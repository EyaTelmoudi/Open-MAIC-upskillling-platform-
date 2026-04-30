"""Tests for common.auth module."""

from datetime import timedelta

from common.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    JWT_ALGORITHM,
    JWT_SECRET_KEY,
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    decode_token,
    hash_password,
    verify_password,
)


class TestPasswordHashing:
    def test_hash_password_returns_string(self):
        hashed = hash_password("testpassword123")
        assert isinstance(hashed, str)
        assert hashed != "testpassword123"

    def test_verify_password_correct(self):
        password = "my_secure_password"
        hashed = hash_password(password)
        assert verify_password(password, hashed) is True

    def test_verify_password_incorrect(self):
        hashed = hash_password("correct_password")
        assert verify_password("wrong_password", hashed) is False

    def test_different_hashes_for_same_password(self):
        password = "same_password"
        hash1 = hash_password(password)
        hash2 = hash_password(password)
        assert hash1 != hash2  # bcrypt uses random salt
        assert verify_password(password, hash1)
        assert verify_password(password, hash2)


class TestCreateAccessToken:
    def test_creates_valid_token(self):
        token = create_access_token(
            user_id="user-123",
            email="test@example.com",
            role="TeamMember",
            auth_provider="azure_entra",
        )
        assert isinstance(token, str)
        assert len(token) > 0

    def test_token_contains_expected_claims(self):
        token = create_access_token(
            user_id="user-456",
            email="admin@example.com",
            role="Admin",
            auth_provider="local",
        )
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "user-456"
        assert payload["email"] == "admin@example.com"
        assert payload["role"] == "Admin"
        assert payload["auth_provider"] == "local"
        assert "exp" in payload
        assert "iat" in payload

    def test_custom_expiry(self):
        token = create_access_token(
            user_id="user-789",
            email="test@example.com",
            role="Manager",
            auth_provider="azure_entra",
            expires_delta=timedelta(minutes=5),
        )
        payload = decode_token(token)
        assert payload is not None


class TestCreateRefreshToken:
    def test_creates_valid_refresh_token(self):
        token = create_refresh_token("user-123")
        assert isinstance(token, str)
        assert len(token) > 0

    def test_refresh_token_contains_user_id(self):
        token = create_refresh_token("user-abc")
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "user-abc"
        assert payload["type"] == "refresh"


class TestDecodeToken:
    def test_decode_valid_token(self):
        token = create_access_token(
            user_id="user-valid",
            email="valid@example.com",
            role="TeamMember",
            auth_provider="local",
        )
        payload = decode_token(token)
        assert payload is not None
        assert payload["sub"] == "user-valid"

    def test_decode_invalid_token(self):
        payload = decode_token("invalid.token.here")
        assert payload is None

    def test_decode_empty_token(self):
        payload = decode_token("")
        assert payload is None
