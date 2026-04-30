from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from common.database import get_db
from common.models import Course, Enrollment, Tenant, User
from common.enums import UserStatus, UserRole
from services.identity.middleware.rbac import require_role
from datetime import datetime, timedelta
from typing import Optional

router = APIRouter(prefix="/superadmin/dashboard", tags=["Dashboard Stats"])


@router.get("/stats")
async def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
):
    """Get dashboard statistics for Super Admin."""

    # Tenant stats
    total_tenants = db.query(Tenant).count()
    active_tenants = db.query(Tenant).filter(Tenant.status == "active").count()
    suspended_tenants = db.query(Tenant).filter(Tenant.status == "suspended").count()
    pending_tenants = db.query(Tenant).filter(Tenant.status == "pending").count()

    # User stats - not filtered by tenant for Super Admin
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.status == UserStatus.active).count()
    pending_users = (
        db.query(User)
        .filter(
            (User.status == UserStatus.provisioned)
            | (User.status == UserStatus.pending_invitation)
        )
        .count()
    )
    inactive_users = (
        db.query(User)
        .filter(
            (User.status == UserStatus.suspended) | (User.status == UserStatus.deleted)
        )
        .count()
    )

    return {
        "tenants": {
            "total": total_tenants,
            "active": active_tenants,
            "suspended": suspended_tenants,
            "pending": pending_tenants,
        },
        "users": {
            "total": total_users,
            "active": active_users,
            "pending": pending_users,
            "inactive": inactive_users,
        },
    }


@router.get("/alerts")
async def get_platform_alerts(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
):
    """Get platform alerts for Super Admin."""
    alerts = []

    # Check for tenants without admin
    tenants = db.query(Tenant).filter(Tenant.status == "active").all()
    for tenant in tenants:
        has_admin = (
            db.query(User)
            .filter(User.tenant_id == tenant.id, User.role == "Admin")
            .first()
            is not None
        )
        if not has_admin:
            alerts.append(
                {
                    "type": "warning",
                    "message": f"{tenant.name} has no admin assigned",
                    "action_url": f"/superadmin/admins/assign?tenant={tenant.id}",
                }
            )

        # Check for tenants without Entra ID config
        if not (tenant.entra_client_id and tenant.entra_tenant_id):
            alerts.append(
                {
                    "type": "warning",
                    "message": f"{tenant.name} has no Entra ID configured",
                    "action_url": f"/superadmin/tenants/{tenant.id}",
                }
            )

        # Check for seat limit
        if tenant.seat_limit and tenant.seat_limit > 0:
            user_count = db.query(User).filter(User.tenant_id == tenant.id).count()
            if user_count >= tenant.seat_limit:
                alerts.append(
                    {
                        "type": "warning",
                        "message": f"{tenant.name} seat limit reached ({user_count}/{tenant.seat_limit})",
                        "action_url": f"/superadmin/tenants/{tenant.id}",
                    }
                )

    # Check for tenants with no users
    for tenant in tenants:
        user_count = db.query(User).filter(User.tenant_id == tenant.id).count()
        if user_count == 0:
            alerts.append(
                {
                    "type": "info",
                    "message": f"{tenant.name} has no users yet",
                    "action_url": f"/admin/users?tenant={tenant.id}",
                }
            )

    return {"alerts": alerts}


