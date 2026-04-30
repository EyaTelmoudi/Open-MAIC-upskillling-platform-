"""Local email/password authentication."""

from typing import Optional

from common.auth import verify_password
from common.enums import AuthProvider, UserRole, UserStatus
from common.models import User
from common.schemas import TokenResponse
from sqlalchemy.orm import Session

from services.identity.auth.jwt import generate_token_response


def authenticate_local(
    db: Session,
    email: str,
    password: str,
    tenant_id: Optional[str] = None,
    is_superadmin: bool = False,
) -> Optional[TokenResponse]:
    """Authenticate a local user with email and password.

    Super Admin users authenticate through the dedicated superadmin login.
    Tenant users can authenticate locally when their account was created
    with the local provider and is active.

    Args:
        db: Database session.
        email: User email.
        password: Plain text password.
        tenant_id: Optional tenant ID for tenant-scoped auth.
        is_superadmin: If True, allow SuperAdmin role and bypass tenant.

    Returns:
        TokenResponse if authentication succeeds, None otherwise.
    """
    user = db.query(User).filter(User.email == email).first()

    if user is None:
        return None

    if is_superadmin:
        if user.role != UserRole.SuperAdmin.value:
            return None
        if user.auth_provider != AuthProvider.local.value:
            return None
    else:
        if user.role == UserRole.SuperAdmin.value:
            return None
        if user.auth_provider != AuthProvider.local.value:
            return None
        if tenant_id and str(user.tenant_id) != tenant_id:
            return None

    if user.status != UserStatus.active.value:
        return None

    if not user.password_hash:
        return None

    if not verify_password(password, user.password_hash):
        return None

    resolved_tenant_id = None if is_superadmin else (tenant_id or str(user.tenant_id))

    return generate_token_response(
        user_id=str(user.id),
        email=user.email,
        role=user.role,
        auth_provider=AuthProvider.local.value,
        status=user.status,
        onboarded=user.onboarded,
        tenant_id=resolved_tenant_id,
    )
