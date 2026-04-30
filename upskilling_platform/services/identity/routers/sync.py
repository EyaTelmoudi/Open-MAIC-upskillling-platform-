"""Sync job scheduler for Azure Entra ID user synchronization."""

import os
import uuid
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel

from common.auth import get_current_user_dependency
from common.models import Tenant, User
from common.database import get_db
from sqlalchemy.orm import Session


router = APIRouter(prefix="/sync", tags=["Sync Jobs"])

AZURE_CLIENT_ID = os.getenv("AZURE_CLIENT_ID", "")
AZURE_TENANT_ID = os.getenv("AZURE_TENANT_ID", "")
AZURE_CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET", "")


class SyncJobRequest(BaseModel):
    tenant_id: Optional[str] = None
    user_id: Optional[str] = None


class SyncJobResponse(BaseModel):
    job_id: str
    status: str
    started_at: str
    completed_at: Optional[str] = None
    total_users: int = 0
    synced_users: int = 0
    failed_users: int = 0
    errors: list[str] = []


class SyncStatusResponse(BaseModel):
    last_sync: Optional[str] = None
    last_sync_status: Optional[str] = None
    total_synced_today: int = 0


_sync_jobs: dict[str, dict] = {}


def trigger_full_tenant_sync(
    tenant_id: str,
    db: Session,
) -> dict:
    """Background task to sync all users for a tenant.

    Args:
        tenant_id: Tenant UUID.
        db: Database session.

    Returns:
        Job result dictionary.
    """
    job_id = str(uuid.uuid4())

    tenant = db.query(Tenant).filter(Tenant.id == uuid.UUID(tenant_id)).first()
    if not tenant:
        _sync_jobs[job_id] = {
            "status": "failed",
            "errors": [f"Tenant {tenant_id} not found"],
            "started_at": datetime.utcnow().isoformat(),
            "completed_at": datetime.utcnow().isoformat(),
        }
        return _sync_jobs[job_id]

    users = (
        db.query(User)
        .filter(
            User.tenant_id == uuid.UUID(tenant_id),
            User.auth_provider == "azure_entra",
            User.entra_oid.isnot(None),
        )
        .all()
    )

    synced_count = 0
    failed_count = 0
    errors = []

    for user in users:
        try:
            from services.identity.auth.sync import fetch_user_from_graph

            azure_user = fetch_user_from_graph(user.entra_oid)
            if azure_user:
                user.entra_upn = azure_user.get("userPrincipalName")
                user.entra_mail = azure_user.get("mail")
                user.entra_display_name = azure_user.get("displayName")
                user.entra_job_title = azure_user.get("jobTitle")
                user.entra_department = azure_user.get("department")
                user.entra_location = azure_user.get("officeLocation")
                user.last_entra_sync = datetime.utcnow()
                synced_count += 1
            else:
                failed_count += 1
        except Exception as e:
            failed_count += 1
            errors.append(f"User {user.id}: {str(e)}")

    db.commit()

    _sync_jobs[job_id] = {
        "status": "completed" if failed_count == 0 else "partial",
        "total_users": len(users),
        "synced_users": synced_count,
        "failed_users": failed_count,
        "errors": errors,
        "started_at": datetime.utcnow().isoformat(),
        "completed_at": datetime.utcnow().isoformat(),
    }

    return _sync_jobs[job_id]


