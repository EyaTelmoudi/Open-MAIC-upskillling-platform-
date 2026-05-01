from __future__ import annotations

import sys

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from agno.os import AgentOS

from .workflow import ChatCoachQuestionInput, chat_coach_workflow


def _log(message: str) -> None:
    print(message, file=sys.stderr)


base_app = FastAPI(title="Chat Coach AgentOS Service")


@base_app.get("/health")
async def health() -> JSONResponse:
    _log("[Agno Chat Coach AgentOS] Health check received.")
    return JSONResponse({"success": True, "service": "chat-coach-agentos"}, status_code=200)


@base_app.post("/v1/chat-coach/ask")
async def ask_chat_coach(payload: ChatCoachQuestionInput) -> JSONResponse:
    _log(
        f"[Agno Chat Coach Agent] Starting action 'ask_hindsight_course_question' for course {payload.courseId}."
    )
    result = chat_coach_workflow.run(input=payload.model_dump())
    content = result.content if isinstance(result.content, dict) else {"success": False}
    _log(
        f"[Agno Chat Coach Agent] Finished action 'ask_hindsight_course_question' for course {payload.courseId}."
    )
    return JSONResponse(content, status_code=200 if bool(content.get("success")) else 500)


agent_os = AgentOS(
    name="Chat Coach AgentOS",
    description="AgentOS runtime for the separate Chat Coach agent workflow.",
    workflows=[chat_coach_workflow],
    base_app=base_app,
    telemetry=False,
)

app = agent_os.get_app()
