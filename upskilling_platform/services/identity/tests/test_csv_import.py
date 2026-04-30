"""Tests for CSV user import functionality."""

import pytest
from services.identity.schemas.user import (
    CSVImportResult,
    CSVUserImport,
    parse_csv_users,
)


class TestCSVUserImport:
    """Tests for CSVUserImport schema."""

    def test_valid_user_creation(self):
        """Test creating a valid user."""
        user = CSVUserImport(
            email="test@example.com",
            first_name="John",
            last_name="Doe",
            role="TeamMember",
        )
        assert user.email == "test@example.com"
        assert user.first_name == "John"
        assert user.last_name == "Doe"
        assert user.role == "TeamMember"

    def test_valid_user_with_department(self):
        """Test creating a user with department."""
        user = CSVUserImport(
            email="test@example.com",
            first_name="John",
            last_name="Doe",
            role="Manager",
            department="Engineering",
        )
        assert user.department == "Engineering"

    def test_email_normalization(self):
        """Test email is normalized to lowercase."""
        user = CSVUserImport(
            email="TEST@EXAMPLE.COM",
            first_name="John",
            last_name="Doe",
            role="TeamMember",
        )
        assert user.email == "test@example.com"

    def test_invalid_email_raises(self):
        """Test invalid email raises error."""
        with pytest.raises(ValueError, match="Invalid email"):
            CSVUserImport(
                email="invalid-email",
                first_name="John",
                last_name="Doe",
                role="TeamMember",
            )

    def test_empty_first_name_raises(self):
        """Test empty first name raises error."""
        with pytest.raises(ValueError, match="Name cannot be empty"):
            CSVUserImport(
                email="test@example.com",
                first_name="",
                last_name="Doe",
                role="TeamMember",
            )

    def test_invalid_role_raises(self):
        """Test invalid role raises error."""
        with pytest.raises(ValueError, match="Invalid role"):
            CSVUserImport(
                email="test@example.com",
                first_name="John",
                last_name="Doe",
                role="InvalidRole",
            )


class TestParseCSVUsers:
    """Tests for CSV parsing."""

    def test_parse_valid_csv(self):
        """Test parsing a valid CSV."""
        csv_content = """email,first_name,last_name,role,department
john@example.com,John,Doe,TeamMember,Engineering
jane@example.com,Jane,Smith,Manager,Sales
"""
        valid_users, errors = parse_csv_users(csv_content)

        assert len(valid_users) == 2
        assert valid_users[0].email == "john@example.com"
        assert valid_users[0].first_name == "John"
        assert valid_users[1].role == "Manager"
        assert len(errors) == 0

    def test_parse_csv_with_invalid_row(self):
        """Test parsing CSV with invalid row."""
        csv_content = """email,first_name,last_name,role,department
john@example.com,John,Doe,TeamMember,Engineering
invalid-email,John,Doe,TeamMember,
"""
        valid_users, errors = parse_csv_users(csv_content)

        assert len(valid_users) == 1
        assert len(errors) == 1
        assert "Invalid email" in errors[0]["error"]

    def test_parse_csv_missing_headers(self):
        """Test CSV missing required headers."""
        csv_content = """email,first_name
john@example.com,John
"""
        valid_users, errors = parse_csv_users(csv_content)

        assert len(valid_users) == 0
        assert len(errors) == 1

    def test_parse_empty_csv(self):
        """Test parsing empty CSV content."""
        csv_content = ""
        valid_users, errors = parse_csv_users(csv_content)

        assert len(valid_users) == 0
        assert len(errors) == 0


class TestCSVImportResult:
    """Tests for CSVImportResult schema."""

    def test_result_creation(self):
        """Test creating import result."""
        result = CSVImportResult(
            success_count=5,
            skipped_count=2,
            errors=[{"row": 1, "error": "Error"}],
            total_rows=7,
        )
        assert result.success_count == 5
        assert result.skipped_count == 2
        assert result.total_rows == 7

    def test_result_with_no_errors(self):
        """Test creating result with no errors."""
        result = CSVImportResult(
            success_count=10,
            skipped_count=0,
            errors=[],
            total_rows=10,
        )
        assert len(result.errors) == 0
