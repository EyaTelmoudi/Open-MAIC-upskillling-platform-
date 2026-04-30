"""Platform settings router for Super Admin operations."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from common.database import get_db
from common.models import SystemConfig
from services.identity.schemas.checklist import (
    GeneralSettings,
    SecuritySettings,
    NotificationSettings,
    AISettings,
    SuperAdminSettingsResponse,
    SuperAdminSettingsUpdate,
)
from services.identity.middleware.audit import log_superadmin_action
from services.identity.middleware.rbac import require_role

router = APIRouter(prefix="/superadmin/settings", tags=["Platform Settings"])

DEFAULT_SECURITY_SETTINGS = {
    "mfa_required_for_superadmin": True,
    "mfa_required_for_tenant_admins": True,
    "security_alerts": {
        "failed_login_spikes": True,
        "admin_account_changes": True,
        "password_reset_events": True,
        "tenant_status_changes": True,
    },
}


def _get_security_settings(config: SystemConfig) -> dict:
    smtp_config = config.smtp_config or {}
    security_settings = smtp_config.get("security") or {}
    security_alerts = security_settings.get("security_alerts") or {}

    return {
        "mfa_required_for_superadmin": security_settings.get(
            "mfa_required_for_superadmin",
            DEFAULT_SECURITY_SETTINGS["mfa_required_for_superadmin"],
        ),
        "mfa_required_for_tenant_admins": security_settings.get(
            "mfa_required_for_tenant_admins",
            DEFAULT_SECURITY_SETTINGS["mfa_required_for_tenant_admins"],
        ),
        "security_alerts": {
            "failed_login_spikes": security_alerts.get(
                "failed_login_spikes",
                DEFAULT_SECURITY_SETTINGS["security_alerts"]["failed_login_spikes"],
            ),
            "admin_account_changes": security_alerts.get(
                "admin_account_changes",
                DEFAULT_SECURITY_SETTINGS["security_alerts"]["admin_account_changes"],
            ),
            "password_reset_events": security_alerts.get(
                "password_reset_events",
                DEFAULT_SECURITY_SETTINGS["security_alerts"]["password_reset_events"],
            ),
            "tenant_status_changes": security_alerts.get(
                "tenant_status_changes",
                DEFAULT_SECURITY_SETTINGS["security_alerts"]["tenant_status_changes"],
            ),
        },
    }


@router.get("/health")
async def settings_health():
    return {"status": "ok", "route": "settings"}


@router.get("")
async def get_all_settings(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin", "Admin")),
):
    """Get all platform settings."""
    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if not config:
        raise HTTPException(status_code=404, detail="System config not found")

    return {
        "general": {
            "platform_name": config.group_name or config.platform_name,
            "group_website": config.group_website or config.platform_logo_url,
            "platform_language": config.platform_language,
            "default_timezone": config.default_timezone,
            "support_email": config.support_email,
        },
        "security": {
            **_get_security_settings(config),
        },
        "notifications": {
            "email_templates": config.email_templates or {},
            "smtp_config": config.smtp_config or {},
        },
        "ai": {
            "groq_api_key": config.groq_api_key,
            "demo_mode": config.demo_mode,
            "agent_toggles": config.agent_toggles or {},
        },
        "superadmin_onboarded": config.superadmin_onboarded,
        "setup_completed": config.setup_completed,
    }


@router.put("/general")
async def update_general_settings(
    request: Request,
    settings: GeneralSettings,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin", "Admin")),
):
    """Update general platform settings."""
    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if not config:
        raise HTTPException(status_code=404, detail="System config not found")

    update_data = settings.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(config, field, value)

    if settings.platform_name is not None:
        config.group_name = settings.platform_name
    if settings.group_website is not None:
        config.group_website = settings.group_website

    db.commit()
    db.refresh(config)

    log_superadmin_action(
        db,
        action="settings.update.general",
        actor_id=current_user["sub"],
        actor_email=current_user.get("email", "superadmin"),
        target_type="settings",
        target_id="general",
        details=update_data,
        request=request,
    )

    return {"success": True, "general": update_data}


@router.put("/security")
async def update_security_settings(
    request: Request,
    settings: SecuritySettings,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin", "Admin")),
):
    """Update security settings."""
    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if not config:
        raise HTTPException(status_code=404, detail="System config not found")

    update_data = settings.model_dump(exclude_unset=True)
    smtp_config = config.smtp_config or {}
    security_config = smtp_config.get("security") or {}

    if settings.mfa_required_for_superadmin is not None:
        security_config["mfa_required_for_superadmin"] = (
            settings.mfa_required_for_superadmin
        )
    if settings.mfa_required_for_tenant_admins is not None:
        security_config["mfa_required_for_tenant_admins"] = (
            settings.mfa_required_for_tenant_admins
        )
    if settings.security_alerts is not None:
        security_config["security_alerts"] = settings.security_alerts

    smtp_config["security"] = security_config
    config.smtp_config = smtp_config

    db.commit()
    db.refresh(config)

    log_superadmin_action(
        db,
        action="settings.update.security",
        actor_id=current_user["sub"],
        actor_email=current_user.get("email", "superadmin"),
        target_type="settings",
        target_id="security",
        details=update_data,
        request=request,
    )

    return {"success": True, "security": _get_security_settings(config)}


@router.put("/notifications")
async def update_notification_settings(
    request: Request,
    settings: NotificationSettings,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin", "Admin")),
):
    """Update notification settings."""
    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if not config:
        raise HTTPException(status_code=404, detail="System config not found")

    if settings.email_templates is not None:
        config.email_templates = settings.email_templates

    if settings.smtp_host or settings.smtp_port or settings.smtp_username:
        smtp_config = config.smtp_config or {}
        if settings.smtp_host:
            smtp_config["host"] = settings.smtp_host
        if settings.smtp_port:
            smtp_config["port"] = settings.smtp_port
        if settings.smtp_username:
            smtp_config["username"] = settings.smtp_username
        if settings.smtp_password:
            smtp_config["password"] = settings.smtp_password
        if settings.smtp_from_name:
            smtp_config["from_name"] = settings.smtp_from_name
        config.smtp_config = smtp_config

    db.commit()
    db.refresh(config)

    log_superadmin_action(
        db,
        action="settings.update.notifications",
        actor_id=current_user["sub"],
        actor_email=current_user.get("email", "superadmin"),
        target_type="settings",
        target_id="notifications",
        request=request,
    )

    return {"success": True, "notifications": {}}


@router.put("/ai")
async def update_ai_settings(
    request: Request,
    settings: AISettings,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin", "Admin")),
):
    """Update AI settings."""
    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if not config:
        raise HTTPException(status_code=404, detail="System config not found")

    update_data = settings.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        if value is not None:
            setattr(config, field, value)

    db.commit()
    db.refresh(config)

    log_superadmin_action(
        db,
        action="settings.update.ai",
        actor_id=current_user["sub"],
        actor_email=current_user.get("email", "superadmin"),
        target_type="settings",
        target_id="ai",
        details=update_data,
        request=request,
    )

    return {"success": True, "ai": update_data}


@router.post("/test-email")
async def test_email(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin", "Admin")),
):
    """Test email configuration."""
    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if not config:
        raise HTTPException(status_code=404, detail="System config not found")

    smtp_config = config.smtp_config or {}
    if not smtp_config.get("host"):
        return {"success": False, "message": "SMTP not configured"}

    return {"success": True, "message": "Email sent successfully (mock)"}


@router.post("/reset")
async def reset_platform(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin", "Admin")),
):
    """Reset platform to initial state."""
    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if not config:
        raise HTTPException(status_code=404, detail="System config not found")

    config.setup_completed = False
    config.setup_completed_at = None
    config.superadmin_onboarded = False
    config.superadmin_checklist = None

    db.commit()

    return {"success": True, "message": "Platform reset to initial state"}


@router.get("/export")
async def export_settings(
    request: Request,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin", "Admin")),
):
    """Export platform settings."""
    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if not config:
        raise HTTPException(status_code=404, detail="System config not found")

    return {
        "platform_name": config.platform_name,
        "platform_language": config.platform_language,
        "default_timezone": config.default_timezone,
        "support_email": config.support_email,
        "security": _get_security_settings(config),
        "demo_mode": config.demo_mode,
        "email_templates": config.email_templates,
        "agent_toggles": config.agent_toggles,
    }
