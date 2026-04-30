"""Tests for authentication (services.identity.auth.local and azure)."""

import uuid
from unittest.mock import MagicMock, patch

import pytest
from common.auth import hash_password
from common.enums import AuthProvider, UserRole

from services.identity.auth.local import authenticate_local


class TestAuthenticateLocal:
    def test_valid_admin_login(self, mock_db):
        """Admin user with correct password gets a token."""
        hashed = hash_password("correct_password")
        user = MagicMock()
        user.id = uuid.UUID("11111111-1111-1111-1111-111111111111")
        user.email = "admin@skillforge.com"
        user.role = UserRole.Admin.value
        user.auth_provider = AuthProvider.local.value
        user.password_hash = hashed
        user.status = "active"
        user.onboarded = True

        mock_db.first.return_value = user

        result = authenticate_local(mock_db, "admin@skillforge.com", "correct_password")
        assert result is not None
        assert result.access_token
        assert result.refresh_token
        assert result.token_type == "bearer"

    def test_wrong_password_returns_none(self, mock_db):
        """Wrong password returns None."""
        hashed = hash_password("correct_password")
        user = MagicMock()
        user.email = "admin@skillforge.com"
        user.role = UserRole.Admin.value
        user.auth_provider = AuthProvider.local.value
        user.password_hash = hashed
        user.status = "active"
        user.onboarded = True

        mock_db.first.return_value = user

        result = authenticate_local(mock_db, "admin@skillforge.com", "wrong_password")
        assert result is None

    def test_nonexistent_user_returns_none(self, mock_db):
        """Non-existent email returns None."""
        mock_db.first.return_value = None

        result = authenticate_local(mock_db, "nonexistent@example.com", "any_password")
        assert result is None

    def test_non_admin_local_user_can_login(self, mock_db):
        """Any active local tenant user can use local auth."""
        hashed = hash_password("password123")
        user = MagicMock()
        user.id = uuid.UUID("22222222-2222-2222-2222-222222222222")
        user.email = "member@enterprise.com"
        user.role = UserRole.TeamMember.value
        user.auth_provider = AuthProvider.local.value
        user.password_hash = hashed
        user.status = "active"
        user.onboarded = True

        mock_db.first.return_value = user

        result = authenticate_local(mock_db, "member@enterprise.com", "password123")
        assert result is not None

    def test_inactive_local_user_returns_none(self, mock_db):
        """Suspended local users cannot sign in."""
        hashed = hash_password("password123")
        user = MagicMock()
        user.email = "member@enterprise.com"
        user.role = UserRole.TeamMember.value
        user.auth_provider = AuthProvider.local.value
        user.password_hash = hashed
        user.status = "suspended"
        user.onboarded = True

        mock_db.first.return_value = user

        result = authenticate_local(mock_db, "member@enterprise.com", "password123")
        assert result is None

    def test_azure_user_returns_none(self, mock_db):
        """Azure-authenticated user cannot use local auth."""
        hashed = hash_password("password123")
        user = MagicMock()
        user.email = "admin@enterprise.com"
        user.role = UserRole.Admin.value
        user.auth_provider = AuthProvider.azure_entra.value
        user.password_hash = hashed
        user.status = "active"
        user.onboarded = True

        mock_db.first.return_value = user

        result = authenticate_local(mock_db, "admin@enterprise.com", "password123")
        assert result is None

    def test_user_without_password_hash_returns_none(self, mock_db):
        """User without password_hash returns None."""
        user = MagicMock()
        user.email = "admin@skillforge.com"
        user.role = UserRole.Admin.value
        user.auth_provider = AuthProvider.local.value
        user.password_hash = None
        user.status = "active"
        user.onboarded = True

        mock_db.first.return_value = user

        result = authenticate_local(mock_db, "admin@skillforge.com", "any_password")
        assert result is None

    def test_token_contains_correct_claims(self, mock_db):
        """Generated token has correct user claims."""
        hashed = hash_password("test_pass")
        user = MagicMock()
        user.id = uuid.UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
        user.email = "admin@test.com"
        user.role = UserRole.Admin.value
        user.auth_provider = AuthProvider.local.value
        user.password_hash = hashed
        user.status = "active"
        user.onboarded = True

        mock_db.first.return_value = user

        result = authenticate_local(mock_db, "admin@test.com", "test_pass")
        assert result is not None

        from common.auth import decode_token

        payload = decode_token(result.access_token)
        assert payload["sub"] == "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
        assert payload["email"] == "admin@test.com"
        assert payload["role"] == "Admin"
        assert payload["auth_provider"] == "local"


class TestAuthenticateAzure:
    def test_demo_mode_creates_user(self, mock_db):
        """Demo mode creates a demo user when none exists."""
        from services.identity.auth.azure import _demo_azure_auth

        mock_db.first.return_value = None

        with patch("common.auth.hash_password", return_value="hashed"):
            result = _demo_azure_auth(mock_db, "any-code")

        assert result is not None
        assert result.access_token
        assert result.token_type == "bearer"
        mock_db.add.assert_called_once()
        mock_db.commit.assert_called_once()

    def test_demo_mode_finds_existing_user(self, mock_db, sample_team_member):
        """Demo mode finds existing demo user."""
        from services.identity.auth.azure import _demo_azure_auth

        sample_team_member.email = "demo@enterprise.com"
        mock_db.first.return_value = sample_team_member

        result = _demo_azure_auth(mock_db, "any-code")
        assert result is not None
        mock_db.add.assert_not_called()

    def test_demo_token_contains_correct_claims(self, mock_db, sample_team_member):
        """Demo auth token has correct claims."""
        from services.identity.auth.azure import _demo_azure_auth
        from common.auth import decode_token

        sample_team_member.email = "demo@enterprise.com"
        mock_db.first.return_value = sample_team_member

        result = _demo_azure_auth(mock_db, "code-123")
        payload = decode_token(result.access_token)
        assert payload["email"] == "demo@enterprise.com"
        assert payload["auth_provider"] == "azure_entra"

    def test_get_azure_auth_url(self):
        """Azure auth URL contains required OAuth parameters."""
        from services.identity.auth.azure import get_azure_auth_url

        url = get_azure_auth_url()
        assert "login.microsoftonline.com" in url
        assert "oauth2/v2.0/authorize" in url
        assert "response_type=code" in url
        assert "scope=openid profile email" in url
