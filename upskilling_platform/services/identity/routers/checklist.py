from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import List, Dict, Any
from sqlalchemy import func, distinct

from common.database import get_db
from common.models import SystemConfig, Tenant, User
from services.identity.schemas.checklist import (
    ChecklistItem,
    ChecklistState,
    ChecklistUpdateRequest,
    SuperAdminSettingsUpdate,
    SuperAdminSettingsResponse,
)
from common.enums import UserRole
from services.identity.middleware.rbac import require_role

router = APIRouter(prefix="/superadmin", tags=["Super Admin Checklist"])


def _get_default_checklist() -> Dict[str, Any]:
    return {
        "items": [
            {
                "id": "platform_configured",
                "title": "Platform configured",
                "description": "Complete platform setup wizard",
                "auto_checked": True,
                "completed": False,
                "action_url": None,
            },
            {
                "id": "first_tenant_created",
                "title": "First tenant created",
                "description": "Create your first company tenant",
                "auto_checked": True,
                "completed": False,
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
                "description": "Invite users to your platform",
                "auto_checked": False,
                "completed": False,
                "action_url": "/superadmin/users",
            },
        ],
        "completed_count": 0,
    }


@router.get("/checklist", response_model=ChecklistState)
async def get_checklist(
    current_user: dict = Depends(require_role("SuperAdmin")),
    db: Session = Depends(get_db),
):
    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if not config:
        raise HTTPException(status_code=404, detail="System config not found")

    checklist_data = config.superadmin_checklist
    if not checklist_data:
        checklist_data = _get_default_checklist()
    else:
        checklist_data = checklist_data.copy()

    checklist_data["completed_count"] = sum(
        1 for item in checklist_data["items"] if item.get("completed")
    )
    checklist_data["total_count"] = len(checklist_data["items"])

    _auto_check_items(checklist_data, db)

    return ChecklistState(
        items=[ChecklistItem(**item) for item in checklist_data["items"]],
        completed_count=checklist_data["completed_count"],
        total_count=checklist_data["total_count"],
    )


def _auto_check_items(checklist_data: Dict, db: Session):
    items = checklist_data.get("items", [])
    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    active_tenant_count = (
        db.query(func.count(Tenant.id))
        .filter(Tenant.status != "suspended")
        .scalar()
        or 0
    )
    tenants_with_admin_count = (
        db.query(func.count(distinct(User.tenant_id)))
        .join(Tenant, Tenant.id == User.tenant_id)
        .filter(
            Tenant.status != "suspended",
            User.tenant_id.isnot(None),
            User.role == UserRole.Admin.value,
        )
        .scalar()
        or 0
    )
    tenants_with_entra_count = (
        db.query(func.count(Tenant.id))
        .filter(
            Tenant.status != "suspended",
            Tenant.entra_client_id.isnot(None),
            Tenant.entra_tenant_id.isnot(None),
        )
        .scalar()
        or 0
    )
    tenants_with_seat_limit_count = (
        db.query(func.count(Tenant.id))
        .filter(Tenant.status != "suspended", Tenant.seat_limit.isnot(None))
        .scalar()
        or 0
    )
    tenants_with_invited_users_count = (
        db.query(func.count(distinct(User.tenant_id)))
        .join(Tenant, Tenant.id == User.tenant_id)
        .filter(
            Tenant.status != "suspended",
            User.tenant_id.isnot(None),
            User.role != UserRole.Admin.value,
        )
        .scalar()
        or 0
    )

    for item in items:
        item_id = item.get("id")
        if item_id == "platform_configured":
            item["completed"] = bool(config and config.setup_completed)
        elif item_id == "first_tenant_created":
            item["completed"] = active_tenant_count > 0
        elif item_id == "tenant_admins_assigned":
            item["completed"] = (
                active_tenant_count > 0
                and tenants_with_admin_count == active_tenant_count
            )
        elif item_id == "entra_id_configured":
            item["completed"] = (
                active_tenant_count > 0
                and tenants_with_entra_count == active_tenant_count
            )
        elif item_id == "seat_limits_set":
            item["completed"] = (
                active_tenant_count > 0
                and tenants_with_seat_limit_count == active_tenant_count
            )
        elif item_id == "first_users_invited":
            item["completed"] = (
                active_tenant_count > 0
                and tenants_with_invited_users_count == active_tenant_count
            )

    checklist_data["completed_count"] = sum(
        1 for item in items if item.get("completed")
    )


@router.put("/checklist", response_model=ChecklistState)
async def update_checklist(
    request: ChecklistUpdateRequest,
    current_user: dict = Depends(require_role("SuperAdmin")),
    db: Session = Depends(get_db),
):
    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if not config:
        raise HTTPException(status_code=404, detail="System config not found")

    checklist_data = config.superadmin_checklist
    if not checklist_data:
        checklist_data = _get_default_checklist()

    for item in checklist_data.get("items", []):
        if item.get("id") == request.item_id and not item.get("auto_checked"):
            item["completed"] = True
            break
    else:
        raise HTTPException(status_code=404, detail="Checklist item not found")

    config.superadmin_checklist = checklist_data
    db.commit()

    _auto_check_items(checklist_data, db)

    return ChecklistState(
        items=[ChecklistItem(**item) for item in checklist_data["items"]],
        completed_count=checklist_data["completed_count"],
        total_count=checklist_data["total_count"],
    )


@router.post("/checklist/mark-onboarded")
async def mark_superadmin_onboarded(
    current_user: dict = Depends(require_role("SuperAdmin")),
    db: Session = Depends(get_db),
):
    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if not config:
        raise HTTPException(status_code=404, detail="System config not found")

    config.superadmin_onboarded = True

    checklist_data = config.superadmin_checklist
    if checklist_data:
        for item in checklist_data.get("items", []):
            item["completed"] = True
        checklist_data["completed_count"] = len(checklist_data["items"])
        config.superadmin_checklist = checklist_data

    db.commit()

    return {"success": True, "superadmin_onboarded": True}