@router.get("/analytics")
async def get_cross_tenant_analytics(
    period: Optional[str] = Query("all", regex="^(all|week|month|year)$"),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_role("SuperAdmin")),
):
    """Get cross-tenant aggregated analytics for Super Admin."""
    now = datetime.utcnow()
    if period == "week":
        start_date = now - timedelta(days=7)
    elif period == "month":
        start_date = now - timedelta(days=30)
    elif period == "year":
        start_date = now - timedelta(days=365)
    else:
        start_date = None

    tenants = db.query(Tenant).order_by(Tenant.created_at.desc()).all()
    tenant_stats = []

    total_enrollments = 0
    total_completions = 0
    total_active_learners = 0
    tenants_with_admin = 0
    tenants_with_entra = 0
    seat_limit_reached = 0
    near_capacity_tenants = 0
    unlimited_seat_tenants = 0

    for tenant in tenants:
        tenant_users = db.query(User).filter(User.tenant_id == tenant.id)
        total_users_count = tenant_users.count()
        active_users_count = tenant_users.filter(
            User.status == UserStatus.active
        ).count()
        pending_users_count = tenant_users.filter(
            (User.status == UserStatus.provisioned)
            | (User.status == UserStatus.pending_invitation)
        ).count()
        admin_count = tenant_users.filter(User.role == UserRole.Admin).count()
        tenant_course_query = db.query(Course).filter(Course.tenant_id == tenant.id)
        if start_date:
            tenant_course_query = tenant_course_query.filter(
                Course.created_at >= start_date
            )
        published_course_count = tenant_course_query.filter(
            Course.is_published.is_(True)
        ).count()

        tenant_enrollment_query = (
            db.query(Enrollment)
            .join(Course, Enrollment.course_id == Course.id)
            .filter(Course.tenant_id == tenant.id)
        )
        if start_date:
            tenant_enrollment_query = tenant_enrollment_query.filter(
                Enrollment.enrolled_at >= start_date
            )
        enrollment_count = tenant_enrollment_query.count()
        completed_enrollment_count = tenant_enrollment_query.filter(
            (Enrollment.completed_at.isnot(None)) | (Enrollment.status == "completed")
        ).count()
        active_learner_count = (
            tenant_enrollment_query.with_entities(Enrollment.user_id).distinct().count()
        )
        completion_rate = round(
            (completed_enrollment_count / enrollment_count * 100)
            if enrollment_count > 0
            else 0,
            1,
        )

        entra_configured = bool(tenant.entra_client_id and tenant.entra_tenant_id)
        if admin_count > 0:
            tenants_with_admin += 1
        if entra_configured:
            tenants_with_entra += 1

        seat_usage_percent = 0
        if tenant.seat_limit and tenant.seat_limit > 0:
            seat_usage_percent = round((total_users_count / tenant.seat_limit) * 100, 1)
            if total_users_count >= tenant.seat_limit:
                seat_limit_reached += 1
            elif seat_usage_percent >= 80:
                near_capacity_tenants += 1
        else:
            unlimited_seat_tenants += 1

        tenant_stats.append(
            {
                "id": str(tenant.id),
                "name": tenant.name,
                "status": tenant.status,
                "total_users": total_users_count,
                "active_users": active_users_count,
                "pending_users": pending_users_count,
                "admin_count": admin_count,
                "seat_limit": tenant.seat_limit or 0,
                "seat_usage_percent": seat_usage_percent,
                "published_courses": published_course_count,
                "enrollment_count": enrollment_count,
                "completed_enrollments": completed_enrollment_count,
                "active_learners": active_learner_count,
                "completion_rate": completion_rate,
                "entra_configured": entra_configured,
            }
        )

        total_enrollments += enrollment_count
        total_completions += completed_enrollment_count
        total_active_learners += active_learner_count

    role_distribution = {}
    for role in UserRole:
        count = db.query(User).filter(User.role == role.value).count()
        role_distribution[role.value] = count

    status_distribution = {}
    for status in UserStatus:
        count = db.query(User).filter(User.status == status.value).count()
        status_distribution[status.value] = count

    total_tenants = db.query(Tenant).count()
    active_tenants_count = db.query(Tenant).filter(Tenant.status == "active").count()
    suspended_tenants_count = (
        db.query(Tenant).filter(Tenant.status == "suspended").count()
    )
    pending_tenants_count = db.query(Tenant).filter(Tenant.status == "pending").count()

    total_users_query = db.query(User)
    total_courses_query = db.query(Course)
    total_enrollments_query = db.query(Enrollment)
    if start_date:
        total_users_query = total_users_query.filter(User.created_at >= start_date)
        total_courses_query = total_courses_query.filter(Course.created_at >= start_date)
        total_enrollments_query = total_enrollments_query.filter(
            Enrollment.enrolled_at >= start_date
        )

    newly_added_users = total_users_query.count()
    published_courses = total_courses_query.filter(Course.is_published.is_(True)).count()
    average_completion_rate = round(
        (total_completions / total_enrollments * 100) if total_enrollments > 0 else 0,
        1,
    )
    tenant_stats.sort(
        key=lambda tenant: (
            tenant["seat_usage_percent"],
            tenant["total_users"],
            tenant["name"].lower(),
        ),
        reverse=True,
    )

    return {
        "period": period,
        "platform_overview": {
            "total_tenants": total_tenants,
            "active_tenants": active_tenants_count,
            "suspended_tenants": suspended_tenants_count,
            "pending_tenants": pending_tenants_count,
            "total_users": db.query(User).count(),
            "active_users": db.query(User)
            .filter(User.status == UserStatus.active)
            .count(),
            "new_users_in_period": newly_added_users,
            "published_courses": published_courses,
        },
        "tenant_stats": tenant_stats,
        "role_distribution": role_distribution,
        "status_distribution": status_distribution,
        "learning_metrics": {
            "total_enrollments": total_enrollments,
            "active_learners": total_active_learners,
            "completed_enrollments": total_completions,
            "completion_rate": average_completion_rate,
        },
        "governance_metrics": {
            "tenants_with_admin": tenants_with_admin,
            "tenants_without_admin": total_tenants - tenants_with_admin,
            "tenants_with_entra": tenants_with_entra,
            "tenants_without_entra": total_tenants - tenants_with_entra,
            "seat_limit_reached": seat_limit_reached,
            "near_capacity_tenants": near_capacity_tenants,
            "unlimited_seat_tenants": unlimited_seat_tenants,
        },
    }
