from __future__ import annotations

import os
import traceback

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from agno.os import AgentOS

from .workflow import ChatCoachQuestionInput, chat_coach_workflow
from .workflow import PreparedCoachingContextKickoffInput
from .workflow import PreparedCoachingContextFactsInput
from .prepared_context_store import start_prepared_context_collection, upsert_prepared_context_facts

base_app = FastAPI(title="Chat Coach AgentOS Service")
PREPARED_CONTEXT_PREFIX = "\U0001F5C3\uFE0FPC [Prepared Coaching Context]"


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


@base_app.post("/v1/chat-coach/prepared-context/start")
async def start_prepared_context(payload: PreparedCoachingContextKickoffInput) -> JSONResponse:
    try:
        print(
            f"{PREPARED_CONTEXT_PREFIX} AgentOS received prepared-context kickoff request. "
            f"preparedContextId={payload.preparedContextId} tenantId={payload.tenantId} "
            f"userId={payload.userId} courseId={payload.courseId} sessionId={payload.sessionId or 'none'}",
            file=os.sys.stderr,
        )
        start_prepared_context_collection(
            prepared_context_id=payload.preparedContextId,
            tenant_id=payload.tenantId,
            user_id=payload.userId,
            course_id=payload.courseId,
            session_id=payload.sessionId,
            question=payload.question,
            extracted_general_facts=payload.learnerDiscussionGeneralFacts,
            extracted_course_facts=payload.learnerDiscussionCourseFacts,
            extraction_reasoning=payload.learnerDiscussionReasoning,
            log=lambda message: print(message, file=os.sys.stderr, flush=True),
        )
        return JSONResponse(
            {
                "success": True,
                "workflowName": "chat-coach-agent",
                "action": "start_prepared_context_collection",
                "preparedContextId": payload.preparedContextId,
            },
            status_code=202,
        )
    except Exception as error:
        traceback.print_exc()
        return JSONResponse(
            {
                "success": False,
                "workflowName": "chat-coach-agent",
                "action": "start_prepared_context_collection",
                "preparedContextId": payload.preparedContextId,
                "error": f"{type(error).__name__}: {error}",
            },
            status_code=500,
        )


@base_app.post("/v1/chat-coach/prepared-context/upsert-facts")
async def upsert_prepared_context_facts_endpoint(
    payload: PreparedCoachingContextFactsInput,
) -> JSONResponse:
    try:
        print(
            f"{PREPARED_CONTEXT_PREFIX} AgentOS received prepared-context facts upsert request. "
            f"preparedContextId={payload.preparedContextId} "
            f"generalFacts={payload.learnerDiscussionGeneralFacts} "
            f"courseFacts={payload.learnerDiscussionCourseFacts}",
            file=os.sys.stderr,
        )
        success = upsert_prepared_context_facts(
            prepared_context_id=payload.preparedContextId,
            general_facts=payload.learnerDiscussionGeneralFacts,
            course_facts=payload.learnerDiscussionCourseFacts,
            extraction_reasoning=payload.learnerDiscussionReasoning,
            log=lambda message: print(message, file=os.sys.stderr, flush=True),
        )
        return JSONResponse(
            {
                "success": success,
                "workflowName": "chat-coach-agent",
                "action": "upsert_prepared_context_facts",
                "preparedContextId": payload.preparedContextId,
            },
            status_code=200 if success else 500,
        )
    except Exception as error:
        traceback.print_exc()
        return JSONResponse(
            {
                "success": False,
                "workflowName": "chat-coach-agent",
                "action": "upsert_prepared_context_facts",
                "preparedContextId": payload.preparedContextId,
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
