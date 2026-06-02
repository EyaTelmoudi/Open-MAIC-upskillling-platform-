"""Tenant router for Super Admin management."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from common.database import get_db
from common.models import Tenant, User
from common.auth import get_current_user
from common.enums import UserRole, UserStatus
from common.messaging import RabbitMQClient
from services.identity.schemas.tenant import (
    AcceptInvitationRequest,
    AdminStatusUpdate,
    AssignTenantAdminRequest,
    InviteTenantAdminRequest,
    InviteTenantAdminResponse,
    SuspendTenantAdminRequest,
    TenantAdminListResponse,
    TenantAdminResponse,
    TenantCreate,
    TenantUpdate,
    TenantStatusUpdate,
    TenantResponse,
    TenantListResponse,
    TenantSetupProgress,
    TenantSetupProgressStep,
    UnassignTenantAdminRequest,
    TestEntraResponse,
)
from services.identity.entra_config import get_platform_entra_redirect_uris
from services.identity.middleware.rbac import require_role
from services.identity.middleware.audit import log_superadmin_action
from services.identity.user_defaults import get_default_user_timezone

router = APIRouter(prefix="/superadmin/tenants", tags=["tenants"])

# Public router for tenant listing (no auth required)
public_router = APIRouter(prefix="/tenants", tags=["public-tenants"])


def normalize_entra_redirect_uris(
    redirect_uris: Optional[list[str]],
    *,
    entra_configured: bool,
) -> list[str]:
    """Use the backend callback URI when tenant Entra credentials are configured."""
    cleaned = [
        str(value or "").strip()
        for value in (redirect_uris or [])
        if str(value or "").strip()
    ]
    if cleaned:
        return cleaned
    if entra_configured:
        return get_platform_entra_redirect_uris()
    return []


@router.post("", response_model=TenantResponse, status_code=status.HTTP_201_CREATED)
def create_tenant(
    tenant_data: TenantCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
    request: Request = None,
):
    """Create a new tenant (Super Admin only)."""
    existing = db.query(Tenant).filter(Tenant.slug == tenant_data.slug).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tenant with this slug already exists",
        )

    entra_configured = bool(tenant_data.entra_client_id and tenant_data.entra_tenant_id)
    tenant = Tenant(
        name=tenant_data.name,
        slug=tenant_data.slug,
        email_domain=tenant_data.email_domain,
        logo_url=tenant_data.logo_url,
        primary_color=tenant_data.primary_color,
        status="pending",
        entra_client_id=tenant_data.entra_client_id,
        entra_tenant_id=tenant_data.entra_tenant_id,
        entra_redirect_uris=normalize_entra_redirect_uris(
            tenant_data.entra_redirect_uris,
            entra_configured=entra_configured,
        ),
        seat_limit=tenant_data.seat_limit,
        created_by_id=current_user["sub"],
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    log_superadmin_action(
        db,
        action="tenant.create",
        actor_id=current_user["sub"],
        actor_email=current_user.get("email", "superadmin"),
        target_type="tenant",
        target_id=str(tenant.id),
        details={"name": tenant.name, "slug": tenant.slug},
        request=None,
    )

    return TenantResponse(
        id=str(tenant.id),
        name=tenant.name,
        slug=tenant.slug,
        email_domain=tenant.email_domain,
        logo_url=tenant.logo_url,
        primary_color=tenant.primary_color,
        status=tenant.status,
        entra_client_id=tenant.entra_client_id,
        entra_tenant_id=tenant.entra_tenant_id,
        entra_redirect_uris=tenant.entra_redirect_uris or [],
        seat_limit=tenant.seat_limit,
        created_at=tenant.created_at.isoformat() if tenant.created_at else None,
        updated_at=tenant.updated_at.isoformat() if tenant.updated_at else None,
        created_by_id=str(tenant.created_by_id) if tenant.created_by_id else None,
    )


@public_router.get("/public", response_model=TenantListResponse)
def list_tenants_public(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
):
    """Public endpoint to list active tenants (for login page dropdown)."""
    query = db.query(Tenant).filter(Tenant.status == "active")

    if status_filter:
        query = query.filter(Tenant.status == status_filter)

    total = query.count()
    offset = (page - 1) * page_size
    tenants = query.order_by(Tenant.name.asc()).offset(offset).limit(page_size).all()

    return TenantListResponse(
        tenants=[
            TenantResponse(
                id=str(tenant.id),
                name=tenant.name,
                slug=tenant.slug,
                email_domain=tenant.email_domain,
                logo_url=tenant.logo_url,
                primary_color=tenant.primary_color,
                status=tenant.status,
                created_at=tenant.created_at.isoformat(),
                updated_at=tenant.updated_at.isoformat() if tenant.updated_at else None,
                entra_client_id=tenant.entra_client_id,
                entra_tenant_id=tenant.entra_tenant_id,
                entra_redirect_uris=tenant.entra_redirect_uris or [],
                seat_limit=tenant.seat_limit,
                user_count=(
                    db.query(func.count(User.id))
                    .filter(User.tenant_id == tenant.id)
                    .scalar()
                    or 0
                ),
                admin_assigned=(
                    db.query(User)
                    .filter(User.tenant_id == tenant.id, User.role == "Admin")
                    .first()
                    is not None
                ),
                entra_configured=bool(tenant.entra_client_id and tenant.entra_tenant_id),
                created_by_id=str(tenant.created_by_id) if tenant.created_by_id else None,
            )
            for tenant in tenants
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("", response_model=TenantListResponse)
def list_tenants(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
):
    """List all tenants (Super Admin only)."""
    query = db.query(Tenant)

    if status_filter:
        query = query.filter(Tenant.status == status_filter)

    total = query.count()
    offset = (page - 1) * page_size
    tenants = (
        query.order_by(Tenant.created_at.desc()).offset(offset).limit(page_size).all()
    )

    tenant_responses = []
    for tenant in tenants:
        user_count = (
            db.query(func.count(User.id)).filter(User.tenant_id == tenant.id).scalar()
            or 0
        )
        # Check if admin is assigned to this tenant
        admin_assigned = (
            db.query(User)
            .filter(User.tenant_id == tenant.id, User.role == "Admin")
            .first()
            is not None
        )
        # Check if Entra ID is configured
        entra_id_config = bool(tenant.entra_client_id and tenant.entra_tenant_id)
        tenant_responses.append(
            TenantResponse(
                id=str(tenant.id),
                name=tenant.name,
                slug=tenant.slug,
                email_domain=tenant.email_domain,
                logo_url=tenant.logo_url,
                primary_color=tenant.primary_color,
                status=tenant.status,
                entra_client_id=tenant.entra_client_id,
                entra_tenant_id=tenant.entra_tenant_id,
                entra_redirect_uris=tenant.entra_redirect_uris or [],
                seat_limit=tenant.seat_limit,
                created_at=tenant.created_at,
                updated_at=tenant.updated_at,
                created_by_id=str(tenant.created_by_id)
                if tenant.created_by_id
                else None,
                user_count=user_count,
                admin_assigned=admin_assigned,
                entra_id_config=entra_id_config,
            )
        )

    return TenantListResponse(
        tenants=tenant_responses,
        total=total,
        page=page,
        page_size=page_size,
    )


@router.get("/{tenant_id}", response_model=TenantResponse)
def get_tenant(
    tenant_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
):
    """Get a tenant by ID (Super Admin only)."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )

    user_count = (
        db.query(func.count(User.id)).filter(User.tenant_id == tenant.id).scalar() or 0
    )
    # Check if admin is assigned to this tenant
    admin_assigned = (
        db.query(User).filter(User.tenant_id == tenant.id, User.role == "Admin").first()
        is not None
    )
    # Check if Entra ID is configured
    entra_id_config = bool(tenant.entra_client_id and tenant.entra_tenant_id)

    return TenantResponse(
        id=str(tenant.id),
        name=tenant.name,
        slug=tenant.slug,
        email_domain=tenant.email_domain,
        logo_url=tenant.logo_url,
        primary_color=tenant.primary_color,
        status=tenant.status,
        entra_client_id=tenant.entra_client_id,
        entra_tenant_id=tenant.entra_tenant_id,
        entra_redirect_uris=tenant.entra_redirect_uris or [],
        seat_limit=tenant.seat_limit,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
        created_by_id=str(tenant.created_by_id) if tenant.created_by_id else None,
        user_count=user_count,
        admin_assigned=admin_assigned,
        entra_id_config=entra_id_config,
    )


