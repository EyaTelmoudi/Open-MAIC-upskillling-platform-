from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel

from agno.workflow import Step, StepInput, StepOutput, Workflow

from .bank_manager import LearnerBankManager
from .event_types import CoachingEvent, EventType, LearnerMemoryEventInput, TRIGGER_EVENT_DESCRIPTIONS


def _log(message: str) -> None:
    try:
        print(message, flush=True)
    except UnicodeEncodeError:
        safe_message = message.encode(
            sys.stdout.encoding or "utf-8",
            errors="backslashreplace",
        ).decode(sys.stdout.encoding or "utf-8", errors="strict")
        print(safe_message, flush=True)


def _clean_text(value: object) -> str:
    return str(value or "").strip()


class LearnerMemoryTriggerResult(BaseModel):
    success: bool
    workflowName: str
    action: str
    tenantId: str
    userId: str
    courseId: str
    triggerEvent: str
    triggerDescription: str
    triggerSummary: dict[str, Any]
    retainedMemories: list[dict[str, Any]]
    hindsightRetainResults: list[dict[str, Any]]
    nextPlannedAction: str


def _build_trigger_summary(payload: LearnerMemoryEventInput) -> dict[str, Any]:
    return {
        "event_type": payload.eventType.value,
        "tenant_id": payload.tenantId,
        "user_id": payload.userId,
        "course_id": payload.courseId,
        "lesson_id": payload.lessonId,
        "quiz_id": payload.quizId,
        "topic": payload.topic,
        "intent": payload.intent,
        "question_text": payload.questionText,
        "session_id": payload.sessionId,
        "session_turn_count": len(payload.sessionTurns),
        "score_percent": payload.scorePercent,
        "passed": payload.passed,
        "missed_topics": payload.missedTopics,
        "style_signal": payload.styleSignal,
        "source": payload.source,
    }


def _detect_style_signal(payload: LearnerMemoryEventInput) -> str | None:
    question = _clean_text(payload.questionText).lower()
    if "example" in question or "show me" in question or "like what" in question:
        return "example_based"
    if "why" in question or "how does" in question or "explain" in question:
        return "conceptual"
    if "step" in question or "how to" in question or "implement" in question:
        return "implementation_oriented"
    if _clean_text(payload.intent) == "stuck":
        return "needs_simplification"
    return _clean_text(payload.styleSignal) or None


def _format_missed_topics_for_content(missed_topics: list[str]) -> str:
    cleaned = [_clean_text(topic) for topic in missed_topics if _clean_text(topic)]
    return ", ".join(cleaned) if cleaned else "none"


def _format_missed_topics_for_context(missed_topics: list[str]) -> str:
    cleaned = [_clean_text(topic) for topic in missed_topics if _clean_text(topic)]
    return "|".join(cleaned) if cleaned else "none"


def _build_coaching_events(payload: LearnerMemoryEventInput) -> list[CoachingEvent]:
    now = datetime.now(timezone.utc)
    events: list[CoachingEvent] = []
    topic = _clean_text(payload.topic)
    intent = _clean_text(payload.intent)

    if payload.eventType == EventType.QUESTION:
        events.append(
            CoachingEvent(
                tenant_id=payload.tenantId,
                user_id=payload.userId,
                course_id=payload.courseId,
                event_type=EventType.QUESTION,
                content=(
                    f"Learner asked about '{topic or 'unknown topic'}' in course {payload.courseId}, "
                    f"lesson {_clean_text(payload.lessonId) or 'unknown lesson'}. "
                    f"Intent: {intent or 'unknown'}. "
                    f"Question: '{_clean_text(payload.questionText)[:200]}'"
                ),
                context_tags={
                    "lesson": _clean_text(payload.lessonId),
                    "topic": topic or "unknown_topic",
                    "intent": intent or "unknown",
                    "session": _clean_text(payload.sessionId),
                },
                timestamp=now,
            )
        )

        if intent == "stuck":
            events.append(
                CoachingEvent(
                    tenant_id=payload.tenantId,
                    user_id=payload.userId,
                    course_id=payload.courseId,
                    event_type=EventType.STRUGGLE,
                    content=(
                        f"Learner is struggling with '{topic or 'unknown topic'}' in course {payload.courseId}. "
                        "Confirmed struggle area from a stuck coaching turn."
                    ),
                    context_tags={
                        "topic": topic or "unknown_topic",
                        "struggle": "true",
                        "intent": intent or "unknown",
                    },
                    timestamp=now,
                )
            )

        style_signal = _detect_style_signal(payload)
        if style_signal:
            events.append(
                CoachingEvent(
                    tenant_id=payload.tenantId,
                    user_id=payload.userId,
                    course_id=payload.courseId,
                    event_type=EventType.STYLE_SIGNAL,
                    content=(
                        f"Style signal detected for learner in course {payload.courseId}: {style_signal}."
                    ),
                    context_tags={"signal": style_signal},
                    timestamp=now,
                )
            )

    elif payload.eventType == EventType.QUIZ_RESULT:
        score_percent = int(round(payload.scorePercent)) if payload.scorePercent is not None else None
        passed_value = str(bool(payload.passed)).lower() if payload.passed is not None else "unknown"
        missed_topics_content = _format_missed_topics_for_content(payload.missedTopics)
        missed_topics_context = _format_missed_topics_for_context(payload.missedTopics)
        events.append(
            CoachingEvent(
                tenant_id=payload.tenantId,
                user_id=payload.userId,
                course_id=payload.courseId,
                event_type=EventType.QUIZ_RESULT,
                content=(
                    f"Learner completed quiz '{_clean_text(payload.quizId) or 'unknown quiz'}' in course {payload.courseId}. "
                    f"Score: {score_percent if score_percent is not None else 'unknown'}%. "
                    f"Passed: {passed_value}. "
                    f"Missed topics: {missed_topics_content}."
                ),
                context_tags={
                    "quiz": _clean_text(payload.quizId),
                    "passed": passed_value,
                    "score": str(score_percent) if score_percent is not None else "unknown",
                    "missed": missed_topics_context,
                },
                timestamp=now,
            )
        )

    elif payload.eventType == EventType.LESSON_COMPLETION:
        events.append(
            CoachingEvent(
                tenant_id=payload.tenantId,
                user_id=payload.userId,
                course_id=payload.courseId,
                event_type=EventType.LESSON_COMPLETION,
                content=(
                    f"Learner completed lesson '{_clean_text(payload.lessonId) or 'unknown lesson'}' in course {payload.courseId}."
                ),
                context_tags={
                    "lesson": _clean_text(payload.lessonId),
                    "status": "completed",
                },
                timestamp=now,
            )
        )

    elif payload.eventType == EventType.SESSION_SUMMARY:
        events.append(
            CoachingEvent(
                tenant_id=payload.tenantId,
                user_id=payload.userId,
                course_id=payload.courseId,
                event_type=EventType.SESSION_SUMMARY,
                content=(
                    f"Coaching session summary placeholder for session '{_clean_text(payload.sessionId) or 'unknown'}' "
                    f"in course {payload.courseId}. Session turn count: {len(payload.sessionTurns)}."
                ),
                context_tags={"session": _clean_text(payload.sessionId)},
                timestamp=now,
            )
        )

    return events


