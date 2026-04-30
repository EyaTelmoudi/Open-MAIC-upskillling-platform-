"""Focused badge manager tests."""

from unittest.mock import MagicMock

from services.learning.gamification.badges import BadgeManager


def test_check_and_award_badges_publishes_event(monkeypatch, mock_db):
    rabbitmq = MagicMock()
    manager = BadgeManager(mock_db, rabbitmq)

    monkeypatch.setattr(manager, "_has_badge", lambda user_id, badge_id: False)

    awarded = manager.check_and_award_badges(
        user_id="user-1",
        action="lesson_complete",
        count=1,
    )

    assert awarded
    assert awarded[0]["badge_id"] == "first_steps"
    rabbitmq.publish.assert_called()
    _, kwargs = rabbitmq.publish.call_args
    assert kwargs["message"]["event"] == "badge.earned"


def test_check_and_award_badges_skips_existing_badge(monkeypatch, mock_db):
    rabbitmq = MagicMock()
    manager = BadgeManager(mock_db, rabbitmq)

    monkeypatch.setattr(manager, "_has_badge", lambda user_id, badge_id: True)

    awarded = manager.check_and_award_badges(
        user_id="user-1",
        action="lesson_complete",
        count=1,
    )

    assert awarded == []
    rabbitmq.publish.assert_not_called()
