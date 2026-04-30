"""Timezone-aware helpers for gamification."""

from __future__ import annotations

from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TIMEZONE = "Africa/Tunis"


def get_timezone(user_timezone: str | None) -> ZoneInfo:
    """Resolve a user timezone, falling back to the project default."""
    timezone_name = user_timezone or DEFAULT_TIMEZONE
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return ZoneInfo(DEFAULT_TIMEZONE)


def get_user_local_date(
    user_timezone: str | None,
    now_utc: datetime | None = None,
) -> date:
    """Return the current local date for a user timezone."""
    reference = now_utc or datetime.now(timezone.utc)
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=timezone.utc)
    return reference.astimezone(get_timezone(user_timezone)).date()


def get_period_start_utc(
    period: str,
    user_timezone: str | None,
    now_utc: datetime | None = None,
) -> datetime:
    """Return the UTC timestamp for the start of the current local period."""
    reference = now_utc or datetime.now(timezone.utc)
    if reference.tzinfo is None:
        reference = reference.replace(tzinfo=timezone.utc)

    local_now = reference.astimezone(get_timezone(user_timezone))
    local_date = local_now.date()

    if period == "weekly":
        start_date = local_date - timedelta(days=local_date.weekday())
    elif period == "monthly":
        start_date = local_date.replace(day=1)
    else:
        raise ValueError(f"Unsupported period: {period}")

    local_start = datetime.combine(start_date, time.min, tzinfo=local_now.tzinfo)
    return local_start.astimezone(timezone.utc)
