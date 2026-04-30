"""Focused leaderboard manager tests."""

from types import SimpleNamespace
from uuid import uuid4

from services.learning.gamification.leaderboard import LeaderboardManager


def test_team_leaderboard_returns_rank_change_and_trimmed_names(mock_db):
    mock_db.execute.return_value = [
        SimpleNamespace(
            UserLevel=SimpleNamespace(user_id="user-1", total_xp=750),
            User=SimpleNamespace(first_name=" Aya ", last_name=" Telmoudi ", avatar=None),
        ),
        SimpleNamespace(
            UserLevel=SimpleNamespace(user_id="user-2", total_xp=90),
            User=SimpleNamespace(first_name="", last_name="", avatar=None),
        ),
    ]

    leaderboard = LeaderboardManager(mock_db).get_team_leaderboard("team-1")

    assert leaderboard[0]["rank"] == 1
    assert leaderboard[0]["user_name"] == "Aya Telmoudi"
    assert leaderboard[0]["rank_change"] == 0
    assert leaderboard[1]["user_name"] == "Unknown User"


def test_user_rank_by_tenant_returns_matching_user(mock_db):
    tenant_id = str(uuid4())
    mock_db.execute.return_value.all.return_value = [
        SimpleNamespace(UserLevel=SimpleNamespace(user_id="user-9", total_xp=1200)),
        SimpleNamespace(UserLevel=SimpleNamespace(user_id="user-1", total_xp=900)),
    ]

    rank = LeaderboardManager(mock_db).get_user_rank_by_tenant("user-1", tenant_id)

    assert rank == {"rank": 2, "total_xp": 900, "level": 2}
