"""Route-level tests for progress tracking."""

from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from services.learning.routers import progress


class FakeRabbitMQClient:
    """Capture published lesson-completion messages."""

    published = []

    def publish(self, exchange: str, routing_key: str, message: dict) -> None:
        self.published.append((exchange, routing_key, message))

    def close(self) -> None:
        return None


def test_update_progress_creates_record(mock_db, registered_admin_user):
    """A missing progress row is created on first update."""
    target_user = SimpleNamespace(
        id=uuid4(),
        tenant_id=registered_admin_user.tenant_id,
    )
    lesson = SimpleNamespace(id=uuid4())

    query = mock_db.query.return_value
    query.filter.return_value = query
    query.first.side_effect = [target_user, lesson, None]

    def set_progress_fields(model) -> None:
        model.id = uuid4()

    mock_db.refresh.side_effect = set_progress_fields

    result = progress.update_progress(
        lesson_id=lesson.id,
        progress_data={
            "user_id": str(target_user.id),
            "status": "in_progress",
            "time_spent": 120,
        },
        current_user={"sub": str(registered_admin_user.id)},
        db=mock_db,
    )

    assert result["status"] == "in_progress"
    assert result["time_spent"] == 120
    mock_db.add.assert_called_once()


def test_complete_lesson_publishes_event(
    mock_db,
    registered_admin_user,
    monkeypatch,
):
    """Completing a lesson emits the Sprint 2 RabbitMQ event."""
    FakeRabbitMQClient.published = []
    monkeypatch.setattr(progress, "RabbitMQClient", FakeRabbitMQClient)
    monkeypatch.setattr(
        "services.learning.services.video_progress.check_enrollment_completion",
        lambda db, user_id, course_id: None,
    )

    target_user = SimpleNamespace(
        id=uuid4(),
        tenant_id=registered_admin_user.tenant_id,
    )
    lesson = SimpleNamespace(id=uuid4(), module_id=uuid4())
    progress_row = SimpleNamespace(
        id=uuid4(),
        user_id=target_user.id,
        lesson_id=lesson.id,
        status="in_progress",
        completed_at=None,
    )
    module = SimpleNamespace(id=lesson.module_id, course_id=uuid4())

    query = mock_db.query.return_value
    query.filter.return_value = query
    query.first.side_effect = [target_user, lesson, progress_row, module]

    result = progress.complete_lesson(
        lesson_id=lesson.id,
        data={"user_id": str(target_user.id)},
        current_user={"sub": str(registered_admin_user.id)},
        db=mock_db,
    )

    assert result["status"] == "completed"
    assert progress_row.status == "completed"
    assert FakeRabbitMQClient.published[0][1] == "learning.lessons.completed"
    assert FakeRabbitMQClient.published[0][2]["lessonId"] == str(lesson.id)


def test_complete_lesson_blocks_cross_tenant_user(mock_db, registered_admin_user):
    """Tenant admins cannot complete progress for a user in another tenant."""
    foreign_user = SimpleNamespace(id=uuid4(), tenant_id=str(uuid4()))

    query = mock_db.query.return_value
    query.filter.return_value = query
    query.first.return_value = foreign_user

    with pytest.raises(HTTPException) as exc_info:
        progress.complete_lesson(
            lesson_id=uuid4(),
            data={"user_id": str(foreign_user.id)},
            current_user={"sub": str(registered_admin_user.id)},
            db=mock_db,
        )

    assert exc_info.value.status_code == 403
    assert "another tenant" in exc_info.value.detail


@pytest.fixture(autouse=True)
def patch_progress_user_resolution(monkeypatch):
    """Route user lookups through the registered fixtures."""
    user_map = {}

    def register(user):
        user_map[str(user.id)] = user
        return user

    monkeypatch.setattr(
        progress,
        "_get_user_from_payload",
        lambda payload, db: user_map[payload["sub"]],
    )
    return register


@pytest.fixture
def registered_admin_user(admin_user, patch_progress_user_resolution):
    """Register the admin fixture for progress router tests."""
    return patch_progress_user_resolution(admin_user)
