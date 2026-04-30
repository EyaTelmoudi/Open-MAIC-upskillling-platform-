"""Setup wizard endpoints for platform first-run."""

import json
import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Header, HTTPException, Response, status, Request
from pydantic import ValidationError
from sqlalchemy.orm import Session

from common.auth import hash_password
from common.database import get_db
from common.enums import AuthProvider, UserRole, UserStatus
from common.messaging import RabbitMQClient
from common.models import SystemConfig, Tenant, User

from services.identity.schemas.setup import (
    AdminCreateRequest,
    GroupConfigRequest,
    PlatformConfigRequest,
    SetupCompleteRequest,
    SetupCompleteResponse,
    SetupStatusResponse,
    TenantCreateRequest,
)
from services.identity.user_defaults import get_default_user_timezone

router = APIRouter(prefix="/setup", tags=["setup"])

SETUP_SECRET_KEY = os.getenv("SETUP_SECRET_KEY", "")


def verify_setup_key(x_setup_key: str = Header(...)) -> str:
    """Verify X-Setup-Key header matches SETUP_SECRET_KEY."""
    if x_setup_key != SETUP_SECRET_KEY:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid setup key",
        )
    return x_setup_key


@router.get("/status", response_model=SetupStatusResponse)
async def get_setup_status():
    """Get current setup status (public endpoint for frontend middleware).

    This endpoint is designed to work even if database is unavailable.
    """
    import logging
    from sqlalchemy import text
    from common.database import engine

    try:
        with engine.connect() as conn:
            result = conn.execute(
                text(
                    "SELECT setup_completed, platform_name FROM system_config WHERE id = 1"
                )
            )
            row = result.fetchone()
            if not row:
                return SetupStatusResponse(
                    setup_completed=False,
                    setup_completed_at=None,
                    platform_name="SkillForge",
                )
            return SetupStatusResponse(
                setup_completed=bool(row[0]),
                setup_completed_at=None,
                platform_name=str(row[1]),
            )
    except Exception as e:
        logging.warning(f"Setup status check failed (database unavailable): {e}")
        return SetupStatusResponse(
            setup_completed=False,
            setup_completed_at=None,
            platform_name="SkillForge",
        )


@router.post("/admin", status_code=status.HTTP_201_CREATED)
async def create_admin(
    request: AdminCreateRequest,
    db: Session = Depends(get_db),
    _key: str = Depends(verify_setup_key),
):
    """Create SuperAdmin account (first time only)."""
    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="System configuration not found",
        )

    existing = db.query(User).filter(User.email == request.email).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User with this email already exists",
        )

    user = User(
        email=request.email,
        password_hash=hash_password(request.password),
        first_name=request.first_name,
        last_name=request.last_name,
        role=UserRole.SuperAdmin.value,
        auth_provider=AuthProvider.local.value,
        status=UserStatus.active.value,
        onboarded=True,
        timezone=get_default_user_timezone(db),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return {
        "message": "SuperAdmin account created",
        "user_id": str(user.id),
        "email": user.email,
    }


@router.put("/platform")
async def configure_platform(
    request: PlatformConfigRequest,
    db: Session = Depends(get_db),
    _key: str = Depends(verify_setup_key),
):
    """Configure platform settings."""
    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="System configuration not found",
        )

    config.platform_name = request.platform_name
    config.platform_logo_url = request.platform_logo_url
    config.default_timezone = request.default_timezone
    config.support_email = request.support_email
    config.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(config)

    return {
        "message": "Platform configuration updated",
        "platform_name": config.platform_name,
    }


