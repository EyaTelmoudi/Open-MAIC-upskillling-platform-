from __future__ import annotations

import os
import traceback

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from agno.os import AgentOS

from .workflow import SoloChallengeStartInput, solo_challenge_workflow

base_app = FastAPI(title="Solo Challenge AgentOS Service")


@base_app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"success": True, "service": "solo-challenge-agentos"}, status_code=200)


@base_app.post("/v1/solo-challenge/start")
async def start_solo_challenge(payload: SoloChallengeStartInput) -> JSONResponse:
    try:
        result = solo_challenge_workflow.run(input=payload.model_dump())
        content = result.content if isinstance(result.content, dict) else {"success": False}
        return JSONResponse(content, status_code=200 if bool(content.get("success")) else 500)
    except Exception as error:
        traceback.print_exc()
        return JSONResponse(
            {
                "success": False,
                "workflowName": "solo-challenge-agent",
                "action": "agent_os_service_exception",
                "tenantId": payload.tenantId,
                "userId": payload.userId,
                "role": payload.role,
                "source": payload.source,
                "pagePath": payload.pagePath,
                "error": f"{type(error).__name__}: {error}",
            },
            status_code=500,
        )


agent_os = AgentOS(
    id=os.getenv("SOLO_CHALLENGE_AGENTOS_ID", "openmaic-solo-challenge-agentos"),
    name="Solo Challenge AgentOS",
    description="AgentOS runtime for the separate Solo Challenge workflow.",
    version=os.getenv("SOLO_CHALLENGE_AGENTOS_VERSION", "0.1.0"),
    workflows=[solo_challenge_workflow],
    base_app=base_app,
    cors_allowed_origins=[
        "https://os.agno.com",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    telemetry=False,
)

app = agent_os.get_app()
