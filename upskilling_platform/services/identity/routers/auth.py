"""Authentication router for the Identity Service."""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from common.database import get_db
from common.models import User
from common.schemas import AzureLoginRequest, LoginRequest, TokenResponse
from services.identity.schemas.auth import SetPasswordRequest
from services.identity.schemas.user import RefreshTokenRequest

router = APIRouter(prefix="/auth", tags=["authentication"])


def resolve_tenant_by_slug(db: Session, slug: str) -> Optional[dict]:
    """Resolve tenant by slug query parameter."""
    from common.models import Tenant

    tenant = (
        db.query(Tenant).filter(Tenant.slug == slug, Tenant.status == "active").first()
    )

    if tenant:
        return {
            "id": str(tenant.id),
            "name": tenant.name,
            "slug": tenant.slug,
            "entra_client_id": tenant.entra_client_id,
            "entra_tenant_id": tenant.entra_tenant_id,
        }
    return None


def resolve_tenant_by_email(db: Session, email: str) -> Optional[dict]:
    """Resolve tenant by email domain."""
    from common.models import Tenant, User

    domain = email.split("@")[-1].lower() if "@" in email else None
    if not domain:
        return None

    # First: check if user exists and has a tenant
    user = db.query(User).filter(User.email == email).first()
    if user and user.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
        if tenant and tenant.status == "active":
            return {
                "id": str(tenant.id),
                "name": tenant.name,
                "slug": tenant.slug,
                "entra_client_id": tenant.entra_client_id,
                "entra_tenant_id": tenant.entra_tenant_id,
            }

    # Second: fallback to tenant email_domain lookup
    tenant = (
        db.query(Tenant)
        .filter(Tenant.email_domain == domain, Tenant.status == "active")
        .first()
    )
    if tenant:
        return {
            "id": str(tenant.id),
            "name": tenant.name,
            "slug": tenant.slug,
            "entra_client_id": tenant.entra_client_id,
            "entra_tenant_id": tenant.entra_tenant_id,
        }

    return None


@router.post("/login/local", response_model=TokenResponse)
def local_login(
    request: LoginRequest,
    tenant: Optional[str] = Query(None, alias="tenant"),
    db: Session = Depends(get_db),
):
    """Login with email and password.

    Supports optional ?tenant={slug} query parameter for tenant resolution.

    Args:
        request: Login credentials.
        tenant: Optional tenant slug for multi-tenant login.
        db: Database session.

    Returns:
        TokenResponse with access and refresh tokens.

    Raises:
        HTTPException 401 if credentials are invalid.
    """
    from services.identity.auth.local import authenticate_local

    resolved_tenant_id = None

    if tenant:
        tenant_obj = resolve_tenant_by_slug(db, tenant)
        if not tenant_obj:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant not found or inactive",
            )
        resolved_tenant_id = tenant_obj["id"]

    token_response = authenticate_local(
        db, request.email, request.password, resolved_tenant_id
    )
    if token_response is None and resolved_tenant_id is None:
        token_response = authenticate_local(
            db, request.email, request.password, None, is_superadmin=True
        )
    if token_response is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )
    return token_response


@router.post("/login/azure", response_model=TokenResponse)
def azure_login(
    request: AzureLoginRequest,
    tenant: Optional[str] = Query(None, alias="tenant"),
    db: Session = Depends(get_db),
):
    """Login via Azure Entra ID (enterprise users).

    Supports optional ?tenant={slug} query parameter for tenant resolution.
    Falls back to email domain detection.

    Args:
        request: Azure authorization code and redirect URI.
        tenant: Optional tenant slug for multi-tenant login.
        db: Database session.

    Returns:
        TokenResponse with access and refresh tokens.
        Includes status and onboarded fields in JWT for access gating.

    Raises:
        HTTPException 401 if Azure authentication fails.
    """
    from services.identity.auth.azure import authenticate_azure_with_roles

    tenant_config = None

    if tenant:
        tenant_config = resolve_tenant_by_slug(db, tenant)

    if not tenant_config and request.email:
        tenant_config = resolve_tenant_by_email(db, request.email)

    if not tenant_config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found or inactive",
        )

    token_response = authenticate_azure_with_roles(
        db,
        request.code,
        request.redirect_uri,
        azure_roles=[],
        tenant_id=tenant_config.get("id"),
        tenant_config={
            "client_id": tenant_config.get("entra_client_id"),
            "tenant_id": tenant_config.get("entra_tenant_id"),
        },
    )
    if token_response is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Azure authentication failed",
        )
    return token_response


