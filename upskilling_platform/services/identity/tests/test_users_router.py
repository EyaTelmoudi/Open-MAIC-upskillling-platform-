"""Tests for identity user management routes."""

import asyncio
from unittest.mock import AsyncMock, patch

from common.enums import UserStatus
from fastapi import HTTPException
import pytest

from services.identity.routers.users import invite_user, set_local_password
from services.identity.user_defaults import get_default_user_timezone
from services.identity.schemas.user import InviteUser, SetLocalPasswordRequest


def test_invite_user_creates_pending_tenant_user(mock_db):
    """Invited users stay pending until they accept the invitation."""
    invite = InviteUser(
        email="new.user@enterprise.com",
        role="TeamMember",
        department="Tech",
    )
    current_user = {
        "role": "Admin",
        "email": "admin@enterprise.com",
        "tenantId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    }

    with (
        patch(
            "services.identity.routers.users.send_invite_email",
            new=AsyncMock(return_value=True),
        ) as send_invite_email_mock,
        patch(
            "services.identity.routers.users.get_default_user_timezone",
            return_value="Europe/Paris",
        ),
    ):
        created_user = asyncio.run(invite_user(invite, current_user, mock_db))

    assert created_user.status == UserStatus.pending_invitation.value
    assert str(created_user.tenant_id) == current_user["tenantId"]
    assert created_user.email == invite.email
    assert created_user.timezone == "Europe/Paris"
    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()
    mock_db.refresh.assert_called_once_with(created_user)
    send_invite_email_mock.assert_awaited_once_with(
        invite.email,
        current_user["email"],
    )


def test_invite_user_rejects_admin_without_tenant(mock_db):
    """Platform-level admins cannot create tenant users without tenant context."""
    invite = InviteUser(
        email="new.user@enterprise.com",
        role="TeamMember",
        department="Tech",
    )
    current_user = {
        "role": "Admin",
        "email": "admin@enterprise.com",
        "tenantId": None,
    }

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(invite_user(invite, current_user, mock_db))

    assert exc_info.value.status_code == 403
    assert "cannot invite regular users" in exc_info.value.detail


def test_invite_user_with_password_creates_active_local_user(mock_db):
    """Providing a password should create an active local login user."""
    invite = InviteUser(
        email="local.user@enterprise.com",
        role="TeamMember",
        department="Tech",
        password="Password123",
    )
    current_user = {
        "role": "Admin",
        "email": "admin@enterprise.com",
        "tenantId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    }

    with (
        patch(
            "services.identity.routers.users.send_invite_email",
            new=AsyncMock(return_value=True),
        ) as send_invite_email_mock,
        patch(
            "services.identity.routers.users.get_default_user_timezone",
            return_value="America/New_York",
        ),
    ):
        created_user = asyncio.run(invite_user(invite, current_user, mock_db))

    assert created_user.status == UserStatus.active.value
    assert created_user.onboarded is True
    assert created_user.password_hash is not None
    assert created_user.timezone == "America/New_York"
    send_invite_email_mock.assert_not_awaited()


def test_get_default_user_timezone_uses_system_config_value(mock_db):
    """New users should inherit the platform timezone from system config."""
    config = type("ConfigObj", (), {})()
    config.default_timezone = "Asia/Dubai"
    mock_db.first.return_value = config

    assert get_default_user_timezone(mock_db) == "Asia/Dubai"


def test_set_local_password_repairs_existing_local_user(mock_db):
    """Admins can repair a local user's password for testing access."""
    existing_user = type("UserObj", (), {})()
    existing_user.id = "user-1"
    existing_user.email = "team.manager@testorg.com"
    existing_user.role = "TeamManager"
    existing_user.tenant_id = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    existing_user.password_hash = None
    existing_user.auth_provider = "local"
    existing_user.status = "pending_invitation"
    existing_user.onboarded = False

    mock_db.first.return_value = existing_user

    current_user = {
        "role": "Admin",
        "email": "admin@enterprise.com",
        "tenantId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    }

    updated_user = set_local_password(
        "user-1",
        SetLocalPasswordRequest(password="Password123"),
        current_user,
        mock_db,
    )

    assert updated_user.password_hash is not None
    assert updated_user.status == UserStatus.active.value
    assert updated_user.onboarded is True
    mock_db.commit.assert_called()