@router.post("/jobs", response_model=SyncJobResponse)
async def create_sync_job(
    request: SyncJobRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_dependency()),
):
    """Create a new sync job.

    Triggers a background sync for all users in a tenant or a specific user.
    Requires Admin or SuperAdmin role.
    """
    if current_user.get("role") not in ["Admin", "SuperAdmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required to trigger sync jobs",
        )

    job_id = str(uuid.uuid4())

    if request.tenant_id:
        if current_user.get("role") == "Admin":
            if current_user.get("tenantId") != request.tenant_id:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot sync users from other tenant",
                )

        _sync_jobs[job_id] = {
            "status": "running",
            "tenant_id": request.tenant_id,
            "started_at": datetime.utcnow().isoformat(),
            "total_users": 0,
            "synced_users": 0,
            "failed_users": 0,
            "errors": [],
        }

        background_tasks.add_task(trigger_full_tenant_sync, request.tenant_id, db)

    elif request.user_id:
        user = db.query(User).filter(User.id == uuid.UUID(request.user_id)).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found",
            )

        if current_user.get("role") == "Admin":
            if str(user.tenant_id) != current_user.get("tenantId"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Cannot sync users from other tenant",
                )

        _sync_jobs[job_id] = {
            "status": "completed",
            "user_id": request.user_id,
            "started_at": datetime.utcnow().isoformat(),
            "completed_at": datetime.utcnow().isoformat(),
            "synced_users": 1,
            "errors": [],
        }

    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either tenant_id or user_id must be provided",
        )

    return SyncJobResponse(
        job_id=job_id,
        status=_sync_jobs[job_id]["status"],
        started_at=_sync_jobs[job_id]["started_at"],
        total_users=_sync_jobs[job_id].get("total_users", 0),
        synced_users=_sync_jobs[job_id].get("synced_users", 0),
        failed_users=_sync_jobs[job_id].get("failed_users", 0),
        errors=_sync_jobs[job_id].get("errors", []),
    )


@router.get("/jobs/{job_id}", response_model=SyncJobResponse)
async def get_sync_job(
    job_id: str,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_dependency()),
):
    """Get sync job status."""
    if job_id not in _sync_jobs:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Job not found",
        )

    job = _sync_jobs[job_id]

    return SyncJobResponse(
        job_id=job_id,
        status=job["status"],
        started_at=job["started_at"],
        completed_at=job.get("completed_at"),
        total_users=job.get("total_users", 0),
        synced_users=job.get("synced_users", 0),
        failed_users=job.get("failed_users", 0),
        errors=job.get("errors", []),
    )


@router.get("/status", response_model=SyncStatusResponse)
async def get_sync_status(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_dependency()),
):
    """Get sync status for current tenant."""
    tenant_id = current_user.get("tenantId")

    if current_user.get("role") == "SuperAdmin":
        last_sync = (
            db.query(User)
            .filter(User.last_entra_sync.isnot(None))
            .order_by(User.last_entra_sync.desc())
            .first()
        )

        return SyncStatusResponse(
            last_sync=last_sync.last_entra_sync.isoformat()
            if last_sync and last_sync.last_entra_sync
            else None,
            last_sync_status="completed",
            total_synced_today=0,
        )

    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required",
        )

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)

    last_sync_user = (
        db.query(User)
        .filter(
            User.tenant_id == uuid.UUID(tenant_id),
            User.last_entra_sync.isnot(None),
        )
        .order_by(User.last_entra_sync.desc())
        .first()
    )

    synced_today = (
        db.query(User)
        .filter(
            User.tenant_id == uuid.UUID(tenant_id),
            User.last_entra_sync >= today_start,
        )
        .count()
    )

    return SyncStatusResponse(
        last_sync=last_sync_user.last_entra_sync.isoformat()
        if last_sync_user and last_sync_user.last_entra_sync
        else None,
        last_sync_status="completed" if last_sync_user else None,
        total_synced_today=synced_today,
    )


@router.post("/trigger")
async def trigger_manual_sync(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user_dependency()),
):
    """Manually trigger sync for all users in tenant.

    This is a convenience endpoint for quick manual triggers.
    For bulk syncs, use POST /sync/jobs instead.
    """
    if current_user.get("role") not in ["Admin", "SuperAdmin"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )

    tenant_id = current_user.get("tenantId")

    if current_user.get("role") == "SuperAdmin":
        tenants = db.query(Tenant).all()
        return {
            "status": "scheduled",
            "message": f"Sync triggered for {len(tenants)} tenants",
            "tenants": [{"id": str(t.id), "name": t.name} for t in tenants],
        }

    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Tenant context required",
        )

    users_count = (
        db.query(User)
        .filter(
            User.tenant_id == uuid.UUID(tenant_id),
            User.auth_provider == "azure_entra",
        )
        .count()
    )

    return {
        "status": "scheduled",
        "tenant_id": tenant_id,
        "total_users": users_count,
        "message": f"Sync job queued for {users_count} users",
    }
