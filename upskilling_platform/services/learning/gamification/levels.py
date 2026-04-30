"""Level system for gamification — handles level progression and thresholds."""

import logging
from datetime import datetime
from typing import Optional

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from common.models import UserLevel
from common.messaging import RabbitMQClient

logger = logging.getLogger(__name__)

LEVEL_TIERS = {
    "bronze": (1, 10),
    "silver": (11, 25),
    "gold": (26, 50),
    "platinum": (51, float("inf")),
}


class LevelManager:
    """Manages user levels and progression."""

    def __init__(self, db: Session, rabbitmq: Optional[RabbitMQClient] = None):
        self.db = db
        self.rabbitmq = rabbitmq

    def get_user_level(self, user_id: str) -> UserLevel:
        """Get or create user level record."""
        result = self.db.execute(
            select(UserLevel).where(UserLevel.user_id == user_id)
        ).scalar_one_or_none()

        if not result:
            result = UserLevel(user_id=user_id, level=1, total_xp=0)
            self.db.add(result)
            self.db.commit()
            self.db.refresh(result)

        return result

    def check_level_up(self, user_id: str) -> Optional[dict]:
        """Check if user should level up based on XP."""
        user_level = self.get_user_level(user_id)
        old_level = int(user_level.level or 1)

        current_total_xp = int(user_level.total_xp or 0)
        new_level = self._calculate_level(current_total_xp)

        if new_level > old_level:
            self.db.execute(
                update(UserLevel)
                .where(UserLevel.user_id == user_id)
                .values(level=new_level)
            )
            self.db.commit()

            try:
                from .badges import BadgeManager

                BadgeManager(self.db, self.rabbitmq).check_and_award_badges(
                    user_id=user_id,
                    action="level",
                    count=new_level,
                )
            except Exception as exc:
                logger.error(f"Failed to award level badges for user {user_id}: {exc}")

            self._publish_level_up_event(user_id, old_level, new_level)

            logger.info(f"User {user_id} leveled up from {old_level} to {new_level}")
            return {
                "old_level": old_level,
                "new_level": new_level,
                "total_xp": current_total_xp,
            }

        return None

    def _calculate_level(self, total_xp: int) -> int:
        """Calculate level from total XP using exponential curve."""
        if total_xp < 100:
            return 1
        return int(1 + (total_xp / 500) ** 0.6)

    def _calculate_total_xp_for_level(self, level: int) -> int:
        """Calculate total XP required for a specific level."""
        if level <= 1:
            return 0
        return int(500 * (level - 1) ** 1.67)

    def get_level_info(self, user_id: str) -> dict:
        """Get detailed level information for a user."""
        user_level = self.get_user_level(user_id)

        current_level = int(user_level.level) if user_level.level else 1
        total_xp = int(user_level.total_xp) if user_level.total_xp else 0

        current_level_xp = self._calculate_total_xp_for_level(current_level)
        next_level_xp = self._calculate_total_xp_for_level(current_level + 1)

        xp_in_level = total_xp - current_level_xp
        xp_needed = next_level_xp - current_level_xp

        tier = self._get_tier(current_level)

        progress = 0 if xp_needed == 0 else round((xp_in_level / xp_needed) * 100, 1)

        return {
            "level": current_level,
            "total_xp": total_xp,
            "current_level_xp": current_level_xp,
            "next_level_xp": next_level_xp,
            "xp_in_level": xp_in_level,
            "xp_needed": xp_needed,
            "progress": progress,
            "tier": tier,
        }

    def _get_tier(self, level: int) -> str:
        """Get the tier name for a level."""
        for tier, (min_level, max_level) in LEVEL_TIERS.items():
            if min_level <= level <= max_level:
                return tier
        return "platinum"

    def _publish_level_up_event(self, user_id: str, old_level: int, new_level: int):
        """Publish level up event to RabbitMQ."""
        if not self.rabbitmq:
            return

        event = {
            "event": "level.up",
            "userId": user_id,
            "old_level": old_level,
            "new_level": new_level,
            "timestamp": datetime.utcnow().isoformat(),
        }

        try:
            self.rabbitmq.publish(
                exchange="learning.exchange",
                routing_key="learning.gamification",
                message=event,
            )
        except Exception as e:
            logger.error(f"Failed to publish level up event: {e}")
