"""Integration tests for the Sprint 2 content ingestion pipeline."""

import os
import sys
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from common.auth import create_access_token
from services.learning.routers import upload


@pytest.fixture
def content_client():
    """Create a test app exposing the content upload routes."""
    app = FastAPI()
    app.include_router(upload.router, prefix="/api/v1")
    return TestClient(app)


def _auth_headers(tenant_id: str) -> dict[str, str]:
    """Create Learning-service auth headers with tenant context."""
    token = create_access_token(
        user_id=str(uuid4()),
        email="expert@example.com",
        role="LearningExpert",
        auth_provider="local",
        tenant_id=tenant_id,
    )
    return {"Authorization": f"Bearer {token}"}


def _fake_db_generator(mock_db):
    """Match the generator contract expected by the upload router."""
    def _generator():
        yield mock_db

    return _generator


def test_pdf_upload_flows_through_ingestion_pipeline(content_client, monkeypatch):
    """A PDF upload is validated, stored, and returned with indexed metadata."""
    tenant_id = str(uuid4())
    mock_db = MagicMock()

    monkeypatch.setattr(
        upload,
        "_get_user_from_payload",
        lambda payload: SimpleNamespace(tenant_id=tenant_id),
    )
    monkeypatch.setattr(upload, "get_db", _fake_db_generator(mock_db))
    monkeypatch.setattr(
        "services.learning.services.content.ingestion.get_minio_client",
        lambda: MagicMock(),
    )
    monkeypatch.setattr(
        "services.learning.services.content.ingestion.upload_file",
        lambda bucket_name, object_name, file_data, content_type, client: object_name,
    )
    monkeypatch.setattr(
        "services.learning.services.content.ingestion.get_presigned_url",
        lambda bucket_name, object_name, expires, client: f"https://minio/{bucket_name}/{object_name}",
    )

    response = content_client.post(
        "/api/v1/content/upload",
        headers=_auth_headers(tenant_id),
        files={"file": ("lesson.pdf", b"%PDF-1.4 sample", "application/pdf")},
        data={"course_id": str(uuid4())},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["bucket"] == "course-pdfs"
    assert body["content_type"] == "pdf"
    assert body["tenant_id"] == tenant_id
    assert body["object_name"].startswith(f"{tenant_id}/courses/")


def test_image_upload_flows_through_ingestion_pipeline(content_client, monkeypatch):
    """An image upload uses the image bucket and tenant-prefixed object path."""
    tenant_id = str(uuid4())
    mock_db = MagicMock()

    monkeypatch.setattr(
        upload,
        "_get_user_from_payload",
        lambda payload: SimpleNamespace(tenant_id=tenant_id),
    )
    monkeypatch.setattr(upload, "get_db", _fake_db_generator(mock_db))
    monkeypatch.setattr(
        "services.learning.services.content.ingestion.get_minio_client",
        lambda: MagicMock(),
    )
    monkeypatch.setattr(
        "services.learning.services.content.ingestion.upload_file",
        lambda bucket_name, object_name, file_data, content_type, client: object_name,
    )
    monkeypatch.setattr(
        "services.learning.services.content.ingestion.get_presigned_url",
        lambda bucket_name, object_name, expires, client: f"https://minio/{bucket_name}/{object_name}",
    )

    response = content_client.post(
        "/api/v1/content/upload",
        headers=_auth_headers(tenant_id),
        files={"file": ("cover.png", b"\x89PNG sample", "image/png")},
        data={"course_id": str(uuid4()), "module_id": str(uuid4())},
    )

    assert response.status_code == 201
    body = response.json()
    assert body["bucket"] == "course-images"
    assert body["content_type"] == "image"
    assert body["url"].startswith("https://minio/course-images/")