@router.get("/{tenant_id}/progress", response_model=TenantSetupProgress)
def get_tenant_setup_progress(
    tenant_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
):
    """Get tenant setup progress (Super Admin only).

    Returns the setup progress for a tenant with 4 steps:
    1. Azure Entra ID - Configured/Not Configured
    2. Tenant Admin - Assigned/Not Assigned
    3. Seat Limit - Set/Unlimited/Not Set
    4. First Users - X users/No users
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )

    # Step 1: Azure Entra ID configuration
    entra_configured = bool(tenant.entra_client_id and tenant.entra_tenant_id)
    steps = [
        TenantSetupProgressStep(
            key="azure_entra_id",
            label="Azure Entra ID",
            status="completed" if entra_configured else "not_configured",
            value=f"Client ID: {tenant.entra_client_id[:8]}..."
            if tenant.entra_client_id
            else None,
        )
    ]

    # Step 2: Tenant Admin assigned
    admin_role = UserRole.Admin.value
    admin_count = (
        db.query(func.count(User.id))
        .filter(User.tenant_id == tenant.id, User.role == admin_role)
        .scalar()
        or 0
    )
    steps.append(
        TenantSetupProgressStep(
            key="tenant_admin",
            label="Tenant Admin",
            status="completed" if admin_count > 0 else "not_configured",
            value=f"{admin_count} admin(s) assigned" if admin_count > 0 else None,
        )
    )

    # Step 3: Seat Limit
    if tenant.seat_limit is not None:
        seat_status = "completed"
        seat_value = f"{tenant.seat_limit} seats"
    else:
        seat_status = "pending"
        seat_value = None
    steps.append(
        TenantSetupProgressStep(
            key="seat_limit",
            label="Seat Limit",
            status=seat_status,
            value=seat_value,
        )
    )

    # Step 4: First Users
    user_count = (
        db.query(func.count(User.id)).filter(User.tenant_id == tenant.id).scalar() or 0
    )
    steps.append(
        TenantSetupProgressStep(
            key="first_users",
            label="First Users",
            status="completed" if user_count > 0 else "pending",
            value=f"{user_count} user(s)" if user_count > 0 else None,
        )
    )

    # Calculate completion percentage
    completed_steps = sum(1 for s in steps if s.status == "completed")
    completion_percentage = int((completed_steps / len(steps)) * 100)

    return TenantSetupProgress(
        tenant_id=tenant_id,
        completion_percentage=completion_percentage,
        steps=steps,
    )


@router.put("/{tenant_id}", response_model=TenantResponse)
def update_tenant(
    tenant_id: str,
    tenant_data: TenantUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
    request: Request = None,
):
    """Update a tenant (Super Admin only)."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )

    if tenant_data.name is not None:
        tenant.name = tenant_data.name
    if tenant_data.email_domain is not None:
        tenant.email_domain = tenant_data.email_domain
    if tenant_data.logo_url is not None:
        tenant.logo_url = tenant_data.logo_url
    if tenant_data.primary_color is not None:
        tenant.primary_color = tenant_data.primary_color
    if tenant_data.entra_client_id is not None:
        tenant.entra_client_id = tenant_data.entra_client_id
    if tenant_data.entra_tenant_id is not None:
        tenant.entra_tenant_id = tenant_data.entra_tenant_id
    if tenant_data.entra_redirect_uris is not None:
        tenant.entra_redirect_uris = normalize_entra_redirect_uris(
            tenant_data.entra_redirect_uris,
            entra_configured=bool(tenant.entra_client_id and tenant.entra_tenant_id),
        )
    elif (
        (tenant_data.entra_client_id is not None or tenant_data.entra_tenant_id is not None)
        and tenant.entra_client_id
        and tenant.entra_tenant_id
        and not tenant.entra_redirect_uris
    ):
        tenant.entra_redirect_uris = get_platform_entra_redirect_uris()
    if tenant_data.seat_limit is not None:
        tenant.seat_limit = tenant_data.seat_limit

    db.commit()
    db.refresh(tenant)

    log_superadmin_action(
        db,
        action="tenant.update",
        actor_id=current_user["sub"],
        actor_email=current_user.get("email", "superadmin"),
        target_type="tenant",
        target_id=str(tenant.id),
        details=tenant_data.model_dump(exclude_unset=True),
        request=None,
    )

    return TenantResponse(
        id=str(tenant.id),
        name=tenant.name,
        slug=tenant.slug,
        email_domain=tenant.email_domain,
        logo_url=tenant.logo_url,
        primary_color=tenant.primary_color,
        status=tenant.status,
        entra_client_id=tenant.entra_client_id,
        entra_tenant_id=tenant.entra_tenant_id,
        entra_redirect_uris=tenant.entra_redirect_uris or [],
        seat_limit=tenant.seat_limit,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
        created_by_id=str(tenant.created_by_id) if tenant.created_by_id else None,
    )

    return TenantResponse(
        id=str(tenant.id),
        name=tenant.name,
        slug=tenant.slug,
        logo_url=tenant.logo_url,
        primary_color=tenant.primary_color,
        status=tenant.status,
        entra_client_id=tenant.entra_client_id,
        entra_tenant_id=tenant.entra_tenant_id,
        entra_redirect_uris=tenant.entra_redirect_uris or [],
        seat_limit=tenant.seat_limit,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
        created_by_id=str(tenant.created_by_id) if tenant.created_by_id else None,
    )


