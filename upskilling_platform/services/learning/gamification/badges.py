"""Badges and achievements system for gamification."""

import logging
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from common.messaging import RabbitMQClient

from .utils import get_timezone

logger = logging.getLogger(__name__)

BADGE_DEFINITIONS = {
    "first_steps": {
        "name": "First Steps",
        "description": "Complete your first lesson",
        "tier": "bronze",
        "icon": "🌱",
        "condition": {"action": "lesson_complete", "count": 1},
    },
    "quick_learner": {
        "name": "Quick Learner",
        "description": "Complete 10 lessons",
        "tier": "bronze",
        "icon": "⚡",
        "condition": {"action": "lesson_complete", "count": 10},
    },
    "course_crusher": {
        "name": "Course Crusher",
        "description": "Complete your first course",
        "tier": "gold",
        "icon": "🏆",
        "condition": {"action": "course_complete", "count": 1},
    },
    "perfectionist": {
        "name": "Perfectionist",
        "description": "Get a perfect score on a quiz",
        "tier": "platinum",
        "icon": "💯",
        "condition": {"action": "perfect_score", "count": 1},
    },
    "streak_7": {
        "name": "Streak Master",
        "description": "Maintain a 7-day streak",
        "tier": "silver",
        "icon": "🔥",
        "condition": {"action": "streak", "count": 7},
    },
    "streak_30": {
        "name": "On Fire",
        "description": "Maintain a 30-day streak",
        "tier": "gold",
        "icon": "🚀",
        "condition": {"action": "streak", "count": 30},
    },
    "team_player": {
        "name": "Team Player",
        "description": "Join a team",
        "tier": "silver",
        "icon": "🤝",
        "condition": {"action": "team_join", "count": 1},
    },
    "top_10": {
        "name": "Top 10",
        "description": "Reach top 10 on leaderboard",
        "tier": "gold",
        "icon": "🥇",
        "condition": {"action": "leaderboard_rank", "count": 10},
    },
    "mentor": {
        "name": "Mentor",
        "description": "Help 10 colleagues through AI Coach",
        "tier": "platinum",
        "icon": "🧠",
        "condition": {"action": "coach_interactions", "count": 10},
    },
    "innovator": {
        "name": "Innovator",
        "description": "Complete 5 advanced courses",
        "tier": "gold",
        "icon": "💡",
        "condition": {"action": "advanced_course", "count": 5},
    },
    "night_owl": {
        "name": "Night Owl",
        "description": "Learn after 10 PM",
        "tier": "silver",
        "icon": "🦉",
        "condition": {"action": "late_session", "count": 1},
    },
    "early_bird": {
        "name": "Early Bird",
        "description": "Learn before 7 AM",
        "tier": "bronze",
        "icon": "🐦",
        "condition": {"action": "early_session", "count": 1},
    },
    "legend": {
        "name": "Legend",
        "description": "Reach level 50",
        "tier": "platinum",
        "icon": "👑",
        "condition": {"action": "level", "count": 50},
    },
}


