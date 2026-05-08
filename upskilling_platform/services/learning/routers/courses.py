"""Course CRUD router for the Learning Platform service."""

from datetime import datetime
import re
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy import delete, or_, update
from sqlalchemy.orm import Session

from common.database import get_db
from common.auth import decode_token
from common.messaging import RabbitMQClient
from common.storage import build_tenant_path, delete_prefix, get_minio_client
from common.models import (
    AICourseDraft,
    Assessment,
    AssessmentAttempt,
    Bookmark,
    Certificate,
    Course,
    CourseAssignment,
    CoursePreviewToken,
    CourseReview,
    Enrollment,
    LearnerCourseContext,
    Lesson,
    Module,
    Question,
    User,
    UserProgress,
    Tenant,
)
from services.learning.utils.course_duration import sync_course_duration
from services.learning.utils.media import resolve_media_url
from services.learning.services.learner_context import build_learner_context_response

router = APIRouter(prefix="/courses", tags=["courses"])
rabbitmq_client = RabbitMQClient()
security = HTTPBearer()
COURSE_EDIT_ROLES = {"LearningExpert", "Manager", "Admin", "SuperAdmin"}
COURSE_DELETE_ROLES = {"LearningExpert", "Manager", "Admin", "SuperAdmin"}
DRAFT_VIEW_ROLES = {"LearningExpert", "Admin", "SuperAdmin"}
COURSE_CONTENT_BUCKETS = [
    "course-videos",
    "course-pdfs",
    "course-slides",
    "course-images",
    "course-files",
]


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


def _normalize_match_key(value: str | None) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _require_course_edit_role(user: User) -> None:
    """Require LearningExpert+ permissions for course authoring actions."""
    if user.role not in COURSE_EDIT_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only LearningExpert, Manager, or Admin can manage courses",
        )


def _can_view_unpublished_course(user: User) -> bool:
    return user.role in DRAFT_VIEW_ROLES


def _resolve_memory_assessment_id(
    lesson: Lesson,
    module_assessments: list[Assessment],
    used_assessment_ids: set[UUID],
) -> UUID | None:
    if lesson.assessment_id:
        return lesson.assessment_id

    if str(lesson.content_type or "").strip().lower() != "quiz":
        return None

    lesson_title = _normalize_match_key(lesson.title)

    exact_title_match = [
        assessment
        for assessment in module_assessments
        if _normalize_match_key(assessment.title) == lesson_title
        and assessment.id not in used_assessment_ids
    ]
    if exact_title_match:
        return exact_title_match[0].id

    unused_module_assessments = [
        assessment
        for assessment in module_assessments
        if assessment.id not in used_assessment_ids
    ]
    if len(unused_module_assessments) == 1:
        return unused_module_assessments[0].id

    quiz_named_match = [
        assessment
        for assessment in unused_module_assessments
        if "quiz" in _normalize_match_key(assessment.title)
    ]
    if len(quiz_named_match) == 1:
        return quiz_named_match[0].id

    return None


@router.get("", response_model=dict)
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

    if not _can_view_unpublished_course(user_info):
        query = query.filter(Course.is_published.is_(True))

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

    if not course.is_published and not _can_view_unpublished_course(user_info):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
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


