"""Role-Based Access Control (RBAC) middleware."""

import logging

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from common.auth import decode_token
from common.enums import UserRole

security = HTTPBearer()
logger = logging.getLogger("rbac")

# Role hierarchy: higher roles can access lower role endpoints
ROLE_HIERARCHY = {
    UserRole.SuperAdmin.value: 7,
    UserRole.Admin.value: 6,
    UserRole.Manager.value: 5,
    UserRole.LearningExpert.value: 4,
    UserRole.TeamManager.value: 3,
    UserRole.TeamMember.value: 2,
    UserRole.TeamIntern.value: 1,
}


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(HTTPBearer(auto_error=False)),
) -> dict:
    """Extract and validate the current user from JWT token.

    Args:
        credentials: HTTP Bearer credentials.

    Returns:
        Decoded user payload dict.

    Raises:
        HTTPException 401 if token is invalid or expired.
    """
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated - no credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated - empty token",
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


def require_role(*allowed_roles: str):
    """Dependency that requires specific roles.

    Args:
        allowed_roles: Role names that are allowed access.

    Returns:
        FastAPI dependency function.

    Raises:
        HTTPException 403 if user role is not allowed.
    """

    def role_checker(
        current_user: dict = Depends(get_current_user),
    ) -> dict:
        user_role = current_user.get("role")
        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user_role}' not authorized for this action",
            )
        return current_user

    return role_checker


def require_min_role(min_role: str):
    """Dependency that requires a minimum role level.

    Uses the role hierarchy to determine access.

    Args:
        min_role: Minimum role required.

    Returns:
        FastAPI dependency function.

    Raises:
        HTTPException 403 if user role level is too low.
    """

    def min_role_checker(
        current_user: dict = Depends(get_current_user),
    ) -> dict:
        user_role = current_user.get("role")
        user_level = ROLE_HIERARCHY.get(user_role, 0)
        min_level = ROLE_HIERARCHY.get(min_role, 0)

        if user_level < min_level:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires minimum role '{min_role}'",
            )
        return current_user

    return min_role_checker
