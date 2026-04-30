"""Focused tests for Sprint 3 team management access rules."""

from types import SimpleNamespace
from uuid import uuid4

import pytest
from fastapi import HTTPException

from services.learning.routers import teams


def test_assert_team_access_blocks_cross_tenant_team(team_member_user):
    """Users cannot access teams from another tenant."""
    foreign_team = SimpleNamespace(
        id=uuid4(),
        tenant_id=str(uuid4()),
        manager_id=uuid4(),
    )

    with pytest.raises(HTTPException) as exc_info:
        teams._assert_team_access(team_member_user, foreign_team)

    assert exc_info.value.status_code == 403
    assert "another tenant" in exc_info.value.detail


def test_assert_team_access_allows_team_manager_on_same_tenant_team(tenant_id):
    """Team managers can manage any team inside their own tenant."""
    team_manager = SimpleNamespace(
        id=uuid4(),
        role="TeamManager",
        tenant_id=tenant_id,
    )
    team = SimpleNamespace(
        id=uuid4(),
        tenant_id=tenant_id,
        manager_id=uuid4(),
    )

    teams._assert_team_access(team_manager, team, write=True)


def test_require_team_management_role_blocks_team_member(team_member_user):
    """Team members cannot access team management actions."""
    with pytest.raises(HTTPException) as exc_info:
        teams._require_team_management_role(team_member_user)

    assert exc_info.value.status_code == 403
    assert "TeamManager" in exc_info.value.detail


def test_assert_team_view_access_allows_team_member_membership(monkeypatch, team_member_user, tenant_id):
    """Regular team members can view teams they belong to."""
    team = SimpleNamespace(
        id=uuid4(),
        tenant_id=tenant_id,
        manager_id=uuid4(),
    )

    monkeypatch.setattr(teams, "_has_team_membership", lambda user, team_id, db: True)

    teams._assert_team_view_access(team_member_user, team, db=None)


def test_assert_team_view_access_blocks_team_member_without_membership(
    monkeypatch, team_member_user, tenant_id
):
    """Regular team members cannot view teams they do not belong to."""
    team = SimpleNamespace(
        id=uuid4(),
        tenant_id=tenant_id,
        manager_id=uuid4(),
    )

    monkeypatch.setattr(teams, "_has_team_membership", lambda user, team_id, db: False)

    with pytest.raises(HTTPException) as exc_info:
        teams._assert_team_view_access(team_member_user, team, db=None)

    assert exc_info.value.status_code == 403
    assert "not a member" in exc_info.value.detail
