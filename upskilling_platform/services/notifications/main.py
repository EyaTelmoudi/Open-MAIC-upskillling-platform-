"""Notification Service for the Upskilling Platform.

Consumes events from RabbitMQ and delivers real-time notifications to users.
"""

import asyncio
import json
import logging
import os
import threading
from collections import defaultdict
from typing import Any

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from common.auth import decode_token

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="Notification Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

SERVICE_PORT = os.getenv("NOTIFICATIONS_SERVICE_PORT", "8004")

# RabbitMQ connection
RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
REALTIME_QUEUE = "learning.gamification"
REALTIME_ROUTING_KEY = "learning.gamification"


class RealtimeConnectionManager:
    """Tracks websocket connections per user."""

    def __init__(self) -> None:
        self._connections: dict[str, set[WebSocket]] = defaultdict(set)
        self._lock = asyncio.Lock()

    async def connect(self, user_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        async with self._lock:
            self._connections[user_id].add(websocket)

    async def disconnect(self, user_id: str, websocket: WebSocket) -> None:
        async with self._lock:
            user_connections = self._connections.get(user_id)
            if not user_connections:
                return
            user_connections.discard(websocket)
            if not user_connections:
                self._connections.pop(user_id, None)

    async def send_to_user(self, user_id: str, payload: dict[str, Any]) -> None:
        async with self._lock:
            user_connections = list(self._connections.get(user_id, set()))

        stale_connections: list[WebSocket] = []
        for websocket in user_connections:
            try:
                await websocket.send_json(payload)
            except Exception:
                stale_connections.append(websocket)

        for websocket in stale_connections:
            await self.disconnect(user_id, websocket)


manager = RealtimeConnectionManager()
event_loop: asyncio.AbstractEventLoop | None = None


def get_rabbitmq_connection():
    """Get RabbitMQ connection."""
    import pika

    params = pika.URLParameters(RABBITMQ_URL)
    return pika.BlockingConnection(params)


def send_onboarding_notification(message: dict[str, Any]) -> None:
    """Send notification to tenant admin when user completes onboarding.

    This notifies the admin that a new user has completed onboarding
    and is awaiting role confirmation.

    Args:
        message: Event message with user details.
    """
    user_id = message.get("userId")
    email = message.get("email")
    role = message.get("role", "TeamMember")
    department = message.get("department", "N/A")
    timestamp = message.get("timestamp", "")

    # In production, this would:
    # 1. Look up the user's tenant
    # 2. Find the tenant admin(s)
    # 3. Send email/push notification to admin

    notification = {
        "type": "onboarding_completed",
        "title": "New User Completed Onboarding",
        "message": f"User {email} (role: {role}, department: {department}) has completed onboarding and is awaiting role confirmation.",
        "user_id": user_id,
        "target_role": "Admin",
        "created_at": timestamp,
    }

    # Log for now - in production would send email/push
    logger.info("Prepared onboarding notification for tenant admin")

    # TODO: Store notification in DB for the admin to see
    # TODO: Send push notification via WebSocket


def publish_realtime_notification(message: dict[str, Any]) -> None:
    """Push a RabbitMQ event to the connected user in real time."""
    global event_loop

    user_id = message.get("userId")
    if not user_id or event_loop is None:
        return

    payload = {
        "channel": "gamification",
        "event": message.get("event"),
        "userId": user_id,
        "data": message,
    }

    future = asyncio.run_coroutine_threadsafe(
        manager.send_to_user(str(user_id), payload),
        event_loop,
    )
    try:
        future.result(timeout=5)
    except Exception:
        logger.exception("Failed to dispatch realtime notification")


def handle_auth_event(message: dict[str, Any]) -> None:
    """Handle authentication events.

    Args:
        message: Event message.
    """
    event_type = message.get("event")

    if event_type == "user.onboarding.completed":
        send_onboarding_notification(message)
    elif event_type == "user.created":
        # Could send welcome email here
        logger.info("Received user.created event")
    elif event_type == "user.logged_in":
        # Update last login (optional)
        logger.info("Received user.logged_in event")
    elif event_type == "admin.invited":
        send_admin_invitation_email(message)
    elif event_type == "tenant.suspended":
        send_tenant_suspension_notification(message)


def handle_learning_event(message: dict[str, Any]) -> None:
    """Handle learning-domain realtime events."""
    event_type = message.get("event")
    if event_type in {"xp.gained", "level.up", "badge.earned", "streak.update"}:
        publish_realtime_notification(message)


def send_admin_invitation_email(message: dict[str, Any]) -> None:
    """Send admin invitation email with magic link.

    Args:
        message: Event message with admin invitation details.
    """
    admin_id = message.get("adminId")
    email = message.get("email")
    first_name = message.get("firstName", "")
    last_name = message.get("lastName", "")
    tenant_name = message.get("tenantName", "the company")
    invitation_token = message.get("invitationToken", "")
    expires_at = message.get("expiresAt", "")
    invited_by = message.get("invitedBy", "Super Admin")

    invitation_link = f"https://platform.example.com/invite/{invitation_token}"

    notification = {
        "type": "admin_invitation",
        "title": "You've been invited as an Admin",
        "message": f"{first_name} {last_name} has been invited to join the platform as an admin for {tenant_name}.",
        "email": email,
        "invitation_link": invitation_link,
        "expires_at": expires_at,
        "invited_by": invited_by,
    }

    logger.info("Prepared admin invitation notification")


def send_tenant_suspension_notification(message: dict[str, Any]) -> None:
    """Send notification to tenant admin when their tenant is suspended.

    Args:
        message: Event message with tenant suspension details.
    """
    tenant_id = message.get("tenantId")
    tenant_name = message.get("tenantName", "your company")
    timestamp = message.get("timestamp", "")

    notification = {
        "type": "tenant_suspended",
        "title": "Account Suspended",
        "message": f"Your company account ({tenant_name}) has been suspended by the platform administrator.",
        "tenant_id": tenant_id,
        "created_at": timestamp,
    }

    # Log for now - in production would send email to all tenant admins
    logger.info("Prepared tenant suspension notification")


def consume_messages():
    """Consume messages from RabbitMQ queues."""
    import pika

    logger.info("Starting message consumer...")

    try:
        connection = get_rabbitmq_connection()
        channel = connection.channel()

        # Declare queues
        channel.queue_declare(queue="auth.onboarding", durable=True)
        channel.queue_declare(queue="auth.notifications", durable=True)
        channel.queue_declare(queue="auth.admin-invitations", durable=True)
        channel.queue_declare(queue="identity.suspensions", durable=True)
        channel.queue_declare(queue=REALTIME_QUEUE, durable=True)

        # Bind queues to exchanges
        channel.exchange_declare(exchange="identity.exchange", exchange_type="topic", durable=True)
        channel.queue_bind(exchange="identity.exchange", queue="identity.suspensions", routing_key="tenant.suspended")
        channel.exchange_declare(exchange="learning.exchange", exchange_type="topic", durable=True)
        channel.queue_bind(
            exchange="learning.exchange",
            queue=REALTIME_QUEUE,
            routing_key=REALTIME_ROUTING_KEY,
        )

        def callback(ch, method, properties, body):
            try:
                import json

                message = json.loads(body.decode("utf-8"))
                logger.info(f"Received: {method.routing_key}")

                if method.routing_key == "auth.onboarding":
                    handle_auth_event(message)
                elif method.routing_key == "auth.notifications":
                    handle_auth_event(message)
                elif method.routing_key == "admin.invited":
                    handle_auth_event(message)
                elif method.routing_key == "tenant.suspended":
                    handle_auth_event(message)
                elif method.routing_key == REALTIME_ROUTING_KEY:
                    handle_learning_event(message)

                ch.basic_ack(delivery_tag=method.delivery_tag)
            except Exception:
                logger.exception("Error processing message")
                ch.basic_nack(delivery_tag=method.delivery_tag, requeue=False)

        channel.basic_consume(
            queue="auth.onboarding",
            on_message_callback=callback,
            auto_ack=False,
        )
        channel.basic_consume(
            queue="auth.notifications",
            on_message_callback=callback,
            auto_ack=False,
        )
        channel.basic_consume(
            queue="auth.admin-invitations",
            on_message_callback=callback,
            auto_ack=False,
        )
        channel.basic_consume(
            queue="identity.suspensions",
            on_message_callback=callback,
            auto_ack=False,
        )
        channel.basic_consume(
            queue=REALTIME_QUEUE,
            on_message_callback=callback,
            auto_ack=False,
        )

        logger.info("Waiting for messages...")
        channel.start_consuming()
    except Exception:
        logger.exception("Consumer error")
        # In production, implement retry logic


# Start consumer in background thread
def start_consumer():
    """Start the RabbitMQ consumer in a background thread."""
    consumer_thread = threading.Thread(target=consume_messages, daemon=True)
    consumer_thread.start()
    logger.info("Consumer thread started")


@app.on_event("startup")
async def startup_event():
    """Start consumer on startup."""
    global event_loop
    event_loop = asyncio.get_running_loop()
    if os.getenv("NOTIFICATIONS_DISABLE_CONSUMER") == "1":
        logger.info("RabbitMQ consumer disabled for this process")
        return
    start_consumer()


@app.websocket("/ws/{user_id}")
async def websocket_notifications(websocket: WebSocket, user_id: str):
    """Authenticated realtime channel keyed by user id."""
    token = websocket.query_params.get("token")
    payload = decode_token(token) if token else None

    if payload is None or payload.get("sub") != user_id:
        await websocket.close(code=1008)
        return

    await manager.connect(user_id, websocket)
    try:
        await websocket.send_json(
            {
                "channel": "system",
                "event": "connected",
                "userId": user_id,
            }
        )
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        await manager.disconnect(user_id, websocket)
    except Exception:
        await manager.disconnect(user_id, websocket)
        raise


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "notifications", "port": SERVICE_PORT}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(SERVICE_PORT))
