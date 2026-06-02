"""Authentication utilities for the Upskilling Platform."""

import os
from datetime import datetime, timedelta, timezone
from typing import Optional

import bcrypt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "dev-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "15"))
REFRESH_TOKEN_EXPIRE_DAYS = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "365"))
BCRYPT_ROUNDS = 12


def hash_password(password: str) -> str:
    """Hash a password using bcrypt."""
    salt = bcrypt.gensalt(rounds=BCRYPT_ROUNDS)
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash."""
    return bcrypt.checkpw(
        plain_password.encode("utf-8"), hashed_password.encode("utf-8")
    )


def create_access_token(
    user_id: str,
    email: str,
    role: str,
    auth_provider: str,
    status: str = "active",
    onboarded: bool = True,
    tenant_id: Optional[str] = None,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """Create a JWT access token.

    Args:
        user_id: User UUID as string.
        email: User email.
        role: User role (e.g. Admin, TeamMember).
        auth_provider: Auth provider (azure_entra or local).
        status: User account status (pending, active, etc.).
        onboarded: Whether user has completed onboarding.
        tenant_id: Tenant ID for multi-tenancy (null for SuperAdmin).
        expires_delta: Optional custom expiry.

    Returns:
        Encoded JWT string.
    """
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(
            minutes=ACCESS_TOKEN_EXPIRE_MINUTES
        )

    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "auth_provider": auth_provider,
        "status": status,
        "onboarded": onboarded,
        "tenantId": tenant_id,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def create_refresh_token(user_id: str) -> str:
    """Create a JWT refresh token.

    Args:
        user_id: User UUID as string.

    Returns:
        Encoded JWT refresh token string.
    """
    expire = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)
    payload = {
        "sub": user_id,
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "type": "refresh",
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decode and validate a JWT token.

    Args:
        token: Encoded JWT string.

    Returns:
        Decoded payload dict or None if invalid.
    """
    try:
        payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        return None


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = None,
) -> dict:
    """Extract and validate the current user from JWT token.

    Can be used as a FastAPI dependency: Depends(get_current_user)
    Or called directly with an authorization string.

    Usage in FastAPI:
        @router.get("/endpoint")
        def endpoint(current_user = Depends(get_current_user)):
            ...

    Args:
        credentials: Optional HTTPAuthorizationCredentials. If not provided,
                    can be passed directly as a string via authorization param.

    Returns:
        Decoded user payload dict.

    Raises:
        HTTPException 401 if token is invalid or expired.
    """
    from fastapi import HTTPException, status
    from fastapi.security import HTTPBearer

    security = HTTPBearer(auto_error=False)

    token = None

    if credentials:
        if hasattr(credentials, "credentials"):
            token = credentials.credentials
        else:
            token = str(credentials)

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def get_current_user_dependency():
    """FastAPI dependency for getting current user.

    Usage:
        from fastapi import Depends
        from common.auth import get_current_user_dependency

        @router.get("/endpoint")
        def endpoint(user = Depends(get_current_user_dependency)):
            ...
    """
    from fastapi import Depends
    from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

    security = HTTPBearer(auto_error=True)

    def get_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
        token = credentials.credentials
        payload = decode_token(token)
        if payload is None:
            from fastapi import HTTPException, status

            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired token",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload

    return get_user
