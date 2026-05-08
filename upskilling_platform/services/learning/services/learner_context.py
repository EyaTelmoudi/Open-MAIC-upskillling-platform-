"""Helpers for storing and building learner context for AI coaching."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from common.models import (
    AssessmentAttempt,
    Course,
    Enrollment,
    LearnerCourseContext,
    Lesson,
    Module,
    UserProgress,
)


def _get_course_lessons(db: Session, course_id: UUID) -> list[Lesson]:
    return (
        db.query(Lesson)
        .join(Module, Lesson.module_id == Module.id)
        .filter(Module.course_id == course_id)
        .order_by(Module.order, Lesson.order)
        .all()
    )


def _get_lesson(db: Session, lesson_id: UUID) -> Lesson | None:
    return db.query(Lesson).filter(Lesson.id == lesson_id).first()


def _get_course_id_by_lesson(db: Session, lesson_id: UUID) -> UUID | None:
    row = (
        db.query(Module.course_id)
        .join(Lesson, Lesson.module_id == Module.id)
        .filter(Lesson.id == lesson_id)
        .first()
    )
    return row[0] if row else None


def _lesson_has_passed_assessment(
    db: Session,
    *,
    user_id: UUID,
    lesson: Lesson,
) -> bool:
    if not lesson.assessment_id:
        return False

    attempt = (
        db.query(AssessmentAttempt)
        .filter(
            AssessmentAttempt.user_id == user_id,
            AssessmentAttempt.assessment_id == lesson.assessment_id,
            AssessmentAttempt.passed == True,
        )
        .first()
    )
    return attempt is not None


def _derive_lesson_progress_state(
    db: Session,
    *,
    user_id: UUID,
    lesson: Lesson,
    progress_by_lesson: dict[UUID, UserProgress],
) -> tuple[str, int, datetime | None]:
    progress = progress_by_lesson.get(lesson.id)
    time_spent = int(progress.time_spent or 0) if progress else 0
    completed_at = progress.completed_at if progress and progress.completed_at else None

    if progress and progress.status == "completed":
        return "completed", time_spent, completed_at

    if _lesson_has_passed_assessment(db, user_id=user_id, lesson=lesson):
        return "completed", time_spent, completed_at

    if progress and progress.status == "in_progress":
        return "in_progress", time_spent, completed_at

    return "not_started", time_spent, completed_at


def ensure_learner_course_context(
    db: Session,
    *,
    user_id: UUID,
    course_id: UUID,
) -> LearnerCourseContext:
    context = (
        db.query(LearnerCourseContext)
        .filter(
            LearnerCourseContext.user_id == user_id,
            LearnerCourseContext.course_id == course_id,
        )
        .first()
    )
    if context:
        return context

    context = LearnerCourseContext(user_id=user_id, course_id=course_id)
    db.add(context)
    db.flush()
    return context


def initialize_learner_course_tracking(
    db: Session,
    *,
    user_id: UUID,
    course_id: UUID,
) -> LearnerCourseContext:
    context = ensure_learner_course_context(db, user_id=user_id, course_id=course_id)
    lessons = _get_course_lessons(db, course_id)

    existing_progress_lesson_ids = {
        lesson_id
        for (lesson_id,) in db.query(UserProgress.lesson_id)
        .filter(UserProgress.user_id == user_id, UserProgress.lesson_id.in_([lesson.id for lesson in lessons] or [UUID(int=0)]))
        .all()
    }

    for lesson in lessons:
        if lesson.id in existing_progress_lesson_ids:
            continue
        db.add(
            UserProgress(
                user_id=user_id,
                lesson_id=lesson.id,
                status="not_started",
                time_spent=0,
            )
        )

    if lessons and context.current_lesson_id is None:
        context.current_lesson_id = lessons[0].id
        context.last_opened_lesson_id = lessons[0].id

    context.updated_at = datetime.utcnow()
    db.flush()
    return context


def touch_lesson_context(
    db: Session,
    *,
    user_id: UUID,
    lesson_id: UUID,
    mark_completed: bool = False,
) -> LearnerCourseContext | None:
    course_id = _get_course_id_by_lesson(db, lesson_id)
    if course_id is None:
        return None

    context = ensure_learner_course_context(db, user_id=user_id, course_id=course_id)
    context.current_lesson_id = lesson_id
    context.last_opened_lesson_id = lesson_id
    if mark_completed:
        context.last_completed_lesson_id = lesson_id
    context.updated_at = datetime.utcnow()
    db.flush()
    return context


def record_quiz_attempt_context(
    db: Session,
    *,
    user_id: UUID,
    course_id: UUID,
    lesson_id: UUID | None,
    score: float,
    passed: bool,
    attempted_at: datetime | None = None,
) -> LearnerCourseContext:
    context = ensure_learner_course_context(db, user_id=user_id, course_id=course_id)
    if lesson_id:
        context.current_lesson_id = lesson_id
        context.last_opened_lesson_id = lesson_id
        if passed:
            context.last_completed_lesson_id = lesson_id
        else:
            context.latest_failed_quiz_lesson_id = lesson_id

    context.latest_quiz_score = score
    context.latest_quiz_passed = passed
    context.last_quiz_attempted_at = attempted_at or datetime.utcnow()
    if not passed:
        context.failed_quiz_count = int(context.failed_quiz_count or 0) + 1
    context.updated_at = datetime.utcnow()
    db.flush()
    return context


def build_learner_context_response(
    db: Session,
    *,
    user_id: UUID,
    course_id: UUID,
) -> dict:
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise ValueError("Course not found")

    context = ensure_learner_course_context(db, user_id=user_id, course_id=course_id)
    lessons = _get_course_lessons(db, course_id)
    lesson_ids = [lesson.id for lesson in lessons]

    progress_rows = (
        db.query(UserProgress)
        .filter(
            UserProgress.user_id == user_id,
            UserProgress.lesson_id.in_(lesson_ids or [UUID(int=0)]),
        )
        .all()
    )
    progress_by_lesson = {row.lesson_id: row for row in progress_rows}

    total_lessons = len(lessons)
    completed_lessons = 0
    in_progress_lessons = 0
    total_time_spent = 0

    derived_progress_by_lesson: dict[UUID, tuple[str, int, datetime | None]] = {}
    for lesson in lessons:
        derived_state = _derive_lesson_progress_state(
            db,
            user_id=user_id,
            lesson=lesson,
            progress_by_lesson=progress_by_lesson,
        )
        derived_progress_by_lesson[lesson.id] = derived_state
        status, time_spent, _ = derived_state
        total_time_spent += time_spent
        if status == "completed":
            completed_lessons += 1
        elif status == "in_progress":
            in_progress_lessons += 1

    not_started_lessons = total_lessons - completed_lessons - in_progress_lessons
    progress_percent = round((completed_lessons / total_lessons) * 100, 2) if total_lessons else 0.0

    enrollment = (
        db.query(Enrollment)
        .filter(Enrollment.user_id == user_id, Enrollment.course_id == course_id)
        .first()
    )

    def _serialize_lesson(lesson_id: UUID | None) -> dict | None:
        if not lesson_id:
            return None
        lesson = _get_lesson(db, lesson_id)
        if not lesson:
            return None
        derived_status, derived_time_spent, derived_completed_at = derived_progress_by_lesson.get(
            lesson.id,
            ("not_started", 0, None),
        )
        return {
            "lessonId": str(lesson.id),
            "title": lesson.title,
            "contentType": lesson.content_type,
            "status": derived_status,
            "timeSpent": derived_time_spent,
            "completedAt": derived_completed_at.isoformat() if derived_completed_at else None,
        }

    traditional_failed_rows = db.execute(
        text(
            """
            SELECT l.id AS lesson_id,
                   l.title AS lesson_title,
                   qa.score,
                   qa.completed_at,
                   qa.wrong_answers
            FROM quiz_attempts qa
            JOIN assessments a ON a.id = qa.assessment_id
            JOIN lessons l ON l.assessment_id = a.id
            JOIN modules m ON m.id = l.module_id
            WHERE qa.user_id = :user_id
              AND m.course_id = :course_id
              AND COALESCE(qa.passed, FALSE) = FALSE
            ORDER BY qa.completed_at DESC NULLS LAST
            LIMIT 5
            """
        ),
        {"user_id": str(user_id), "course_id": str(course_id)},
    ).mappings().all()

    ai_failed_rows = db.execute(
        text(
            """
            SELECT a.lesson_id,
                   l.title AS lesson_title,
                   a.score,
                   a.completed_at,
                   a.wrong_answers
            FROM ai_platform_lesson_quiz_attempts a
            JOIN lessons l ON l.id = a.lesson_id
            WHERE a.user_id = CAST(:user_id AS uuid)
              AND a.course_id = CAST(:course_id AS uuid)
              AND a.passed = FALSE
            ORDER BY a.completed_at DESC
            LIMIT 5
            """
        ),
        {"user_id": str(user_id), "course_id": str(course_id)},
    ).mappings().all()

    failed_quizzes = [
        {
            "lessonId": str(row["lesson_id"]),
            "lessonTitle": row["lesson_title"],
            "score": float(row["score"] or 0),
            "completedAt": row["completed_at"].isoformat() if row["completed_at"] else None,
            "wrongAnswers": row["wrong_answers"] or [],
        }
        for row in [*traditional_failed_rows, *ai_failed_rows]
    ]

    latest_traditional_attempt = (
        db.query(AssessmentAttempt)
        .join(Lesson, Lesson.assessment_id == AssessmentAttempt.assessment_id)
        .join(Module, Module.id == Lesson.module_id)
        .filter(AssessmentAttempt.user_id == user_id, Module.course_id == course_id)
        .order_by(AssessmentAttempt.completed_at.desc().nullslast(), AssessmentAttempt.started_at.desc())
        .first()
    )

    latest_ai_attempt = db.execute(
        text(
            """
            SELECT lesson_id, score, passed, completed_at
            FROM ai_platform_lesson_quiz_attempts
            WHERE user_id = CAST(:user_id AS uuid)
              AND course_id = CAST(:course_id AS uuid)
            ORDER BY completed_at DESC
            LIMIT 1
            """
        ),
        {"user_id": str(user_id), "course_id": str(course_id)},
    ).mappings().first()

    latest_attempt_candidates: list[tuple[datetime, dict]] = []
    if latest_traditional_attempt and latest_traditional_attempt.completed_at:
        lesson = db.query(Lesson).filter(Lesson.assessment_id == latest_traditional_attempt.assessment_id).first()
        latest_attempt_candidates.append(
            (
                latest_traditional_attempt.completed_at,
                {
                    "lessonId": str(lesson.id) if lesson else None,
                    "score": float(latest_traditional_attempt.score or 0),
                    "passed": bool(latest_traditional_attempt.passed),
                    "completedAt": latest_traditional_attempt.completed_at.isoformat(),
                    "source": "traditional",
                },
            )
        )
    if latest_ai_attempt and latest_ai_attempt["completed_at"]:
        latest_attempt_candidates.append(
            (
                latest_ai_attempt["completed_at"],
                {
                    "lessonId": str(latest_ai_attempt["lesson_id"]),
                    "score": float(latest_ai_attempt["score"] or 0),
                    "passed": bool(latest_ai_attempt["passed"]),
                    "completedAt": latest_ai_attempt["completed_at"].isoformat(),
                    "source": "ai_generated",
                },
            )
        )

    latest_attempt_candidates.sort(key=lambda item: item[0], reverse=True)
    latest_quiz_attempt = latest_attempt_candidates[0][1] if latest_attempt_candidates else None

    return {
        "userId": str(user_id),
        "courseId": str(course_id),
        "courseTitle": course.title,
        "enrollment": {
            "status": enrollment.status if enrollment else "not_enrolled",
            "enrolledAt": enrollment.enrolled_at.isoformat() if enrollment else None,
            "completedAt": enrollment.completed_at.isoformat() if enrollment and enrollment.completed_at else None,
        },
        "progressSummary": {
            "totalLessons": total_lessons,
            "completedLessons": completed_lessons,
            "inProgressLessons": in_progress_lessons,
            "notStartedLessons": not_started_lessons,
            "progressPercent": progress_percent,
            "timeSpentSeconds": total_time_spent,
        },
        "currentLesson": _serialize_lesson(context.current_lesson_id),
        "lastOpenedLesson": _serialize_lesson(context.last_opened_lesson_id),
        "lastCompletedLesson": _serialize_lesson(context.last_completed_lesson_id),
        "latestQuizAttempt": latest_quiz_attempt,
        "failedQuizzes": failed_quizzes,
        "failedQuizCount": int(context.failed_quiz_count or 0),
        "latestFailedQuizLessonId": str(context.latest_failed_quiz_lesson_id)
        if context.latest_failed_quiz_lesson_id
        else None,
        "updatedAt": context.updated_at.isoformat() if context.updated_at else None,
    }
