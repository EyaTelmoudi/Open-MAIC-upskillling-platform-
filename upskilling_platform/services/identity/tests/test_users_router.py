"""Tests for identity user management routes."""

import asyncio
import uuid
from unittest.mock import AsyncMock, patch

from common.enums import UserStatus
from common.models import IdentityAuditLog, Tenant, User
from fastapi import HTTPException
import pytest

from services.identity.routers.users import create_user, invite_user, set_local_password
from services.identity.user_defaults import get_default_user_timezone
from services.identity.schemas.user import CreateUser, InviteUser, SetLocalPasswordRequest


def make_tenant(email_domain: str = "enterprise.com") -> Tenant:
    tenant = Tenant(
        id=uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"),
        name="Enterprise",
        slug="enterprise",
        email_domain=email_domain,
        status="active",
    )
    return tenant


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
    mock_db.first.side_effect = [make_tenant("enterprise.com"), None]

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
    mock_db.first.side_effect = [make_tenant("enterprise.com"), None]

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


def test_invite_user_rejects_email_outside_admin_company_domain(mock_db):
    """Tenant admins can only add users whose email domain matches their tenant."""
    invite = InviteUser(
        email="outside@other-company.com",
        role="TeamMember",
        department="Tech",
    )
    current_user = {
        "role": "Admin",
        "email": "admin@enterprise.com",
        "tenantId": "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    }
    mock_db.first.return_value = make_tenant("enterprise.com")

    with pytest.raises(HTTPException) as exc_info:
        asyncio.run(invite_user(invite, current_user, mock_db))

    assert exc_info.value.status_code == 403
    assert "enterprise.com" in exc_info.value.detail
    mock_db.add.assert_not_called()


def test_create_user_superadmin_requires_matching_provided_tenant_domain(mock_db):
    """SuperAdmins cannot force a user into a tenant with a mismatched email domain."""
    user_data = CreateUser(
        email="person@other-company.com",
        first_name="Test",
        last_name="User",
        role="TeamMember",
        tenant_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    )
    current_user = {"role": "SuperAdmin", "email": "root@3s.com.tn"}
    mock_db.first.side_effect = [None, make_tenant("enterprise.com"), None]

    with pytest.raises(HTTPException) as exc_info:
        create_user(user_data, current_user, mock_db)

    assert exc_info.value.status_code == 403
    assert "enterprise.com" in exc_info.value.detail
    mock_db.add.assert_not_called()


def test_create_user_superadmin_accepts_matching_provided_tenant_domain(mock_db):
    """SuperAdmins can add a user when the email matches the selected tenant domain."""
    user_data = CreateUser(
        email="person@enterprise.com",
        first_name="Test",
        last_name="User",
        role="TeamMember",
        tenant_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
        password="Password123",
    )
    current_user = {"role": "SuperAdmin", "email": "root@3s.com.tn"}
    mock_db.first.side_effect = [None, make_tenant("enterprise.com"), None]

    created_user = create_user(user_data, current_user, mock_db)

    assert created_user.email == "person@enterprise.com"
    assert str(created_user.tenant_id) == "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    assert mock_db.add.call_count == 2
    assert isinstance(mock_db.add.call_args_list[0].args[0], User)
    assert isinstance(mock_db.add.call_args_list[1].args[0], IdentityAuditLog)
    mock_db.commit.assert_called_once()


def test_create_user_superadmin_resolves_tenant_from_known_group_domain(mock_db):
    """SuperAdmins can create users without tenant_id only when the domain belongs to a known tenant."""
    user_data = CreateUser(
        email="person@enterprise.com",
        first_name="Test",
        last_name="User",
        role="TeamMember",
    )
    current_user = {"role": "SuperAdmin", "email": "root@3s.com.tn"}
    mock_db.first.return_value = None
    mock_db.all.return_value = [make_tenant("enterprise.com"), make_tenant("3s.com.tn")]

    created_user = create_user(user_data, current_user, mock_db)

    assert created_user.email == "person@enterprise.com"
    assert str(created_user.tenant_id) == "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
    assert mock_db.add.call_count == 2
    assert isinstance(mock_db.add.call_args_list[0].args[0], User)
    assert isinstance(mock_db.add.call_args_list[1].args[0], IdentityAuditLog)


def test_create_user_superadmin_rejects_unknown_group_domain(mock_db):
    """SuperAdmins cannot create users for domains not configured on any tenant."""
    user_data = CreateUser(
        email="person@unknown-company.com",
        first_name="Test",
        last_name="User",
        role="TeamMember",
    )
    current_user = {"role": "SuperAdmin", "email": "root@3s.com.tn"}
    mock_db.first.return_value = None
    mock_db.all.return_value = [make_tenant("enterprise.com")]

    with pytest.raises(HTTPException) as exc_info:
        create_user(user_data, current_user, mock_db)

    assert exc_info.value.status_code == 403
    assert "existing 3S group company" in exc_info.value.detail
    mock_db.add.assert_not_called()


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
