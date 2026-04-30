"""Streak tracking system for gamification."""

import logging
from datetime import date, datetime, timedelta, timezone
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from common.messaging import RabbitMQClient
from .utils import DEFAULT_TIMEZONE, get_timezone, get_user_local_date

logger = logging.getLogger(__name__)

STREAK_MILESTONES = [7, 14, 30, 60, 90, 180, 365]


class StreakManager:
    """Manages user streaks and streak bonuses."""

    def __init__(self, db: Session, rabbitmq: Optional[RabbitMQClient] = None):
        self.db = db
        self.rabbitmq = rabbitmq

    def record_activity(
        self,
        user_id: str,
        user_timezone: str = DEFAULT_TIMEZONE,
    ) -> dict:
        """Record user activity and update streak."""
        from common.models import UserStreak

        streak = self.db.execute(
            select(UserStreak).where(UserStreak.user_id == user_id)
        ).scalar_one_or_none()

        today = get_user_local_date(user_timezone)

        if not streak:
            streak = UserStreak(
                user_id=user_id,
                current_streak=1,
                longest_streak=1,
                last_activity_date=today,
            )
            self.db.add(streak)
            self.db.commit()
            self.db.refresh(streak)

            self._publish_streak_event(user_id, 1, "new")
            return {"current_streak": 1, "longest_streak": 1, "milestone": None}

        last_activity = streak.last_activity_date
        if isinstance(last_activity, datetime):
            last_activity = last_activity.date()

        days_diff = (today - last_activity).days

        if days_diff == 0:
            return {
                "current_streak": streak.current_streak,
                "longest_streak": streak.longest_streak,
                "milestone": None,
            }

        if days_diff == 1:
            new_streak = streak.current_streak + 1
        else:
            new_streak = 1

        streak.current_streak = new_streak
        if new_streak > streak.longest_streak:
            streak.longest_streak = new_streak
        streak.last_activity_date = today

        self.db.commit()

        try:
            from .badges import BadgeManager

            BadgeManager(self.db, self.rabbitmq).check_and_award_badges(
                user_id=user_id,
                action="streak",
                count=new_streak,
            )
        except Exception as exc:
            logger.error(f"Failed to award streak badges for user {user_id}: {exc}")

        milestone = self._check_milestone(new_streak)

        self._publish_streak_event(user_id, new_streak, "update")

        return {
            "current_streak": new_streak,
            "longest_streak": streak.longest_streak,
            "milestone": milestone,
        }

    def _check_milestone(self, streak: int) -> Optional[int]:
        """Check if streak hit a milestone."""
        for milestone in STREAK_MILESTONES:
            if streak == milestone:
                return milestone
        return None

    def get_streak_info(
        self,
        user_id: str,
        user_timezone: str = DEFAULT_TIMEZONE,
    ) -> dict:
        """Get streak information for a user."""
        from common.models import UserStreak

        streak = self.db.execute(
            select(UserStreak).where(UserStreak.user_id == user_id)
        ).scalar_one_or_none()

        if not streak:
            bootstrap = self._bootstrap_streak_from_learning_activity(
                user_id, user_timezone
            )
            if bootstrap:
                return bootstrap
            return {
                "current_streak": 0,
                "longest_streak": 0,
                "last_activity_date": None,
                "is_active_today": False,
            }

        last_activity = streak.last_activity_date
        if isinstance(last_activity, datetime):
            last_activity = last_activity.date()

        today = get_user_local_date(user_timezone)
        is_active_today = last_activity == today if last_activity else False

        return {
            "current_streak": streak.current_streak,
            "longest_streak": streak.longest_streak,
            "last_activity_date": last_activity.isoformat() if last_activity else None,
            "is_active_today": is_active_today,
        }

    def _bootstrap_streak_from_learning_activity(
        self,
        user_id: str,
        user_timezone: str | None,
    ) -> Optional[dict]:
        """Build and persist an initial streak from existing learning activity."""
        from common.models import Enrollment, UserProgress, UserStreak

        progress_rows = (
            self.db.execute(
                select(UserProgress.completed_at).where(
                    UserProgress.user_id == user_id,
                    UserProgress.completed_at.isnot(None),
                )
            )
            .scalars()
            .all()
        )
        enrollment_rows = (
            self.db.execute(
                select(Enrollment.completed_at).where(
                    Enrollment.user_id == user_id,
                    Enrollment.completed_at.isnot(None),
                )
            )
            .scalars()
            .all()
        )

        activity_dates = {
            self._to_local_date(timestamp, user_timezone)
            for timestamp in [*progress_rows, *enrollment_rows]
            if timestamp is not None
        }
        activity_dates.discard(None)

        if not activity_dates:
            return None

        ordered_dates = sorted(activity_dates, reverse=True)
        last_activity = ordered_dates[0]
        current_streak = 1

        for index in range(1, len(ordered_dates)):
            previous_day = ordered_dates[index - 1] - timedelta(days=1)
            if ordered_dates[index] != previous_day:
                break
            current_streak += 1

        streak_row = UserStreak(
            user_id=user_id,
            current_streak=current_streak,
            longest_streak=current_streak,
            last_activity_date=last_activity,
        )
        self.db.add(streak_row)
        self.db.commit()

        today = get_user_local_date(user_timezone)
        return {
            "current_streak": current_streak,
            "longest_streak": current_streak,
            "last_activity_date": last_activity.isoformat(),
            "is_active_today": last_activity == today,
        }

    def _to_local_date(
        self,
        timestamp: datetime | None,
        user_timezone: str | None,
    ) -> Optional[date]:
        """Convert a UTC-ish timestamp to the user's local date."""
        if timestamp is None:
            return None

        if timestamp.tzinfo is None:
            timestamp = timestamp.replace(tzinfo=timezone.utc)

        return timestamp.astimezone(get_timezone(user_timezone)).date()

    def _publish_streak_event(self, user_id: str, streak: int, event_type: str):
        """Publish streak update event to RabbitMQ."""
        if not self.rabbitmq:
            return

        event = {
            "event": "streak.update",
            "userId": user_id,
            "current_streak": streak,
            "event_type": event_type,
            "timestamp": datetime.utcnow().isoformat(),
        }

        try:
            self.rabbitmq.publish(
                exchange="learning.exchange",
                routing_key="learning.gamification",
                message=event,
            )
        except Exception as e:
            logger.error(f"Failed to publish streak event: {e}")
