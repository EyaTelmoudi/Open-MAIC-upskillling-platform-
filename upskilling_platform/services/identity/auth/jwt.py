"""JWT token management for the Identity Service."""

from datetime import timedelta
from typing import Optional

from common.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    REFRESH_TOKEN_EXPIRE_DAYS,
    create_access_token,
    create_refresh_token,
    decode_token,
)
from common.schemas import TokenResponse


def generate_token_response(
    user_id: str,
    email: str,
    role: str,
    auth_provider: str,
    status: str = "active",
    onboarded: bool = True,
    tenant_id: Optional[str] = None,
) -> TokenResponse:
    """Generate a complete token response with access and refresh tokens.

    Args:
        user_id: User UUID as string.
        email: User email.
        role: User role (e.g. Admin, TeamMember).
        auth_provider: Auth provider (azure_entra or local).
        status: User account status.
        onboarded: Whether user has completed onboarding.
        tenant_id: Tenant ID for multi-tenancy (null for SuperAdmin).

    Returns:
        TokenResponse with access_token, refresh_token, and metadata.
    """
    access_token = create_access_token(
        user_id=user_id,
        email=email,
        role=role,
        auth_provider=auth_provider,
        status=status,
        onboarded=onboarded,
        tenant_id=tenant_id,
    )
    refresh_token = create_refresh_token(user_id=user_id)

    return TokenResponse(
        access_token=access_token,
        refresh_token=refresh_token,
        token_type="bearer",
        expires_in=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        role=role,
        email=email,
    )


def validate_token(token: str) -> Optional[dict]:
    """Validate a JWT access token.

    Args:
        token: Encoded JWT string.

    Returns:
        Decoded payload dict or None if invalid.
    """
    return decode_token(token)


def validate_refresh_token(token: str) -> Optional[str]:
    """Validate a refresh token and return the user_id.

    Args:
        token: Encoded JWT refresh token string.

    Returns:
        User ID string or None if invalid.
    """
    payload = decode_token(token)
    if payload and payload.get("type") == "refresh":
        return payload.get("sub")
    return None


def refresh_access_token(
    refresh_token: str, user_data: dict
) -> Optional[TokenResponse]:
    """Refresh an access token using a valid refresh token.

    Args:
        refresh_token: The refresh token string.
        user_data: Dict with user info (id, email, role, auth_provider).

    Returns:
        New TokenResponse or None if refresh token is invalid.
    """
    user_id = validate_refresh_token(refresh_token)
    if user_id is None:
        return None

    return generate_token_response(
        user_id=user_data["id"],
        email=user_data["email"],
        role=user_data["role"],
        auth_provider=user_data["auth_provider"],
    )
