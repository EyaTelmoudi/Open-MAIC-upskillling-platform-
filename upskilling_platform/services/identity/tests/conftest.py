"""Shared test fixtures for Identity Service tests."""

import os
import sys
import uuid
from unittest.mock import MagicMock, patch

import pytest

# Add project root to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))


@pytest.fixture
def mock_db():
    """Create a mock SQLAlchemy session."""
    db = MagicMock()
    db.query = MagicMock(return_value=db)
    db.filter = MagicMock(return_value=db)
    db.first = MagicMock(return_value=None)
    db.add = MagicMock()
    db.commit = MagicMock()
    db.refresh = MagicMock()
    db.all = MagicMock(return_value=[])
    db.count = MagicMock(return_value=0)
    db.offset = MagicMock(return_value=db)
    db.limit = MagicMock(return_value=db)
    return db


@pytest.fixture
def sample_admin_user():
    """Create a sample admin user mock."""
    user = MagicMock()
    user.id = uuid.UUID("11111111-1111-1111-1111-111111111111")
    user.email = "admin@skillforge.com"
    user.password_hash = (
        "$2b$12$LJ3m4ys3Lg7E9Bx1qKz5eOQK1YqH7vJz8F3x9WnRtYpDcGbHiJkSa"  # "admin123"
    )
    user.auth_provider = "local"
    user.role = "Admin"
    user.status = "active"
    user.first_name = "Admin"
    user.last_name = "User"
    user.avatar = None
    user.department = None
    user.bio = None
    user.skills = []
    return user


@pytest.fixture
def sample_team_member():
    """Create a sample team member user mock."""
    user = MagicMock()
    user.id = uuid.UUID("22222222-2222-2222-2222-222222222222")
    user.email = "member@enterprise.com"
    user.password_hash = "$2b$12$LJ3m4ys3Lg7E9Bx1qKz5eOQK1YqH7vJz8F3x9WnRtYpDcGbHiJkSa"
    user.auth_provider = "azure_entra"
    user.role = "TeamMember"
    user.status = "active"
    user.first_name = "Team"
    user.last_name = "Member"
    user.avatar = None
    user.department = "Engineering"
    user.bio = None
    user.skills = []
    return user


@pytest.fixture
def valid_access_token():
    """Create a valid JWT access token for testing."""
    from common.auth import create_access_token

    return create_access_token(
        user_id="11111111-1111-1111-1111-111111111111",
        email="admin@skillforge.com",
        role="Admin",
        auth_provider="local",
    )


@pytest.fixture
def valid_member_token():
    """Create a valid JWT access token for a team member."""
    from common.auth import create_access_token

    return create_access_token(
        user_id="22222222-2222-2222-2222-222222222222",
        email="member@enterprise.com",
        role="TeamMember",
        auth_provider="azure_entra",
    )


@pytest.fixture
def valid_refresh_token():
    """Create a valid JWT refresh token for testing."""
    from common.auth import create_refresh_token

    return create_refresh_token(user_id="11111111-1111-1111-1111-111111111111")


@pytest.fixture
def identity_app():
    """Create a test FastAPI app for the identity service."""
    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from services.identity.routers.auth import router as auth_router
    from services.identity.routers.users import router as users_router

    app = FastAPI()
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(users_router, prefix="/api/v1")
    return app


@pytest.fixture
def identity_client(identity_app):
    """Create a test client for the identity service."""
    from fastapi.testclient import TestClient

    return TestClient(identity_app)
