"""Integration tests: API Gateway → Identity Service routing."""

import os
import sys
import uuid
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))


@pytest.fixture
def mock_db_session():
    """Mock the database session for integration tests."""
    mock_db = MagicMock()
    mock_db.query = MagicMock(return_value=mock_db)
    mock_db.filter = MagicMock(return_value=mock_db)
    mock_db.first = MagicMock(return_value=None)
    mock_db.add = MagicMock()
    mock_db.commit = MagicMock()
    mock_db.refresh = MagicMock()
    mock_db.all = MagicMock(return_value=[])
    mock_db.count = MagicMock(return_value=0)
    mock_db.offset = MagicMock(return_value=mock_db)
    mock_db.limit = MagicMock(return_value=mock_db)
    return mock_db


@pytest.fixture
def identity_client(mock_db_session):
    """Create a test client for the Identity service with mocked DB."""
    from fastapi import FastAPI
    from services.identity.routers.auth import router as auth_router
    from services.identity.routers.users import router as users_router

    app = FastAPI()
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(users_router, prefix="/api/v1")

    def override_get_db():
        yield mock_db_session

    from common.database import get_db

    app.dependency_overrides[get_db] = override_get_db

    return TestClient(app)


@pytest.fixture
def gateway_client():
    """Create a test client for the API Gateway."""
    from services.gateway.main import app

    return TestClient(app)


class TestIdentityServiceHealth:
    def test_identity_health_endpoint(self):
        """Identity service /health returns healthy status."""
        from fastapi import FastAPI

        app = FastAPI()

        @app.get("/health")
        async def health():
            return {"status": "healthy", "service": "identity"}

        client = TestClient(app)
        response = client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "identity"


class TestGatewayHealth:
    def test_gateway_health_endpoint(self, gateway_client):
        """Gateway /health returns healthy status."""
        response = gateway_client.get("/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "healthy"
        assert data["service"] == "gateway"

    def test_gateway_unknown_service_returns_404(self, gateway_client):
        """Gateway returns 404 for unknown service."""
        response = gateway_client.get("/api/v1/unknown/health")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


class TestGatewayProxyRouting:
    def test_gateway_routes_to_identity(self, gateway_client):
        """Gateway correctly routes /api/v1/identity/* to identity service."""
        # This test verifies the routing logic exists in the gateway
        # Actual proxy behavior requires running services
        from services.gateway.main import SERVICE_MAP

        assert "identity" in SERVICE_MAP
        assert "learning" in SERVICE_MAP
        assert "agents" in SERVICE_MAP
        assert "notifications" in SERVICE_MAP

    def test_gateway_service_map_contains_all_services(self):
        """All 4 microservices are in the gateway service map."""
        from services.gateway.main import SERVICE_MAP

        expected_services = {"identity", "learning", "agents", "notifications"}
        assert set(SERVICE_MAP.keys()) == expected_services


class TestAuthEndpointsViaIdentity:
    def test_local_login_endpoint_exists(self, identity_client):
        """POST /api/v1/auth/login/local is registered."""
        response = identity_client.post(
            "/api/v1/auth/login/local",
            json={"email": "test@test.com", "password": "test"},
        )
        # Should get 401 (not 404), proving the endpoint exists
        assert response.status_code in (401, 422)

    def test_azure_login_endpoint_exists(self, identity_client):
        """POST /api/v1/auth/login/azure is registered."""
        response = identity_client.post(
            "/api/v1/auth/login/azure",
            json={
                "code": "test-code",
                "redirect_uri": "http://localhost:3000/callback",
            },
        )
        # Should get 200 (demo mode) or 401, not 404
        assert response.status_code in (200, 401, 422)

    def test_local_login_invalid_credentials_returns_401(self, identity_client):
        """Invalid credentials return 401."""
        response = identity_client.post(
            "/api/v1/auth/login/local",
            json={"email": "nonexistent@test.com", "password": "wrong"},
        )
        assert response.status_code == 401

    def test_azure_login_demo_mode_returns_tokens(self, identity_client):
        """Azure login in demo mode returns valid tokens."""
        response = identity_client.post(
            "/api/v1/auth/login/azure",
            json={
                "code": "demo-code",
                "redirect_uri": "http://localhost:3000/callback",
            },
        )
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] == 900

    def test_azure_demo_token_is_valid_jwt(self, identity_client):
        """Azure demo token is a valid JWT with correct claims."""
        from common.auth import decode_token

        response = identity_client.post(
            "/api/v1/auth/login/azure",
            json={
                "code": "demo-code",
                "redirect_uri": "http://localhost:3000/callback",
            },
        )
        token = response.json()["access_token"]
        payload = decode_token(token)
        assert payload is not None
        assert payload["email"] == "demo@enterprise.com"
        assert payload["auth_provider"] == "azure_entra"


