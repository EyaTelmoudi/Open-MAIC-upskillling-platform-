"""XP system for gamification — awards XP for learning actions."""

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from common.models import UserLevel, XPTransaction
from common.messaging import RabbitMQClient
from .utils import DEFAULT_TIMEZONE

logger = logging.getLogger(__name__)

XP_CONFIG = {
    "lesson_complete": 50,
    "quiz_pass": 100,
    "course_complete": 200,
    "daily_login": 10,
    "streak_bonus": {
        7: 50,
        14: 100,
        30: 200,
        60: 500,
        90: 1000,
    },
    "enrollment": 20,
    "first_course": 150,
    "perfect_score": 75,
    "daily_lesson": 25,
}

ANTI_GAMING_THRESHOLD = 1000
ANTI_GAMING_TIME_WINDOW = 300


class XPManager:
    """Manages XP awarding, history, and anti-gaming logic."""

    def __init__(self, db: Session, rabbitmq: Optional[RabbitMQClient] = None):
        self.db = db
        self.rabbitmq = rabbitmq
        self._recent_transactions = {}

    def award_xp(
        self,
        user_id: str,
        action: str,
        reason: Optional[str] = None,
        multiplier: float = 1.0,
        user_timezone: str = DEFAULT_TIMEZONE,
        explicit_amount: Optional[int] = None,
    ) -> Optional[XPTransaction]:
        """Award XP to a user for a specific action."""
        base_xp = explicit_amount if explicit_amount is not None else XP_CONFIG.get(action, 0)
        if base_xp == 0:
            logger.warning(f"Unknown XP action: {action}")
            return None

        if self._check_anti_gaming(user_id, action):
            logger.warning(f"Anti-gaming triggered for user {user_id}, action {action}")
            return None

        amount = int(base_xp * multiplier)
        if reason is None:
            reason = action.replace("_", " ").title()

        transaction = XPTransaction(
            user_id=user_id,
            amount=amount,
            reason=reason,
        )
        self.db.add(transaction)

        user_level = self.db.execute(
            select(UserLevel).where(UserLevel.user_id == user_id)
        ).scalar_one_or_none()

        if not user_level:
            user_level = UserLevel(user_id=user_id, level=1, total_xp=0)
            self.db.add(user_level)
            self.db.flush()

            current_xp = 0
        else:
            current_xp = user_level.total_xp or 0

        new_total = current_xp + amount

        self.db.execute(
            update(UserLevel)
            .where(UserLevel.user_id == user_id)
            .values(total_xp=new_total)
        )

        self.db.commit()

        try:
            from .levels import LevelManager

            LevelManager(self.db, self.rabbitmq).check_level_up(user_id)
        except Exception as exc:
            logger.error(f"Failed to check level progression for user {user_id}: {exc}")

        self._publish_xp_event(user_id, amount, action)

        logger.info(f"Awarded {amount} XP to user {user_id} for {action}")
        return transaction

    def _check_anti_gaming(self, user_id: str, action: str) -> bool:
        """Check for suspicious activity patterns."""
        key = f"{user_id}:{action}"
        now = datetime.utcnow()

        if key not in self._recent_transactions:
            self._recent_transactions[key] = []

        self._recent_transactions[key] = [
            t
            for t in self._recent_transactions[key]
            if (now - t).total_seconds() < ANTI_GAMING_TIME_WINDOW
        ]

        if len(self._recent_transactions[key]) >= ANTI_GAMING_THRESHOLD:
            return True

        self._recent_transactions[key].append(now)
        return False

    def _publish_xp_event(self, user_id: str, amount: int, action: str):
        """Publish XP gained event to RabbitMQ."""
        if not self.rabbitmq:
            return

        event = {
            "event": "xp.gained",
            "userId": user_id,
            "amount": amount,
            "action": action,
            "timestamp": datetime.utcnow().isoformat(),
        }

        try:
            self.rabbitmq.publish(
                exchange="learning.exchange",
                routing_key="learning.gamification",
                message=event,
            )
        except Exception as e:
            logger.error(f"Failed to publish XP event: {e}")

    def get_xp_history(
        self,
        user_id: str,
        limit: int = 50,
        offset: int = 0,
    ) -> list[XPTransaction]:
        """Get XP transaction history for a user."""
        result = self.db.execute(
            select(XPTransaction)
            .where(XPTransaction.user_id == user_id)
            .order_by(XPTransaction.created_at.desc())
            .limit(limit)
            .offset(offset)
        )
        return list(result.scalars().all())

    def get_total_xp(self, user_id: str) -> int:
        """Get total XP for a user."""
        user_level = self.db.execute(
            select(UserLevel).where(UserLevel.user_id == user_id)
        ).scalar_one_or_none()

        if not user_level:
            return 0

        return user_level.total_xp or 0


def get_level_from_xp(total_xp: int) -> int:
    """Calculate level from total XP using exponential curve."""
    if total_xp < 100:
        return 1
    return int(1 + (total_xp / 500) ** 0.6)


def get_xp_for_level(level: int) -> int:
    """Calculate XP required for a specific level."""
    if level <= 1:
        return 0
    return int(500 * (level - 1) ** 1.67)


def get_next_level_xp(current_level: int) -> int:
    """Get XP needed to reach the next level."""
    return get_xp_for_level(current_level + 1)
