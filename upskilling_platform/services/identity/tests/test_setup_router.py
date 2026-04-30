"""Tests for setup wizard endpoints."""

import os
import uuid
from unittest.mock import MagicMock

from fastapi import FastAPI
from fastapi.testclient import TestClient

from services.identity.routers.setup import router as setup_router


def create_setup_client(mock_db):
    app = FastAPI()
    app.include_router(setup_router)

    from common.database import get_db

    app.dependency_overrides[get_db] = lambda: mock_db
    return TestClient(app)


def test_setup_tenant_creates_real_tenant(monkeypatch, mock_db):
    monkeypatch.setenv("SETUP_SECRET_KEY", "test-setup-key")
    import services.identity.routers.setup as setup_module

    setup_module.SETUP_SECRET_KEY = "test-setup-key"

    def query_side_effect(model):
        query = MagicMock()
        if model.__name__ == "Tenant":
            query.filter.return_value.first.return_value = None
        elif model.__name__ == "User":
            admin = MagicMock()
            admin.id = uuid.UUID("11111111-1111-1111-1111-111111111111")
            admin.role = "SuperAdmin"
            query.filter.return_value.first.return_value = admin
        return query

    mock_db.query.side_effect = query_side_effect
    client = create_setup_client(mock_db)

    response = client.post(
        "/setup/tenant",
        headers={"X-Setup-Key": "test-setup-key"},
        json={
            "name": "Example Company",
            "slug": "example-company",
            "email_domain": "example.com",
        },
    )

    assert response.status_code == 201
    body = response.json()
    assert body["message"] == "First tenant created"
    assert body["name"] == "Example Company"
    assert body["slug"] == "example-company"
    mock_db.add.assert_called_once()
    mock_db.commit.assert_called_once()
    mock_db.refresh.assert_called_once()


def test_complete_setup_marks_first_tenant_only_when_present(monkeypatch, mock_db):
    monkeypatch.setenv("SETUP_SECRET_KEY", "test-setup-key")
    import services.identity.routers.setup as setup_module

    setup_module.SETUP_SECRET_KEY = "test-setup-key"

    config = MagicMock()
    config.id = 1
    config.platform_name = "SkillForge"
    admin = MagicMock()
    admin.email = "superadmin@example.com"
    admin.role = "SuperAdmin"

    def query_side_effect(model):
        query = MagicMock()
        model_name = getattr(model, "__name__", None)
        if model_name == "SystemConfig":
            query.filter.return_value.first.return_value = config
        elif model_name == "User":
            query.filter.return_value.first.return_value = admin
        elif model_name == "Tenant" or str(model) == "Tenant.id":
            query.first.return_value = None
        return query

    mock_db.query.side_effect = query_side_effect
    client = create_setup_client(mock_db)

    response = client.post(
        "/setup/complete",
        headers={"X-Setup-Key": "test-setup-key"},
        json={"confirm": True},
    )

    assert response.status_code == 200
    assert config.superadmin_checklist["items"][1]["completed"] is False
    assert config.superadmin_checklist["completed_count"] == 1
