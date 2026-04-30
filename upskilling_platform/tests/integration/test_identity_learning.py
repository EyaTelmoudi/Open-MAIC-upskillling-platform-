"""Integration tests for Identity JWTs against Learning service routes."""

import os
import sys
from datetime import datetime
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from common.auth import create_access_token
from services.learning.routers import courses, enrollment, progress


class FakeRabbitMQClient:
    """Capture broker messages during tests."""

    published = []

    def publish(self, exchange: str, routing_key: str, message: dict) -> None:
        self.published.append((exchange, routing_key, message))

    def close(self) -> None:
        return None


@pytest.fixture
def learning_app():
    """Create a minimal Learning service app for integration tests."""
    app = FastAPI()
    app.include_router(courses.router, prefix="/api/v1")
    app.include_router(enrollment.router, prefix="/api/v1")
    app.include_router(progress.router, prefix="/api/v1")
    return app


@pytest.fixture
def make_client(learning_app):
    """Create a test client with a supplied mock database."""

    def factory(mock_db):
        learning_app.dependency_overrides[courses.get_db] = lambda: mock_db
        learning_app.dependency_overrides[enrollment.get_db] = lambda: mock_db
        learning_app.dependency_overrides[progress.get_db] = lambda: mock_db
        return TestClient(learning_app)

    return factory


def _auth_headers(role: str, tenant_id: str, user_id: str | None = None) -> dict[str, str]:
    """Build Authorization headers using the shared Identity JWT utility."""
    token = create_access_token(
        user_id=user_id or str(uuid4()),
        email=f"{role.lower()}@example.com",
        role=role,
        auth_provider="local",
        tenant_id=tenant_id,
    )
    return {"Authorization": f"Bearer {token}"}


def test_identity_jwt_is_accepted_by_learning_routes(make_client, monkeypatch):
    """A valid Identity-issued JWT authenticates against Learning routes."""
    tenant_id = str(uuid4())
    mock_session = MagicMock()
    query = mock_session.query.return_value
    query.filter.return_value = query
    query.count.return_value = 0
    query.order_by.return_value = query
    query.offset.return_value = query
    query.limit.return_value = query
    query.all.return_value = []

    monkeypatch.setattr(
        courses,
        "_get_user_from_payload",
        lambda payload, db: SimpleNamespace(
            id=payload["sub"],
            role="Admin",
            tenant_id=tenant_id,
            timezone="Africa/Tunis",
        ),
    )

    client = make_client(mock_session)
    response = client.get("/api/v1/courses/", headers=_auth_headers("Admin", tenant_id))

    assert response.status_code == 200
    assert response.json()["items"] == []


def test_course_creation_is_restricted_to_learning_expert_plus(
    make_client,
    monkeypatch,
):
    """Course creation rejects a TeamMember with a valid JWT."""
    tenant_id = str(uuid4())
    mock_session = MagicMock()

    monkeypatch.setattr(
        courses,
        "_get_user_from_payload",
        lambda payload, db: SimpleNamespace(
            id=payload["sub"],
            role="TeamMember",
            tenant_id=tenant_id,
            timezone="Africa/Tunis",
        ),
    )

    client = make_client(mock_session)
    response = client.post(
        "/api/v1/courses/",
        headers=_auth_headers("TeamMember", tenant_id),
        json={
            "title": "Unauthorized Course",
            "category": "Engineering",
            "difficulty": "Beginner",
            "duration": 30,
        },
    )

    assert response.status_code == 403
    assert "LearningExpert" in response.json()["detail"]


def test_enrolled_courses_appear_in_user_enrollment_list(make_client, monkeypatch):
    """Enrollment list returns the courses for the requested user."""
    tenant_id = str(uuid4())
    user_id = str(uuid4())
    mock_session = MagicMock()
    enrollment_row = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        course_id=uuid4(),
        enrolled_at=datetime.utcnow(),
        completed_at=None,
        status="in_progress",
    )
    query = mock_session.query.return_value
    query.join.return_value = query
    query.filter.return_value = query
    query.order_by.return_value = query
    query.all.return_value = [enrollment_row]

    monkeypatch.setattr(
        enrollment,
        "_get_user_from_payload",
        lambda payload, db: SimpleNamespace(
            id=payload["sub"],
            role="Admin",
            tenant_id=tenant_id,
            timezone="Africa/Tunis",
        ),
    )

    client = make_client(mock_session)
    response = client.get(
        f"/api/v1/enrollments/?user_id={user_id}",
        headers=_auth_headers("Admin", tenant_id),
    )

    assert response.status_code == 200
    assert response.json()[0]["status"] == "in_progress"


def test_lesson_completion_publishes_rabbitmq_event(
    make_client,
    monkeypatch,
):
    """Lesson completion emits the Sprint 2 RabbitMQ payload."""
    tenant_id = str(uuid4())
    user_id = str(uuid4())
    FakeRabbitMQClient.published = []
    mock_session = MagicMock()
    target_user = SimpleNamespace(id=uuid4(), tenant_id=tenant_id)
    lesson = SimpleNamespace(id=uuid4(), module_id=uuid4())
    progress_row = SimpleNamespace(
        id=uuid4(),
        user_id=target_user.id,
        lesson_id=lesson.id,
        status="in_progress",
        completed_at=None,
    )
    module = SimpleNamespace(id=lesson.module_id, course_id=uuid4())
    query = mock_session.query.return_value
    query.filter.return_value = query
    query.first.side_effect = [target_user, lesson, progress_row, module]

    monkeypatch.setattr(progress, "RabbitMQClient", FakeRabbitMQClient)
    monkeypatch.setattr(
        progress,
        "_get_user_from_payload",
        lambda payload, db: SimpleNamespace(
            id=payload["sub"],
            role="Admin",
            tenant_id=tenant_id,
            timezone="Africa/Tunis",
        ),
    )
    monkeypatch.setattr(
        "services.learning.services.video_progress.check_enrollment_completion",
        lambda db, user_id, course_id: None,
    )

    client = make_client(mock_session)
    response = client.post(
        f"/api/v1/progress/{lesson.id}/complete",
        headers=_auth_headers("Admin", tenant_id, user_id=user_id),
        json={"user_id": str(target_user.id)},
    )

    assert response.status_code == 200
    assert FakeRabbitMQClient.published[0][1] == "learning.lessons.completed"
    assert FakeRabbitMQClient.published[0][2]["lessonId"] == str(lesson.id)