@router.get("/{course_id}/memory-curriculum", response_model=dict)
def get_course_memory_curriculum(
    course_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Get a memory-oriented curriculum payload with resolved quiz questions."""
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

    _require_course_edit_role(user_info)

    modules = sorted(course.modules, key=lambda m: m.order)
    module_ids = [module.id for module in modules]
    assessments = (
        db.query(Assessment)
        .filter(Assessment.module_id.in_(module_ids))
        .all()
        if module_ids
        else []
    )
    assessments_by_module: dict[UUID, list[Assessment]] = {}
    for assessment in assessments:
        assessments_by_module.setdefault(assessment.module_id, []).append(assessment)

    assessment_ids = [assessment.id for assessment in assessments]
    questions = (
        db.query(Question)
        .filter(Question.assessment_id.in_(assessment_ids))
        .order_by(Question.order)
        .all()
        if assessment_ids
        else []
    )
    questions_by_assessment: dict[UUID, list[Question]] = {}
    for question in questions:
        questions_by_assessment.setdefault(question.assessment_id, []).append(question)

    modules_payload = []
    for module in modules:
        used_assessment_ids: set[UUID] = set()
        lessons_payload = []
        module_assessments = assessments_by_module.get(module.id, [])

        for lesson in sorted(module.lessons, key=lambda l: l.order):
            resolved_assessment_id = _resolve_memory_assessment_id(
                lesson, module_assessments, used_assessment_ids
            )
            if resolved_assessment_id:
                used_assessment_ids.add(resolved_assessment_id)

            quiz_questions = [
                {
                    "id": str(question.id),
                    "assessment_id": str(question.assessment_id),
                    "text": question.text,
                    "type": question.type,
                    "options": question.options,
                    "correct_answer": question.correct_answer,
                    "points": question.points,
                    "order": question.order,
                }
                for question in questions_by_assessment.get(resolved_assessment_id, [])
            ]

            lessons_payload.append(
                {
                    "id": str(lesson.id),
                    "title": lesson.title,
                    "content": lesson.content,
                    "video_url": resolve_media_url(lesson.video_url),
                    "content_type": lesson.content_type,
                    "duration": lesson.duration,
                    "order": lesson.order,
                    "assessment_id": str(resolved_assessment_id)
                    if resolved_assessment_id
                    else None,
                    "quiz_questions": quiz_questions,
                }
            )

        modules_payload.append(
            {
                "id": str(module.id),
                "title": module.title,
                "description": module.description,
                "order": module.order,
                "lessons": lessons_payload,
            }
        )

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
        "modules": modules_payload,
    }


@router.get("/{course_id}/learner-context/{user_id}", response_model=dict)
def get_course_learner_context(
    course_id: UUID,
    user_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the learner-context snapshot that the AI coach should consume."""
    user_info = _get_user_from_payload(current_user, db)
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
        )

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if user_info.role != "SuperAdmin":
        if course.tenant_id != user_info.tenant_id or target_user.tenant_id != user_info.tenant_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied: learner context belongs to another tenant"
            )

    try:
        return build_learner_context_response(db, user_id=user_id, course_id=course_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc


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

    if not course.is_published and not _can_view_unpublished_course(user_info):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found"
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


@router.post("", response_model=dict, status_code=status.HTTP_201_CREATED)
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
        duration=0,
        xp_reward=course_data.get("xp_reward", 100),
        is_published=course_data.get("is_published", False),
        author_id=_normalize_uuid(course_data.get("author_id")) or UUID(current_user["sub"]),
        tenant_id=_normalize_uuid(tenant_id),
    )
    db.add(course)
    db.flush()
    sync_course_duration(course.id, db)
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
        "xp_reward",
        "is_published",
    ]:
        if field in course_data and course_data[field] is not None:
            setattr(course, field, course_data[field])

    sync_course_duration(course.id, db)
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
    course_row = (
        db.query(Course.id, Course.tenant_id)
        .filter(Course.id == course_id)
        .first()
    )
    if not course_row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Course not found"
        )

    _, course_tenant_id = course_row
    if user_info.role != "SuperAdmin" and course_tenant_id != user_info.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: course belongs to another tenant"
        )

    try:
        tenant_prefix = None
        if course_row.tenant_id:
            tenant_prefix = build_tenant_path(str(course_row.tenant_id), "courses", str(course_id))

        if tenant_prefix:
            minio_client = get_minio_client()
            for bucket_name in COURSE_CONTENT_BUCKETS:
                delete_prefix(bucket_name, tenant_prefix, minio_client)

        module_ids = [
            module_id
            for (module_id,) in db.query(Module.id).filter(Module.course_id == course_id).all()
        ]
        lesson_ids = (
            [
                lesson_id
                for (lesson_id,) in db.query(Lesson.id)
                .filter(Lesson.module_id.in_(module_ids))
                .all()
            ]
            if module_ids
            else []
        )
        assessment_ids = (
            [
                assessment_id
                for (assessment_id,) in db.query(Assessment.id)
                .filter(Assessment.module_id.in_(module_ids))
                .all()
            ]
            if module_ids
            else []
        )

        db.execute(
            update(AICourseDraft)
            .where(AICourseDraft.platform_course_id == course_id)
            .values(
                platform_course_id=None,
                review_status="final_review_ready",
            )
        )
        db.execute(delete(CoursePreviewToken).where(CoursePreviewToken.course_id == course_id))
        db.execute(delete(Bookmark).where(Bookmark.course_id == course_id))
        db.execute(delete(CourseReview).where(CourseReview.course_id == course_id))
        db.execute(delete(CourseAssignment).where(CourseAssignment.course_id == course_id))
        db.execute(delete(Certificate).where(Certificate.course_id == course_id))
        db.execute(delete(Enrollment).where(Enrollment.course_id == course_id))

        if lesson_ids:
            db.execute(
                update(LearnerCourseContext)
                .where(
                    or_(
                        LearnerCourseContext.current_lesson_id.in_(lesson_ids),
                        LearnerCourseContext.last_opened_lesson_id.in_(lesson_ids),
                        LearnerCourseContext.last_completed_lesson_id.in_(lesson_ids),
                        LearnerCourseContext.latest_failed_quiz_lesson_id.in_(lesson_ids),
                    )
                )
                .values(
                    current_lesson_id=None,
                    last_opened_lesson_id=None,
                    last_completed_lesson_id=None,
                    latest_failed_quiz_lesson_id=None,
                )
            )
            db.execute(delete(LearnerCourseContext).where(LearnerCourseContext.course_id == course_id))
            db.execute(delete(Bookmark).where(Bookmark.lesson_id.in_(lesson_ids)))
            db.execute(delete(UserProgress).where(UserProgress.lesson_id.in_(lesson_ids)))

        if assessment_ids:
            db.execute(delete(AssessmentAttempt).where(AssessmentAttempt.assessment_id.in_(assessment_ids)))
            db.execute(delete(Question).where(Question.assessment_id.in_(assessment_ids)))
            db.execute(
                update(Lesson)
                .where(Lesson.assessment_id.in_(assessment_ids))
                .values(assessment_id=None)
            )
            db.execute(delete(Assessment).where(Assessment.id.in_(assessment_ids)))

        if lesson_ids:
            db.execute(delete(Lesson).where(Lesson.id.in_(lesson_ids)))
        if module_ids:
            db.execute(delete(Module).where(Module.id.in_(module_ids)))

        db.expunge_all()
        db.execute(delete(Course).where(Course.id == course_id))
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete course: {exc}",
        ) from exc


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
