"""Identity & Access router for tenant-scoped operations."""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from common.auth import get_current_user_dependency
from common.database import get_db
from common.enums import UserRole, UserStatus


router = APIRouter(prefix="/identity", tags=["Identity"])


class PendingUserResponse(BaseModel):
    id: str
    email: str
    first_name: str
    last_name: str
    role: str
    department: Optional[str] = None
    created_at: str


class PendingUsersListResponse(BaseModel):
    users: list[PendingUserResponse]
    total: int


class RoleChangeRequest(BaseModel):
    role: str
    reason: Optional[str] = None


class StatusChangeRequest(BaseModel):
    status: str
    reason: Optional[str] = None


class RevokeRequest(BaseModel):
    reason: Optional[str] = None
    revoke_credentials: bool = False


class RoleMappingRuleRequest(BaseModel):
    azure_role: str
    platform_role: str
    department: Optional[str] = None


class RoleMappingRuleResponse(BaseModel):
    id: str
    azure_role: str
    platform_role: str
    department: Optional[str] = None
    is_active: bool = True
    tenant_id: Optional[str] = None
    created_at: str


class RoleMappingRulesListResponse(BaseModel):
    rules: list[RoleMappingRuleResponse]
    total: int


class RoleMappingSimulationRequest(BaseModel):
    azure_roles: list[str]
    department: Optional[str] = None


class RoleMappingSimulationResponse(BaseModel):
    mapped_role: Optional[str] = None
    matched_rule: Optional[str] = None


@router.get("/pending-users", response_model=PendingUsersListResponse)
async def get_pending_users(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_dependency()),
):
    """Get all pending users in the caller's tenant.

    Requires Admin role.
    """
    if current_user.get("role") != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )

    tenant_id = current_user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required",
        )

    from common.models import User

    users = (
        db.query(User)
        .filter(
            User.tenant_id == uuid.UUID(tenant_id),
            User.status.in_(
                [UserStatus.pending.value, UserStatus.pending_invitation.value]
            ),
        )
        .order_by(User.created_at.desc())
        .all()
    )

    return PendingUsersListResponse(
        users=[
            PendingUserResponse(
                id=str(u.id),
                email=u.email,
                first_name=u.first_name,
                last_name=u.last_name,
                role=u.role,
                department=u.department,
                created_at=u.created_at.isoformat(),
            )
            for u in users
        ],
        total=len(users),
    )