@router.post("/tenant", status_code=status.HTTP_201_CREATED)
async def create_first_tenant(
    request: TenantCreateRequest,
    db: Session = Depends(get_db),
    _key: str = Depends(verify_setup_key),
):
    """Create first tenant (optional)."""
    existing = db.query(Tenant).filter(Tenant.slug == request.slug).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Tenant with this slug already exists",
        )

    admin = db.query(User).filter(User.role == UserRole.SuperAdmin.value).first()

    tenant = Tenant(
        name=request.name,
        slug=request.slug,
        email_domain=request.email_domain,
        status="pending",
        created_by_id=admin.id if admin else None,
    )
    db.add(tenant)
    db.commit()
    db.refresh(tenant)

    return {
        "message": "First tenant created",
        "id": str(tenant.id),
        "name": tenant.name,
        "slug": tenant.slug,
        "email_domain": tenant.email_domain,
        "status": tenant.status,
    }


@router.post("/group")
async def configure_group(
    request: GroupConfigRequest,
    db: Session = Depends(get_db),
    _key: str = Depends(verify_setup_key),
):
    """Configure organization group (parent company)."""
    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="System configuration not found",
        )

    config.group_name = request.group_name
    config.group_website = request.group_website
    config.group_primary_color = request.group_primary_color
    config.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(config)

    return {
        "message": "Organization group configured",
        "group_name": config.group_name,
    }


@router.post("/complete", response_model=SetupCompleteResponse)
async def complete_setup(
    request: SetupCompleteRequest,
    db: Session = Depends(get_db),
    _key: str = Depends(verify_setup_key),
):
    """Complete the setup wizard."""
    if not request.confirm:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must confirm setup completion",
        )

    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if not config:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="System configuration not found",
        )

    admin = db.query(User).filter(User.role == UserRole.SuperAdmin.value).first()
    if not admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must create SuperAdmin account first",
        )

    first_tenant_exists = db.query(Tenant.id).first() is not None

    config.setup_completed = True
    config.setup_completed_at = datetime.now(timezone.utc)
    config.updated_at = datetime.now(timezone.utc)
    config.superadmin_checklist = {
        "items": [
            {
                "id": "platform_configured",
                "title": "Platform configured",
                "description": "Complete platform setup wizard",
                "auto_checked": True,
                "completed": True,
                "action_url": None,
            },
            {
                "id": "first_tenant_created",
                "title": "First tenant created",
                "description": "Create your first company tenant",
                "auto_checked": True,
                "completed": first_tenant_exists,
                "action_url": "/superadmin/tenants/new",
            },
            {
                "id": "tenant_admins_assigned",
                "title": "Assign Tenant Admin",
                "description": "Assign an admin for your tenant",
                "auto_checked": False,
                "completed": False,
                "action_url": "/superadmin/users",
            },
            {
                "id": "entra_id_configured",
                "title": "Configure Azure Entra ID",
                "description": "Set up Azure Entra ID for SSO",
                "auto_checked": False,
                "completed": False,
                "action_url": "/superadmin/settings?tab=entra",
            },
            {
                "id": "seat_limits_set",
                "title": "Set seat limits",
                "description": "Configure seat limits for tenants",
                "auto_checked": False,
                "completed": False,
                "action_url": "/superadmin/tenants",
            },
            {
                "id": "first_users_invited",
                "title": "Invite first users",
                "description": "Invite users to your tenant",
                "auto_checked": False,
                "completed": False,
                "action_url": "/superadmin/users",
            },
        ],
        "completed_count": 2 if first_tenant_exists else 1,
        "total_count": 6,
    }
    config.superadmin_onboarded = False

    db.commit()
    db.refresh(config)

    try:
        mq = RabbitMQClient()
        mq.publish(
            exchange="auth.exchange",
            routing_key="platform.setup.completed",
            message={
                "event": "platform.setup.completed",
                "platform_name": config.platform_name,
                "admin_email": admin.email,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            },
        )
        mq.close()
    except Exception:
        pass

    return SetupCompleteResponse(
        setup_completed=True,
        redirect_to="/superadmin/login",
        message="Platform is live!",
        platform_name=config.platform_name,
        admin_email=admin.email,
    )
