"""Video progress tracking service with segment merge algorithm."""

import math
from datetime import datetime
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session

from common.models import UserProgress, Lesson, Enrollment, AssessmentAttempt, Course, User, XPTransaction
from services.learning.services.learner_context import touch_lesson_context
from services.learning.services.goal_tracking import sync_user_goals


def _course_completion_xp_already_awarded(
    db: Session,
    *,
    user_id: UUID,
    course: Course,
) -> bool:
    legacy_reason = f"Completed course {course.title}"
    scoped_reason = f"Completed course {course.title} ({course.id})"
    existing = (
        db.query(XPTransaction)
        .filter(
            XPTransaction.user_id == user_id,
            XPTransaction.amount == int(course.xp_reward or 0),
            or_(
                XPTransaction.reason == legacy_reason,
                XPTransaction.reason == scoped_reason,
            ),
        )
        .first()
    )
    return existing is not None


def check_enrollment_completion(db: Session, user_id: UUID, course_id: UUID) -> None:
    """Check if all lessons in a course are completed and mark enrollment as completed.

    A lesson is considered completed when:
    1. Video/text progress is completed (status = 'completed')
    2. OR lesson has an assessment AND the assessment is passed
    """
    import logging
    from services.learning.routers.certificates import (
        generate_certificate_for_enrollment,
    )
    from services.learning.gamification import XPManager
    from services.learning.gamification.badges import BadgeManager
    from common.messaging import RabbitMQClient

    logger = logging.getLogger(__name__)
    logger.info(f"=== CHECKING ENROLLMENT COMPLETION ===")
    logger.info(f"User ID: {user_id}, Course ID: {course_id}")

    lessons = (
        db.query(Lesson)
        .join(Lesson.module)
        .filter(Lesson.module.has(course_id=course_id))
        .all()
    )

    if not lessons:
        return

    completed_lessons = 0

    for lesson in lessons:
        # Check if video/text progress is completed
        progress = (
            db.query(UserProgress)
            .filter(
                UserProgress.user_id == user_id,
                UserProgress.lesson_id == lesson.id,
                or_(
                    UserProgress.status == "completed",
                    UserProgress.completed_at.isnot(None),
                ),
            )
            .first()
        )

        if progress:
            completed_lessons += 1
            continue

        # Check if lesson has an assessment and it's passed
        if lesson.assessment_id:
            passed_attempt = (
                db.query(AssessmentAttempt)
                .filter(
                    AssessmentAttempt.user_id == user_id,
                    AssessmentAttempt.assessment_id == lesson.assessment_id,
                    AssessmentAttempt.passed == True,
                )
                .first()
            )

            if passed_attempt:
                # Auto-create progress record for passed assessment
                existing_progress = (
                    db.query(UserProgress)
                    .filter(
                        UserProgress.user_id == user_id,
                        UserProgress.lesson_id == lesson.id,
                    )
                    .first()
                )

                if not existing_progress:
                    new_progress = UserProgress(
                        user_id=user_id,
                        lesson_id=lesson.id,
                        status="completed",
                        completed_at=datetime.utcnow(),
                    )
                    db.add(new_progress)
                    db.flush()

                completed_lessons += 1

    if completed_lessons >= len(lessons):
        logger.info(f"All lessons completed: {completed_lessons}/{len(lessons)}")
        enrollment = (
            db.query(Enrollment)
            .filter(
                Enrollment.user_id == user_id,
                Enrollment.course_id == course_id,
            )
            .first()
        )
        if enrollment and enrollment.status != "completed":
            logger.info(f"Marking enrollment {enrollment.id} as completed")
            enrollment.status = "completed"
            enrollment.completed_at = datetime.utcnow()
            db.commit()

            try:
                logger.info(
                    f"Calling generate_certificate_for_enrollment for enrollment {enrollment.id}"
                )
                generate_certificate_for_enrollment(enrollment.id, db)
            except Exception as e:
                logger.error(f"Certificate generation failed: {e}")

            try:
                course = db.query(Course).filter(Course.id == course_id).first()
                if not course:
                    logger.error(f"Course not found for XP award: {course_id}")
                    return

                rabbitmq = RabbitMQClient()
                xp_manager = XPManager(db, rabbitmq)
                badge_manager = BadgeManager(db, rabbitmq)
                transaction = None
                if _course_completion_xp_already_awarded(db, user_id=user_id, course=course):
                    logger.info(
                        f"Course completion XP already awarded for user {user_id}, course {course_id}"
                    )
                else:
                    transaction = xp_manager.award_xp(
                        user_id=str(user_id),
                        action="course_complete",
                        reason=f"Completed course {course.title} ({course.id})",
                        explicit_amount=course.xp_reward,
                    )
                completed_course_count = badge_manager.get_completed_course_count(
                    str(user_id)
                )
                badge_manager.check_and_award_badges(
                    user_id=str(user_id),
                    action="course_complete",
                    count=completed_course_count,
                )
                if (course.difficulty or "").lower() == "advanced":
                    badge_manager.check_and_award_badges(
                        user_id=str(user_id),
                        action="advanced_course",
                        count=badge_manager.get_completed_advanced_course_count(
                            str(user_id)
                        ),
                    )
                try:
                    from services.learning.routers.gamification import (
                        evaluate_custom_badges_for_user,
                    )

                    evaluate_custom_badges_for_user(
                        db,
                        user_id=str(user_id),
                        event_type="course.completed",
                        course_id=str(course_id),
                        completed=True,
                    )
                except Exception as exc:
                    logger.error(f"Custom course badge evaluation failed: {exc}")
                if transaction is not None:
                    logger.info(
                        f"Awarded {course.xp_reward} XP for user {user_id}, course {course_id}"
                    )
                sync_user_goals(db, user_id)
            except Exception as e:
                logger.error(f"XP award failed: {e}")
        else:
            if enrollment:
                logger.warning(
                    f"Enrollment already completed or status is: {enrollment.status}"
                )
            else:
                logger.warning(
                    f"No enrollment found for user {user_id}, course {course_id}"
                )
    else:
        logger.info(
            f"Not all lessons completed yet: {completed_lessons}/{len(lessons)}"
        )


