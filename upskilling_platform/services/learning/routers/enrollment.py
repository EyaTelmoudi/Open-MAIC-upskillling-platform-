"""Enrollment router for the Learning Platform service."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from common.database import get_db
from common.auth import decode_token
from common.models import Course, Enrollment, User, Tenant
from common.messaging import RabbitMQClient
from services.learning.services.learner_context import initialize_learner_course_tracking

router = APIRouter(prefix="/enrollments", tags=["enrollments"])
security = HTTPBearer()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Extract and validate the current user from JWT token."""
    token = credentials.credentials
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def _get_user_from_payload(payload: dict, db: Session) -> User:
    """Get User object from JWT payload."""
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing user ID")
    user = db.query(User).filter(User.id == UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.get("", response_model=list[dict], include_in_schema=False)
@router.get("/", response_model=list[dict])
def list_enrollments(
    user_id: UUID = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List enrollments. Tenant-scoped for non-SuperAdmins. Filter by user_id if provided."""
    user_info = _get_user_from_payload(current_user, db)
    query = db.query(Enrollment)

    if user_info.role != "SuperAdmin":
        query = query.join(User).filter(User.tenant_id == user_info.tenant_id)

    if user_id:
        query = query.filter(Enrollment.user_id == user_id)

    enrollments = query.order_by(Enrollment.enrolled_at.desc()).all()
    return [
        {
            "id": str(e.id),
            "user_id": str(e.user_id),
            "course_id": str(e.course_id),
            "enrolled_at": e.enrolled_at.isoformat(),
            "completed_at": e.completed_at.isoformat() if e.completed_at else None,
            "status": e.status,
        }
        for e in enrollments
    ]


@router.get("/{enrollment_id}", response_model=dict)
def get_enrollment(
    enrollment_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get enrollment by ID. Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
    enrollment = db.query(Enrollment).filter(Enrollment.id == enrollment_id).first()
    if not enrollment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Enrollment not found"
        )

    enrollment_user = db.query(User).filter(User.id == enrollment.user_id).first()
    if user_info.role != "SuperAdmin" and enrollment_user.tenant_id != user_info.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: enrollment belongs to another tenant"
        )

    return {
        "id": str(enrollment.id),
        "user_id": str(enrollment.user_id),
        "course_id": str(enrollment.course_id),
        "enrolled_at": enrollment.enrolled_at.isoformat(),
        "completed_at": enrollment.completed_at.isoformat()
        if enrollment.completed_at
        else None,
        "status": enrollment.status,
    }


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED, include_in_schema=False)
@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED)
def enroll_in_course(
    enrollment_data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Enroll a user in a course. Prevents duplicate enrollments. Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
    user_id = UUID(enrollment_data["user_id"])
    course_id = UUID(enrollment_data["course_id"])

    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
        )

    if user_info.role != "SuperAdmin" and course.tenant_id != user_info.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: course belongs to another tenant"
        )

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="User not found"
        )

    if user_info.role != "SuperAdmin" and user.tenant_id != user_info.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: user belongs to another tenant"
        )

    if user.tenant_id:
        tenant = db.query(Tenant).filter(Tenant.id == user.tenant_id).first()
        if tenant and tenant.seat_limit is not None:
            enrolled_users_count = (
                db.query(Enrollment.user_id)
                .join(User, Enrollment.user_id == User.id)
                .filter(User.tenant_id == tenant.id)
                .distinct()
                .count()
            )
            
            user_already_enrolled = (
                db.query(Enrollment)
                .filter(Enrollment.user_id == user_id)
                .first()
            ) is not None
            
            if not user_already_enrolled and enrolled_users_count >= tenant.seat_limit:
                try:
                    mq = RabbitMQClient()
                    mq.publish(
                        exchange="learning.exchange",
                        routing_key="tenant.seat_limit_reached",
                        message={
                            "event": "tenant.seat_limit_reached",
                            "tenantId": str(tenant.id),
                            "seatLimit": tenant.seat_limit,
                            "timestamp": datetime.utcnow().isoformat(),
                        },
                    )
                    mq.close()
                except Exception:
                    pass
                
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"Seat limit reached for this company ({tenant.seat_limit} seats). Please contact your administrator.",
                )
            
            if not user_already_enrolled and enrolled_users_count + 1 >= tenant.seat_limit * 0.9:
                try:
                    mq = RabbitMQClient()
                    mq.publish(
                        exchange="learning.exchange",
                        routing_key="tenant.seat_limit_warning",
                        message={
                            "event": "tenant.seat_limit_warning",
                            "tenantId": str(tenant.id),
                            "currentSeats": enrolled_users_count + 1,
                            "seatLimit": tenant.seat_limit,
                            "timestamp": datetime.utcnow().isoformat(),
                        },
                    )
                    mq.close()
                except Exception:
                    pass

    existing = (
        db.query(Enrollment)
        .filter(
            Enrollment.user_id == user_id,
            Enrollment.course_id == course_id,
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="User is already enrolled in this course",
        )

    enrollment = Enrollment(
        user_id=user_id,
        course_id=course_id,
        status="in_progress",
    )
    db.add(enrollment)
    db.flush()
    initialize_learner_course_tracking(db, user_id=user_id, course_id=course_id)
    db.commit()
    db.refresh(enrollment)

    try:
        mq = RabbitMQClient()
        mq.publish(
            exchange="learning.exchange",
            routing_key="learning.enrollment.created",
            message={
                "event": "enrollment.created",
                "userId": str(user_id),
                "courseId": str(course_id),
                "enrollmentId": str(enrollment.id),
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
        mq.close()
    except Exception:
        pass

    return {
        "id": str(enrollment.id),
        "user_id": str(enrollment.user_id),
        "course_id": str(enrollment.course_id),
        "enrolled_at": enrollment.enrolled_at.isoformat(),
        "completed_at": None,
        "status": enrollment.status,
    }