@router.patch("/{tenant_id}/status", response_model=TenantResponse)
def update_tenant_status(
    tenant_id: str,
    status_data: TenantStatusUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
):
    """Update tenant status (suspend/activate) (Super Admin only)."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )

    tenant.status = status_data.status
    db.commit()
    db.refresh(tenant)

    if tenant.status == "suspended":
        try:
            mq = RabbitMQClient()
            mq.publish(
                exchange="identity.exchange",
                routing_key="tenant.suspended",
                message={
                    "event": "tenant.suspended",
                    "tenantId": str(tenant.id),
                    "tenantName": tenant.name,
                    "timestamp": datetime.utcnow().isoformat(),
                },
            )
            mq.close()
        except Exception:
            pass

    return TenantResponse(
        id=str(tenant.id),
        name=tenant.name,
        slug=tenant.slug,
        logo_url=tenant.logo_url,
        primary_color=tenant.primary_color,
        status=tenant.status,
        entra_client_id=tenant.entra_client_id,
        entra_tenant_id=tenant.entra_tenant_id,
        entra_redirect_uris=tenant.entra_redirect_uris or [],
        seat_limit=tenant.seat_limit,
        created_at=tenant.created_at,
        updated_at=tenant.updated_at,
        created_by_id=str(tenant.created_by_id) if tenant.created_by_id else None,
    )


@router.delete("/{tenant_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tenant(
    tenant_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
):
    """Soft delete a tenant (Super Admin only)."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )

    tenant.status = "suspended"
    db.commit()

    try:
        mq = RabbitMQClient()
        mq.publish(
            exchange="identity.exchange",
            routing_key="tenant.suspended",
            message={
                "event": "tenant.suspended",
                "tenantId": str(tenant.id),
                "tenantName": tenant.name,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
        mq.close()
    except Exception:
        pass

    log_superadmin_action(
        db,
        action="tenant.suspend",
        actor_id=current_user["sub"],
        actor_email=current_user.get("email", "superadmin"),
        target_type="tenant",
        target_id=str(tenant.id),
        request=None,
    )

    return None


@router.post("/{tenant_id}/test-entra", response_model=TestEntraResponse)
async def test_entra_connection(
    tenant_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
):
    """Test Entra ID configuration (Super Admin only).

    Verifies the tenant ID is valid by checking the well-known OIDC configuration endpoint.
    """
    import httpx

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )

    if not tenant.entra_tenant_id:
        return TestEntraResponse(
            success=False,
            message="Entra ID tenant ID is not configured",
        )
    if not tenant.entra_client_id:
        return TestEntraResponse(
            success=False,
            message="Entra ID client ID is not configured",
        )

    try:
        UUID(str(tenant.entra_client_id))
    except ValueError:
        return TestEntraResponse(
            success=False,
            message="Entra ID client ID must be a valid Application (client) ID.",
        )

    redirect_uris = normalize_entra_redirect_uris(
        tenant.entra_redirect_uris,
        entra_configured=True,
    )
    if not tenant.entra_redirect_uris:
        tenant.entra_redirect_uris = redirect_uris
        db.commit()

    # Test the Entra ID configuration by calling the well-known OpenID configuration endpoint
    # This proves the tenant ID exists and is a valid Azure AD tenant
    url = f"https://login.microsoftonline.com/{tenant.entra_tenant_id}/v2.0/.well-known/openid-configuration"

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(url, timeout=5.0)

            if response.status_code == 200:
                data = response.json()
                issuer = data.get("issuer", "")
                authorization_endpoint = data.get("authorization_endpoint")
                token_endpoint = data.get("token_endpoint")
                if not authorization_endpoint or not token_endpoint:
                    return TestEntraResponse(
                        success=False,
                        message="Microsoft metadata was found, but the tenant OIDC endpoints are incomplete.",
                    )
                return TestEntraResponse(
                    success=True,
                    message=(
                        "Entra ID configuration is ready for this tenant. "
                        f"Tenant metadata: {issuer}. "
                        f"Backend redirect URI: {redirect_uris[0]}. "
                        "Make sure this exact redirect URI is registered in the Azure App Registration."
                    ),
                )
            else:
                return TestEntraResponse(
                    success=False,
                    message=f"Invalid Entra ID tenant. Azure responded with {response.status_code}",
                )
    except Exception as exc:
        return TestEntraResponse(
            success=False,
            message=f"Failed to connect to Microsoft servers: {str(exc)}",
        )


admin_router = APIRouter(prefix="/superadmin/admins", tags=["superadmin-admins"])


@admin_router.get("", response_model=TenantAdminListResponse)
def list_tenant_admins(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status_filter: Optional[str] = Query(None, alias="status"),
    tenant_id: Optional[str] = Query(None, alias="tenantId"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
):
    """List all tenant admins (Super Admin only).

    Returns all users with Admin role across all tenants.

    Args:
        page: Page number.
        page_size: Items per page.
        status_filter: Filter by status.
        tenant_id: Filter by tenant ID.
        current_user: Authenticated super admin from JWT.
        db: Database session.

    Returns:
        List of tenant admins with pagination.
    """
    admin_role = UserRole.Admin.value
    query = db.query(User).filter(User.role == admin_role)

    if status_filter:
        query = query.filter(User.status == status_filter)
    if tenant_id:
        query = query.filter(User.tenant_id == tenant_id)

    total = query.count()
    offset = (page - 1) * page_size
    admins = (
        query.order_by(User.created_at.desc()).offset(offset).limit(page_size).all()
    )

    admin_responses = []
    for admin in admins:
        tenant = None
        if admin.tenant_id:
            tenant = db.query(Tenant).filter(Tenant.id == admin.tenant_id).first()

        admin_responses.append(
            TenantAdminResponse(
                id=str(admin.id),
                email=admin.email,
                first_name=admin.first_name,
                last_name=admin.last_name,
                role=admin.role,
                status=admin.status,
                tenant_id=str(admin.tenant_id) if admin.tenant_id else None,
                tenant_name=tenant.name if tenant else None,
                department=admin.department,
                created_at=admin.created_at,
                last_login=admin.last_login,
            )
        )

    return TenantAdminListResponse(
        admins=admin_responses,
        total=total,
        page=page,
        page_size=page_size,
    )


@admin_router.get("/{admin_id}", response_model=TenantAdminResponse)
def get_tenant_admin(
    admin_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
):
    """Get a tenant admin by ID (Super Admin only).

    Args:
        admin_id: Admin user UUID.
        current_user: Authenticated super admin from JWT.
        db: Database session.

    Returns:
        Tenant admin details.

    Raises:
        HTTPException 404 if admin not found.
    """
    admin = db.query(User).filter(User.id == admin_id).first()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found",
        )

    if admin.role != UserRole.Admin.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not an admin",
        )

    tenant = None
    if admin.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == admin.tenant_id).first()

    return TenantAdminResponse(
        id=str(admin.id),
        email=admin.email,
        first_name=admin.first_name,
        last_name=admin.last_name,
        role=admin.role,
        status=admin.status,
        tenant_id=str(admin.tenant_id) if admin.tenant_id else None,
        tenant_name=tenant.name if tenant else None,
        department=admin.department,
        created_at=admin.created_at,
        last_login=admin.last_login,
    )