@router.patch("/users/{user_id}/role", response_model=PendingUserResponse)
async def change_user_role(
    user_id: str,
    request: RoleChangeRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_dependency()),
):
    """Change user role within tenant.

    Requires Admin role.
    """
    if current_user.get("role") != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )

    tenant_id = current_user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required",
        )

    valid_roles = {r.value for r in UserRole}
    if request.role not in valid_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid role. Must be one of: {', '.join(valid_roles)}",
        )

    from common.models import User, IdentityAuditLog

    user = (
        db.query(User)
        .filter(
            User.id == uuid.UUID(user_id),
            User.tenant_id == uuid.UUID(tenant_id),
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    old_role = user.role
    user.role = request.role
    db.commit()
    db.refresh(user)

    audit_log = IdentityAuditLog(
        tenant_id=uuid.UUID(tenant_id),
        user_id=user.id,
        action="role_changed",
        actor_id=uuid.UUID(current_user["sub"]),
        actor_email=current_user.get("email"),
        target_user_id=user.id,
        target_email=user.email,
        details=f"Role changed from {old_role} to {request.role}. Reason: {request.reason or 'N/A'}",
    )
    db.add(audit_log)
    db.commit()

    return PendingUserResponse(
        id=str(user.id),
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        department=user.department,
        created_at=user.created_at.isoformat(),
    )


@router.patch("/users/{user_id}/status", response_model=PendingUserResponse)
async def change_user_status(
    user_id: str,
    request: StatusChangeRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_dependency()),
):
    """Change user status within tenant.

    Requires Admin role.
    """
    if current_user.get("role") != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )

    tenant_id = current_user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required",
        )

    valid_statuses = {s.value for s in UserStatus}
    if request.status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}",
        )

    from common.models import User, IdentityAuditLog

    user = (
        db.query(User)
        .filter(
            User.id == uuid.UUID(user_id),
            User.tenant_id == uuid.UUID(tenant_id),
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    old_status = user.status
    user.status = request.status
    db.commit()
    db.refresh(user)

    audit_log = IdentityAuditLog(
        tenant_id=uuid.UUID(tenant_id),
        user_id=user.id,
        action="status_changed",
        actor_id=uuid.UUID(current_user["sub"]),
        actor_email=current_user.get("email"),
        target_user_id=user.id,
        target_email=user.email,
        details=f"Status changed from {old_status} to {request.status}. Reason: {request.reason or 'N/A'}",
    )
    db.add(audit_log)
    db.commit()

    return PendingUserResponse(
        id=str(user.id),
        email=user.email,
        first_name=user.first_name,
        last_name=user.last_name,
        role=user.role,
        department=user.department,
        created_at=user.created_at.isoformat(),
    )


@router.post("/users/{user_id}/revoke")
async def revoke_user_access(
    user_id: str,
    request: RevokeRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_dependency()),
):
    """Revoke user access (force logout) within tenant.

    Requires Admin role.
    """
    if current_user.get("role") != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )

    tenant_id = current_user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required",
        )

    from common.models import User, IdentityAuditLog

    user = (
        db.query(User)
        .filter(
            User.id == uuid.UUID(user_id),
            User.tenant_id == uuid.UUID(tenant_id),
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    old_status = user.status
    user.status = UserStatus.suspended.value
    user.password_hash = None
    db.commit()

    audit_log = IdentityAuditLog(
        tenant_id=uuid.UUID(tenant_id),
        user_id=user.id,
        action="access_revoked",
        actor_id=uuid.UUID(current_user["sub"]),
        actor_email=current_user.get("email"),
        target_user_id=user.id,
        target_email=user.email,
        details=f"Access revoked. Old status: {old_status}. Reason: {request.reason or 'N/A'}",
    )
    db.add(audit_log)
    db.commit()

    return {"message": "User access revoked successfully", "user_id": str(user.id)}


@router.get("/role-mapping-rules", response_model=RoleMappingRulesListResponse)
async def get_role_mapping_rules(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_dependency()),
):
    """Get role mapping rules for tenant.

    Requires Admin role.
    """
    if current_user.get("role") != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )

    tenant_id = current_user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required",
        )

    from common.models import RoleMappingRule

    rules = (
        db.query(RoleMappingRule)
        .filter(RoleMappingRule.tenant_id == uuid.UUID(tenant_id))
        .order_by(RoleMappingRule.created_at.desc())
        .all()
    )

    return RoleMappingRulesListResponse(
        rules=[
            RoleMappingRuleResponse(
                id=str(r.id),
                azure_role=r.azure_role,
                platform_role=r.platform_role,
                department=r.department,
                is_active=r.is_active,
                tenant_id=str(r.tenant_id) if r.tenant_id else None,
                created_at=r.created_at.isoformat(),
            )
            for r in rules
        ],
        total=len(rules),
    )


@router.post("/role-mapping-rules", response_model=RoleMappingRuleResponse)
async def create_role_mapping_rule(
    request: RoleMappingRuleRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_dependency()),
):
    """Create role mapping rule.

    Requires Admin role.
    Target role restricted to: Manager, LearningExpert, TeamManager, TeamMember, TeamIntern (NOT Admin/SuperAdmin).
    """
    if current_user.get("role") != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )

    tenant_id = current_user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required",
        )

    restricted_roles = {"Admin", "SuperAdmin"}
    if request.platform_role in restricted_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot map to {request.platform_role}. Target roles restricted to: Manager, LearningExpert, TeamManager, TeamMember, TeamIntern",
        )

    from common.models import RoleMappingRule

    rule = RoleMappingRule(
        tenant_id=uuid.UUID(tenant_id),
        azure_role=request.azure_role,
        platform_role=request.platform_role,
        department=request.department,
        is_active=True,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)

    return RoleMappingRuleResponse(
        id=str(rule.id),
        azure_role=rule.azure_role,
        platform_role=rule.platform_role,
        department=rule.department,
        is_active=rule.is_active,
        tenant_id=str(rule.tenant_id) if rule.tenant_id else None,
        created_at=rule.created_at.isoformat(),
    )


