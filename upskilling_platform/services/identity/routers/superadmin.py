"""Super Admin operations router."""

from typing import Optional
from fastapi import APIRouter, Depends, Query, status, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import distinct
from common.database import get_db
from common.models import SuperAdminAuditLog, User, Tenant
from common.auth import hash_password
from common.enums import UserRole, UserStatus, AuthProvider
from services.identity.schemas.auth import (
    SuperAdminAuditLogListResponse,
    SuperAdminAuditLogResponse,
    SuperAdminAuditLogFilterOptionsResponse,
    AdminCreateRequest,
    AdminCreateResponse,
    AdminInviteRequest,
    AdminInviteResponse,
)
from services.identity.middleware.rbac import require_role
from services.identity.user_defaults import get_default_user_timezone

from fastapi.responses import StreamingResponse
import csv
import io
from datetime import datetime
import uuid

router = APIRouter(prefix="/superadmin", tags=["superadmin"])


@router.get(
    "/audit-log/filter-options", response_model=SuperAdminAuditLogFilterOptionsResponse
)
def get_audit_log_filter_options(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
):
    """Get available audit log filter values."""
    action_rows = (
        db.query(distinct(SuperAdminAuditLog.action))
        .filter(SuperAdminAuditLog.action.isnot(None))
        .order_by(SuperAdminAuditLog.action.asc())
        .all()
    )
    target_type_rows = (
        db.query(distinct(SuperAdminAuditLog.target_type))
        .filter(SuperAdminAuditLog.target_type.isnot(None))
        .order_by(SuperAdminAuditLog.target_type.asc())
        .all()
    )

    return SuperAdminAuditLogFilterOptionsResponse(
        actions=[row[0] for row in action_rows if row[0]],
        target_types=[row[0] for row in target_type_rows if row[0]],
    )


@router.get("/audit-log/export")
def export_audit_logs(
    action: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
):
    """Export audit logs to CSV (Super Admin only)."""
    query = db.query(SuperAdminAuditLog)

    if action:
        query = query.filter(SuperAdminAuditLog.action == action)
    if target_type:
        query = query.filter(SuperAdminAuditLog.target_type == target_type)

    logs = query.order_by(SuperAdminAuditLog.created_at.desc()).all()

    def generate():
        output = io.StringIO()
        writer = csv.writer(output)

        # Header
        writer.writerow(
            [
                "Timestamp",
                "Action",
                "Actor Email",
                "Target Type",
                "Target ID",
                "IP Address",
                "Details",
            ]
        )

        for log in logs:
            writer.writerow(
                [
                    log.created_at.isoformat(),
                    log.action,
                    log.actor_email,
                    log.target_type,
                    log.target_id,
                    log.ip_address,
                    str(log.details) if log.details else "",
                ]
            )
            yield output.getvalue()
            output.seek(0)
            output.truncate(0)

    filename = f"audit_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    return StreamingResponse(
        generate(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/audit-log", response_model=SuperAdminAuditLogListResponse)
def get_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    action: Optional[str] = Query(None),
    target_type: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
):
    """Get platform-level audit logs (Super Admin only)."""
    query = db.query(SuperAdminAuditLog)

    if action:
        query = query.filter(SuperAdminAuditLog.action == action)
    if target_type:
        query = query.filter(SuperAdminAuditLog.target_type == target_type)

    total = query.count()
    offset = (page - 1) * page_size
    logs = (
        query.order_by(SuperAdminAuditLog.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    # Format dates as ISO strings
    items = []
    for log in logs:
        items.append(
            SuperAdminAuditLogResponse(
                id=str(log.id),
                action=log.action,
                actor_id=str(log.actor_id) if log.actor_id else None,
                actor_email=log.actor_email,
                target_type=log.target_type,
                target_id=log.target_id,
                details=log.details,
                ip_address=log.ip_address,
                user_agent=log.user_agent,
                created_at=log.created_at.isoformat(),
            )
        )

    return SuperAdminAuditLogListResponse(
        items=items, total=total, page=page, page_size=page_size
    )


@router.post("/admins/create", response_model=AdminCreateResponse)
def create_admin_direct(
    request: AdminCreateRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
):
    """Create admin directly with password (testing mode)."""

    # Check if email already exists
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists"
        )

    # Check if tenant exists
    tenant = db.query(Tenant).filter(Tenant.id == request.tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant not found"
        )

    # Create the admin user
    admin_id = str(uuid.uuid4())
    hashed_password = hash_password(request.password)
    default_timezone = get_default_user_timezone(db)

    admin = User(
        id=admin_id,
        tenant_id=request.tenant_id,
        email=request.email,
        password_hash=hashed_password,
        auth_provider=AuthProvider.local,
        first_name=request.first_name,
        last_name=request.last_name,
        department=request.department,
        role=UserRole.Admin,
        status=UserStatus.active,
        timezone=default_timezone,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    db.add(admin)
    db.commit()
    db.refresh(admin)

    # Auto-activate tenant if pending (testing workflow)
    if tenant.status == "pending":
        tenant.status = "active"
        db.commit()
        db.refresh(tenant)

    # Log the action
    audit_log = SuperAdminAuditLog(
        actor_id=current_user.get("id"),
        actor_email=current_user.get("email"),
        action="admin_created",
        target_type="user",
        target_id=admin_id,
        details={
            "method": "direct",
            "tenant_id": request.tenant_id,
            "tenant_name": tenant.name,
            "department": request.department,
            "tenant_activated": tenant.status == "active",
        },
        created_at=datetime.utcnow(),
    )
    db.add(audit_log)
    db.commit()

    return AdminCreateResponse(
        success=True,
        message="Admin created successfully"
        + (" and company activated" if tenant.status == "active" else ""),
        admin_id=admin_id,
        login_credentials={"email": request.email, "password": request.password},
    )
    db.add(audit_log)
    db.commit()

    return AdminCreateResponse(
        success=True,
        message="Admin created successfully",
        admin_id=admin_id,
        login_credentials={"email": request.email, "password": request.password},
    )


@router.post("/admins/invite", response_model=AdminInviteResponse)
def invite_admin(
    request: AdminInviteRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
):
    """Invite admin with email (production mode)."""

    # Check if email already exists
    existing_user = db.query(User).filter(User.email == request.email).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Email already exists"
        )

    # Check if tenant exists
    tenant = db.query(Tenant).filter(Tenant.id == request.tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail="Tenant not found"
        )

    # TODO: Generate temporary password and send email invitation
    # For now, just create pending admin
    admin_id = str(uuid.uuid4())
    default_timezone = get_default_user_timezone(db)

    admin = User(
        id=admin_id,
        tenant_id=request.tenant_id,
        email=request.email,
        auth_provider=AuthProvider.local,
        first_name=request.first_name,
        last_name=request.last_name,
        role=UserRole.Admin,
        status=UserStatus.pending,
        timezone=default_timezone,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )

    db.add(admin)
    db.commit()
    db.refresh(admin)

    # Log the action
    audit_log = SuperAdminAuditLog(
        actor_id=current_user.get("id"),
        actor_email=current_user.get("email"),
        action="admin_invited",
        target_type="user",
        target_id=admin_id,
        details={
            "method": "invitation",
            "tenant_id": request.tenant_id,
            "tenant_name": tenant.name,
        },
        created_at=datetime.utcnow(),
    )
    db.add(audit_log)
    db.commit()

    return AdminInviteResponse(
        success=True, message="Admin invitation sent", admin_id=admin_id
    )