@admin_router.post("/invite", response_model=InviteTenantAdminResponse)
def invite_tenant_admin(
    invite_data: InviteTenantAdminRequest,
    current_user: dict = Depends(require_role("SuperAdmin")),
    db: Session = Depends(get_db),
    request: Request = None,
):
    """Invite a new person as tenant admin (Super Admin only)."""
    import logging

    logger = logging.getLogger(__name__)
    logger.info(f"INVITE_ADMIN: Called with data={invite_data}")
    logger.info(f"INVITE_ADMIN: Current user={current_user}")

    from datetime import datetime
    from common.enums import AuthProvider, UserRole, UserStatus
    from services.identity.auth.tokens import generate_secure_token, get_token_expiry

    logger.info(f"INVITE_ADMIN: Looking for tenant {invite_data.tenant_id}")
    tenant = db.query(Tenant).filter(Tenant.id == invite_data.tenant_id).first()
    if not tenant:
        logger.error(f"INVITE_ADMIN: Tenant not found: {invite_data.tenant_id}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )
    logger.info(f"INVITE_ADMIN: Found tenant: {tenant.name}")

    existing = db.query(User).filter(User.email == invite_data.email).first()
    if existing:
        logger.error(f"INVITE_ADMIN: User already exists: {invite_data.email}")
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A user with this email already exists",
        )

    invitation_token = generate_secure_token()
    expires_at = get_token_expiry()
    logger.info(f"INVITE_ADMIN: Creating admin user {invite_data.email}")
    default_timezone = get_default_user_timezone(db)

    new_admin = User(
        email=invite_data.email,
        password_hash=None,
        auth_provider=AuthProvider.local.value,
        first_name=invite_data.first_name,
        last_name=invite_data.last_name,
        role=UserRole.Admin.value,
        status=UserStatus.pending_invitation.value,
        tenant_id=tenant.id,
        timezone=default_timezone,
        invitation_token=invitation_token,
        invitation_expires_at=expires_at,
    )
    db.add(new_admin)
    db.commit()
    db.refresh(new_admin)
    logger.info(f"INVITE_ADMIN: Created admin with id={new_admin.id}")

    log_superadmin_action(
        db,
        action="admin.invite",
        actor_id=current_user["sub"],
        actor_email=current_user.get("email", "superadmin"),
        target_type="user",
        target_id=str(new_admin.id),
        details={"email": new_admin.email, "tenant_id": str(tenant.id)},
        request=request,
    )

    try:
        rabbitmq = RabbitMQClient()
        rabbitmq.publish(
            exchange="auth",
            routing_key="admin.invited",
            message={
                "event": "admin.invited",
                "adminId": str(new_admin.id),
                "email": new_admin.email,
                "firstName": new_admin.first_name,
                "lastName": new_admin.last_name,
                "tenantId": str(tenant.id),
                "tenantName": tenant.name,
                "invitationToken": invitation_token,
                "expiresAt": expires_at.isoformat(),
                "invitedBy": current_user.get("email", "superadmin"),
            },
        )
        logger.info("INVITE_ADMIN: Published RabbitMQ event")
    except Exception as e:
        logger.warning(f"INVITE_ADMIN: RabbitMQ publish failed: {e}")
        pass

    logger.info(f"INVITE_ADMIN: Returning success for {invite_data.email}")
    logger.info(f"INVITE_ADMIN: admin_id={new_admin.id}")
    return InviteTenantAdminResponse(
        success=True,
        message="Admin invitation sent",
        admin_id=str(new_admin.id),
    )


