"""Timezone-aware gamification tests for Sprint 2."""

from datetime import date, datetime, timezone
from types import SimpleNamespace

from services.learning.gamification.streaks import StreakManager
from services.learning.gamification.utils import get_period_start_utc, get_user_local_date


def test_get_user_local_date_uses_user_timezone():
    """Late-night UTC activity maps to the correct local calendar day."""
    utc_timestamp = datetime(2026, 4, 23, 22, 30, tzinfo=timezone.utc)

    local_date = get_user_local_date("Africa/Tunis", now_utc=utc_timestamp)

    assert local_date == date(2026, 4, 23)


def test_get_period_start_utc_uses_local_week_boundary():
    """Weekly period boundaries are calculated from the user's local week start."""
    utc_timestamp = datetime(2026, 4, 26, 23, 30, tzinfo=timezone.utc)

    period_start = get_period_start_utc(
        "weekly",
        "Africa/Tunis",
        now_utc=utc_timestamp,
    )

    assert period_start.isoformat() == "2026-04-26T23:00:00+00:00"


def test_streak_manager_marks_today_using_timezone(mock_db, monkeypatch):
    """Streak status is evaluated against the user's local date."""
    streak_row = SimpleNamespace(
        current_streak=4,
        longest_streak=7,
        last_activity_date=date(2026, 4, 23),
    )
    execute_result = mock_db.execute.return_value
    execute_result.scalar_one_or_none.return_value = streak_row
    monkeypatch.setattr(
        "services.learning.gamification.streaks.get_user_local_date",
        lambda user_timezone: date(2026, 4, 23),
    )

    result = StreakManager(mock_db).get_streak_info("user-1", "Africa/Tunis")

    assert result["current_streak"] == 4
    assert result["is_active_today"] is True
