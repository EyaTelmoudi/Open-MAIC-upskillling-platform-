from __future__ import annotations

import os
import traceback

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from agno.os import AgentOS

from .event_types import EventType, LearnerMemoryEventInput
from .workflow import learner_memory_workflow

base_app = FastAPI(title="Learner Memory AgentOS Service")


@base_app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"success": True, "service": "learner-memory-agentos"}, status_code=200)


@base_app.post("/v1/learner-memory/events")
async def process_event(payload: LearnerMemoryEventInput) -> JSONResponse:
    try:
        result = learner_memory_workflow.run(input=payload.model_dump())
        content = result.content if isinstance(result.content, dict) else {"success": False}
        return JSONResponse(content, status_code=200 if bool(content.get("success")) else 500)
    except Exception as error:
        traceback.print_exc()
        return JSONResponse(
            {
                "success": False,
                "workflowName": "learner-memory-agent",
                "action": "agent_os_service_exception",
                "tenantId": payload.tenantId,
                "userId": payload.userId,
                "courseId": payload.courseId,
                "triggerEvent": payload.eventType.value,
                "error": f"{type(error).__name__}: {error}",
            },
            status_code=500,
        )


@base_app.post("/v1/learner-memory/coaching-turn")
async def process_coaching_turn(payload: LearnerMemoryEventInput) -> JSONResponse:
    normalized = payload.model_copy(update={"eventType": EventType.QUESTION})
    return await process_event(normalized)


@base_app.post("/v1/learner-memory/quiz-result")
async def process_quiz_result(payload: LearnerMemoryEventInput) -> JSONResponse:
    normalized = payload.model_copy(update={"eventType": EventType.QUIZ_RESULT})
    return await process_event(normalized)


@base_app.post("/v1/learner-memory/lesson-completion")
async def process_lesson_completion(payload: LearnerMemoryEventInput) -> JSONResponse:
    normalized = payload.model_copy(update={"eventType": EventType.LESSON_COMPLETION})
    return await process_event(normalized)


@base_app.post("/v1/learner-memory/session-summary")
async def process_session_summary(payload: LearnerMemoryEventInput) -> JSONResponse:
    normalized = payload.model_copy(update={"eventType": EventType.SESSION_SUMMARY})
    return await process_event(normalized)


agent_os = AgentOS(
    id=os.getenv("LEARNER_MEMORY_AGENTOS_ID", "openmaic-learner-memory-agentos"),
    name="Learner Memory AgentOS",
    description="AgentOS runtime for the separate Learner Memory agent workflow.",
    version=os.getenv("LEARNER_MEMORY_AGENTOS_VERSION", "0.1.0"),
    workflows=[learner_memory_workflow],
    base_app=base_app,
    cors_allowed_origins=[
        "https://os.agno.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    telemetry=False,
)

app = agent_os.get_app()

