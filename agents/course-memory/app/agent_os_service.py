from __future__ import annotations

import asyncio
import json
import os
import subprocess
import sys
from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import JSONResponse
import httpx

from agno.os import AgentOS

COMMON_SRC = Path(__file__).resolve().parents[3] / "upskilling_platform" / "packages" / "common" / "src"
if str(COMMON_SRC) not in sys.path:
    sys.path.insert(0, str(COMMON_SRC))

from .workflow import CourseMemoryAssemblyInput, course_memory_workflow


def _log(message: str) -> None:
    print(message, file=sys.stderr)


_background_tasks: set[asyncio.Task[None]] = set()


def _resolve_system_python() -> str:
    if os.name == "nt":
        candidate = Path(sys.base_prefix) / "python.exe"
        if candidate.exists():
            return str(candidate)
    else:
        candidate = Path(sys.base_prefix) / "bin" / "python3"
        if candidate.exists():
            return str(candidate)
    return "python"


def _publish_course_memory_event_via_fallback_python(message: dict[str, object]) -> None:
    publish_script = """
import json, os, sys
import pika
from pika import BasicProperties, DeliveryMode

message = json.loads(sys.argv[1])
url = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672/")
params = pika.URLParameters(url)
connection = pika.BlockingConnection(params)
channel = connection.channel()
channel.exchange_declare(exchange="learning.exchange", exchange_type="topic", durable=True)
channel.queue_declare(queue="learning.notifications", durable=True)
channel.queue_bind(queue="learning.notifications", exchange="learning.exchange", routing_key="learning.notifications")
channel.basic_publish(
    exchange="learning.exchange",
    routing_key="learning.notifications",
    body=json.dumps(message).encode("utf-8"),
    properties=BasicProperties(
        delivery_mode=DeliveryMode.Persistent,
        content_type="application/json",
    ),
)
connection.close()
"""
    subprocess.run(
        [_resolve_system_python(), "-c", publish_script, json.dumps(message)],
        check=True,
        capture_output=True,
        text=True,
    )


def _publish_course_memory_event(message: dict[str, object]) -> None:
    try:
        from common.messaging import RabbitMQClient

        rabbitmq = RabbitMQClient()
        try:
            rabbitmq.publish(
                exchange="learning",
                routing_key="learning.notifications",
                message=message,
            )
        finally:
            rabbitmq.close()
    except ModuleNotFoundError as exc:
        if exc.name != "pika":
            raise
        _publish_course_memory_event_via_fallback_python(message)


async def _watch_hindsight_operation(
    *,
    course_id: str,
    bank_id: str,
    operation_id: str,
    requester_user_id: str | None,
    requester_name: str | None,
    hindsight_url: str,
    hindsight_api_key: str | None,
) -> None:
    headers: dict[str, str] = {}
    if hindsight_api_key:
        headers["Authorization"] = f"Bearer {hindsight_api_key}"

    status_url = f"{hindsight_url}/v1/default/banks/{bank_id}/operations/{operation_id}"
    _log(
        f"[Agno Course Memory Agent] Watching Hindsight operation {operation_id} for course {course_id}."
    )

    timeout = httpx.Timeout(15.0)
    async with httpx.AsyncClient(timeout=timeout) as client:
        while True:
            try:
                response = await client.get(status_url, headers=headers)
            except Exception as exc:
                _log(
                    f"[Agno Course Memory Agent] Hindsight operation watch retry for course {course_id}: {exc}"
                )
                await asyncio.sleep(5)
                continue

            if response.status_code >= 400:
                _log(
                    f"[Agno Course Memory Agent] Hindsight operation watch stopped for course {course_id}. "
                    f"Status endpoint returned {response.status_code}: {response.text}"
                )
                return

            data = response.json()
            status = str(data.get("status") or "").strip().lower()

            if status == "completed":
                event_payload = {
                    "event": "course_memory.completed",
                    "userId": requester_user_id,
                    "requester": requester_name,
                    "courseId": course_id,
                    "bankId": bank_id,
                    "operationId": operation_id,
                    "timestamp": response.headers.get("date"),
                }
                await asyncio.to_thread(_publish_course_memory_event, event_payload)
                _log(
                    f"[Agno Course Memory Agent] Hindsight finished processing course {course_id} successfully. "
                    f"Bank: {bank_id}. Operation: {operation_id}."
                )
                return

            if status in {"failed", "cancelled"}:
                event_payload = {
                    "event": "course_memory.failed",
                    "userId": requester_user_id,
                    "requester": requester_name,
                    "courseId": course_id,
                    "bankId": bank_id,
                    "operationId": operation_id,
                    "status": status,
                    "error": data.get("error_message") or "unknown",
                    "timestamp": response.headers.get("date"),
                }
                await asyncio.to_thread(_publish_course_memory_event, event_payload)
                _log(
                    f"[Agno Course Memory Agent] Hindsight processing failed for course {course_id}. "
                    f"Bank: {bank_id}. Operation: {operation_id}. Status: {status}. "
                    f"Error: {data.get('error_message') or 'unknown'}"
                )
                return

            await asyncio.sleep(5)


base_app = FastAPI(title="Course Memory AgentOS Service")


@base_app.get("/health")
async def health() -> JSONResponse:
    _log("[Agno Course Memory AgentOS] Health check received.")
    return JSONResponse({"success": True, "service": "course-memory-agentos"}, status_code=200)


@base_app.post("/v1/course-memory/assemble")
async def assemble_course_memory(payload: CourseMemoryAssemblyInput) -> JSONResponse:
    _log(
        f"[Agno Course Memory Agent] Starting action 'retain_published_course_knowledge' for course {payload.courseId}."
    )
    result = course_memory_workflow.run(input=payload.model_dump())
    content = result.content if isinstance(result.content, dict) else {"success": False}
    if bool(content.get("success")) and bool(content.get("isAsync")) and content.get("operationId") and content.get("bankId"):
        task = asyncio.create_task(
            _watch_hindsight_operation(
                course_id=payload.courseId,
                bank_id=str(content["bankId"]),
                operation_id=str(content["operationId"]),
                requester_user_id=str(content.get("requesterUserId") or payload.requesterUserId or ""),
                requester_name=str(content.get("requesterName") or payload.requesterName or ""),
                hindsight_url=payload.hindsightApiUrl or "http://127.0.0.1:8888",
                hindsight_api_key=payload.hindsightApiKey,
            )
        )
        _background_tasks.add(task)
        task.add_done_callback(_background_tasks.discard)
    _log(
        f"[Agno Course Memory Agent] Finished action 'retain_published_course_knowledge' for course {payload.courseId}."
    )
    return JSONResponse(content, status_code=200 if bool(content.get("success")) else 500)


agent_os = AgentOS(
    name="Course Memory AgentOS",
    description="AgentOS runtime for the separate Course Memory Agent workflow.",
    workflows=[course_memory_workflow],
    base_app=base_app,
    telemetry=False,
)

app = agent_os.get_app()
