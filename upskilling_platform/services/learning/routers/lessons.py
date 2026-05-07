"""Lesson CRUD router for the Learning Platform service."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from common.database import get_db
from common.auth import decode_token
from common.models import Lesson, Module, Course, User
from services.learning.utils.course_duration import sync_course_duration
from services.learning.utils.media import normalize_media_reference, resolve_media_url

router = APIRouter(prefix="/lessons", tags=["lessons"])
security = HTTPBearer()
DRAFT_VIEW_ROLES = {"LearningExpert", "Admin", "SuperAdmin"}


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


def _can_view_unpublished_course(user: User) -> bool:
    return user.role in DRAFT_VIEW_ROLES


def _validate_course_access_by_module(
    module_id: UUID, user: User, db: Session
) -> Course:
    """Validate user has access to the course containing this module."""
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    course = db.query(Course).filter(Course.id == module.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    if user.role != "SuperAdmin" and course.tenant_id != user.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: course belongs to another tenant"
        )
    if not course.is_published and not _can_view_unpublished_course(user):
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def _get_course_by_module_id(module_id: UUID, db: Session) -> Course:
    module = db.query(Module).filter(Module.id == module_id).first()
    if not module:
        raise HTTPException(status_code=404, detail="Module not found")
    course = db.query(Course).filter(Course.id == module.course_id).first()
    if not course:
        raise HTTPException(status_code=404, detail="Course not found")
    return course


def _validate_course_access_by_lesson(
    lesson_id: UUID, user: User, db: Session
) -> Course:
    """Validate user has access to the course containing this lesson."""
    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(status_code=404, detail="Lesson not found")
    return _validate_course_access_by_module(lesson.module_id, user, db)


@router.get("/module/{module_id}", response_model=list[dict])
def list_lessons_by_module(
    module_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all lessons for a module. Tenant-scoped for non-SuperAdmins."""
    user_info = _get_user_from_payload(current_user, db)
    _validate_course_access_by_module(module_id, user_info, db)

    lessons = (
        db.query(Lesson)
        .filter(Lesson.module_id == module_id)
        .order_by(Lesson.order)
        .all()
    )
    return [
        {
            "id": str(l.id),
            "module_id": str(l.module_id),
            "title": l.title,
            "content": l.content,
            "video_url": resolve_media_url(l.video_url),
            "content_type": l.content_type,
            "duration": l.duration,
            "order": l.order,
            "created_at": l.created_at.isoformat(),
        }
        for l in lessons
    ]


@router.get("/{lesson_id}", response_model=dict)
def get_lesson(
    lesson_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get lesson by ID. Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
    _validate_course_access_by_lesson(lesson_id, user_info, db)

    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found"
        )

    return {
        "id": str(lesson.id),
        "module_id": str(lesson.module_id),
        "title": lesson.title,
        "content": lesson.content,
        "video_url": resolve_media_url(lesson.video_url),
        "content_type": lesson.content_type,
        "duration": lesson.duration,
        "order": lesson.order,
        "created_at": lesson.created_at.isoformat(),
    }


@router.post(
    "/module/{module_id}", response_model=dict, status_code=status.HTTP_201_CREATED
)
def create_lesson(
    module_id: UUID,
    lesson_data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a lesson in a module. Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
    _validate_course_access_by_module(module_id, user_info, db)

    lesson = Lesson(
        module_id=module_id,
        title=lesson_data["title"],
        content=lesson_data.get("content"),
        video_url=normalize_media_reference(lesson_data.get("video_url")),
        content_type=lesson_data["content_type"],
        duration=lesson_data["duration"],
        order=lesson_data["order"],
    )
    db.add(lesson)
    db.flush()
    course = _get_course_by_module_id(module_id, db)
    sync_course_duration(course.id, db)
    db.commit()
    db.refresh(lesson)

    return {
        "id": str(lesson.id),
        "module_id": str(lesson.module_id),
        "title": lesson.title,
        "content": lesson.content,
        "video_url": resolve_media_url(lesson.video_url),
        "content_type": lesson.content_type,
        "duration": lesson.duration,
        "order": lesson.order,
        "created_at": lesson.created_at.isoformat(),
    }


@router.put("/{lesson_id}", response_model=dict)
def update_lesson(
    lesson_id: UUID,
    lesson_data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a lesson. Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
    _validate_course_access_by_lesson(lesson_id, user_info, db)

    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found"
        )

    for field in ["title", "content", "video_url", "content_type", "duration", "order"]:
        if field in lesson_data and lesson_data[field] is not None:
            if field == "video_url":
                setattr(lesson, field, normalize_media_reference(lesson_data[field]))
            else:
                setattr(lesson, field, lesson_data[field])

    course = _get_course_by_module_id(lesson.module_id, db)
    sync_course_duration(course.id, db)
    db.commit()
    db.refresh(lesson)

    return {
        "id": str(lesson.id),
        "module_id": str(lesson.module_id),
        "title": lesson.title,
        "content": lesson.content,
        "video_url": resolve_media_url(lesson.video_url),
        "content_type": lesson.content_type,
        "duration": lesson.duration,
        "order": lesson.order,
        "created_at": lesson.created_at.isoformat(),
    }


@router.delete("/{lesson_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_lesson(
    lesson_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a lesson. Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
    _validate_course_access_by_lesson(lesson_id, user_info, db)

    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found"
        )

    course = _get_course_by_module_id(lesson.module_id, db)
    db.delete(lesson)
    db.flush()
    sync_course_duration(course.id, db)
    db.commit()
