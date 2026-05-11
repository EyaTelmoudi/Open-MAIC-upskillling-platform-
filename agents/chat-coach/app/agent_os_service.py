from __future__ import annotations

import os
import traceback

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from agno.os import AgentOS

from .workflow import ChatCoachQuestionInput, chat_coach_workflow

base_app = FastAPI(title="Chat Coach AgentOS Service")


@base_app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"success": True, "service": "chat-coach-agentos"}, status_code=200)


@base_app.post("/v1/chat-coach/ask")
async def ask_chat_coach(payload: ChatCoachQuestionInput) -> JSONResponse:
    try:
        result = chat_coach_workflow.run(input=payload.model_dump())
        content = result.content if isinstance(result.content, dict) else {"success": False}
        return JSONResponse(content, status_code=200 if bool(content.get("success")) else 500)
    except Exception as error:
        traceback.print_exc()
        return JSONResponse(
            {
                "success": False,
                "workflowName": "chat-coach-agent",
                "action": "agent_os_service_exception",
                "tenantId": payload.tenantId,
                "courseId": payload.courseId,
                "userId": payload.userId,
                "question": payload.question,
                "error": f"{type(error).__name__}: {error}",
            },
            status_code=500,
        )


agent_os = AgentOS(
    id=os.getenv("CHAT_COACH_AGENTOS_ID", "openmaic-chat-coach-agentos"),
    name="Chat Coach AgentOS",
    description="AgentOS runtime for the separate Chat Coach agent workflow.",
    version=os.getenv("CHAT_COACH_AGENTOS_VERSION", "0.1.0"),
    workflows=[chat_coach_workflow],
    base_app=base_app,
    cors_allowed_origins=[
        "https://os.agno.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    telemetry=False,
)

app = agent_os.get_app()
