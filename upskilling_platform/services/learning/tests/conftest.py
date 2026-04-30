"""Shared fixtures for Learning service tests."""

import os
import sys
from types import SimpleNamespace
from uuid import uuid4

import pytest
from unittest.mock import MagicMock

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", ".."))


@pytest.fixture
def mock_db():
    """Create a mock SQLAlchemy session."""
    db = MagicMock()
    db.add = MagicMock()
    db.commit = MagicMock()
    db.refresh = MagicMock()
    db.flush = MagicMock()
    db.delete = MagicMock()
    return db


@pytest.fixture
def tenant_id():
    """Return a stable tenant UUID string for tests."""
    return str(uuid4())


@pytest.fixture
def admin_user(tenant_id):
    """Return a tenant-scoped admin-like user."""
    return SimpleNamespace(
        id=uuid4(),
        role="Admin",
        tenant_id=tenant_id,
        timezone="Africa/Tunis",
    )


@pytest.fixture
def learning_expert_user(tenant_id):
    """Return a tenant-scoped LearningExpert user."""
    return SimpleNamespace(
        id=uuid4(),
        role="LearningExpert",
        tenant_id=tenant_id,
        timezone="Africa/Tunis",
    )


@pytest.fixture
def team_member_user(tenant_id):
    """Return a tenant-scoped TeamMember user."""
    return SimpleNamespace(
        id=uuid4(),
        role="TeamMember",
        tenant_id=tenant_id,
        timezone="Africa/Tunis",
    )
