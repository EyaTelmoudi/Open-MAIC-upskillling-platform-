"""Focused tests for Sprint 3 goals tracking."""

from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from services.learning.routers import goals
from services.learning.services import goal_tracking


def test_normalize_status_marks_goal_completed():
    """Progress at or above the target auto-completes the goal."""
    assert goals._normalize_status(progress=5, target_count=5, current_status="active") == "completed"


def test_serialize_user_goal_includes_completion_rate():
    """Serialized personal goals expose target count and completion rate."""
    goal = SimpleNamespace(
        id=uuid4(),
        user_id=uuid4(),
        title="Finish lessons",
        description="Finish five lessons",
        target_date=None,
        target_count=5,
        xp_reward=100,
        progress=3,
        status="active",
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    payload = goals._serialize_user_goal(goal)

    assert payload["target_count"] == 5
    assert payload["xp_reward"] == 100
    assert payload["completion_rate"] == 60.0


def test_require_team_goal_role_blocks_team_member(team_member_user):
    """Team members cannot manage team goals."""
    with pytest.raises(HTTPException) as exc_info:
        goals._require_team_goal_role(team_member_user)

    assert exc_info.value.status_code == 403


def test_superadmin_can_manage_team_goals(tenant_id):
    """Super admins can create and manage team goals."""
    super_admin_user = SimpleNamespace(id=uuid4(), role="SuperAdmin", tenant_id=tenant_id)

    goals._require_team_goal_role(super_admin_user)


def test_required_text_rejects_missing_title():
    """Incomplete goal creation payloads get a clear validation error."""
    with pytest.raises(HTTPException) as exc_info:
        goals._required_text({"title": "   "}, "title")

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "title is required"


def test_parse_uuid_rejects_invalid_user_id():
    """Malformed user/team IDs should not fall through to permission errors."""
    with pytest.raises(HTTPException) as exc_info:
        goals._parse_uuid("", "user_id")

    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "user_id is invalid"


def test_regular_user_can_manage_own_personal_goal(team_member_user):
    """Every authenticated user can create or edit their own personal goal."""
    goals._assert_can_manage_personal_goal_for_user(team_member_user, team_member_user)


def test_regular_user_cannot_assign_goal_to_another_user(team_member_user, tenant_id):
    """Cross-user goal assignment remains restricted to management roles."""
    other_user = SimpleNamespace(id=uuid4(), role="TeamMember", tenant_id=tenant_id)

    with pytest.raises(HTTPException) as exc_info:
        goals._assert_can_manage_personal_goal_for_user(team_member_user, other_user)

    assert exc_info.value.status_code == 403


def test_get_team_for_goal_access_blocks_team_manager_from_other_team(tenant_id):
    """Team managers can only manage goals for their own teams."""
    team_manager = SimpleNamespace(id=uuid4(), role="TeamManager", tenant_id=tenant_id)
    foreign_team = SimpleNamespace(id=uuid4(), tenant_id=tenant_id, manager_id=uuid4())
    mock_db = SimpleNamespace(query=lambda model: SimpleNamespace(filter=lambda *args, **kwargs: SimpleNamespace(first=lambda: foreign_team)))

    with pytest.raises(HTTPException) as exc_info:
        goals._get_team_for_goal_access(foreign_team.id, team_manager, mock_db)

    assert exc_info.value.status_code == 403


def test_goal_sync_marks_lesson_goal_completed_from_real_progress(team_member_user):
    """Auto-tracked goals are completed from counted learning activity, not manual toggles."""
    goal = SimpleNamespace(
        id=uuid4(),
        user_id=team_member_user.id,
        title="Complete one lesson",
        description=goal_tracking.serialize_goal_description("", "lessons_completed"),
        target_count=1,
        xp_reward=0,
        progress=0,
        status="active",
    )

    class Query:
        def __init__(self, model):
            self.model = model

        def filter(self, *args, **kwargs):
            return self

        def all(self):
            model_name = getattr(self.model, "__name__", "")
            if model_name == "UserGoal":
                return [goal]
            return []

        def first(self):
            return team_member_user

        def count(self):
            return 1

    db = SimpleNamespace(
        query=lambda model: Query(model),
        commit=lambda: None,
    )

    goal_tracking.sync_user_goals(db, team_member_user.id)

    assert goal.progress == 1
    assert goal.status == "completed"