@admin_router.post("/accept-invitation")
def accept_invitation(
    accept_data: AcceptInvitationRequest,
    db: Session = Depends(get_db),
):
    """Accept invitation and set password.

    Args:
        accept_data: Invitation token and new password.
        db: Database session.

    Returns:
        TokenResponse with access and refresh tokens.

    Raises:
        HTTPException 400 if token invalid or expired.
        HTTPException 400 if password too weak.
    """
    from common.auth import hash_password
    from services.identity.auth.jwt import generate_token_response

    user = (
        db.query(User)
        .filter(
            User.invitation_token == accept_data.token,
            User.status == UserStatus.pending_invitation.value,
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired invitation token",
        )

    if user.invitation_expires_at and user.invitation_expires_at < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invitation token has expired",
        )

    if len(accept_data.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 8 characters",
        )

    user.password_hash = hash_password(accept_data.password)
    user.invitation_token = None
    user.invitation_expires_at = None
    user.status = UserStatus.active.value
    db.commit()
    db.refresh(user)

    tenant = None
    if user.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()

    token_response = generate_token_response(
        user,
        str(user.tenant_id) if user.tenant_id else None,
    )

    return {
        "access_token": token_response["access_token"],
        "refresh_token": token_response["refresh_token"],
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "email": user.email,
            "first_name": user.first_name,
            "last_name": user.last_name,
            "role": user.role,
            "tenant_id": str(user.tenant_id) if user.tenant_id else None,
            "tenant_name": tenant.name if tenant else None,
        },
    }


@admin_router.post("/assign", response_model=TenantAdminResponse)
def assign_tenant_admin(
    assign_data: AssignTenantAdminRequest,
    current_user: dict = Depends(require_role("SuperAdmin")),
    db: Session = Depends(get_db),
):
    """Assign a user as tenant admin (Super Admin only).

    Args:
        assign_data: User ID and tenant ID.
        current_user: Authenticated super admin from JWT.
        db: Database session.

    Returns:
        Created tenant admin.

    Raises:
        HTTPException 404 if user not found.
        HTTPException 404 if tenant not found.
        HTTPException 400 if user is already an admin.
    """
    user = db.query(User).filter(User.id == assign_data.user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    tenant = db.query(Tenant).filter(Tenant.id == assign_data.tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )

    if user.role == UserRole.Admin.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is already an admin",
        )

    user.role = UserRole.Admin.value
    user.tenant_id = tenant.id
    db.commit()
    db.refresh(user)

    try:
        rabbitmq = RabbitMQClient()
        rabbitmq.publish(
            exchange="auth",
            routing_key="admin.assigned",
            message={
                "event": "admin.assigned",
                "userId": str(user.id),
                "email": user.email,
                "tenantId": str(tenant.id),
                "tenantName": tenant.name,
                "assignedBy": current_user.get("email", "superadmin"),
            },
        )
    except Exception:
        pass

    return TenantAdminResponse(
        id=str(user.id),
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        status=user.status,
        tenant_id=str(user.tenant_id) if user.tenant_id else None,
        tenant_name=tenant.name,
        department=user.department,
        created_at=user.created_at,
        last_login=user.last_login,
    )


