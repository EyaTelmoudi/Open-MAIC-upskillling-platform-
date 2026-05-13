from __future__ import annotations

import asyncio
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import httpx
from pydantic import BaseModel, Field


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _chat_coach_site_packages() -> Path:
    return _repo_root() / "agents" / "chat-coach" / ".venv" / "Lib" / "site-packages"


def _ensure_runtime_site_packages() -> None:
    site_packages = _chat_coach_site_packages()
    site_packages_str = str(site_packages)
    if site_packages.exists() and site_packages_str not in sys.path:
        sys.path.append(site_packages_str)


_ensure_runtime_site_packages()

from agno.workflow import Step, StepInput, StepOutput, Workflow


DEFAULT_HINDSIGHT_URL = os.getenv("HINDSIGHT_API_URL", "http://127.0.0.1:8888")
DEFAULT_HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY") or None
MEMORY_TIMEOUT_SECONDS = float(os.getenv("LEARNER_MEMORY_HINDSIGHT_TIMEOUT_SECONDS", "120"))
MEMORY_HTTP_TIMEOUT_SECONDS = float(os.getenv("LEARNER_MEMORY_HINDSIGHT_RETAIN_HTTP_TIMEOUT_SECONDS", "20"))


class LessonReference(BaseModel):
    title: str | None = None
    url: str | None = None


class LearnerLessonMemoryInput(BaseModel):
    tenantId: str
    userId: str
    courseId: str
    courseTitle: str | None = None
    lessonId: str
    lessonTitle: str | None = None
    moduleId: str | None = None
    moduleTitle: str | None = None
    lessonContentType: str | None = None
    lessonDurationMinutes: int | None = None
    lessonOrder: int | None = None
    assessmentId: str | None = None
    eventType: str = "lesson_completed"
    difficultySignal: str | None = None
    difficultyTopic: str | None = None
    quizId: str | None = None
    quizPassed: bool | None = None
    quizScore: float | None = None
    wrongAnswers: list[dict[str, Any]] = Field(default_factory=list)
    lessonReferenceIds: list[str] = Field(default_factory=list)
    supportReferences: list[LessonReference] = Field(default_factory=list)
    hindsightApiUrl: str | None = None
    hindsightApiKey: str | None = None


LessonReference.model_rebuild(_types_namespace=globals())
LearnerLessonMemoryInput.model_rebuild(_types_namespace=globals())


def _log(message: str) -> None:
    print(message, file=sys.stderr)


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _build_user_course_bank_id(tenant_id: str, user_id: str, course_id: str) -> str:
    return f"tenant:{tenant_id}:user:{user_id}:course:{course_id}"


def _build_bank_body(*, tenant_id: str, user_id: str, course_id: str) -> dict[str, Any]:
    return {
        "name": f"Tenant {tenant_id} Learner {user_id} Course {course_id}",
        "background": (
            f"Learner memory timeline for user {user_id} inside course {course_id} "
            f"for tenant {tenant_id}. Keep learner progression history grounded."
        ),
        "retain_mission": (
            "Store learner-course history events such as course completion and other useful "
            "learner-specific facts for this single course."
        ),
        "reflect_mission": (
            "Answer questions about the learner's history in this course using only retained "
            "learner-course events."
        ),
    }


def _build_memory_content(payload: LearnerLessonMemoryInput, *, captured_at_iso: str) -> str:
    course_title = _clean_text(payload.courseTitle) or f"Course {payload.courseId}"
    if payload.eventType == "course_enrollment_completed":
        return "\n".join(
            [
                f"[course_completion] Learner {payload.userId} completed the course \"{course_title}\".",
                f"Captured at: {captured_at_iso}",
                f"Tenant ID: {payload.tenantId}",
                f"User ID: {payload.userId}",
                f"Course ID: {payload.courseId}",
            ]
        )

    if payload.eventType == "difficulty_signal_detected":
        difficulty_signal = _clean_text(payload.difficultySignal) or "stuck"
        topic = _clean_text(payload.difficultyTopic)
        lines = [
            f"[difficulty_signal] Learner {payload.userId} showed difficulty in course \"{course_title}\".",
            f"Difficulty: {difficulty_signal}",
            f"Captured at: {captured_at_iso}",
            f"Tenant ID: {payload.tenantId}",
            f"User ID: {payload.userId}",
            f"Course ID: {payload.courseId}",
        ]
        if topic:
            lines.append(f"Topic: {topic}")
        return "\n".join(lines)

    if payload.eventType == "quiz_completed":
        quiz_id = _clean_text(payload.quizId) or _clean_text(payload.assessmentId) or payload.lessonId
        passed = bool(payload.quizPassed)
        lines = [
            f"[quiz_result] Learner {payload.userId} finished quiz \"{quiz_id}\" in course \"{course_title}\".",
            f"Result: {'correct' if passed else 'false'}",
            f"Captured at: {captured_at_iso}",
            f"Tenant ID: {payload.tenantId}",
            f"User ID: {payload.userId}",
            f"Course ID: {payload.courseId}",
            f"Quiz ID: {quiz_id}",
        ]
        if payload.quizScore is not None:
            lines.append(f"Quiz Score: {payload.quizScore}")
        if not passed and payload.wrongAnswers:
            lines.append("False Assessment:")
            for wrong in payload.wrongAnswers:
                question = _clean_text(wrong.get("question") or wrong.get("text") or "")
                user_answer = _clean_text(wrong.get("userAnswer") or wrong.get("userAnswers") or "")
                correct_answer = _clean_text(wrong.get("correctAnswer") or wrong.get("correctAnswers") or "")
                if question:
                    lines.append(f"- Question: {question}")
                if user_answer:
                    lines.append(f"  User Answer: {user_answer}")
                if correct_answer:
                    lines.append(f"  Correct Answer: {correct_answer}")
        return "\n".join(lines)

    lesson_title = _clean_text(payload.lessonTitle) or f"Lesson {payload.lessonId}"
    return "\n".join(
        [
            f"[lesson_completion] Learner {payload.userId} completed lesson \"{lesson_title}\" in course \"{course_title}\".",
            f"Captured at: {captured_at_iso}",
            f"Tenant ID: {payload.tenantId}",
            f"User ID: {payload.userId}",
            f"Course ID: {payload.courseId}",
            f"Lesson ID: {payload.lessonId}",
        ]
    )