class VideoProgressService:
    """Service for tracking video lesson progress."""

    def __init__(self, db: Session):
        self.db = db

    def merge_segments(
        self, existing_segments: list[dict], new_segment: dict
    ) -> list[dict]:
        """
        Merge new segment with existing segments using segment merge algorithm.

        Algorithm:
        1. Add new segment to existing list
        2. Sort by start time
        3. Merge overlapping/adjacent segments
        4. Remove duplicate time ranges

        Args:
            existing_segments: List of {start: float, end: float}
            new_segment: New segment {start: float, end: float}

        Returns:
            Merged and deduplicated segment list
        """
        if not new_segment or new_segment.get("start", 0) >= new_segment.get("end", 0):
            return existing_segments

        all_segments = existing_segments + [new_segment]
        all_segments.sort(key=lambda s: s.get("start", 0))

        merged = []
        for seg in all_segments:
            if not merged:
                merged.append(seg.copy())
                continue

            last = merged[-1]
            current_start = seg.get("start", 0)
            current_end = seg.get("end", 0)
            last_end = last.get("end", 0)

            if current_start <= last_end:
                last["end"] = max(last_end, current_end)
            else:
                merged.append(seg.copy())

        return merged

    def calculate_watch_percent(
        self, segments: list[dict], total_duration: float
    ) -> float:
        """
        Calculate watch percentage without double-counting overlapping segments.

        Args:
            segments: List of {start: float, end: float}
            total_duration: Total video duration in seconds

        Returns:
            Watch percentage (0-100)
        """
        if not segments or total_duration <= 0:
            return 0.0

        merged = self.merge_segments(segments, {"start": 0, "end": 0})

        total_watched = sum(
            seg["end"] - seg["start"]
            for seg in merged
            if seg.get("end", 0) > seg.get("start", 0)
        )

        watch_percent = (total_watched / total_duration) * 100
        return min(100.0, round(watch_percent, 2))

    def validate_heartbeat(
        self, current_time: float, last_heartbeat: datetime | None, segments: list[dict]
    ) -> dict:
        """
        Validate heartbeat for integrity.

        Checks:
        - Speed cap (cannot watch more than 2x real time between heartbeats)
        - Time impossibility (current_time cannot be in future)
        - Gap detection

        Args:
            current_time: Current video position in seconds
            last_heartbeat: Timestamp of last heartbeat
            segments: Current watched segments

        Returns:
            Validation result {valid: bool, reason: str}
        """
        now = datetime.utcnow()

        if last_heartbeat:
            time_diff = (now - last_heartbeat).total_seconds()

            if time_diff > 0:
                playback_speed = (
                    current_time - (segments[-1]["end"] if segments else 0)
                ) / time_diff

                if playback_speed > 2.0:
                    return {
                        "valid": False,
                        "reason": "Playback speed too fast (>2x)",
                        "rejected": True,
                    }

        if current_time < 0:
            return {"valid": False, "reason": "Invalid time position", "rejected": True}

        return {"valid": True, "rejected": False}

    def process_heartbeat(
        self,
        user_id: UUID,
        lesson_id: UUID,
        current_time: float,
        played_segments: list[dict],
        video_duration: float,
    ) -> dict:
        """
        Process video heartbeat and update progress.

        Args:
            user_id: User ID
            lesson_id: Lesson ID
            current_time: Current video position in seconds
            played_segments: List of {start, end} segments watched
            video_duration: Total video duration in seconds

        Returns:
            Progress update result
        """
        lesson = self.db.query(Lesson).filter(Lesson.id == lesson_id).first()
        if not lesson:
            raise ValueError("Lesson not found")

        # Use SELECT FOR UPDATE to prevent race conditions
        try:
            progress = (
                self.db.query(UserProgress)
                .filter(
                    UserProgress.user_id == user_id,
                    UserProgress.lesson_id == lesson_id,
                )
                .with_for_update()
                .first()
            )
        except Exception:
            # If lock fails, just do a regular query
            progress = (
                self.db.query(UserProgress)
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
                    status="in_progress",
                )
                self.db.add(progress)
                self.db.flush()
            except Exception:
                # If insert fails due to race condition, fetch the existing record
                self.db.rollback()
                progress = (
                    self.db.query(UserProgress)
                    .filter(
                        UserProgress.user_id == user_id,
                        UserProgress.lesson_id == lesson_id,
                    )
                    .first()
                )
                if not progress:
                    raise ValueError("Failed to create or fetch progress")

        was_completed = progress.status == "completed" or progress.completed_at is not None

        video_data = dict(progress.video_data) if progress.video_data else {}
        existing_segments = video_data.get("segments", [])

        merged_segments = existing_segments.copy()
        for seg in played_segments:
            merged_segments = self.merge_segments(merged_segments, seg)

        watch_percent = self.calculate_watch_percent(
            merged_segments, video_duration or lesson.duration * 60
        )

        completion_threshold = 100.0
        completion_unlocked = watch_percent >= completion_threshold

        video_data["segments"] = merged_segments
        video_data["current_time"] = current_time
        video_data["watch_percent"] = watch_percent
        video_data["last_heartbeat"] = datetime.utcnow().isoformat()

        progress.video_data = video_data
        if was_completed or completion_unlocked:
            progress.status = "completed"
        else:
            progress.status = "in_progress"

        if progress.status == "completed" and not progress.completed_at:
            progress.completed_at = datetime.utcnow()

        touch_lesson_context(
            self.db,
            user_id=user_id,
            lesson_id=lesson_id,
            mark_completed=progress.status == "completed",
        )

        self.db.commit()
        self.db.refresh(progress)

        if completion_unlocked and not was_completed:
            try:
                from services.learning.gamification.badges import BadgeManager
                from services.learning.gamification.streaks import StreakManager
                from common.messaging import RabbitMQClient

                user = self.db.query(User).filter(User.id == user_id).first()
                rabbitmq = RabbitMQClient()
                StreakManager(self.db, rabbitmq).record_activity(
                    str(user_id),
                    user.timezone if user else None,
                )
                badge_manager = BadgeManager(self.db)
                badge_manager.check_and_award_badges(
                    user_id=str(user_id),
                    action="lesson_complete",
                    count=badge_manager.get_completed_lesson_count(str(user_id)),
                )
                badge_manager.award_time_of_day_badges(
                    user_id=str(user_id),
                    user_timezone=user.timezone if user else None,
                    occurred_at=progress.completed_at,
                )
            except Exception:
                # Badge awarding must not break lesson progression.
                pass

        from common.models import Module

        module = self.db.query(Module).filter(Module.id == lesson.module_id).first()
        if module:
            check_enrollment_completion(self.db, user_id, module.course_id)

        return {
            "lesson_id": str(lesson_id),
            "user_id": str(user_id),
            "current_time": current_time,
            "watch_percent": watch_percent,
            "completion_unlocked": completion_unlocked,
            "segments": merged_segments,
        }

    def get_video_progress(self, user_id: UUID, lesson_id: UUID) -> dict | None:
        """Get current video progress for a lesson."""
        progress = (
            self.db.query(UserProgress)
            .filter(
                UserProgress.user_id == user_id,
                UserProgress.lesson_id == lesson_id,
            )
            .first()
        )

        if not progress:
            return None

        video_data = progress.video_data or {}
        return {
            "lesson_id": str(lesson_id),
            "user_id": str(user_id),
            "status": progress.status,
            "current_time": video_data.get("current_time", 0),
            "watch_percent": video_data.get("watch_percent", 0),
            "segments": video_data.get("segments", []),
            "last_heartbeat": video_data.get("last_heartbeat"),
        }
