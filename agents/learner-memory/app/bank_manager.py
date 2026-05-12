from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any

import httpx

from .event_types import CoachingEvent

DEFAULT_HINDSIGHT_URL = os.getenv("HINDSIGHT_API_URL", "http://127.0.0.1:8888")
DEFAULT_HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY", "")


class LearnerBankManager:
    def __init__(self, tenant_id: str, user_id: str):
        self.bank_id = f"tenant:{tenant_id}:user:{user_id}:coach"
        self.hindsight_url = DEFAULT_HINDSIGHT_URL.rstrip("/")
        self.hindsight_api_key = DEFAULT_HINDSIGHT_API_KEY

    def retain_event(self, event: CoachingEvent) -> dict[str, Any]:
        headers = {"Content-Type": "application/json"}
        if self.hindsight_api_key:
            headers["Authorization"] = f"Bearer {self.hindsight_api_key}"

        payload = {
            "items": [
                {
                    "content": event.content,
                    "context": event.build_context_string(),
                    "timestamp": (event.timestamp or datetime.now(timezone.utc)).isoformat(),
                    "tags": [
                        f"tenant:{event.tenant_id}",
                        f"course:{event.course_id}",
                        f"type:{event.event_type.value}",
                    ],
                }
            ],
            "async": True,
        }

        with httpx.Client(timeout=30.0, trust_env=False) as client:
            response = client.post(
                f"{self.hindsight_url}/v1/default/banks/{self.bank_id}/memories",
                headers=headers,
                json=payload,
            )
            response.raise_for_status()
            return response.json()

