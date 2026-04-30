"""Focused tests for Sprint 3 goals tracking."""

from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from services.learning.routers import goals


def test_normalize_status_marks_goal_completed():
    """Progress at or above the target auto-completes the goal."""
    assert goals._normalize_status(progress=5, target_count=5, current_status="active") == "completed"


def test_serialize_user_goal_includes_completion_rate():
    """Serialized personal goals expose target count and completion rate."""
    goal = SimpleNamespace(
        id=uuid4(),
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


def test_get_team_for_goal_access_blocks_team_manager_from_other_team(tenant_id):
    """Team managers can only manage goals for their own teams."""
    team_manager = SimpleNamespace(id=uuid4(), role="TeamManager", tenant_id=tenant_id)
    foreign_team = SimpleNamespace(id=uuid4(), tenant_id=tenant_id, manager_id=uuid4())
    mock_db = SimpleNamespace(query=lambda model: SimpleNamespace(filter=lambda *args, **kwargs: SimpleNamespace(first=lambda: foreign_team)))

    with pytest.raises(HTTPException) as exc_info:
        goals._get_team_for_goal_access(foreign_team.id, team_manager, mock_db)

    assert exc_info.value.status_code == 403
