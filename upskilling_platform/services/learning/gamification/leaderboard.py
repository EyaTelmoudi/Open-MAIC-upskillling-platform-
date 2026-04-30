"""Leaderboard system for gamification."""

import logging
from typing import Optional

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from .utils import DEFAULT_TIMEZONE, get_period_start_utc

logger = logging.getLogger(__name__)


def _display_name(first_name: str | None, last_name: str | None) -> str:
    full_name = f"{(first_name or '').strip()} {(last_name or '').strip()}".strip()
    return full_name or "Unknown User"


class LeaderboardManager:
    """Manages leaderboard rankings."""

    def __init__(self, db: Session):
        self.db = db

    def get_global_leaderboard(
        self,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """Get global leaderboard ranked by total XP."""
        from common.models import UserLevel, User

        result = self.db.execute(
            select(UserLevel, User)
            .join(User, UserLevel.user_id == User.id)
            .order_by(desc(UserLevel.total_xp))
            .limit(limit)
            .offset(offset)
        )

        leaderboard = []
        rank = offset + 1
        for row in result:
            level = self._calculate_level(row.UserLevel.total_xp or 0)
            leaderboard.append(
                {
                    "rank": rank,
                    "user_id": str(row.UserLevel.user_id),
                    "user_name": _display_name(row.User.first_name, row.User.last_name),
                    "avatar": row.User.avatar,
                    "total_xp": row.UserLevel.total_xp or 0,
                    "level": level,
                    "rank_change": 0,
                }
            )
            rank += 1

        return leaderboard

    def get_weekly_leaderboard(
        self,
        limit: int = 100,
        offset: int = 0,
        user_timezone: str = DEFAULT_TIMEZONE,
    ) -> list[dict]:
        """Get weekly leaderboard ranked by XP earned in the current local week."""
        return self._get_period_leaderboard(
            period="weekly",
            limit=limit,
            offset=offset,
            user_timezone=user_timezone,
        )

    def get_monthly_leaderboard(
        self,
        limit: int = 100,
        offset: int = 0,
        user_timezone: str = DEFAULT_TIMEZONE,
    ) -> list[dict]:
        """Get monthly leaderboard ranked by XP earned in the current local month."""
        return self._get_period_leaderboard(
            period="monthly",
            limit=limit,
            offset=offset,
            user_timezone=user_timezone,
        )

    def get_tenant_leaderboard(
        self,
        tenant_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """Get tenant-scoped leaderboard ranked by total XP."""
        from uuid import UUID
        from common.models import UserLevel, User

        result = self.db.execute(
            select(UserLevel, User)
            .join(User, UserLevel.user_id == User.id)
            .where(User.tenant_id == UUID(tenant_id))
            .order_by(desc(UserLevel.total_xp))
            .limit(limit)
            .offset(offset)
        )

        leaderboard = []
        rank = offset + 1
        for row in result:
            level = self._calculate_level(row.UserLevel.total_xp or 0)
            leaderboard.append(
                {
                    "rank": rank,
                    "user_id": str(row.UserLevel.user_id),
                    "user_name": _display_name(row.User.first_name, row.User.last_name),
                    "avatar": row.User.avatar,
                    "total_xp": row.UserLevel.total_xp or 0,
                    "level": level,
                    "rank_change": 0,
                }
            )
            rank += 1

        return leaderboard

    def get_tenant_weekly_leaderboard(
        self,
        tenant_id: str,
        limit: int = 100,
        offset: int = 0,
        user_timezone: str = DEFAULT_TIMEZONE,
    ) -> list[dict]:
        """Get tenant weekly leaderboard."""
        return self._get_period_leaderboard(
            period="weekly",
            limit=limit,
            offset=offset,
            user_timezone=user_timezone,
            tenant_id=tenant_id,
        )

    def get_tenant_monthly_leaderboard(
        self,
        tenant_id: str,
        limit: int = 100,
        offset: int = 0,
        user_timezone: str = DEFAULT_TIMEZONE,
    ) -> list[dict]:
        """Get tenant monthly leaderboard."""
        return self._get_period_leaderboard(
            period="monthly",
            limit=limit,
            offset=offset,
            user_timezone=user_timezone,
            tenant_id=tenant_id,
        )

    def get_team_leaderboard(
        self,
        team_id: str,
        limit: int = 100,
        offset: int = 0,
    ) -> list[dict]:
        """Get leaderboard for a specific team."""
        from common.models import UserLevel, User, TeamMembership

        result = self.db.execute(
            select(UserLevel, User)
            .join(User, UserLevel.user_id == User.id)
            .join(TeamMembership, User.id == TeamMembership.user_id)
            .where(TeamMembership.team_id == team_id)
            .order_by(desc(UserLevel.total_xp))
            .limit(limit)
            .offset(offset)
        )

        leaderboard = []
        rank = offset + 1
        for row in result:
            level = self._calculate_level(row.UserLevel.total_xp or 0)
            leaderboard.append(
                {
                    "rank": rank,
                    "user_id": str(row.UserLevel.user_id),
                    "user_name": _display_name(row.User.first_name, row.User.last_name),
                    "avatar": row.User.avatar,
                    "total_xp": row.UserLevel.total_xp or 0,
                    "level": level,
                    "rank_change": 0,
                }
            )
            rank += 1

        return leaderboard

    def get_user_rank(self, user_id: str) -> Optional[dict]:
        """Get the rank of a specific user."""
        from common.models import UserLevel

        result = self.db.execute(select(UserLevel).order_by(desc(UserLevel.total_xp)))

        all_levels = result.scalars().all()

        rank = 1
        for level in all_levels:
            if str(level.user_id) == str(user_id):
                return {
                    "rank": rank,
                    "total_xp": level.total_xp or 0,
                    "level": self._calculate_level(level.total_xp or 0),
                }
            rank += 1

        return None

    def get_user_rank_by_tenant(self, user_id: str, tenant_id: str) -> Optional[dict]:
        """Get the rank of a specific user within a tenant."""
        from uuid import UUID
        from common.models import UserLevel, User

        result = self.db.execute(
            select(UserLevel, User)
            .join(User, UserLevel.user_id == User.id)
            .where(User.tenant_id == UUID(tenant_id))
            .order_by(desc(UserLevel.total_xp))
        )

        all_rows = result.all()

        rank = 1
        for row in all_rows:
            if str(row.UserLevel.user_id) == str(user_id):
                return {
                    "rank": rank,
                    "total_xp": row.UserLevel.total_xp or 0,
                    "level": self._calculate_level(row.UserLevel.total_xp or 0),
                }
            rank += 1

        return None

    def get_leaderboard_counts(self) -> dict:
        """Get total count of users on leaderboard."""
        from common.models import UserLevel

        result = self.db.execute(select(func.count()).select_from(UserLevel))
        return {"total": result.scalar() or 0}

    def _get_period_leaderboard(
        self,
        period: str,
        limit: int,
        offset: int,
        user_timezone: str,
        tenant_id: Optional[str] = None,
    ) -> list[dict]:
        """Rank users by XP earned since the start of the current local period."""
        from uuid import UUID

        from common.models import User, UserLevel, XPTransaction

        period_start = get_period_start_utc(period, user_timezone)

        query = (
            select(
                User.id.label("user_id"),
                User.first_name.label("first_name"),
                User.last_name.label("last_name"),
                User.avatar.label("avatar"),
                func.coalesce(func.sum(XPTransaction.amount), 0).label("period_xp"),
                UserLevel.total_xp.label("all_time_total_xp"),
            )
            .join(User, XPTransaction.user_id == User.id)
            .outerjoin(UserLevel, UserLevel.user_id == User.id)
            .where(XPTransaction.created_at >= period_start)
            .group_by(
                User.id,
                User.first_name,
                User.last_name,
                User.avatar,
                UserLevel.total_xp,
            )
            .order_by(desc("period_xp"), User.first_name, User.last_name)
            .limit(limit)
            .offset(offset)
        )

        if tenant_id:
            query = query.where(User.tenant_id == UUID(tenant_id))

        rows = self.db.execute(query).all()

        leaderboard = []
        rank = offset + 1
        for row in rows:
            leaderboard.append(
                {
                    "rank": rank,
                    "user_id": str(row.user_id),
                    "user_name": _display_name(row.first_name, row.last_name),
                    "avatar": row.avatar,
                    "total_xp": int(row.period_xp or 0),
                    "level": self._calculate_level(int(row.all_time_total_xp or 0)),
                    "rank_change": 0,
                }
            )
            rank += 1

        return leaderboard

    def _calculate_level(self, total_xp: int) -> int:
        """Calculate level from total XP."""
        if total_xp < 100:
            return 1
        return int(1 + (total_xp / 500) ** 0.6)