@router.put("/role-mapping-rules/{rule_id}", response_model=RoleMappingRuleResponse)
async def update_role_mapping_rule(
    rule_id: str,
    request: RoleMappingRuleRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_dependency()),
):
    """Update role mapping rule.

    Requires Admin role.
    """
    if current_user.get("role") != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )

    tenant_id = current_user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required",
        )

    restricted_roles = {"Admin", "SuperAdmin"}
    if request.platform_role in restricted_roles:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot map to {request.platform_role}. Target roles restricted to: Manager, LearningExpert, TeamManager, TeamMember, TeamIntern",
        )

    from common.models import RoleMappingRule

    rule = (
        db.query(RoleMappingRule)
        .filter(
            RoleMappingRule.id == uuid.UUID(rule_id),
            RoleMappingRule.tenant_id == uuid.UUID(tenant_id),
        )
        .first()
    )

    if not rule:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Role mapping rule not found",
        )

    rule.azure_role = request.azure_role
    rule.platform_role = request.platform_role
    rule.department = request.department
    db.commit()
    db.refresh(rule)

    return RoleMappingRuleResponse(
        id=str(rule.id),
        azure_role=rule.azure_role,
        platform_role=rule.platform_role,
        department=rule.department,
        is_active=rule.is_active,
        tenant_id=str(rule.tenant_id) if rule.tenant_id else None,
        created_at=rule.created_at.isoformat(),
    )


@router.delete("/role-mapping-rules/{rule_id}")
async def delete_role_mapping_rule(
    rule_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_dependency()),
):
    """Delete role mapping rule.

    Requires Admin role.
    """
    if current_user.get("role") != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )

    tenant_id = current_user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required",
        )

    from common.models import RoleMappingRule

    rule = (
        db.query(RoleMappingRule)
        .filter(
            RoleMappingRule.id == uuid.UUID(rule_id),
            RoleMappingRule.tenant_id == uuid.UUID(tenant_id),
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

    return {"message": "Role mapping rule deleted successfully"}


@router.post(
    "/role-mapping-rules/simulate", response_model=RoleMappingSimulationResponse
)
async def simulate_role_mapping(
    request: RoleMappingSimulationRequest,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_dependency()),
):
    """Simulate role mapping with mock claims.

    Requires Admin role.
    """
    if current_user.get("role") != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )

    tenant_id = current_user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required",
        )

    from common.models import RoleMappingRule

    rules = (
        db.query(RoleMappingRule)
        .filter(
            RoleMappingRule.is_active == True,
            RoleMappingRule.tenant_id == uuid.UUID(tenant_id),
        )
        .all()
    )

    matched_rule = None
    mapped_role = None

    for rule in rules:
        if rule.azure_role in request.azure_roles:
            if not rule.department or rule.department == request.department:
                matched_rule = rule.azure_role
                mapped_role = rule.platform_role
                break

    return RoleMappingSimulationResponse(
        mapped_role=mapped_role,
        matched_rule=matched_rule,
    )


class IdentityAuditLogResponse(BaseModel):
    id: str
    user_id: Optional[str] = None
    action: str
    actor_id: Optional[str] = None
    actor_email: Optional[str] = None
    target_user_id: Optional[str] = None
    target_email: Optional[str] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: str


class IdentityAuditLogListResponse(BaseModel):
    logs: list[IdentityAuditLogResponse]
    total: int
    page: int = 1
    page_size: int = 20