@router.post("/login/superadmin", response_model=TokenResponse)
def superadmin_login(
    request: LoginRequest,
    db: Session = Depends(get_db),
):
    """Login as Super Admin (bypasses tenant context).

    Super Admin login does NOT include tenantId in JWT.

    Args:
        request: Login credentials.
        db: Database session.

    Returns:
        TokenResponse with access and refresh tokens (tenantId=null).

    Raises:
        HTTPException 401 if credentials are invalid.
    """
    from services.identity.auth.local import authenticate_local

    token_response = authenticate_local(
        db, request.email, request.password, None, is_superadmin=True
    )
    if token_response is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials or not a Super Admin user",
        )
    return token_response


@router.post("/refresh", response_model=TokenResponse)
def refresh_token(
    request: RefreshTokenRequest,
    tenant_id: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Refresh an access token using a refresh token.

    Args:
        request: The refresh token payload.
        tenant_id: Optional tenant ID for multi-tenancy.
        db: Database session.

    Returns:
        New TokenResponse.

    Raises:
        HTTPException 401 if refresh token is invalid.
    """
    from services.identity.auth.jwt import refresh_access_token, validate_refresh_token

    validated_user_id = validate_refresh_token(request.refresh_token)
    if validated_user_id is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )

    user = db.query(User).filter(User.id == validated_user_id).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found for refresh token",
        )

    resolved_tenant_id = None
    if user.role != "SuperAdmin":
        resolved_tenant_id = tenant_id or (str(user.tenant_id) if user.tenant_id else None)

    user_data = {
        "id": str(user.id),
        "email": user.email,
        "role": user.role,
        "auth_provider": user.auth_provider,
        "tenant_id": resolved_tenant_id,
        "status": user.status,
        "onboarded": bool(user.onboarded),
    }
    token_response = refresh_access_token(request.refresh_token, user_data)
    if token_response is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid refresh token",
        )
    return token_response


@router.post("/set-password", response_model=TokenResponse)
def set_password(
    request: SetPasswordRequest,
    db: Session = Depends(get_db),
):
    """Set initial password for invited users using a one-time token.
    
    Validates token, hashes password, sets user status to active, 
    and returns initial tokens.
    
    Args:
        request: Token and new password.
        db: Database session.
        
    Returns:
        TokenResponse with access and refresh tokens.
    """
    from common.models import User, Tenant
    from common.auth import hash_password
    from services.identity.auth.jwt import generate_token_response
    from services.identity.auth.tokens import is_token_expired
    from common.enums import UserStatus
    from datetime import datetime

    user = (
        db.query(User)
        .filter(
            User.invitation_token == request.token,
            User.status == UserStatus.pending.value,
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired invitation token",
        )

    if is_token_expired(user.invitation_expires_at):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation token has expired",
        )

    # Update user
    user.password_hash = hash_password(request.password)
    user.invitation_token = None
    user.invitation_expires_at = None
    user.status = UserStatus.active.value
    user.updated_at = datetime.utcnow()
    
    db.commit()
    db.refresh(user)

    # Generate token response
    token_response = generate_token_response(
        user,
        str(user.tenant_id) if user.tenant_id else None,
    )

    # Format response to match TokenResponse schema
    return TokenResponse(
        access_token=token_response["access_token"],
        refresh_token=token_response["refresh_token"],
        token_type="bearer",
        expires_in=token_response.get("expires_in", 3600),
        role=user.role,
        email=user.email,
    )