def _ensure_bank_exists(
    *,
    hindsight_url: str,
    hindsight_api_key: str | None,
    bank_id: str,
    tenant_id: str,
    user_id: str,
    course_id: str,
) -> tuple[bool, str | None]:
    headers: dict[str, str] = {}
    if hindsight_api_key:
        headers["Authorization"] = f"Bearer {hindsight_api_key}"

    timeout = httpx.Timeout(20.0)
    with httpx.Client(timeout=timeout) as client:
        profile_response = client.get(
            f"{hindsight_url}/v1/default/banks/{bank_id}/profile",
            headers=headers,
        )
        if profile_response.status_code < 400:
            return False, None

        bank_response = client.put(
            f"{hindsight_url}/v1/default/banks/{bank_id}",
            headers={**headers, "Content-Type": "application/json"},
            json=_build_bank_body(
                tenant_id=tenant_id,
                user_id=user_id,
                course_id=course_id,
            ),
        )
        if bank_response.status_code >= 400:
            return (
                False,
                f"Hindsight learner-course bank creation failed with status {bank_response.status_code}",
            )
        return True, None


def kickoff_lesson_memory_capture(step_input: StepInput) -> StepOutput:
    payload = LearnerLessonMemoryInput.model_validate(step_input.input)
    _log_event_start(payload)
    return StepOutput(
        content={
            "success": True,
            "workflowName": "learner-memory-agent",
            "action": "kickoff_lesson_memory_capture",
            "tenantId": payload.tenantId,
            "userId": payload.userId,
            "courseId": payload.courseId,
            "lessonId": payload.lessonId,
            "eventType": payload.eventType,
        }
    )


def _log_event_start(payload: LearnerLessonMemoryInput) -> None:
    event_label = (
        "course completion memory capture"
        if payload.eventType == "course_enrollment_completed"
        else "difficulty signal memory capture"
        if payload.eventType == "difficulty_signal_detected"
        else "learner memory capture"
    )
    _log(
        f"[Agno Learner Memory Agent] {event_label} starts working. "
        f"user={payload.userId} course={payload.courseId} lesson={payload.lessonId} event={payload.eventType}"
    )


