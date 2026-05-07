"""Helpers for keeping course duration synchronized with lesson durations."""

from uuid import UUID

from sqlalchemy.orm import Session

from common.models import Course, Lesson, Module


def calculate_course_duration(course_id: UUID, db: Session) -> int:
    """Return the total duration, in minutes, of all lessons in a course."""
    durations = (
        db.query(Lesson.duration)
        .join(Module, Lesson.module_id == Module.id)
        .filter(Module.course_id == course_id)
        .all()
    )
    return sum(max(int(duration or 0), 0) for (duration,) in durations)


def sync_course_duration(course_id: UUID, db: Session) -> int:
    """Persist the current lesson-duration total on the course row."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        return 0

    course.duration = calculate_course_duration(course_id, db)
    db.flush()
    return course.duration
