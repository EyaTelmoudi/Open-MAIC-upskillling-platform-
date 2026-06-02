from __future__ import annotations

import os
import traceback

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from agno.os import AgentOS

from .workflow import (
    RecommendationFeedStartInput,
    RecommendationSkillGapStartInput,
    recommendation_feed_workflow,
    recommendation_skill_gap_workflow,
)

base_app = FastAPI(title="Recommendation AgentOS Service")


@base_app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"success": True, "service": "recommendation-agentos"}, status_code=200)


@base_app.post("/v1/recommendation/skill-gap/start")
async def start_skill_gap(payload: RecommendationSkillGapStartInput) -> JSONResponse:
    try:
        result = recommendation_skill_gap_workflow.run(input=payload.model_dump())
        content = result.content if isinstance(result.content, dict) else {"success": False}
        return JSONResponse(content, status_code=200 if bool(content.get("success")) else 500)
    except Exception as error:
        traceback.print_exc()
        return JSONResponse(
            {
                "success": False,
                "workflowName": "recommendation-agent",
                "action": "agent_os_service_exception",
                "tenantId": payload.tenantId,
                "userId": payload.userId,
                "source": payload.source,
                "pagePath": payload.pagePath,
                "error": f"{type(error).__name__}: {error}",
            },
            status_code=500,
        )


@base_app.post("/v1/recommendation/feed")
async def build_recommendation_feed(payload: RecommendationFeedStartInput) -> JSONResponse:
    try:
        result = recommendation_feed_workflow.run(input=payload.model_dump())
        content = result.content if isinstance(result.content, dict) else {"success": False}
        return JSONResponse(content, status_code=200 if bool(content.get("success")) else 500)
    except Exception as error:
        traceback.print_exc()
        return JSONResponse(
            {
                "success": False,
                "workflowName": "recommendation-agent",
                "action": "recommendation_feed_exception",
                "tenantId": payload.tenantId,
                "userId": payload.userId,
                "source": payload.source,
                "pagePath": payload.pagePath,
                "error": f"{type(error).__name__}: {error}",
            },
            status_code=500,
        )


agent_os = AgentOS(
    id=os.getenv("RECOMMENDATION_AGENTOS_ID", "openmaic-recommendation-agentos"),
    name="Recommendation AgentOS",
    description="AgentOS runtime for the learner recommendation and skill-gap workflows.",
    version=os.getenv("RECOMMENDATION_AGENTOS_VERSION", "0.1.0"),
    workflows=[recommendation_skill_gap_workflow, recommendation_feed_workflow],
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
