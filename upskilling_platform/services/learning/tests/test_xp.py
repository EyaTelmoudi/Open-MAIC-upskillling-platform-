"""Focused unit tests for XP awarding."""

from types import SimpleNamespace
from unittest.mock import MagicMock

from services.learning.gamification.xp import XPManager


def test_award_xp_publishes_event(mock_db):
    rabbitmq = MagicMock()
    execute_result = mock_db.execute.return_value
    execute_result.scalar_one_or_none.return_value = None

    transaction = XPManager(mock_db, rabbitmq).award_xp(
        user_id="user-1",
        action="lesson_complete",
        reason="Lesson Completed",
    )

    assert transaction is not None
    rabbitmq.publish.assert_called_once()
    _, kwargs = rabbitmq.publish.call_args
    assert kwargs["exchange"] == "learning.exchange"
    assert kwargs["routing_key"] == "learning.gamification"
    assert kwargs["message"]["event"] == "xp.gained"
    assert kwargs["message"]["amount"] == 50


def test_award_xp_blocks_unknown_action(mock_db):
    rabbitmq = MagicMock()

    transaction = XPManager(mock_db, rabbitmq).award_xp(
        user_id="user-1",
        action="unknown_action",
    )

    assert transaction is None
    rabbitmq.publish.assert_not_called()