def _retain_payload(payload: LearnerLessonMemoryInput) -> dict[str, Any]:
    hindsight_url = (payload.hindsightApiUrl or DEFAULT_HINDSIGHT_URL).rstrip("/")
    hindsight_api_key = payload.hindsightApiKey or DEFAULT_HINDSIGHT_API_KEY
    bank_id = _build_user_course_bank_id(payload.tenantId, payload.userId, payload.courseId)
    captured_at_iso = datetime.now(timezone.utc).isoformat()
    memory_content = _build_memory_content(payload, captured_at_iso=captured_at_iso)

    _log("[Agno Learner Memory Agent] Checking learner-course bank existence.")
    _log(f"[Agno Learner Memory Agent] Target bank ID: {bank_id}")

    bank_created, bank_error = _ensure_bank_exists(
        hindsight_url=hindsight_url,
        hindsight_api_key=hindsight_api_key,
        bank_id=bank_id,
        tenant_id=payload.tenantId,
        user_id=payload.userId,
        course_id=payload.courseId,
    )
    if bank_error:
        return {
            "success": False,
            "workflowName": "learner-memory-agent",
            "action": "create_learner_course_bank",
            "tenantId": payload.tenantId,
            "userId": payload.userId,
            "courseId": payload.courseId,
            "lessonId": payload.lessonId,
            "bankId": bank_id,
            "error": bank_error,
        }

    if bank_created:
        _log("[Agno Learner Memory Agent] Learner-course bank not found. Created it.")
    else:
        _log("[Agno Learner Memory Agent] Learner-course bank already exists.")

    try:
        if payload.eventType == "quiz_completed":
            _log("[Agno Learner Memory Agent] Retaining learner quiz-result event via Hindsight HTTP async retain.")
        elif payload.eventType == "difficulty_signal_detected":
            _log("[Agno Learner Memory Agent] Retaining learner difficulty-signal event via Hindsight HTTP async retain.")
        elif payload.eventType == "course_enrollment_completed":
            _log("[Agno Learner Memory Agent] Retaining learner course-completion event via Hindsight HTTP async retain.")
        else:
            _log("[Agno Learner Memory Agent] Retaining learner lesson-completion event via Hindsight HTTP async retain.")
        headers = {"Content-Type": "application/json"}
        if hindsight_api_key:
            headers["Authorization"] = f"Bearer {hindsight_api_key}"
        retain_response = httpx.post(
            f"{hindsight_url}/v1/default/banks/{bank_id}/memories",
            json={
                "items": [
                    {
                        "content": memory_content,
                        "metadata": {
                            "event_type": payload.eventType,
                            "tenant_id": payload.tenantId,
                            "user_id": payload.userId,
                            "course_id": payload.courseId,
                            "lesson_id": payload.lessonId,
                        },
                        "tags": ["scope:learner_course", "type:learner_progress_event"],
                    }
                ],
                "async": True,
            },
            headers=headers,
            timeout=httpx.Timeout(MEMORY_HTTP_TIMEOUT_SECONDS),
        )
        if retain_response.status_code >= 400:
            return {
                "success": False,
                "workflowName": "learner-memory-agent",
                "action": "retain_lesson_memory_event",
                "tenantId": payload.tenantId,
                "userId": payload.userId,
                "courseId": payload.courseId,
                "lessonId": payload.lessonId,
                "bankId": bank_id,
                "bankCreated": bank_created,
                "error": (
                    f"Hindsight retain failed with status {retain_response.status_code}: "
                    f"{retain_response.text}"
                ),
            }
        retain_result = retain_response.json()
        _log(
            "[Agno Learner Memory Agent] Hindsight retain result: "
            f"{_clean_text(retain_result) or 'no result'}"
        )
        operation_id = _clean_text(retain_result.get("operation_id"))
        if not operation_id and not bool(retain_result.get("async")):
            return {
                "success": False,
                "workflowName": "learner-memory-agent",
                "action": "retain_lesson_memory_event",
                "tenantId": payload.tenantId,
                "userId": payload.userId,
                "courseId": payload.courseId,
                "lessonId": payload.lessonId,
                "bankId": bank_id,
                "bankCreated": bank_created,
                "error": "Hindsight async retain did not return an operation id.",
            }
    except Exception as error:
        return {
            "success": False,
            "workflowName": "learner-memory-agent",
            "action": "retain_lesson_memory_event",
            "tenantId": payload.tenantId,
            "userId": payload.userId,
            "courseId": payload.courseId,
            "lessonId": payload.lessonId,
            "bankId": bank_id,
            "bankCreated": bank_created,
            "error": f"{type(error).__name__}: {error}",
        }

    if payload.eventType == "quiz_completed":
        _log("[Agno Learner Memory Agent] Collected learner quiz-result event:")
    elif payload.eventType == "difficulty_signal_detected":
        _log("[Agno Learner Memory Agent] Collected learner difficulty-signal event:")
    elif payload.eventType == "course_enrollment_completed":
        _log("[Agno Learner Memory Agent] Collected learner course-completion event:")
    else:
        _log("[Agno Learner Memory Agent] Collected learner lesson-completion event:")
    _log(memory_content)

    return {
        "success": True,
        "workflowName": "learner-memory-agent",
        "action": "retain_lesson_memory_event",
        "tenantId": payload.tenantId,
        "userId": payload.userId,
        "courseId": payload.courseId,
        "lessonId": payload.lessonId,
        "bankId": bank_id,
        "bankCreated": bank_created,
        "capturedAt": captured_at_iso,
        "memoryContent": memory_content,
        "operationId": operation_id or None,
        "retentionMode": "direct_hindsight_http_async",
    }


def retain_learner_memory_payload(raw_input: dict[str, Any]) -> dict[str, Any]:
    payload = LearnerLessonMemoryInput.model_validate(raw_input)
    _log_event_start(payload)
    return _retain_payload(payload)


def retain_lesson_memory_event(step_input: StepInput) -> StepOutput:
    payload = LearnerLessonMemoryInput.model_validate(step_input.input)
    return StepOutput(content=_retain_payload(payload))


learner_memory_workflow = Workflow(
    name="learner-memory-agent",
    description="Agno workflow that stores learner-course lesson history in a dedicated Hindsight bank.",
    steps=[
        Step(
            name="kickoff-lesson-memory-capture",
            executor=kickoff_lesson_memory_capture,
        ),
        Step(
            name="retain-lesson-memory-event",
            executor=retain_lesson_memory_event,
        ),
    ],
)
