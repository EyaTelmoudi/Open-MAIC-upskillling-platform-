"""Module CRUD router for the Learning Platform service."""

from datetime import datetime

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from common.database import get_db
from common.auth import decode_token
from common.models import Course, Module, User
from services.learning.utils.course_duration import sync_course_duration

router = APIRouter(prefix="/modules", tags=["modules"])
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


def _validate_course_access(course_id: UUID, user: User, db: Session) -> Course:
    """Validate user has access to the course (tenant check)."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if user.role != "SuperAdmin" and course.tenant_id != user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: course belongs to another tenant"
        )
    return course


def _mark_course_memory_pending(course: Course) -> None:
    course.memory_retention_status = "pending"
    course.memory_retention_error = None
    course.memory_retention_updated_at = datetime.utcnow()


@router.get("/course/{course_id}", response_model=list[dict])
def list_modules_by_course(
    course_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all modules for a course. Tenant-scoped for non-SuperAdmins."""
    user_info = _get_user_from_payload(current_user, db)
    _validate_course_access(course_id, user_info, db)

    modules = (
        db.query(Module)
        .filter(Module.course_id == course_id)
        .order_by(Module.order)
        .all()
    )
    return [
        {
            "id": str(m.id),
            "course_id": str(m.course_id),
            "title": m.title,
            "description": m.description,
            "order": m.order,
            "created_at": m.created_at.isoformat(),
        }
        for m in modules
    ]


@router.get("/{module_id}", response_model=dict)
def get_module(
    module_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get module by ID with its lessons. Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Module not found"
        )

    _validate_course_access(module.course_id, user_info, db)

    lessons = sorted(module.lessons, key=lambda l: l.order)
    return {
        "id": str(module.id),
        "course_id": str(module.course_id),
        "title": module.title,
        "description": module.description,
        "order": module.order,
        "created_at": module.created_at.isoformat(),
        "lessons": [
            {
                "id": str(l.id),
                "title": l.title,
                "content_type": l.content_type,
                "duration": l.duration,
                "order": l.order,
            }
            for l in lessons
        ],
    }


@router.post(
    "/course/{course_id}", response_model=dict, status_code=status.HTTP_201_CREATED
)
def create_module(
    course_id: UUID,
    module_data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a module in a course. Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
    _validate_course_access(course_id, user_info, db)

    module = Module(
        course_id=course_id,
        title=module_data["title"],
        description=module_data.get("description"),
        order=module_data["order"],
    )
    db.add(module)
    course = _validate_course_access(course_id, user_info, db)
    _mark_course_memory_pending(course)
    db.commit()
    db.refresh(module)

    return {
        "id": str(module.id),
        "course_id": str(module.course_id),
        "title": module.title,
        "description": module.description,
        "order": module.order,
        "created_at": module.created_at.isoformat(),
    }


@router.put("/{module_id}", response_model=dict)
def update_module(
    module_id: UUID,
    module_data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a module. Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Module not found"
        )

    _validate_course_access(module.course_id, user_info, db)

    for field in ["title", "description", "order"]:
        if field in module_data and module_data[field] is not None:
            setattr(module, field, module_data[field])

    course = _validate_course_access(module.course_id, user_info, db)
    _mark_course_memory_pending(course)
    db.commit()
    db.refresh(module)

    return {
        "id": str(module.id),
        "course_id": str(module.course_id),
        "title": module.title,
        "description": module.description,
        "order": module.order,
        "created_at": module.created_at.isoformat(),
    }


@router.delete("/{module_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_module(
    module_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a module. Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Module not found"
        )

    _validate_course_access(module.course_id, user_info, db)

    course_id = module.course_id
    course = _validate_course_access(course_id, user_info, db)
    _mark_course_memory_pending(course)
    db.delete(module)
    db.flush()
    sync_course_duration(course_id, db)
    db.commit()