@router.get("/audit", response_model=IdentityAuditLogListResponse)
async def get_identity_audit_log(
    page: int = 1,
    page_size: int = 20,
    action_filter: Optional[str] = None,
    user_id_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_dependency()),
):
    """Get identity audit log for tenant.

    Returns role/status changes with timestamp, actor, target, old/new values, reason, source, IP.
    Requires Admin role.
    """
    if current_user.get("role") != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )

    tenant_id = current_user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required",
        )

    from common.models import IdentityAuditLog

    query = db.query(IdentityAuditLog).filter(
        IdentityAuditLog.tenant_id == uuid.UUID(tenant_id)
    )

    if action_filter:
        query = query.filter(IdentityAuditLog.action == action_filter)

    if user_id_filter:
        query = query.filter(
            IdentityAuditLog.target_user_id == uuid.UUID(user_id_filter)
        )

    total = query.count()
    logs = (
        query.order_by(IdentityAuditLog.created_at.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return IdentityAuditLogListResponse(
        logs=[
            IdentityAuditLogResponse(
                id=str(log.id),
                user_id=str(log.user_id) if log.user_id else None,
                action=log.action,
                actor_id=str(log.actor_id) if log.actor_id else None,
                actor_email=log.actor_email,
                target_user_id=str(log.target_user_id) if log.target_user_id else None,
                target_email=log.target_email,
                details=log.details,
                ip_address=log.ip_address,
                created_at=log.created_at.isoformat(),
            )
            for log in logs
        ],
        total=total,
        page=page,
        page_size=page_size,
    )


class EmailMismatchResponse(BaseModel):
    user_id: str
    email: str
    first_name: str
    last_name: str
    entra_mail: Optional[str] = None
    detected_at: str


class EmailMismatchListResponse(BaseModel):
    mismatches: list[EmailMismatchResponse]
    total: int


@router.get("/email-mismatches", response_model=EmailMismatchListResponse)
async def get_email_mismatches(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_dependency()),
):
    """Get users with email mismatch between platform email and Entra ID email.

    Requires Admin role.
    """
    if current_user.get("role") != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )

    tenant_id = current_user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required",
        )

    from common.models import User

    users = (
        db.query(User)
        .filter(
            User.tenant_id == uuid.UUID(tenant_id),
            User.entra_oid.isnot(None),
            User.entra_mail.isnot(None),
            User.email != User.entra_mail,
        )
        .order_by(User.updated_at.desc())
        .all()
    )

    return EmailMismatchListResponse(
        mismatches=[
            EmailMismatchResponse(
                user_id=str(u.id),
                email=u.email,
                first_name=u.first_name,
                last_name=u.last_name,
                entra_mail=u.entra_mail,
                detected_at=u.updated_at.isoformat(),
            )
            for u in users
        ],
        total=len(users),
    )


@router.post("/users/{user_id}/confirm-email")
async def confirm_email_update(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_dependency()),
):
    """Confirm email update - set platform email to Entra ID email, clear mismatch flag.

    Requires Admin role.
    """
    if current_user.get("role") != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )

    tenant_id = current_user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required",
        )

    from common.models import User, IdentityAuditLog

    user = (
        db.query(User)
        .filter(
            User.id == uuid.UUID(user_id),
            User.tenant_id == uuid.UUID(tenant_id),
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    if not user.entra_mail:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="User has no Entra ID email to confirm",
        )

    old_email = user.email
    user.email = user.entra_mail
    db.commit()

    audit_log = IdentityAuditLog(
        tenant_id=uuid.UUID(tenant_id),
        user_id=user.id,
        action="email_confirmed",
        actor_id=uuid.UUID(current_user["sub"]),
        actor_email=current_user.get("email"),
        target_user_id=user.id,
        target_email=user.email,
        details=f"Email confirmed and updated from {old_email} to {user.entra_mail}",
    )
    db.add(audit_log)
    db.commit()

    return {
        "message": "Email updated successfully",
        "user_id": str(user.id),
        "new_email": user.email,
    }


@router.post("/users/{user_id}/keep-email")
async def keep_current_email(
    user_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_dependency()),
):
    """Keep current platform email, suppress mismatch flag until next change.

    Requires Admin role.
    """
    if current_user.get("role") != "Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )

    tenant_id = current_user.get("tenantId")
    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required",
        )

    from common.models import User, IdentityAuditLog

    user = (
        db.query(User)
        .filter(
            User.id == uuid.UUID(user_id),
            User.tenant_id == uuid.UUID(tenant_id),
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    audit_log = IdentityAuditLog(
        tenant_id=uuid.UUID(tenant_id),
        user_id=user.id,
        action="email_mismatch_suppressed",
        actor_id=uuid.UUID(current_user["sub"]),
        actor_email=current_user.get("email"),
        target_user_id=user.id,
        target_email=user.email,
        details=f"Email mismatch suppressed. Current email: {user.email}, Entra email: {user.entra_mail}",
    )
    db.add(audit_log)
    db.commit()

    return {"message": "Email mismatch suppressed", "user_id": str(user.id)}
