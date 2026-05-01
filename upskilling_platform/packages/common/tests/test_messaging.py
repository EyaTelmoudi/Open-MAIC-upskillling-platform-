"""Tests for common.messaging module."""

import json
import os

import pytest

from common.messaging import EXCHANGES, QUEUES, RabbitMQClient

# Skip integration tests if RabbitMQ is not available
_rabbitmq_available = False
try:
    import pika

    params = pika.URLParameters(
        os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
    )
    conn = pika.BlockingConnection(params)
    conn.close()
    _rabbitmq_available = True
except Exception:
    pass


class TestExchanges:
    def test_all_exchanges_defined(self):
        expected = {"auth", "learning", "agents", "notifications"}
        assert set(EXCHANGES.keys()) == expected

    def test_exchange_names(self):
        assert EXCHANGES["auth"] == "auth.exchange"
        assert EXCHANGES["learning"] == "learning.exchange"
        assert EXCHANGES["agents"] == "agents.exchange"
        assert EXCHANGES["notifications"] == "notifications.exchange"


class TestQueues:
    def test_all_queues_defined(self):
        expected_queues = {
            "auth.notifications",
            "auth.onboarding",
            "learning.progress",
            "learning.enrollment",
            "learning.gamification",
            "learning.notifications",
            "agents.tasks",
            "agents.recall",
            "notif.email",
            "notif.push",
            "notif.websocket",
        }
        assert set(QUEUES.keys()) == expected_queues

    def test_queue_configs_have_exchange_and_routing_key(self):
        for queue_name, config in QUEUES.items():
            assert "exchange" in config, f"Queue {queue_name} missing exchange"
            assert "routing_key" in config, f"Queue {queue_name} missing routing_key"


class TestRabbitMQClient:
    def test_init_default_url(self):
        client = RabbitMQClient()
        assert "localhost" in client.url or "rabbitmq" in client.url

    def test_init_custom_url(self):
        client = RabbitMQClient(url="amqp://test:test@myhost:5672/")
        assert client.url == "amqp://test:test@myhost:5672/"


@pytest.mark.skipif(not _rabbitmq_available, reason="RabbitMQ not available")
class TestRabbitMQIntegration:
    """Integration tests against a live RabbitMQ instance."""

    def test_connection(self):
        client = RabbitMQClient()
        ch = client.channel
        assert ch.is_open
        client.close()

    def test_setup_infrastructure(self):
        client = RabbitMQClient()
        client.setup_infrastructure()
        ch = client.channel
        assert ch.is_open
        client.close()

    def test_publish_consume(self):
        client = RabbitMQClient()
        client.setup_infrastructure()

        test_message = {"event": "test", "data": "hello"}
        received = []

        client.publish("auth", "auth.notifications", test_message)
        client.close()

        client2 = RabbitMQClient()
        ch = client2.channel
        method, props, body = ch.basic_get("auth.notifications", auto_ack=True)
        if body:
            received.append(json.loads(body.decode("utf-8")))

        assert len(received) >= 1
        assert received[0]["event"] == "test"
        assert received[0]["data"] == "hello"
        client2.close()
