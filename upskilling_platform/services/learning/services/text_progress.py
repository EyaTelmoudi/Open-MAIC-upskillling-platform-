"""Text progress tracking service with active reading time tracking."""

import math
from datetime import datetime
from uuid import UUID

from sqlalchemy import or_
from sqlalchemy.orm import Session

from common.models import UserProgress, Lesson, Module, Enrollment, AssessmentAttempt, Course, User, XPTransaction
from services.learning.services.learner_context import touch_lesson_context


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
    logger.info(f"=== CHECKING ENROLLMENT COMPLETION (TEXT) ===")
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
                UserProgress.status == "completed",
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
                if transaction is not None:
                    logger.info(
                        f"Awarded {course.xp_reward} XP for user {user_id}, course {course_id}"
                    )
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


class TextProgressService:
    """Service for tracking text/lesson reading progress."""

    def __init__(self, db: Session):
        self.db = db

    def calculate_reading_time(
        self,
        previous_time: int,
        new_reading_seconds: int,
        page_was_visible: bool,
        last_heartbeat: datetime | None,
    ) -> dict:
        """
        Calculate reading time with Page Visibility API support.

        Only counts time when:
        1. Page is visible (not minimized/tab hidden)
        2. Time gap between heartbeats is reasonable (< 5 minutes)

        Args:
            previous_time: Previous accumulated reading time in seconds
            new_reading_seconds: New reading time from this heartbeat
            page_was_visible: Whether page was visible during this interval
            last_heartbeat: Timestamp of previous heartbeat

        Returns:
            Calculated time result {valid: bool, added_seconds: int, total_time: int}
        """
        added_seconds = 0

        if not page_was_visible:
            return {
                "valid": False,
                "added_seconds": 0,
                "total_time": previous_time,
                "reason": "Page not visible",
            }

        now = datetime.utcnow()
        if last_heartbeat:
            time_diff = (now - last_heartbeat).total_seconds()

            if time_diff > 600:
                return {
                    "valid": False,
                    "added_seconds": 0,
                    "total_time": previous_time,
                    "reason": "Gap too large (>10 min), session reset",
                }

            # Only check unrealistic speed if gap is very small
            if time_diff < 2 and new_reading_seconds > 5:
                return {
                    "valid": False,
                    "added_seconds": 0,
                    "total_time": previous_time,
                    "reason": "Too fast - possible automation",
                }

        added_seconds = min(new_reading_seconds, 300)

        new_total = previous_time + added_seconds

        return {
            "valid": True,
            "added_seconds": added_seconds,
            "total_time": new_total,
            "reason": None,
        }

    def calculate_reading_percent(self, total_seconds: int, word_count: int) -> float:
        """
        Calculate reading progress percentage.

        Assumes average reading speed of 200 words per minute.
        Required: 70% of content read (based on time)

        Args:
            total_seconds: Total reading time in seconds
            word_count: Number of words in the lesson

        Returns:
            Reading percentage (0-100)
        """
        if word_count <= 0:
            return 0.0

        minutes_read = total_seconds / 60
        words_read = minutes_read * 200

        read_percent = (words_read / word_count) * 100
        return min(100.0, round(read_percent, 2))

    def validate_text_heartbeat(
        self,
        reading_seconds: int,
        page_was_visible: bool,
        last_heartbeat: datetime | None,
    ) -> dict:
        """
        Validate text heartbeat for integrity.

        Args:
            reading_seconds: Reading time in this interval
            page_was_visible: Whether page was visible
            last_heartbeat: Last heartbeat timestamp

        Returns:
            Validation result
        """
        if reading_seconds > 600:
            return {
                "valid": False,
                "reason": "Reading time exceeds maximum (10 minutes per heartbeat)",
                "rejected": True,
            }

        if reading_seconds < 0:
            return {
                "valid": False,
                "reason": "Invalid reading time",
                "rejected": True,
            }

        return {"valid": True, "rejected": False}

    def process_heartbeat(
        self,
        user_id: UUID,
        lesson_id: UUID,
        reading_seconds: int,
        page_was_visible: bool = True,
    ) -> dict:
        """
        Process text reading heartbeat and update progress.

        Args:
            user_id: User ID
            lesson_id: Lesson ID
            reading_seconds: Seconds spent reading in this interval
            page_was_visible: Whether page was visible

        Returns:
            Progress update result
        """
        lesson = self.db.query(Lesson).filter(Lesson.id == lesson_id).first()
        if not lesson:
            raise ValueError("Lesson not found")

        word_count = len(lesson.content.split()) if lesson.content else 0

        # Use SELECT FOR UPDATE to prevent race conditions
        from sqlalchemy import text

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

        text_data = dict(progress.text_data) if progress.text_data else {}
        previous_time = text_data.get("reading_time", 0)
        last_heartbeat_str = text_data.get("last_heartbeat")
        last_heartbeat = (
            datetime.fromisoformat(last_heartbeat_str) if last_heartbeat_str else None
        )

        time_result = self.calculate_reading_time(
            previous_time,
            reading_seconds,
            page_was_visible,
            last_heartbeat,
        )

        total_time = time_result["total_time"]
        reading_percent = self.calculate_reading_time_percent(
            total_time, lesson.duration * 60
        )

        # For text lessons, completion requires:
        # 1. At least 60 seconds of reading time (minimum engagement)
        completion_threshold = 0.0
        completion_unlocked = total_time >= 60

        text_data["reading_time"] = total_time
        text_data["reading_percent"] = reading_percent
        text_data["page_was_visible"] = page_was_visible
        text_data["last_heartbeat"] = datetime.utcnow().isoformat()

        progress.text_data = text_data
        progress.time_spent = total_time
        progress.status = "completed" if completion_unlocked else "in_progress"

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

        module = self.db.query(Module).filter(Module.id == lesson.module_id).first()
        if module:
            check_enrollment_completion(self.db, user_id, module.course_id)

        return {
            "lesson_id": str(lesson_id),
            "user_id": str(user_id),
            "reading_time": total_time,
            "reading_percent": reading_percent,
            "completion_unlocked": completion_unlocked,
            "valid": time_result["valid"],
            "reason": time_result.get("reason"),
        }

    def calculate_reading_time_percent(
        self, total_seconds: int, expected_duration_seconds: float
    ) -> float:
        """Calculate reading progress based on expected duration."""
        if expected_duration_seconds <= 0:
            return 0.0

        percent = (total_seconds / expected_duration_seconds) * 100
        return min(100.0, round(percent, 2))

    def get_text_progress(self, user_id: UUID, lesson_id: UUID) -> dict | None:
        """Get current text progress for a lesson."""
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

        text_data = progress.text_data or {}
        return {
            "lesson_id": str(lesson_id),
            "user_id": str(user_id),
            "status": progress.status,
            "reading_time": text_data.get("reading_time", 0),
            "reading_percent": text_data.get("reading_percent", 0),
            "page_was_visible": text_data.get("page_was_visible", True),
            "last_heartbeat": text_data.get("last_heartbeat"),
        }
