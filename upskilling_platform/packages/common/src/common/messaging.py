"""RabbitMQ client utilities for the Upskilling Platform."""

import json
import logging
import os
from typing import Any, Callable, Optional

import pika
from pika import BasicProperties, DeliveryMode
from pika.adapters.blocking_connection import BlockingChannel

logger = logging.getLogger(__name__)

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")

EXCHANGES = {
    "auth": "auth.exchange",
    "learning": "learning.exchange",
    "agents": "agents.exchange",
    "notifications": "notifications.exchange",
}

QUEUES = {
    "auth.notifications": {"exchange": "auth", "routing_key": "auth.notifications"},
    "auth.onboarding": {"exchange": "auth", "routing_key": "auth.onboarding"},
    "learning.progress": {"exchange": "learning", "routing_key": "learning.progress"},
    "learning.enrollment": {
        "exchange": "learning",
        "routing_key": "learning.enrollment",
    },
    "learning.gamification": {
        "exchange": "learning",
        "routing_key": "learning.gamification",
    },
    "learning.notifications": {
        "exchange": "learning",
        "routing_key": "learning.notifications",
    },
    "agents.tasks": {"exchange": "agents", "routing_key": "agents.tasks"},
    "agents.recall": {"exchange": "agents", "routing_key": "agents.recall"},
    "notif.email": {"exchange": "notifications", "routing_key": "notif.email"},
    "notif.push": {"exchange": "notifications", "routing_key": "notif.push"},
    "notif.websocket": {"exchange": "notifications", "routing_key": "notif.websocket"},
}


class RabbitMQClient:
    """Blocking RabbitMQ client for publishing and consuming messages."""

    def __init__(self, url: Optional[str] = None):
        self.url = url or RABBITMQ_URL
        self._connection: Optional[pika.BlockingConnection] = None
        self._channel: Optional[BlockingChannel] = None

    @property
    def channel(self) -> BlockingChannel:
        """Get or create a blocking channel."""
        if self._connection is None or self._connection.is_closed:
            params = pika.URLParameters(self.url)
            self._connection = pika.BlockingConnection(params)
        if self._channel is None or self._channel.is_closed:
            self._channel = self._connection.channel()
        return self._channel

    def setup_infrastructure(self) -> None:
        """Declare all exchanges and queues."""
        ch = self.channel

        # Declare exchanges
        for name, exchange in EXCHANGES.items():
            if name == "notifications":
                ch.exchange_declare(
                    exchange=exchange, exchange_type="fanout", durable=True
                )
            else:
                ch.exchange_declare(
                    exchange=exchange, exchange_type="topic", durable=True
                )

        # Declare queues and bind them
        for queue_name, config in QUEUES.items():
            ch.queue_declare(queue=queue_name, durable=True)
            exchange = EXCHANGES[config["exchange"]]
            if config["exchange"] == "notifications":
                ch.queue_bind(queue=queue_name, exchange=exchange)
            else:
                ch.queue_bind(
                    queue=queue_name,
                    exchange=exchange,
                    routing_key=config["routing_key"],
                )

        logger.info("RabbitMQ infrastructure declared successfully")

    def publish(
        self,
        exchange: str,
        routing_key: str,
        message: dict[str, Any],
    ) -> None:
        """Publish a message to an exchange.

        Args:
            exchange: Exchange name (use EXCHANGES keys like 'auth').
            routing_key: Routing key for the message.
            message: Dict payload (will be JSON-serialized).
        """
        ch = self.channel
        exchange_name = EXCHANGES.get(exchange, exchange)
        body = json.dumps(message).encode("utf-8")
        ch.basic_publish(
            exchange=exchange_name,
            routing_key=routing_key,
            body=body,
            properties=BasicProperties(
                delivery_mode=DeliveryMode.Persistent,
                content_type="application/json",
            ),
        )
        logger.debug("Published message to %s/%s", exchange_name, routing_key)

    def consume(
        self,
        queue: str,
        callback: Callable[[dict[str, Any]], None],
        auto_ack: bool = False,
    ) -> None:
        """Start consuming messages from a queue.

        Args:
            queue: Queue name (e.g. 'auth.notifications').
            callback: Function called with decoded message dict.
            auto_ack: If True, messages are auto-acknowledged.
        """
        ch = self.channel

        def _on_message(
            ch: BlockingChannel, method: Any, properties: Any, body: bytes
        ) -> None:
            try:
                message = json.loads(body.decode("utf-8"))
                callback(message)
                if not auto_ack:
                    ch.basic_ack(delivery_tag=method.delivery_tag)
            except Exception:
                logger.exception("Error processing message from %s", queue)
                if not auto_ack:
                    ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

        ch.basic_consume(
            queue=queue, on_message_callback=_on_message, auto_ack=auto_ack
        )
        logger.info("Consuming from queue: %s", queue)
        ch.start_consuming()

    def close(self) -> None:
        """Close the connection."""
        if self._connection and not self._connection.is_closed:
            self._connection.close()
            logger.info("RabbitMQ connection closed")
