"""Course CRUD router for the Learning Platform service."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from common.database import get_db
from common.auth import decode_token
from common.messaging import RabbitMQClient
from common.models import Course, Module, Lesson, User, Tenant
from services.learning.utils.media import resolve_media_url

router = APIRouter(prefix="/courses", tags=["courses"])
rabbitmq_client = RabbitMQClient()
security = HTTPBearer()
COURSE_EDIT_ROLES = {"LearningExpert", "Manager", "Admin", "SuperAdmin"}
COURSE_DELETE_ROLES = {"LearningExpert", "Manager", "Admin", "SuperAdmin"}


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


def _normalize_uuid(value: UUID | str | None) -> UUID | None:
    """Accept UUID objects or UUID strings and return a UUID instance."""
    if value is None:
        return None
    if isinstance(value, UUID):
        return value
    return UUID(str(value))


def _require_course_edit_role(user: User) -> None:
    """Require LearningExpert+ permissions for course authoring actions."""
    if user.role not in COURSE_EDIT_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only LearningExpert, Manager, or Admin can manage courses",
        )


@router.get("/", response_model=dict)
def list_courses(
    category: Optional[str] = Query(None),
    difficulty: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    is_published: Optional[bool] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List courses with filtering, search, and pagination. Tenant-scoped for non-SuperAdmins."""
    user_info = _get_user_from_payload(current_user, db)
    query = db.query(Course)

    if user_info.role != "SuperAdmin":
        query = query.filter(Course.tenant_id == user_info.tenant_id)

    if category:
        query = query.filter(Course.category == category)
    if difficulty:
        query = query.filter(Course.difficulty == difficulty)
    if is_published is not None:
        query = query.filter(Course.is_published == is_published)
    if search:
        query = query.filter(Course.title.ilike(f"%{search}%"))

    total = query.count()
    offset = (page - 1) * page_size
    courses = (
        query.order_by(Course.created_at.desc()).offset(offset).limit(page_size).all()
    )

    return {
        "items": [
            {
                "id": str(c.id),
                "title": c.title,
                "description": c.description,
                "thumbnail": c.thumbnail,
                "category": c.category,
                "difficulty": c.difficulty,
                "duration": c.duration,
                "xp_reward": c.xp_reward,
                "rating": c.rating,
                "is_published": c.is_published,
                "author_id": str(c.author_id) if c.author_id else None,
                "tenant_id": str(c.tenant_id) if c.tenant_id else None,
                "created_at": c.created_at.isoformat(),
                "updated_at": c.updated_at.isoformat(),
            }
            for c in courses
        ],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


@router.get("/{course_id}", response_model=dict)
def get_course(
    course_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get course by ID. Tenant-scoped for non-SuperAdmins."""
    user_info = _get_user_from_payload(current_user, db)
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

    modules = sorted(course.modules, key=lambda m: m.order)
    return {
        "id": str(course.id),
        "title": course.title,
        "description": course.description,
        "thumbnail": course.thumbnail,
        "category": course.category,
        "difficulty": course.difficulty,
        "duration": course.duration,
        "xp_reward": course.xp_reward,
        "rating": course.rating,
        "is_published": course.is_published,
        "author_id": str(course.author_id) if course.author_id else None,
        "tenant_id": str(course.tenant_id) if course.tenant_id else None,
        "created_at": course.created_at.isoformat(),
        "updated_at": course.updated_at.isoformat(),
        "modules": [
            {
                "id": str(m.id),
                "title": m.title,
                "description": m.description,
                "order": m.order,
                "lessons": [
                    {
                        "id": str(l.id),
                        "title": l.title,
                        "content": l.content,
                        "video_url": resolve_media_url(l.video_url),
                        "content_type": l.content_type,
                        "duration": l.duration,
                        "order": l.order,
                        "assessment_id": str(l.assessment_id)
                        if l.assessment_id
                        else None,
                    }
                    for l in sorted(m.lessons, key=lambda l: l.order)
                ],
            }
            for m in modules
        ],
    }


@router.get("/{course_id}/curriculum", response_model=dict)
def get_course_curriculum(
    course_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get full course curriculum with modules and lessons. Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
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

    modules = sorted(course.modules, key=lambda m: m.order)
    return {
        "course_id": str(course.id),
        "course_title": course.title,
        "total_duration": course.duration,
        "modules": [
            {
                "id": str(m.id),
                "title": m.title,
                "description": m.description,
                "order": m.order,
                "lessons": [
                    {
                        "id": str(l.id),
                        "title": l.title,
                        "content_type": l.content_type,
                        "duration": l.duration,
                        "order": l.order,
                    }
                    for l in sorted(m.lessons, key=lambda l: l.order)
                ],
            }
            for m in modules
        ],
    }


@router.post("/", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_course(
    course_data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a new course. Auto-assigns to current user's tenant."""
    user_info = _get_user_from_payload(current_user, db)
    _require_course_edit_role(user_info)

    if user_info.role == "SuperAdmin":
        tenant_id = course_data.get("tenant_id")
    else:
        tenant_id = user_info.tenant_id

    course = Course(
        title=course_data["title"],
        description=course_data.get("description"),
        thumbnail=course_data.get("thumbnail"),
        category=course_data["category"],
        difficulty=course_data["difficulty"],
        duration=course_data["duration"],
        xp_reward=course_data.get("xp_reward", 100),
        is_published=course_data.get("is_published", False),
        author_id=_normalize_uuid(course_data.get("author_id")) or UUID(current_user["sub"]),
        tenant_id=_normalize_uuid(tenant_id),
    )
    db.add(course)
    db.commit()
    db.refresh(course)

    return {
        "id": str(course.id),
        "title": course.title,
        "description": course.description,
        "thumbnail": course.thumbnail,
        "category": course.category,
        "difficulty": course.difficulty,
        "duration": course.duration,
        "xp_reward": course.xp_reward,
        "rating": course.rating,
        "is_published": course.is_published,
        "author_id": str(course.author_id) if course.author_id else None,
        "tenant_id": str(course.tenant_id) if course.tenant_id else None,
        "created_at": course.created_at.isoformat(),
        "updated_at": course.updated_at.isoformat(),
    }


@router.put("/{course_id}", response_model=dict)
def update_course(
    course_id: UUID,
    course_data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update a course. Tenant-scoped for non-SuperAdmins."""
    user_info = _get_user_from_payload(current_user, db)
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

    for field in [
        "title",
        "description",
        "thumbnail",
        "category",
        "difficulty",
        "duration",
        "xp_reward",
        "is_published",
    ]:
        if field in course_data and course_data[field] is not None:
            setattr(course, field, course_data[field])

    db.commit()
    db.refresh(course)

    return {
        "id": str(course.id),
        "title": course.title,
        "description": course.description,
        "thumbnail": course.thumbnail,
        "category": course.category,
        "difficulty": course.difficulty,
        "duration": course.duration,
        "xp_reward": course.xp_reward,
        "rating": course.rating,
        "is_published": course.is_published,
        "author_id": str(course.author_id) if course.author_id else None,
        "tenant_id": str(course.tenant_id) if course.tenant_id else None,
        "created_at": course.created_at.isoformat(),
        "updated_at": course.updated_at.isoformat(),
    }


@router.delete("/{course_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_course(
    course_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a course. Tenant-scoped for non-SuperAdmins."""
    user_info = _get_user_from_payload(current_user, db)
    if user_info.role not in COURSE_DELETE_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only LearningExpert, Manager, or Admin can delete courses",
        )
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

    db.delete(course)
    db.commit()


@router.patch("/{course_id}/publish", response_model=dict)
def toggle_course_publish(
    course_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Toggle course publish status.

    Validates that course has at least 1 module + 1 lesson before allowing publish.
    Publishes course.published event to RabbitMQ on state change.
    Tenant-scoped for non-SuperAdmins.
    """
    user_info = _get_user_from_payload(current_user, db)
    _require_course_edit_role(user_info)
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

    # Validate course has at least 1 module + 1 lesson if publishing
    if not course.is_published:
        modules = db.query(Module).filter(Module.course_id == course_id).all()
        if not modules:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Course must have at least 1 module to publish",
            )

        has_lessons = False
        for module in modules:
            lessons = db.query(Lesson).filter(Lesson.module_id == module.id).all()
            if lessons:
                has_lessons = True
                break

        if not has_lessons:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Course must have at least 1 lesson to publish",
            )

    # Toggle publish status
    course.is_published = not course.is_published
    course.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(course)

    # Publish event to RabbitMQ
    try:
        rabbitmq = RabbitMQClient()
        rabbitmq.publish(
            exchange="learning",
            routing_key="learning.course.published",
            message={
                "event": "course.published",
                "courseId": str(course.id),
                "title": course.title,
                "isPublished": course.is_published,
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
    except Exception:
        pass  # Non-blocking event publishing

    return {
        "id": str(course.id),
        "title": course.title,
        "is_published": course.is_published,
        "updated_at": course.updated_at.isoformat(),
    }
