"""Realtime notification flow tests."""

import pytest
from fastapi.testclient import TestClient

from common.auth import create_access_token
from services.notifications import main


def test_websocket_rejects_wrong_user(monkeypatch):
    """A user cannot subscribe to another user's realtime channel."""
    monkeypatch.setenv("NOTIFICATIONS_DISABLE_CONSUMER", "1")
    token = create_access_token(
        user_id="user-1",
        email="user@example.com",
        role="TeamMember",
        auth_provider="local",
        tenant_id="tenant-1",
    )

    with TestClient(main.app) as client:
        with pytest.raises(Exception):
            with client.websocket_connect(f"/ws/user-2?token={token}"):
                pass


def test_gamification_event_is_pushed_to_connected_user(monkeypatch):
    """Gamification events are pushed to the authenticated websocket client."""
    monkeypatch.setenv("NOTIFICATIONS_DISABLE_CONSUMER", "1")
    token = create_access_token(
        user_id="user-1",
        email="user@example.com",
        role="TeamMember",
        auth_provider="local",
        tenant_id="tenant-1",
    )

    with TestClient(main.app) as client:
        with client.websocket_connect(f"/ws/user-1?token={token}") as websocket:
            connected = websocket.receive_json()
            assert connected["event"] == "connected"

            main.handle_learning_event(
                {
                    "event": "xp.gained",
                    "userId": "user-1",
                    "amount": 50,
                    "action": "lesson_complete",
                    "timestamp": "2026-04-24T10:00:00Z",
                }
            )

            realtime_message = websocket.receive_json()
            assert realtime_message["channel"] == "gamification"
            assert realtime_message["event"] == "xp.gained"
            assert realtime_message["data"]["amount"] == 50
