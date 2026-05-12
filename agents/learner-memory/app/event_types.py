from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field


class EventType(str, Enum):
    QUESTION = "question"
    STRUGGLE = "struggle"
    QUIZ_RESULT = "quiz_result"
    LESSON_COMPLETION = "lesson_completion"
    SESSION_SUMMARY = "session_summary"
    STYLE_SIGNAL = "style_signal"


class LearnerMemoryEventInput(BaseModel):
    tenantId: str
    userId: str
    courseId: str
    eventType: EventType
    lessonId: str | None = None
    quizId: str | None = None
    topic: str | None = None
    intent: str | None = None
    questionText: str | None = None
    sessionId: str | None = None
    sessionTurns: list[dict[str, Any]] = Field(default_factory=list)
    scorePercent: float | None = None
    passed: bool | None = None
    missedTopics: list[str] = Field(default_factory=list)
    styleSignal: str | None = None
    source: str | None = None


@dataclass
class CoachingEvent:
    tenant_id: str
    user_id: str
    course_id: str
    event_type: EventType
    content: str
    context_tags: dict[str, str] = field(default_factory=dict)
    timestamp: datetime | None = None

    @staticmethod
    def _normalize_context_value(value: object) -> str:
        raw = str(value or "").strip()
        if not raw:
            return ""
        collapsed = "_".join(raw.split())
        return collapsed.replace(":", "_").replace("|", "_")

    def build_context_string(self) -> str:
        tags = {
            "type": self.event_type.value,
            "course": self.course_id,
            **self.context_tags,
        }
        return " ".join(
            f"{key}:{self._normalize_context_value(value)}"
            for key, value in tags.items()
            if self._normalize_context_value(value)
        )


TRIGGER_EVENT_DESCRIPTIONS: dict[EventType, str] = {
    EventType.QUESTION: (
        "Triggered after the AI Coach finishes a learner turn. "
        "This is the entry point for storing a coaching question event."
    ),
    EventType.STRUGGLE: (
        "Triggered when the learner is identified as struggling, for example after a stuck intent "
        "or a repeated topic."
    ),
    EventType.QUIZ_RESULT: (
        "Triggered when a quiz result becomes available so the learner coaching bank can retain "
        "the outcome and missed topics."
    ),
    EventType.LESSON_COMPLETION: (
        "Triggered when the learner completes a lesson so the coaching bank can track progress signals."
    ),
    EventType.SESSION_SUMMARY: (
        "Triggered at the end of a coaching session to create and store a summary memory."
    ),
    EventType.STYLE_SIGNAL: (
        "Triggered when a learning-style signal is detected from the learner's questioning pattern."
    ),
}