@admin_router.post("/{admin_id}/unassign", response_model=TenantAdminResponse)
def unassign_tenant_admin(
    admin_id: str,
    unassign_data: UnassignTenantAdminRequest = UnassignTenantAdminRequest(),
    current_user: dict = Depends(require_role("SuperAdmin")),
    db: Session = Depends(get_db),
):
    """Unassign/revoke admin role from a user (Super Admin only).

    Args:
        admin_id: Admin user UUID.
        unassign_data: Optional reason for unassigning.
        current_user: Authenticated super admin from JWT.
        db: Database session.

    Returns:
        Updated user with role changed to TeamMember.

    Raises:
        HTTPException 404 if admin not found.
    """
    admin = db.query(User).filter(User.id == admin_id).first()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found",
        )

    if admin.role != UserRole.Admin.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not an admin",
        )

    old_tenant_id = admin.tenant_id
    admin.role = UserRole.TeamMember.value
    admin.tenant_id = None
    db.commit()
    db.refresh(admin)

    try:
        rabbitmq = RabbitMQClient()
        rabbitmq.publish(
            exchange="auth",
            routing_key="admin.unassigned",
            message={
                "event": "admin.unassigned",
                "userId": str(admin.id),
                "email": admin.email,
                "oldTenantId": str(old_tenant_id) if old_tenant_id else None,
                "reason": unassign_data.reason,
                "unassignedBy": current_user.get("email", "superadmin"),
            },
        )
    except Exception:
        pass

    tenant = None
    if old_tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == old_tenant_id).first()

    return TenantAdminResponse(
        id=str(admin.id),
        email=admin.email,
        first_name=admin.first_name,
        last_name=admin.last_name,
        role=admin.role,
        status=admin.status,
        tenant_id=str(admin.tenant_id) if admin.tenant_id else None,
        tenant_name=tenant.name if tenant else None,
        department=admin.department,
        created_at=admin.created_at,
        last_login=admin.last_login,
    )


@admin_router.patch("/{admin_id}/status", response_model=TenantAdminResponse)
def update_admin_status(
    admin_id: str,
    status_data: AdminStatusUpdate,
    current_user: dict = Depends(require_role("SuperAdmin")),
    db: Session = Depends(get_db),
):
    """Update admin status (activate/suspend) (Super Admin only).

    Args:
        admin_id: Admin user UUID.
        status_data: New status and optional reason.
        current_user: Authenticated super admin from JWT.
        db: Database session.

    Returns:
        Updated admin.

    Raises:
        HTTPException 404 if admin not found.
        HTTPException 400 if status is invalid.
    """
    admin = db.query(User).filter(User.id == admin_id).first()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found",
        )

    if admin.role != UserRole.Admin.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not an admin",
        )

    old_status = admin.status
    admin.status = status_data.status
    db.commit()
    db.refresh(admin)

    try:
        rabbitmq = RabbitMQClient()
        rabbitmq.publish(
            exchange="auth",
            routing_key="admin.status_changed",
            message={
                "event": "admin.status_changed",
                "userId": str(admin.id),
                "email": admin.email,
                "tenantId": str(admin.tenant_id) if admin.tenant_id else None,
                "oldStatus": old_status,
                "newStatus": status_data.status,
                "reason": status_data.reason,
                "changedBy": current_user.get("email", "superadmin"),
            },
        )
    except Exception:
        pass

    tenant = None
    if admin.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == admin.tenant_id).first()

    return TenantAdminResponse(
        id=str(admin.id),
        email=admin.email,
        first_name=admin.first_name,
        last_name=admin.last_name,
        role=admin.role,
        status=admin.status,
        tenant_id=str(admin.tenant_id) if admin.tenant_id else None,
        tenant_name=tenant.name if tenant else None,
        department=admin.department,
        created_at=admin.created_at,
        last_login=admin.last_login,
    )


@admin_router.post("/{admin_id}/reset-password", response_model=dict)
def reset_admin_password(
    admin_id: str,
    current_user: dict = Depends(require_role("SuperAdmin")),
    db: Session = Depends(get_db),
):
    """Reset admin password (Super Admin only).

    Generates a new temporary password for the admin.
    In production, this would send an email with the reset link.

    Args:
        admin_id: Admin user UUID.
        current_user: Authenticated super admin from JWT.
        db: Database session.

    Returns:
        Success message with temporary password info.

    Raises:
        HTTPException 404 if admin not found.
    """
    admin = db.query(User).filter(User.id == admin_id).first()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found",
        )

    if admin.role != UserRole.Admin.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not an admin",
        )

    import secrets
    import string

    alphabet = string.ascii_letters + string.digits
    temp_password = "".join(secrets.choice(alphabet) for _ in range(12))

    from common.auth import hash_password

    admin.password_hash = hash_password(temp_password)
    db.commit()

    try:
        rabbitmq = RabbitMQClient()
        rabbitmq.publish(
            exchange="auth",
            routing_key="admin.password_reset",
            message={
                "event": "admin.password_reset",
                "userId": str(admin.id),
                "email": admin.email,
                "resetBy": current_user.get("email", "superadmin"),
            },
        )
    except Exception:
        pass

    return {
        "message": "Password reset successfully",
        "userId": str(admin.id),
        "email": admin.email,
        "tempPassword": temp_password,
    }


platform_role_mapping_router = APIRouter(
    prefix="/superadmin/role-mappings", tags=["platform-role-mappings"]
)