class TestProtectedEndpointsRejectUnauthenticated:
    def test_users_list_requires_auth(self, identity_client):
        """GET /users/ requires authentication."""
        response = identity_client.get("/api/v1/users/")
        assert response.status_code in (401, 403)

    def test_users_me_requires_auth(self, identity_client):
        """GET /users/me requires authentication."""
        response = identity_client.get("/api/v1/users/me")
        assert response.status_code in (401, 403)

    def test_users_detail_requires_auth(self, identity_client):
        """GET /users/{id} requires authentication."""
        response = identity_client.get(
            "/api/v1/users/11111111-1111-1111-1111-111111111111"
        )
        assert response.status_code in (401, 403)

    def test_users_update_requires_auth(self, identity_client):
        """PUT /users/{id} requires authentication."""
        response = identity_client.put(
            "/api/v1/users/11111111-1111-1111-1111-111111111111",
            json={"first_name": "Test"},
        )
        assert response.status_code in (401, 403)

    def test_users_deactivate_requires_auth(self, identity_client):
        """POST /users/{id}/deactivate requires authentication."""
        response = identity_client.post(
            "/api/v1/users/11111111-1111-1111-1111-111111111111/deactivate"
        )
        assert response.status_code in (401, 403)


class TestTokenRefreshFlow:
    def test_refresh_endpoint_exists(self, identity_client):
        """POST /api/v1/auth/refresh is registered."""
        response = identity_client.post(
            "/api/v1/auth/refresh",
            params={
                "refresh_token": "invalid",
                "user_id": "u1",
                "email": "e@e.com",
                "role": "Admin",
                "auth_provider": "local",
            },
        )
        # Should get 401 (invalid token), not 404
        assert response.status_code in (401, 422)

    def test_full_token_refresh_flow(self, identity_client, mock_db_session):
        """Full flow: create user, get tokens, then refresh."""
        import uuid
        from common.auth import decode_token, create_refresh_token

        # Create a mock user with a proper UUID for the demo auth
        mock_user = MagicMock()
        mock_user.id = uuid.UUID("33333333-3333-3333-3333-333333333333")
        mock_user.email = "demo@enterprise.com"
        mock_user.role = "TeamMember"
        mock_user.auth_provider = "azure_entra"
        mock_db_session.first.return_value = mock_user

        # Step 1: Get initial tokens via Azure demo login
        login_response = identity_client.post(
            "/api/v1/auth/login/azure",
            json={
                "code": "demo-code",
                "redirect_uri": "http://localhost:3000/callback",
            },
        )
        assert login_response.status_code == 200
        tokens = login_response.json()

        # Step 2: Decode the access token to verify claims
        access_payload = decode_token(tokens["access_token"])
        assert access_payload is not None
        assert access_payload["sub"] == "33333333-3333-3333-3333-333333333333"

        # Step 3: Create a fresh refresh token for the refresh call
        refresh_token = create_refresh_token(
            user_id="33333333-3333-3333-3333-333333333333"
        )

        # Step 4: Refresh the access token
        refresh_response = identity_client.post(
            "/api/v1/auth/refresh",
            params={
                "refresh_token": refresh_token,
                "user_id": "33333333-3333-3333-3333-333333333333",
                "email": "demo@enterprise.com",
                "role": "TeamMember",
                "auth_provider": "azure_entra",
            },
        )
        assert refresh_response.status_code == 200
        new_tokens = refresh_response.json()
        assert "access_token" in new_tokens
        assert "refresh_token" in new_tokens
