"""Tests for common.schemas module."""

import uuid

from pydantic import ValidationError

from common.schemas import (
    AzureLoginRequest,
    HealthResponse,
    LoginRequest,
    PaginationParams,
    TokenPayload,
    TokenResponse,
    UserCreate,
    UserResponse,
)


class TestTokenPayload:
    def test_valid_payload(self):
        payload = TokenPayload(
            sub="user-123",
            email="test@example.com",
            role="Admin",
            auth_provider="local",
            exp=1700000000,
            iat=1699999000,
        )
        assert payload.sub == "user-123"
        assert payload.email == "test@example.com"

    def test_missing_required_fields(self):
        try:
            TokenPayload(sub="user-123")
            assert False, "Should have raised ValidationError"
        except ValidationError:
            pass


class TestTokenResponse:
    def test_valid_response(self):
        resp = TokenResponse(
            access_token="abc123",
            refresh_token="def456",
            expires_in=900,
        )
        assert resp.token_type == "bearer"
        assert resp.access_token == "abc123"
        assert resp.expires_in == 900


class TestUserCreate:
    def test_minimal_user(self):
        user = UserCreate(
            email="user@test.com",
            first_name="John",
            last_name="Doe",
            role="TeamMember",
        )
        assert user.email == "user@test.com"
        assert user.skills == []

    def test_full_user(self):
        user = UserCreate(
            email="admin@test.com",
            password="secret123",
            first_name="Admin",
            last_name="User",
            role="Admin",
            department="IT",
            bio="Platform admin",
            skills=["Python", "FastAPI"],
        )
        assert user.password == "secret123"
        assert user.skills == ["Python", "FastAPI"]


class TestLoginRequest:
    def test_valid_login(self):
        req = LoginRequest(email="user@test.com", password="pass123")
        assert req.email == "user@test.com"


class TestAzureLoginRequest:
    def test_valid_azure_login(self):
        req = AzureLoginRequest(
            code="auth-code-123", redirect_uri="http://localhost:3000/callback"
        )
        assert req.code == "auth-code-123"


class TestHealthResponse:
    def test_defaults(self):
        resp = HealthResponse(status="healthy", service="identity")
        assert resp.version == "0.1.0"


class TestPaginationParams:
    def test_defaults(self):
        p = PaginationParams()
        assert p.page == 1
        assert p.page_size == 20

    def test_custom(self):
        p = PaginationParams(page=3, page_size=50)
        assert p.page == 3
        assert p.page_size == 50