@platform_role_mapping_router.post(
    "", response_model=dict, status_code=status.HTTP_201_CREATED
)
def create_platform_role_mapping(
    azure_role: str,
    platform_role: str,
    department: Optional[str] = None,
    current_user: dict = Depends(require_role("SuperAdmin")),
    db: Session = Depends(get_db),
):
    """Create a platform-level role mapping rule (Super Admin only).

    Maps Azure AD roles to platform roles globally.
    These rules apply across all tenants.

    Args:
        azure_role: Azure AD role name.
        platform_role: Platform role to map to.
        department: Optional department filter.
        current_user: Authenticated super admin from JWT.
        db: Database session.

    Returns:
        Created role mapping rule.
    """
    from common.models import RoleMappingRule

    rule = RoleMappingRule(
        tenant_id=None,
        azure_role=azure_role,
        platform_role=platform_role,
        department=department,
        is_active=True,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    return {
        "id": str(rule.id),
        "azure_role": rule.azure_role,
        "platform_role": rule.platform_role,
        "department": rule.department,
        "is_active": rule.is_active,
        "scope": "platform",
    }


@platform_role_mapping_router.get("", response_model=list[dict])
def list_platform_role_mappings(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_role("SuperAdmin")),
    db: Session = Depends(get_db),
):
    """List platform-level role mapping rules (Super Admin only).

    Args:
        page: Page number.
        page_size: Items per page.
        current_user: Authenticated super admin from JWT.
        db: Database session.

    Returns:
        List of platform role mapping rules.
    """
    from common.models import RoleMappingRule

    query = db.query(RoleMappingRule).filter(RoleMappingRule.tenant_id == None)

    total = query.count()
    offset = (page - 1) * page_size
    rules = query.offset(offset).limit(page_size).all()

    return [
        {
            "id": str(r.id),
            "azure_role": r.azure_role,
            "platform_role": r.platform_role,
            "department": r.department,
            "is_active": r.is_active,
            "scope": "platform",
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in rules
    ]


@platform_role_mapping_router.put("/{rule_id}", response_model=dict)
def update_platform_role_mapping(
    rule_id: str,
    azure_role: Optional[str] = None,
    platform_role: Optional[str] = None,
    department: Optional[str] = None,
    is_active: Optional[bool] = None,
    current_user: dict = Depends(require_role("SuperAdmin")),
    db: Session = Depends(get_db),
):
    """Update a platform-level role mapping rule (Super Admin only).

    Args:
        rule_id: Rule UUID.
        azure_role: Updated Azure role.
        platform_role: Updated platform role.
        department: Updated department.
        is_active: Updated active status.
        current_user: Authenticated super admin from JWT.
        db: Database session.

    Returns:
        Updated role mapping rule.

    Raises:
        HTTPException 404 if rule not found.
    """
    from common.models import RoleMappingRule
    from uuid import UUID

    rule = (
        db.query(RoleMappingRule)
        .filter(
            RoleMappingRule.id == UUID(rule_id),
            RoleMappingRule.tenant_id == None,
        )
        .first()
    )

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role mapping rule not found",
        )

    if azure_role is not None:
        rule.azure_role = azure_role
    if platform_role is not None:
        rule.platform_role = platform_role
    if department is not None:
        rule.department = department
    if is_active is not None:
        rule.is_active = is_active

    db.commit()
    db.refresh(rule)

    return {
        "id": str(rule.id),
        "azure_role": rule.azure_role,
        "platform_role": rule.platform_role,
        "department": rule.department,
        "is_active": rule.is_active,
        "scope": "platform",
    }


@platform_role_mapping_router.delete(
    "/{rule_id}", status_code=status.HTTP_204_NO_CONTENT
)
def delete_platform_role_mapping(
    rule_id: str,
    current_user: dict = Depends(require_role("SuperAdmin")),
    db: Session = Depends(get_db),
):
    """Delete a platform-level role mapping rule (Super Admin only).

    Args:
        rule_id: Rule UUID.
        current_user: Authenticated super admin from JWT.
        db: Database session.

    Raises:
        HTTPException 404 if rule not found.
    """
    from common.models import RoleMappingRule
    from uuid import UUID

    rule = (
        db.query(RoleMappingRule)
        .filter(
            RoleMappingRule.id == UUID(rule_id),
            RoleMappingRule.tenant_id == None,
        )
        .first()
    )

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role mapping rule not found",
        )

    db.delete(rule)
    db.commit()


