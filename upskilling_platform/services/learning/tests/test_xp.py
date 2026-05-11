"""Focused unit tests for XP awarding."""

from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

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


def test_course_complete_xp_is_not_awarded_twice_for_same_course(mock_db):
    rabbitmq = MagicMock()
    course_id = uuid4()
    existing_transaction = SimpleNamespace(
        user_id="user-1",
        reason=f"Completed course AI Foundations ({course_id})",
    )
    mock_db.execute.return_value.scalar_one_or_none.return_value = existing_transaction

    transaction = XPManager(mock_db, rabbitmq).award_xp(
        user_id="user-1",
        action="course_complete",
        reason=f"Completed course AI Foundations ({course_id})",
        explicit_amount=350,
    )

    assert transaction is None
    mock_db.add.assert_not_called()
    rabbitmq.publish.assert_not_called()


def test_perfect_score_xp_is_not_awarded_twice_for_same_assessment(mock_db):
    rabbitmq = MagicMock()
    assessment_id = uuid4()
    existing_transaction = SimpleNamespace(
        user_id="user-1",
        reason=f"Perfect score on Quiz 1 ({assessment_id})",
    )
    mock_db.execute.return_value.scalar_one_or_none.return_value = existing_transaction

    transaction = XPManager(mock_db, rabbitmq).award_xp(
        user_id="user-1",
        action="perfect_score",
        reason=f"Perfect score on Quiz 1 ({assessment_id})",
    )

    assert transaction is None
    mock_db.add.assert_not_called()
    rabbitmq.publish.assert_not_called()
