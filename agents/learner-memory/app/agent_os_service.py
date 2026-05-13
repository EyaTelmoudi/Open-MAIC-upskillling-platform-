from __future__ import annotations

import asyncio
import os
import traceback

from fastapi import FastAPI
from fastapi.responses import JSONResponse

from agno.os import AgentOS

from .workflow import LearnerLessonMemoryInput, learner_memory_workflow

base_app = FastAPI(title="Learner Memory AgentOS Service")


@base_app.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"success": True, "service": "learner-memory-agentos"}, status_code=200)


@base_app.post("/v1/learner-memory/retain-lesson-event")
async def retain_lesson_event(payload: LearnerLessonMemoryInput) -> JSONResponse:
    try:
        print(
            "[Agno Learner Memory Agent] AgentOS received lesson memory request. "
            f"tenantId={payload.tenantId} userId={payload.userId} courseId={payload.courseId} lessonId={payload.lessonId} event={payload.eventType}",
            file=os.sys.stderr,
        )
        print(
            "[Agno Learner Memory Agent] AgentOS payload summary: "
            f"courseTitle={payload.courseTitle or 'none'} lessonTitle={payload.lessonTitle or 'none'} "
            f"moduleTitle={payload.moduleTitle or 'none'} lessonReferences={payload.lessonReferenceIds} "
            f"difficultySignal={payload.difficultySignal or 'none'} "
            f"difficultyTopic={payload.difficultyTopic or 'none'} "
            f"quizId={payload.quizId or payload.assessmentId or 'none'} "
            f"quizPassed={payload.quizPassed if payload.quizPassed is not None else 'none'} "
            f"quizScore={payload.quizScore if payload.quizScore is not None else 'none'} "
            f"wrongAnswersCount={len(payload.wrongAnswers)}",
            file=os.sys.stderr,
        )
        result = await asyncio.to_thread(
            learner_memory_workflow.run,
            input=payload.model_dump(),
        )
        content = result.content if isinstance(result.content, dict) else {"success": False}
        if isinstance(content, dict) and content.get("memoryContent"):
            if payload.eventType == "quiz_completed":
                print(
                    "[Agno Learner Memory Agent] AgentOS retained quiz-result memory content:",
                    file=os.sys.stderr,
                )
            elif payload.eventType == "difficulty_signal_detected":
                print(
                    "[Agno Learner Memory Agent] AgentOS retained difficulty-signal memory content:",
                    file=os.sys.stderr,
                )
            elif payload.eventType == "course_enrollment_completed":
                print(
                    "[Agno Learner Memory Agent] AgentOS retained course-completion memory content:",
                    file=os.sys.stderr,
                )
            else:
                print(
                    "[Agno Learner Memory Agent] AgentOS retained lesson-completion memory content:",
                    file=os.sys.stderr,
                )
            print(str(content.get("memoryContent")), file=os.sys.stderr)
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
                "lessonId": payload.lessonId,
                "error": f"{type(error).__name__}: {error}",
            },
            status_code=500,
        )


agent_os = AgentOS(
    id=os.getenv("LEARNER_MEMORY_AGENTOS_ID", "openmaic-learner-memory-agentos"),
    name="Learner Memory AgentOS",
    description="AgentOS runtime for the learner lesson history memory workflow.",
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
