"""Audit logging for Super Admin actions."""

from typing import Any, Optional
from fastapi import Request
from sqlalchemy.orm import Session
from common.models import SuperAdminAuditLog


def log_superadmin_action(
    db: Session,
    action: str,
    actor_id: str,
    actor_email: str,
    target_type: Optional[str] = None,
    target_id: Optional[str] = None,
    details: Optional[dict[str, Any]] = None,
    request: Optional[Request] = None,
):
    """Log a Super Admin action to the audit log.
    
    Args:
        db: Database session.
        action: The action performed (e.g. "tenant.create").
        actor_id: ID of the Super Admin who performed the action.
        actor_email: Email of the Super Admin.
        target_type: Type of object acted upon.
        target_id: ID of object acted upon.
        details: Additional JSON details.
        request: FastAPI request object for IP and User Agent.
    """
    ip_address = None
    user_agent = None
    
    if request:
        ip_address = request.client.host if request.client else None
        user_agent = request.headers.get("user-agent")
        
    audit_log = SuperAdminAuditLog(
        action=action,
        actor_id=actor_id,
        actor_email=actor_email,
        target_type=target_type,
        target_id=target_id,
        details=details,
        ip_address=ip_address,
        user_agent=user_agent
    )
    
    db.add(audit_log)
    db.commit()