def capture_trigger_event(step_input: StepInput) -> StepOutput:
    payload = LearnerMemoryEventInput.model_validate(step_input.input)
    trigger_description = TRIGGER_EVENT_DESCRIPTIONS[payload.eventType]
    trigger_summary = _build_trigger_summary(payload)
    coaching_events = _build_coaching_events(payload)
    bank_manager = LearnerBankManager(payload.tenantId, payload.userId)
    retain_results: list[dict[str, Any]] = []

    _log("[Agno Learner Memory Agent] Learner Memory Agent started.")
    _log(
        "[Agno Learner Memory Agent] Trigger event received: "
        f"{payload.eventType.value}"
    )
    _log(f"[Agno Learner Memory Agent] Trigger description: {trigger_description}")
    _log("[Agno Learner Memory Agent] Trigger payload:")
    _log(json.dumps(trigger_summary, indent=2, ensure_ascii=False))
    _log(f"[Agno Learner Memory Agent] Coaching events to retain: {len(coaching_events)}")

    for index, event in enumerate(coaching_events, start=1):
        event_preview = {
            "event_type": event.event_type.value,
            "content": event.content,
            "context": event.build_context_string(),
        }
        _log(f"[Agno Learner Memory Agent] Retain job {index} prepared:")
        _log(json.dumps(event_preview, indent=2, ensure_ascii=False))
        retain_result = bank_manager.retain_event(event)
        retain_results.append(retain_result if isinstance(retain_result, dict) else {})
        _log(f"[Agno Learner Memory Agent] Retain job {index} completed:")
        _log(json.dumps(retain_result, indent=2, ensure_ascii=False))

    _log("[Agno Learner Memory Agent] Current stage completed: Hindsight coaching-bank retention finished.")

    return StepOutput(
        content=LearnerMemoryTriggerResult(
            success=True,
            workflowName="learner-memory-agent",
            action="capture_trigger_event",
            tenantId=payload.tenantId,
            userId=payload.userId,
            courseId=payload.courseId,
            triggerEvent=payload.eventType.value,
            triggerDescription=trigger_description,
            triggerSummary=trigger_summary,
            retainedMemories=[
                {
                    "event_type": event.event_type.value,
                    "content": event.content,
                    "context": event.build_context_string(),
                }
                for event in coaching_events
            ],
            hindsightRetainResults=retain_results,
            nextPlannedAction="Extend this agent with recall, reflection, and end-of-session synthesis in the next implementation step.",
        ).model_dump(),
        success=True,
    )


learner_memory_workflow = Workflow(
    name="learner-memory-agent",
    description=(
        "Separate AgentOS workflow that receives learner-memory trigger events and "
        "retains coaching memories into the learner coaching bank in Hindsight."
    ),
    steps=[
        Step(
            name="capture-trigger-event",
            executor=capture_trigger_event,
        ),
    ],
)
