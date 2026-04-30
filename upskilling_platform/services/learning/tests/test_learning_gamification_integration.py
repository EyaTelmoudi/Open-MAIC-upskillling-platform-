"""Integration-style checks between learning progress and gamification."""

from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

from services.learning.services import video_progress


class FakeXPManager:
    """Captures course completion XP awards."""

    awards = []

    def __init__(self, db, rabbitmq):
        self.db = db
        self.rabbitmq = rabbitmq

    def award_xp(
        self,
        user_id: str,
        action: str,
        reason: str | None = None,
        explicit_amount: int | None = None,
    ):
        self.__class__.awards.append(
            {
                "user_id": user_id,
                "action": action,
                "reason": reason,
                "explicit_amount": explicit_amount,
            }
        )


class FakeBadgeManager:
    """Captures badge award checks triggered by progress completion."""

    awards = []

    def __init__(self, db, rabbitmq=None):
        self.db = db
        self.rabbitmq = rabbitmq

    def get_completed_course_count(self, user_id: str) -> int:
        return 1

    def get_completed_advanced_course_count(self, user_id: str) -> int:
        return 0

    def check_and_award_badges(self, user_id: str, action: str, count: int = 1):
        self.__class__.awards.append(
            {
                "user_id": user_id,
                "action": action,
                "count": count,
            }
        )
        return []


class FakeRabbitMQClient:
    """No-op RabbitMQ client for completion tests."""

    def close(self):
        return None


def test_course_completion_awards_course_complete_xp(monkeypatch):
    """Completing the last lesson bridges learning progress into gamification."""
    from common import messaging
    from services.learning import gamification
    from services.learning.routers import certificates
    from services.learning.gamification import badges

    FakeXPManager.awards = []
    FakeBadgeManager.awards = []

    monkeypatch.setattr(messaging, "RabbitMQClient", FakeRabbitMQClient)
    monkeypatch.setattr(gamification, "XPManager", FakeXPManager)
    monkeypatch.setattr(badges, "BadgeManager", FakeBadgeManager)
    monkeypatch.setattr(
        certificates,
        "generate_certificate_for_enrollment",
        lambda enrollment_id, db: None,
    )

    user_id = uuid4()
    course_id = uuid4()
    lesson_id = uuid4()
    enrollment = SimpleNamespace(
        id=uuid4(),
        user_id=user_id,
        course_id=course_id,
        status="in_progress",
        completed_at=None,
    )

    lesson_query = MagicMock()
    lesson_query.join.return_value = lesson_query
    lesson_query.filter.return_value = lesson_query
    lesson_query.all.return_value = [SimpleNamespace(id=lesson_id, assessment_id=None)]

    progress_query = MagicMock()
    progress_query.filter.return_value = progress_query
    progress_query.first.return_value = SimpleNamespace(status="completed")

    enrollment_query = MagicMock()
    enrollment_query.filter.return_value = enrollment_query
    enrollment_query.first.return_value = enrollment

    course = SimpleNamespace(id=course_id, title="AI Foundations", xp_reward=350)
    course_query = MagicMock()
    course_query.filter.return_value = course_query
    course_query.first.return_value = course

    db = MagicMock()
    db.query.side_effect = [lesson_query, progress_query, enrollment_query, course_query]

    video_progress.check_enrollment_completion(db, user_id, course_id)

    assert enrollment.status == "completed"
    assert FakeXPManager.awards == [
        {
            "user_id": str(user_id),
            "action": "course_complete",
            "reason": "Completed course AI Foundations",
            "explicit_amount": 350,
        }
    ]
    assert FakeBadgeManager.awards == [
        {
            "user_id": str(user_id),
            "action": "course_complete",
            "count": 1,
        }
    ]
