"""Progress tracking router for the Learning Platform service."""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy.orm import Session

from common.database import get_db
from common.auth import decode_token
from common.models import Enrollment, Lesson, Module, User, UserProgress
from common.messaging import RabbitMQClient
from services.learning.services.goal_tracking import sync_user_goals
from services.learning.services.video_progress import VideoProgressService
from services.learning.services.text_progress import TextProgressService
from services.learning.services.learner_context import touch_lesson_context

router = APIRouter(prefix="/progress", tags=["progress"])
security = HTTPBearer()


def _extract_last_activity(progress: UserProgress) -> str | None:
    last_activity = progress.completed_at

    for payload in [progress.video_data, progress.text_data]:
        if not isinstance(payload, dict):
            continue
        heartbeat = payload.get("last_heartbeat")
        if not heartbeat:
            continue
        try:
            parsed = datetime.fromisoformat(heartbeat)
        except (TypeError, ValueError):
            continue
        if last_activity is None or parsed > last_activity:
            last_activity = parsed

    return last_activity.isoformat() if last_activity else None


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


@router.get("/", response_model=list[dict])
def list_progress(
    user_id: UUID = Query(...),
    course_id: UUID = Query(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List user progress. Tenant-scoped for non-SuperAdmins."""
    user_info = _get_user_from_payload(current_user, db)

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_info.role != "SuperAdmin" and target_user.tenant_id != user_info.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: user belongs to another tenant"
        )

    query = db.query(UserProgress).filter(UserProgress.user_id == user_id)

    if course_id:
        lesson_ids = [
            l.id
            for l in db.query(Lesson.id)
            .join(Lesson.module)
            .filter(Lesson.module.has(course_id=course_id))
            .all()
        ]
        query = query.filter(UserProgress.lesson_id.in_(lesson_ids))

    progress_list = query.all()
    return [
        {
            "id": str(p.id),
            "user_id": str(p.user_id),
            "lesson_id": str(p.lesson_id),
            "status": p.status,
            "completed_at": p.completed_at.isoformat() if p.completed_at else None,
            "last_activity_at": _extract_last_activity(p),
            "time_spent": p.time_spent,
        }
        for p in progress_list
    ]


@router.put("/{lesson_id}", response_model=dict)
def update_progress(
    lesson_id: UUID,
    progress_data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update progress for a lesson. Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
    user_id = UUID(progress_data["user_id"])

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_info.role != "SuperAdmin" and target_user.tenant_id != user_info.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: user belongs to another tenant"
        )

    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found"
        )

    progress = (
        db.query(UserProgress)
        .filter(
            UserProgress.user_id == user_id,
            UserProgress.lesson_id == lesson_id,
        )
        .first()
    )

    if not progress:
        progress = UserProgress(
            user_id=user_id,
            lesson_id=lesson_id,
            status=progress_data.get("status", "in_progress"),
            time_spent=progress_data.get("time_spent", 0),
        )
        db.add(progress)
    else:
        if "status" in progress_data:
            progress.status = progress_data["status"]
        if "time_spent" in progress_data:
            progress.time_spent = progress_data["time_spent"]

    touch_lesson_context(
        db,
        user_id=user_id,
        lesson_id=lesson_id,
        mark_completed=progress.status == "completed",
    )

    db.commit()
    db.refresh(progress)
    sync_user_goals(db, user_id)

    return {
        "id": str(progress.id),
        "user_id": str(progress.user_id),
        "lesson_id": str(progress.lesson_id),
        "status": progress.status,
        "completed_at": progress.completed_at.isoformat()
        if progress.completed_at
        else None,
        "time_spent": progress.time_spent,
    }


@router.post("/{lesson_id}/complete", response_model=dict)
def complete_lesson(
    lesson_id: UUID,
    data: dict,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Mark a lesson as completed. Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
    user_id = UUID(data["user_id"])

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_info.role != "SuperAdmin" and target_user.tenant_id != user_info.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: user belongs to another tenant"
        )

    lesson = db.query(Lesson).filter(Lesson.id == lesson_id).first()
    if not lesson:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Lesson not found"
        )

    progress = (
        db.query(UserProgress)
        .filter(
            UserProgress.user_id == user_id,
            UserProgress.lesson_id == lesson_id,
        )
        .first()
    )

    if not progress:
        try:
            progress = UserProgress(
                user_id=user_id,
                lesson_id=lesson_id,
            )
            db.add(progress)
            db.flush()
        except Exception:
            db.rollback()
            progress = (
                db.query(UserProgress)
                .filter(
                    UserProgress.user_id == user_id,
                    UserProgress.lesson_id == lesson_id,
                )
                .first()
            )
            if not progress:
                raise HTTPException(status_code=500, detail="Failed to create progress")

    progress.status = "completed"
    progress.completed_at = datetime.utcnow()
    touch_lesson_context(db, user_id=user_id, lesson_id=lesson_id, mark_completed=True)
    db.commit()
    db.refresh(progress)

    # Check enrollment completion and generate certificate if all lessons done
    from services.learning.services.video_progress import (
        check_enrollment_completion as check_completion,
    )

    module = db.query(Module).filter(Module.id == lesson.module_id).first()
    if module:
        check_completion(db, user_id, module.course_id)

    # Publish lesson completion event to RabbitMQ
    xp_earned = 0
    try:
        mq = RabbitMQClient()
        mq.publish(
            exchange="learning.exchange",
            routing_key="learning.lessons.completed",
            message={
                "event": "lesson.completed",
                "userId": str(user_id),
                "lessonId": str(lesson_id),
                "moduleId": str(lesson.module_id),
                "timestamp": datetime.utcnow().isoformat(),
            },
        )
        mq.close()
    except Exception:
        pass

    sync_user_goals(db, user_id)

    return {
        "message": "Lesson completed",
        "lesson_id": str(lesson_id),
        "status": "completed",
        "xp_earned": xp_earned,
    }


@router.delete("/user/{user_id}/reset", response_model=dict)
def reset_user_progress(
    user_id: UUID,
    course_id: UUID = None,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Reset progress for a user. Tenant-scoped for non-SuperAdmins."""
    user_info = _get_user_from_payload(current_user, db)

    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")

    if user_info.role != "SuperAdmin" and target_user.tenant_id != user_info.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: user belongs to another tenant"
        )

    from common.models import Lesson, Module

    # Get all lesson IDs for the user
    query = db.query(UserProgress).filter(UserProgress.user_id == user_id)

    if course_id:
        lesson_ids = [
            l.id
            for l in db.query(Lesson.id)
            .join(Lesson.module)
            .filter(Lesson.module.has(course_id=course_id))
            .all()
        ]
        query = query.filter(UserProgress.lesson_id.in_(lesson_ids))

    progress_records = query.all()
    count = len(progress_records)

    for progress in progress_records:
        db.delete(progress)

    # Also reset enrollments
    enroll_query = db.query(Enrollment).filter(Enrollment.user_id == user_id)
    if course_id:
        enroll_query = enroll_query.filter(Enrollment.course_id == course_id)

    enrollments = enroll_query.all()
    for enrollment in enrollments:
        enrollment.status = "not_started"
        enrollment.completed_at = None
        enrollment.enrolled_at = datetime.utcnow()

    db.commit()

    return {
        "message": f"Progress reset for user",
        "deleted_progress_count": count,
        "reset_enrollments": len(enrollments),
    }


class VideoHeartbeatRequest(BaseModel):
    user_id: str
    lesson_id: str
    current_time: float
    played_segments: list[dict]
    video_duration: float


class TextHeartbeatRequest(BaseModel):
    user_id: str
    lesson_id: str
    reading_seconds: int
    page_was_visible: bool = True


@router.post("/video/heartbeat")
def video_heartbeat(
    data: VideoHeartbeatRequest,
    db: Session = Depends(get_db),
):
    """Send video playback heartbeat. Updates progress and returns completion status."""
    user_id = UUID(data.user_id)
    lesson_id = UUID(data.lesson_id)

    video_service = VideoProgressService(db)

    try:
        result = video_service.process_heartbeat(
            user_id=user_id,
            lesson_id=lesson_id,
            current_time=data.current_time,
            played_segments=data.played_segments,
            video_duration=data.video_duration,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/video/{lesson_id}")
def get_video_progress(
    lesson_id: UUID,
    user_id: UUID = Query(...),
    db: Session = Depends(get_db),
):
    """Get video progress for a lesson."""
    video_service = VideoProgressService(db)
    result = video_service.get_video_progress(user_id, lesson_id)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Progress not found"
        )
    return result


@router.post("/text/heartbeat")
def text_heartbeat(
    data: TextHeartbeatRequest,
    db: Session = Depends(get_db),
):
    """Send text reading heartbeat. Updates progress with Page Visibility support."""
    user_id = UUID(data.user_id)
    lesson_id = UUID(data.lesson_id)

    text_service = TextProgressService(db)

    try:
        result = text_service.process_heartbeat(
            user_id=user_id,
            lesson_id=lesson_id,
            reading_seconds=data.reading_seconds,
            page_was_visible=data.page_was_visible,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))


@router.get("/text/{lesson_id}")
def get_text_progress(
    lesson_id: UUID,
    user_id: UUID = Query(...),
    db: Session = Depends(get_db),
):
    """Get text progress for a lesson."""
    text_service = TextProgressService(db)
    result = text_service.get_text_progress(user_id, lesson_id)

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Progress not found"
        )
    return result
