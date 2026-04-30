"""Tests for RBAC middleware (services.identity.middleware.rbac)."""

import pytest
from fastapi import HTTPException

from services.identity.middleware.rbac import (
    ROLE_HIERARCHY,
    require_min_role,
    require_role,
)


class TestRoleHierarchy:
    def test_admin_is_highest(self):
        assert ROLE_HIERARCHY["Admin"] == 6

    def test_intern_is_lowest(self):
        assert ROLE_HIERARCHY["TeamIntern"] == 1

    def test_all_six_roles_present(self):
        assert len(ROLE_HIERARCHY) == 6

    def test_hierarchy_order(self):
        levels = ROLE_HIERARCHY
        assert levels["Admin"] > levels["Manager"]
        assert levels["Manager"] > levels["LearningExpert"]
        assert levels["LearningExpert"] > levels["TeamManager"]
        assert levels["TeamManager"] > levels["TeamMember"]
        assert levels["TeamMember"] > levels["TeamIntern"]


class TestRequireRole:
    def test_allowed_role_passes(self):
        """User with allowed role passes through."""
        checker = require_role("Admin", "Manager")
        user = {"sub": "user-1", "role": "Admin"}
        result = checker(current_user=user)
        assert result == user

    def test_disallowed_role_raises_403(self):
        """User with disallowed role raises 403."""
        checker = require_role("Admin")
        user = {"sub": "user-1", "role": "TeamMember"}
        with pytest.raises(HTTPException) as exc_info:
            checker(current_user=user)
        assert exc_info.value.status_code == 403
        assert "TeamMember" in exc_info.value.detail

    def test_multiple_roles_allowed(self):
        """Multiple roles can be allowed."""
        checker = require_role("Admin", "Manager", "TeamManager")

        for role in ["Admin", "Manager", "TeamManager"]:
            user = {"sub": "user-1", "role": role}
            result = checker(current_user=user)
            assert result["role"] == role

    def test_wrong_role_raises_403(self):
        """Any role not in the list raises 403."""
        checker = require_role("Admin")
        for role in [
            "Manager",
            "LearningExpert",
            "TeamManager",
            "TeamMember",
            "TeamIntern",
        ]:
            user = {"sub": "user-1", "role": role}
            with pytest.raises(HTTPException) as exc_info:
                checker(current_user=user)
            assert exc_info.value.status_code == 403


class TestRequireMinRole:
    def test_exact_role_passes(self):
        """User with exact minimum role passes."""
        checker = require_min_role("Manager")
        user = {"sub": "user-1", "role": "Manager"}
        result = checker(current_user=user)
        assert result == user

    def test_higher_role_passes(self):
        """User with higher role than minimum passes."""
        checker = require_min_role("TeamMember")
        user = {"sub": "user-1", "role": "Admin"}
        result = checker(current_user=user)
        assert result == user

    def test_lower_role_raises_403(self):
        """User with lower role than minimum raises 403."""
        checker = require_min_role("Manager")
        user = {"sub": "user-1", "role": "TeamMember"}
        with pytest.raises(HTTPException) as exc_info:
            checker(current_user=user)
        assert exc_info.value.status_code == 403
        assert "Manager" in exc_info.value.detail

    def test_admin_can_access_everything(self):
        """Admin role can access all minimum role levels."""
        for min_role in ROLE_HIERARCHY:
            checker = require_min_role(min_role)
            user = {"sub": "user-1", "role": "Admin"}
            result = checker(current_user=user)
            assert result["role"] == "Admin"

    def test_intern_can_only_access_intern_level(self):
        """Intern can only access TeamIntern minimum level."""
        checker_ok = require_min_role("TeamIntern")
        user = {"sub": "user-1", "role": "TeamIntern"}
        assert checker_ok(current_user=user) == user

        for min_role in [
            "TeamMember",
            "TeamManager",
            "LearningExpert",
            "Manager",
            "Admin",
        ]:
            checker = require_min_role(min_role)
            with pytest.raises(HTTPException) as exc_info:
                checker(current_user=user)
            assert exc_info.value.status_code == 403

    def test_unknown_role_gets_level_0(self):
        """Unknown role gets level 0 (lowest)."""
        checker = require_min_role("TeamIntern")
        user = {"sub": "user-1", "role": "UnknownRole"}
        with pytest.raises(HTTPException):
            checker(current_user=user)