class BadgeManager:
    """Manages badge definitions, awarding, and user badge tracking."""

    def __init__(self, db: Session, rabbitmq: Optional[RabbitMQClient] = None):
        self.db = db
        self.rabbitmq = rabbitmq

    def check_and_award_badges(
        self, user_id: str, action: str, count: int = 1
    ) -> list[dict]:
        """Check if user qualifies for any badges based on action."""
        awarded = []

        for badge_id, definition in BADGE_DEFINITIONS.items():
            condition = definition.get("condition", {})
            if condition.get("action") != action:
                continue

            required_count = condition.get("count", 1)
            if count < required_count or self._has_badge(user_id, badge_id):
                continue

            awarded.append(self._award_badge(user_id, badge_id))

        return awarded

    def get_completed_lesson_count(self, user_id: str) -> int:
        """Return the number of completed lessons for a user."""
        from common.models import UserProgress

        return (
            self.db.query(func.count(UserProgress.id))
            .filter(
                UserProgress.user_id == user_id,
                UserProgress.status == "completed",
            )
            .scalar()
            or 0
        )

    def get_completed_course_count(self, user_id: str) -> int:
        """Return the number of completed courses for a user."""
        from common.models import Enrollment

        return (
            self.db.query(func.count(Enrollment.id))
            .filter(
                Enrollment.user_id == user_id,
                Enrollment.status == "completed",
            )
            .scalar()
            or 0
        )

    def get_completed_advanced_course_count(self, user_id: str) -> int:
        """Return the number of completed advanced courses for a user."""
        from common.models import Course, Enrollment

        return (
            self.db.query(func.count(Enrollment.id))
            .join(Course, Enrollment.course_id == Course.id)
            .filter(
                Enrollment.user_id == user_id,
                Enrollment.status == "completed",
                func.lower(Course.difficulty) == "advanced",
            )
            .scalar()
            or 0
        )

    def award_time_of_day_badges(
        self,
        user_id: str,
        user_timezone: str | None,
        occurred_at: datetime | None = None,
    ) -> list[dict]:
        """Award time-based badges based on the user's local learning time."""
        reference = occurred_at or datetime.now(timezone.utc)
        if reference.tzinfo is None:
            reference = reference.replace(tzinfo=timezone.utc)

        local_hour = reference.astimezone(get_timezone(user_timezone)).hour
        awarded: list[dict] = []

        if local_hour < 7:
            awarded.extend(self.check_and_award_badges(user_id, "early_session", 1))
        if local_hour >= 22:
            awarded.extend(self.check_and_award_badges(user_id, "late_session", 1))

        return awarded

    def _has_badge(self, user_id: str, badge_id: str) -> bool:
        """Check if user already has a specific badge."""
        from common.models import UserBadge

        result = self.db.execute(
            select(UserBadge).where(
                UserBadge.user_id == user_id, UserBadge.badge_id == badge_id
            )
        )
        return result.scalar_one_or_none() is not None

    def _award_badge(self, user_id: str, badge_id: str) -> dict:
        """Award a badge to a user."""
        from common.models import UserBadge

        badge_def = BADGE_DEFINITIONS.get(badge_id)
        if not badge_def:
            return {}

        user_badge = UserBadge(
            user_id=user_id,
            badge_id=badge_id,
            badge_name=badge_def["name"],
            badge_tier=badge_def["tier"],
            badge_icon=badge_def["icon"],
            description=badge_def["description"],
        )
        self.db.add(user_badge)
        self.db.commit()

        self._publish_badge_event(user_id, badge_id, badge_def)

        logger.info("Awarded badge %s to user %s", badge_id, user_id)
        return {
            "badge_id": badge_id,
            "name": badge_def["name"],
            "tier": badge_def["tier"],
            "icon": badge_def["icon"],
        }

    def _publish_badge_event(self, user_id: str, badge_id: str, badge_def: dict):
        """Publish badge earned event to RabbitMQ."""
        if not self.rabbitmq:
            return

        event = {
            "event": "badge.earned",
            "userId": user_id,
            "badge_id": badge_id,
            "badge_name": badge_def["name"],
            "tier": badge_def["tier"],
            "icon": badge_def["icon"],
            "timestamp": datetime.utcnow().isoformat(),
        }

        try:
            self.rabbitmq.publish(
                exchange="learning.exchange",
                routing_key="learning.gamification",
                message=event,
            )
        except Exception as exc:
            logger.error("Failed to publish badge event: %s", exc)

    def get_user_badges(self, user_id: str) -> list[dict]:
        """Get all badges for a user."""
        from common.models import UserBadge

        result = self.db.execute(select(UserBadge).where(UserBadge.user_id == user_id))
        badges = result.scalars().all()

        return [
            {
                "badge_id": badge.badge_id,
                "name": badge.badge_name,
                "tier": badge.badge_tier,
                "icon": badge.badge_icon,
                "description": badge.description,
                "earned_at": badge.earned_at.isoformat() if badge.earned_at else None,
            }
            for badge in badges
        ]

    def get_all_badge_definitions(self) -> list[dict]:
        """Get all badge definitions for UI display."""
        return [
            {
                "badge_id": badge_id,
                "name": definition["name"],
                "description": definition["description"],
                "tier": definition["tier"],
                "icon": definition["icon"],
            }
            for badge_id, definition in BADGE_DEFINITIONS.items()
        ]
