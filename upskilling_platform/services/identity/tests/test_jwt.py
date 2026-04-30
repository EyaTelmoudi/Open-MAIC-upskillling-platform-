"""Tests for JWT token management (services.identity.auth.jwt)."""

import uuid

from services.identity.auth.jwt import (
    generate_token_response,
    refresh_access_token,
    validate_refresh_token,
    validate_token,
)


class TestGenerateTokenResponse:
    def test_returns_token_response(self):
        response = generate_token_response(
            user_id="user-123",
            email="test@example.com",
            role="Admin",
            auth_provider="local",
        )
        assert response.access_token
        assert response.refresh_token
        assert response.token_type == "bearer"
        assert response.expires_in == 15 * 60  # 900 seconds

    def test_access_token_contains_claims(self):
        response = generate_token_response(
            user_id="user-abc",
            email="admin@skillforge.com",
            role="Admin",
            auth_provider="local",
        )
        payload = validate_token(response.access_token)
        assert payload is not None
        assert payload["sub"] == "user-abc"
        assert payload["email"] == "admin@skillforge.com"
        assert payload["role"] == "Admin"
        assert payload["auth_provider"] == "local"

    def test_refresh_token_contains_user_id(self):
        response = generate_token_response(
            user_id="user-xyz",
            email="test@example.com",
            role="TeamMember",
            auth_provider="azure_entra",
        )
        user_id = validate_refresh_token(response.refresh_token)
        assert user_id == "user-xyz"

    def test_different_calls_produce_different_tokens(self):
        r1 = generate_token_response("u1", "a@b.com", "Admin", "local")
        r2 = generate_token_response("u2", "c@d.com", "Manager", "azure_entra")
        assert r1.access_token != r2.access_token
        assert r1.refresh_token != r2.refresh_token


class TestValidateToken:
    def test_valid_access_token(self):
        response = generate_token_response(
            user_id="user-valid",
            email="valid@example.com",
            role="Manager",
            auth_provider="local",
        )
        payload = validate_token(response.access_token)
        assert payload is not None
        assert payload["sub"] == "user-valid"

    def test_invalid_token_returns_none(self):
        assert validate_token("not.a.valid.token") is None

    def test_empty_token_returns_none(self):
        assert validate_token("") is None

    def test_refresh_token_is_not_valid_access_token(self):
        from common.auth import create_refresh_token

        refresh = create_refresh_token("user-123")
        payload = validate_token(refresh)
        assert payload is not None  # Token is valid JWT
        assert payload.get("type") == "refresh"  # But it's a refresh token


class TestValidateRefreshToken:
    def test_valid_refresh_token(self):
        response = generate_token_response(
            user_id="user-refresh",
            email="refresh@example.com",
            role="TeamMember",
            auth_provider="azure_entra",
        )
        user_id = validate_refresh_token(response.refresh_token)
        assert user_id == "user-refresh"

    def test_access_token_is_not_valid_refresh_token(self):
        response = generate_token_response(
            user_id="user-acc",
            email="acc@example.com",
            role="Admin",
            auth_provider="local",
        )
        result = validate_refresh_token(response.access_token)
        assert result is None  # Access token has no "type":"refresh"

    def test_invalid_token_returns_none(self):
        assert validate_refresh_token("invalid.token.here") is None


class TestRefreshAccessToken:
    def test_refresh_with_valid_token(self):
        original = generate_token_response(
            user_id="user-rfr",
            email="rfr@example.com",
            role="Admin",
            auth_provider="local",
        )
        user_data = {
            "id": "user-rfr",
            "email": "rfr@example.com",
            "role": "Admin",
            "auth_provider": "local",
        }
        refreshed = refresh_access_token(original.refresh_token, user_data)
        assert refreshed is not None
        assert refreshed.access_token
        assert refreshed.refresh_token
        assert refreshed.token_type == "bearer"

    def test_refresh_with_invalid_token(self):
        user_data = {
            "id": "user-123",
            "email": "test@example.com",
            "role": "Admin",
            "auth_provider": "local",
        }
        result = refresh_access_token("invalid.token", user_data)
        assert result is None

    def test_refreshed_token_contains_correct_claims(self):
        original = generate_token_response(
            user_id="user-claims",
            email="claims@example.com",
            role="Manager",
            auth_provider="azure_entra",
        )
        user_data = {
            "id": "user-claims",
            "email": "claims@example.com",
            "role": "Manager",
            "auth_provider": "azure_entra",
        }
        refreshed = refresh_access_token(original.refresh_token, user_data)
        payload = validate_token(refreshed.access_token)
        assert payload is not None
        assert payload["sub"] == "user-claims"
        assert payload["email"] == "claims@example.com"
        assert payload["role"] == "Manager"
