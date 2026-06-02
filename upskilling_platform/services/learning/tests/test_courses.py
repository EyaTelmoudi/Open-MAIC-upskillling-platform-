"""Route-level tests for course management."""

from datetime import datetime
from unittest.mock import MagicMock
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from services.learning.routers import courses


def test_list_courses_returns_paginated_items(mock_db, registered_admin_user):
    """Listing courses returns serialized items and pagination metadata."""
    course = SimpleNamespace(
        id=uuid4(),
        title="Python Foundations",
        description="Core Python skills",
        thumbnail=None,
        category="Engineering",
        difficulty="Beginner",
        duration=120,
        xp_reward=100,
        rating=4.8,
        is_published=True,
        author_id=uuid4(),
        tenant_id=registered_admin_user.tenant_id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    query = mock_db.query.return_value
    query.filter.return_value = query
    query.count.return_value = 1
    query.order_by.return_value = query
    query.offset.return_value = query
    query.limit.return_value = query
    query.all.return_value = [course]

    result = courses.list_courses(
        page=1,
        page_size=20,
        current_user={"sub": str(registered_admin_user.id)},
        db=mock_db,
    )

    assert result["total"] == 1
    assert result["items"][0]["title"] == "Python Foundations"
    assert query.filter.call_count >= 1


def test_get_course_sorts_modules_and_lessons(mock_db, registered_admin_user):
    """Course detail returns modules and lessons sorted by their order fields."""
    lesson_b = SimpleNamespace(
        id=uuid4(),
        title="Lesson B",
        content="Second",
        video_url=None,
        content_type="text",
        duration=10,
        order=2,
        assessment_id=None,
    )
    lesson_a = SimpleNamespace(
        id=uuid4(),
        title="Lesson A",
        content="First",
        video_url=None,
        content_type="text",
        duration=10,
        order=1,
        assessment_id=None,
    )
    module_b = SimpleNamespace(
        id=uuid4(),
        title="Module B",
        description="Second module",
        order=2,
        lessons=[lesson_b, lesson_a],
    )
    module_a = SimpleNamespace(
        id=uuid4(),
        title="Module A",
        description="First module",
        order=1,
        lessons=[lesson_b],
    )
    course = SimpleNamespace(
        id=uuid4(),
        title="Ordered Course",
        description="Course description",
        thumbnail=None,
        category="Engineering",
        difficulty="Intermediate",
        duration=60,
        xp_reward=150,
        rating=4.5,
        is_published=True,
        author_id=uuid4(),
        tenant_id=registered_admin_user.tenant_id,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
        modules=[module_b, module_a],
    )

    query = mock_db.query.return_value
    query.filter.return_value = query
    query.first.return_value = course

    result = courses.get_course(
        course_id=course.id,
        current_user={"sub": str(registered_admin_user.id)},
        db=mock_db,
    )

    assert [module["title"] for module in result["modules"]] == ["Module A", "Module B"]
    assert [lesson["title"] for lesson in result["modules"][1]["lessons"]] == [
        "Lesson A",
        "Lesson B",
    ]


def test_create_course_requires_learning_expert_plus(
    mock_db,
    registered_team_member_user,
):
    """Team members cannot create courses."""
    with pytest.raises(HTTPException) as exc_info:
        courses.create_course(
            course_data={
                "title": "Restricted Course",
                "category": "Engineering",
                "difficulty": "Beginner",
                "duration": 45,
            },
            current_user={"sub": str(registered_team_member_user.id)},
            db=mock_db,
        )

    assert exc_info.value.status_code == 403
    assert "LearningExpert" in exc_info.value.detail


def test_delete_course_requires_admin_role(
    mock_db,
    registered_learning_expert_user,
):
    """Only admins can delete a course."""
    with pytest.raises(HTTPException) as exc_info:
        courses.delete_course(
            course_id=uuid4(),
            current_user={"sub": str(registered_learning_expert_user.id)},
            db=mock_db,
        )

    assert exc_info.value.status_code == 403
    assert "Admin" in exc_info.value.detail


def test_delete_course_removes_learner_context_before_lessons(
    mock_db,
    registered_admin_user,
    monkeypatch,
):
    """Deleting a course clears learner context rows that still reference its lessons."""
    course_id = uuid4()
    tenant_id = registered_admin_user.tenant_id
    module_id = uuid4()
    lesson_a = uuid4()
    lesson_b = uuid4()
    assessment_id = uuid4()

    query = mock_db.query.return_value
    query.filter.return_value = query
    query.first.side_effect = [(course_id, tenant_id)]
    query.all.side_effect = [[(module_id,)], [(lesson_a,), (lesson_b,)], [(assessment_id,)]]

    monkeypatch.setattr(courses, "get_minio_client", lambda: object())
    monkeypatch.setattr(courses, "delete_prefix", lambda *args, **kwargs: None)

    courses.delete_course(
        course_id=course_id,
        current_user={"sub": str(registered_admin_user.id)},
        db=mock_db,
    )

    executed_statements = [call.args[0] for call in mock_db.execute.call_args_list]
    assert any(
        getattr(statement, "table", None) is courses.LearnerCourseContext.__table__
        for statement in executed_statements
    )
    mock_db.commit.assert_called_once()


def test_toggle_course_publish_publishes_ready_course(
    mock_db,
    registered_admin_user,
    monkeypatch,
):
    """Publishing a ready draft flips is_published to true and returns the new state."""
    course_id = uuid4()
    course = SimpleNamespace(
        id=course_id,
        title="Ready Course",
        is_published=False,
        tenant_id=registered_admin_user.tenant_id,
        memory_retention_status="completed",
        memory_retention_error=None,
        memory_retention_updated_at=None,
        updated_at=datetime.utcnow(),
    )
    module = SimpleNamespace(id=uuid4(), course_id=course_id)
    lesson = SimpleNamespace(id=uuid4(), module_id=module.id)

    course_query = MagicMock()
    course_query.filter.return_value = course_query
    course_query.first.return_value = course

    module_query = MagicMock()
    module_query.filter.return_value = module_query
    module_query.all.return_value = [module]

    lesson_query = MagicMock()
    lesson_query.filter.return_value = lesson_query
    lesson_query.all.return_value = [lesson]

    mock_db.query.side_effect = [course_query, module_query, lesson_query]
    mock_db.refresh.side_effect = lambda entity: entity

    published_messages = []

    class FakeRabbitMQClient:
        def publish(self, **message):
            published_messages.append(message)

    monkeypatch.setattr(courses, "RabbitMQClient", FakeRabbitMQClient)

    result = courses.toggle_course_publish(
        course_id=course_id,
        current_user={"sub": str(registered_admin_user.id)},
        db=mock_db,
    )

    assert course.is_published is True
    assert result["is_published"] is True
    assert result["id"] == str(course_id)
    mock_db.commit.assert_called_once()
    assert published_messages[0]["routing_key"] == "learning.course.published"


@pytest.fixture(autouse=True)
def patch_course_user_resolution(monkeypatch):
    """Route user lookups through the JWT subject fixture objects."""
    user_map = {}

    def register(user):
        user_map[str(user.id)] = user
        return user

    monkeypatch.setattr(courses, "_get_user_from_payload", lambda payload, db: user_map[payload["sub"]])
    return register


@pytest.fixture
def registered_admin_user(admin_user, patch_course_user_resolution):
    """Register the admin fixture in the router lookup patch."""
    return patch_course_user_resolution(admin_user)


@pytest.fixture
def registered_learning_expert_user(
    learning_expert_user,
    patch_course_user_resolution,
):
    """Register the LearningExpert fixture in the router lookup patch."""
    return patch_course_user_resolution(learning_expert_user)


@pytest.fixture
def registered_team_member_user(team_member_user, patch_course_user_resolution):
    """Register the TeamMember fixture in the router lookup patch."""
    return patch_course_user_resolution(team_member_user)
