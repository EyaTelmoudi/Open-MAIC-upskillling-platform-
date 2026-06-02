"""Integration tests for CSV user import via API."""

import io
import pytest
from fastapi.testclient import TestClient
from services.identity.main import app


@pytest.fixture
def client():
    """Create test client."""
    return TestClient(app)


@pytest.fixture
def admin_token(client):
    """Create admin token for testing."""
    from common.auth import create_access_token

    return create_access_token("test-admin-id", "admin@test.com", "Admin", "local")


@pytest.fixture
def non_admin_token(client):
    """Create non-admin token for testing."""
    from common.auth import create_access_token

    return create_access_token("test-user-id", "user@test.com", "TeamMember", "local")


class TestCSVImportEndpoint:
    """Tests for /users/import endpoint."""

    def test_import_requires_admin(self, client, non_admin_token):
        """Test import rejects non-admin users."""
        response = client.post(
            "/api/v1/identity/users/import",
            headers={"Authorization": f"Bearer {non_admin_token}"},
            files={
                "file": ("test.csv", b"email,first_name,last_name,role", "text/csv")
            },
        )
        assert response.status_code == 403

    def test_import_requires_auth(self, client):
        """Test import rejects unauthenticated requests."""
        response = client.post(
            "/api/v1/identity/users/import",
            files={
                "file": ("test.csv", b"email,first_name,last_name,role", "text/csv")
            },
        )
        assert response.status_code == 401

    def test_import_requires_csv_file(self, client, admin_token):
        """Test import rejects non-CSV files."""
        response = client.post(
            "/api/v1/identity/users/import",
            headers={"Authorization": f"Bearer {admin_token}"},
            files={"file": ("test.txt", b"content", "text/plain")},
        )
        assert response.status_code == 400
        assert "CSV file" in response.json()["detail"]

    @pytest.mark.skip(reason="Requires database connection")
    def test_import_valid_csv(self, client, admin_token):
        """Test import with valid CSV content."""
        csv_content = "email,first_name,last_name,role,department\ntest1@example.com,Test,User,TeamMember,IT"
        response = client.post(
            "/api/v1/identity/users/import",
            headers={"Authorization": f"Bearer {admin_token}"},
            files={"file": ("test.csv", csv_content.encode(), "text/csv")},
        )

        assert response.status_code == 200
        data = response.json()
        assert "success_count" in data
        assert "skipped_count" in data
        assert "errors" in data

    @pytest.mark.skip(reason="Requires database connection")
    def test_import_validates_email(self, client, admin_token):
        """Test import validates email format."""
        """Test import validates email format."""
        csv_content = "email,first_name,last_name,role,department\ninvalid-email,Test,User,TeamMember,IT"
        response = client.post(
            "/api/v1/identity/users/import",
            headers={"Authorization": f"Bearer {admin_token}"},
            files={"file": ("test.csv", csv_content.encode(), "text/csv")},
        )

        assert response.status_code == 200
        data = response.json()
        assert data["errors"] is not None
        assert len(data["errors"]) > 0

    @pytest.mark.skip(reason="Requires database connection")
    def test_import_validates_role(self, client, admin_token):
        """Test import validates role."""
        csv_content = "email,first_name,last_name,role,department\ntest@example.com,Test,User,InvalidRole,IT"
        response = client.post(
            "/api/v1/identity/users/import",
            headers={"Authorization": f"Bearer {admin_token}"},
            files={"file": ("test.csv", csv_content.encode(), "text/csv")},
        )

        assert response.status_code == 200
        data = response.json()
        assert any("Invalid role" in str(e) for e in data["errors"])
