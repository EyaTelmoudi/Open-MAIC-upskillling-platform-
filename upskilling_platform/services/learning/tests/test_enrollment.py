"""Route-level tests for enrollment flows."""

from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from services.learning.routers import enrollment


class FakeRabbitMQClient:
    """Capture published messages without a broker."""

    published = []

    def publish(self, exchange: str, routing_key: str, message: dict) -> None:
        self.published.append((exchange, routing_key, message))

    def close(self) -> None:
        return None


def test_enroll_in_course_rejects_duplicate_enrollment(mock_db, registered_admin_user):
    """Duplicate enrollments are blocked with HTTP 409."""
    course = SimpleNamespace(id=uuid4(), tenant_id=registered_admin_user.tenant_id)
    user = SimpleNamespace(id=uuid4(), tenant_id=registered_admin_user.tenant_id)
    tenant = SimpleNamespace(id=registered_admin_user.tenant_id, seat_limit=None)
    existing = SimpleNamespace(id=uuid4())

    course_query = mock_db.query.return_value
    course_query.filter.return_value = course_query
    course_query.first.side_effect = [course, user, tenant, existing]

    with pytest.raises(HTTPException) as exc_info:
        enrollment.enroll_in_course(
            enrollment_data={"user_id": str(user.id), "course_id": str(course.id)},
            current_user={"sub": str(registered_admin_user.id)},
            db=mock_db,
        )

    assert exc_info.value.status_code == 409
    assert "already enrolled" in exc_info.value.detail


def test_enroll_in_course_blocks_cross_tenant_user(mock_db, registered_admin_user):
    """Tenant admins cannot enroll users from another tenant."""
    course = SimpleNamespace(id=uuid4(), tenant_id=registered_admin_user.tenant_id)
    foreign_user = SimpleNamespace(id=uuid4(), tenant_id=str(uuid4()))

    query = mock_db.query.return_value
    query.filter.return_value = query
    query.first.side_effect = [course, foreign_user]

    with pytest.raises(HTTPException) as exc_info:
        enrollment.enroll_in_course(
            enrollment_data={
                "user_id": str(foreign_user.id),
                "course_id": str(course.id),
            },
            current_user={"sub": str(registered_admin_user.id)},
            db=mock_db,
        )

    assert exc_info.value.status_code == 403
    assert "another tenant" in exc_info.value.detail


def test_enroll_in_course_publishes_event(
    mock_db,
    registered_admin_user,
    monkeypatch,
):
    """Successful enrollment publishes the Sprint 2 enrollment event."""
    FakeRabbitMQClient.published = []
    monkeypatch.setattr(enrollment, "RabbitMQClient", FakeRabbitMQClient)

    course = SimpleNamespace(id=uuid4(), tenant_id=registered_admin_user.tenant_id)
    user = SimpleNamespace(id=uuid4(), tenant_id=registered_admin_user.tenant_id)
    tenant = SimpleNamespace(id=registered_admin_user.tenant_id, seat_limit=None)

    query = mock_db.query.return_value
    query.filter.return_value = query
    query.first.side_effect = [course, user, tenant, None]

    def set_enrollment_fields(model) -> None:
        model.id = uuid4()
        model.enrolled_at = datetime.utcnow()

    mock_db.refresh.side_effect = set_enrollment_fields

    result = enrollment.enroll_in_course(
        enrollment_data={"user_id": str(user.id), "course_id": str(course.id)},
        current_user={"sub": str(registered_admin_user.id)},
        db=mock_db,
    )

    assert result["status"] == "in_progress"
    assert FakeRabbitMQClient.published[0][1] == "learning.enrollment.created"
    assert FakeRabbitMQClient.published[0][2]["userId"] == str(user.id)


@pytest.fixture(autouse=True)
def patch_enrollment_user_resolution(monkeypatch):
    """Route user lookups through the registered fixtures."""
    user_map = {}

    def register(user):
        user_map[str(user.id)] = user
        return user

    monkeypatch.setattr(
        enrollment,
        "_get_user_from_payload",
        lambda payload, db: user_map[payload["sub"]],
    )
    return register


@pytest.fixture
def registered_admin_user(admin_user, patch_enrollment_user_resolution):
    """Register the admin fixture for enrollment router tests."""
    return patch_enrollment_user_resolution(admin_user)