@admin_router.get("/{admin_id}/audit-log", response_model=list[dict])
def get_admin_audit_log(
    admin_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(require_role("SuperAdmin")),
    db: Session = Depends(get_db),
):
    """Get audit log for a specific admin (Super Admin only).

    Returns all actions performed by or on the admin account.

    Args:
        admin_id: Admin user UUID.
        page: Page number.
        page_size: Items per page.
        current_user: Authenticated super admin from JWT.
        db: Database session.

    Returns:
        List of audit events.

    Raises:
        HTTPException 404 if admin not found.
    """
    from common.models import IdentityAuditLog
    from uuid import UUID

    admin = db.query(User).filter(User.id == admin_id).first()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found",
        )

    offset = (page - 1) * page_size
    query = db.query(IdentityAuditLog).filter(
        (IdentityAuditLog.actor_id == UUID(admin_id))
        | (IdentityAuditLog.target_user_id == UUID(admin_id))
    )

    total = query.count()
    logs = (
        query.order_by(IdentityAuditLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return [
        {
            "id": str(log.id),
            "action": log.action,
            "actor_id": str(log.actor_id) if log.actor_id else None,
            "actor_email": log.actor_email,
            "target_user_id": str(log.target_user_id) if log.target_user_id else None,
            "target_email": log.target_email,
            "details": log.details,
            "ip_address": log.ip_address,
            "created_at": log.created_at.isoformat() if log.created_at else None,
        }
        for log in logs
    ]


@admin_router.get("/audit-log", response_model=dict)
def get_all_admins_audit_log(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    action: Optional[str] = Query(None),
    current_user: dict = Depends(require_role("SuperAdmin")),
    db: Session = Depends(get_db),
):
    """Get audit log for all admin actions (Super Admin only).

    Args:
        page: Page number.
        page_size: Items per page.
        action: Filter by action type.
        current_user: Authenticated super admin from JWT.
        db: Database session.

    Returns:
        List of audit events with pagination.
    """
    from common.models import IdentityAuditLog
    from common.enums import UserRole

    admin_role = UserRole.Admin.value
    admin_ids_subquery = db.query(User.id).filter(User.role == admin_role).subquery()

    query = db.query(IdentityAuditLog).filter(
        IdentityAuditLog.actor_id.in_(admin_ids_subquery)
    )

    if action:
        query = query.filter(IdentityAuditLog.action == action)

    total = query.count()
    offset = (page - 1) * page_size
    logs = (
        query.order_by(IdentityAuditLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    return {
        "logs": [
            {
                "id": str(log.id),
                "action": log.action,
                "actor_id": str(log.actor_id) if log.actor_id else None,
                "actor_email": log.actor_email,
                "target_user_id": str(log.target_user_id)
                if log.target_user_id
                else None,
                "target_email": log.target_email,
                "details": log.details,
                "ip_address": log.ip_address,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in logs
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@admin_router.post("/{admin_id}/suspend", response_model=TenantAdminResponse)
def suspend_tenant_admin(
    admin_id: str,
    suspend_data: SuspendTenantAdminRequest = SuspendTenantAdminRequest(),
    current_user: dict = Depends(require_role("SuperAdmin")),
    db: Session = Depends(get_db),
):
    """Suspend a tenant admin (Super Admin only).

    Args:
        admin_id: Admin user UUID.
        suspend_data: Optional reason for suspension.
        current_user: Authenticated super admin from JWT.
        db: Database session.

    Returns:
        Suspended admin.

    Raises:
        HTTPException 404 if admin not found.
        HTTPException 400 if admin is already suspended.
    """
    admin = db.query(User).filter(User.id == admin_id).first()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found",
        )

    if admin.role != UserRole.Admin.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not an admin",
        )

    if admin.status == UserStatus.suspended.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin is already suspended",
        )

    admin.status = UserStatus.suspended.value
    db.commit()
    db.refresh(admin)

    try:
        rabbitmq = RabbitMQClient()
        rabbitmq.publish(
            exchange="auth",
            routing_key="admin.suspended",
            message={
                "event": "admin.suspended",
                "userId": str(admin.id),
                "email": admin.email,
                "tenantId": str(admin.tenant_id) if admin.tenant_id else None,
                "reason": suspend_data.reason,
                "suspendedBy": current_user.get("email", "superadmin"),
            },
        )
    except Exception:
        pass

    tenant = None
    if admin.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == admin.tenant_id).first()

    return TenantAdminResponse(
        id=str(admin.id),
        email=admin.email,
        first_name=admin.first_name,
        last_name=admin.last_name,
        role=admin.role,
        status=admin.status,
        tenant_id=str(admin.tenant_id) if admin.tenant_id else None,
        tenant_name=tenant.name if tenant else None,
        department=admin.department,
        created_at=admin.created_at,
        last_login=admin.last_login,
    )


@admin_router.post("/{admin_id}/reactivate", response_model=TenantAdminResponse)
def reactivate_tenant_admin(
    admin_id: str,
    current_user: dict = Depends(require_role("SuperAdmin")),
    db: Session = Depends(get_db),
):
    """Reactivate a suspended tenant admin (Super Admin only).

    Args:
        admin_id: Admin user UUID.
        current_user: Authenticated super admin from JWT.
        db: Database session.

    Returns:
        Reactivated admin.

    Raises:
        HTTPException 404 if admin not found.
        HTTPException 400 if admin is not suspended.
    """
    admin = db.query(User).filter(User.id == admin_id).first()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Admin not found",
        )

    if admin.role != UserRole.Admin.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User is not an admin",
        )

    if admin.status != UserStatus.suspended.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Admin is not suspended",
        )

    admin.status = UserStatus.active.value
    db.commit()
    db.refresh(admin)

    try:
        rabbitmq = RabbitMQClient()
        rabbitmq.publish(
            exchange="auth",
            routing_key="admin.reactivated",
            message={
                "event": "admin.reactivated",
                "userId": str(admin.id),
                "email": admin.email,
                "tenantId": str(admin.tenant_id) if admin.tenant_id else None,
                "reactivatedBy": current_user.get("email", "superadmin"),
            },
        )
    except Exception:
        pass

    tenant = None
    if admin.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == admin.tenant_id).first()

    return TenantAdminResponse(
        id=str(admin.id),
        email=admin.email,
        first_name=admin.first_name,
        last_name=admin.last_name,
        role=admin.role,
        status=admin.status,
        tenant_id=str(admin.tenant_id) if admin.tenant_id else None,
        tenant_name=tenant.name if tenant else None,
        department=admin.department,
        created_at=admin.created_at,
        last_login=admin.last_login,
    )
