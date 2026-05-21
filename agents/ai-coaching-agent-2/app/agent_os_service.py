from __future__ import annotations

import os
import traceback

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from agno.os import AgentOS

from .workflow import AICoachingAgent2AskInput, ai_coaching_agent_2_workflow

base_app = FastAPI(title="AI Coaching Agent 2 AgentOS Service")


@base_app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"success": True, "service": "ai-coaching-agent-2-agentos"}, status_code=200)


@base_app.post("/v1/ai-coaching-agent-2/ask")
async def ask_ai_coaching_agent_2(payload: AICoachingAgent2AskInput) -> JSONResponse:
    try:
        result = ai_coaching_agent_2_workflow.run(input=payload.model_dump())
        content = result.content if isinstance(result.content, dict) else {"success": False}
        return JSONResponse(content, status_code=200 if bool(content.get("success")) else 500)
    except Exception as error:
        traceback.print_exc()
        return JSONResponse(
            {
                "success": False,
                "workflowName": "ai-coaching-agent-2",
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
    id=os.getenv("AI_COACHING_AGENT_2_AGENTOS_ID", "openmaic-ai-coaching-agent-2-agentos"),
    name="AI Coaching Agent 2 AgentOS",
    description="AgentOS runtime for AI Coaching Agent 2 backed by Hindsight reflect.",
    version=os.getenv("AI_COACHING_AGENT_2_AGENTOS_VERSION", "0.1.0"),
    workflows=[ai_coaching_agent_2_workflow],
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
