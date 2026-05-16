from __future__ import annotations

import json
import os
import socket
import sys
import threading
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

if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.skills import LocalSkills, Skills
from agno.workflow import Step, StepInput, StepOutput, Workflow
from hindsight_agno import HindsightTools


DEFAULT_HINDSIGHT_URL = os.getenv("HINDSIGHT_API_URL", "http://127.0.0.1:8888")
DEFAULT_HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY") or None
MEMORY_HTTP_TIMEOUT_SECONDS = float(os.getenv("LEARNER_MEMORY_HINDSIGHT_RETAIN_HTTP_TIMEOUT_SECONDS", "20"))
DEFAULT_DISCUSSION_FACT_MODEL = os.getenv("LEARNER_MEMORY_DISCUSSION_FACT_MODEL") or "gemma-4-4b"
DEFAULT_DISCUSSION_FACT_MODEL_URL = (
    os.getenv("LEARNER_MEMORY_DISCUSSION_FACT_MODEL_URL")
    or "http://models.endpoint.3s.local"
)
DEFAULT_DISCUSSION_FACT_MODEL_API_KEY = (
    os.getenv("LEARNER_MEMORY_DISCUSSION_FACT_MODEL_API_KEY")
    or "sk-EBe-S_eHyf5z7f-B19UwHQ"
    or None
)
PREPARED_CONTEXT_REDIS_HOST = os.getenv("PREPARED_CONTEXT_REDIS_HOST", "127.0.0.1")
PREPARED_CONTEXT_REDIS_PORT = int(os.getenv("PREPARED_CONTEXT_REDIS_PORT", "6379"))
PREPARED_CONTEXT_REDIS_DB = int(os.getenv("PREPARED_CONTEXT_REDIS_DB", "0"))


_DISCUSSION_FACT_AGENT: Agent | None = None
_DISCUSSION_FACT_DUPLICATE_AGENT: Agent | None = None
_DISCUSSION_FACT_STRUCTURER_AGENT: Agent | None = None


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
    discussionMessage: str | None = None
    sessionId: str | None = None
    source: str | None = None
    preExtractedGeneralFacts: list[str] = Field(default_factory=list)
    preExtractedCourseFacts: list[str] = Field(default_factory=list)
    preExtractionReasoning: str | None = None
    preparedContextId: str | None = None
    hindsightApiUrl: str | None = None
    hindsightApiKey: str | None = None


class DiscussionFactExtraction(BaseModel):
    general_facts: list[str] = Field(default_factory=list)
    course_facts: list[str] = Field(default_factory=list)
    reasoning: str = ""


class DiscussionFactDuplicateDecision(BaseModel):
    is_duplicate: bool = False
    matched_memory: str = ""
    reasoning: str = ""


class BatchedDiscussionFactDuplicateDecision(BaseModel):
    duplicate_facts: list[str] = Field(default_factory=list)
    matched_memories: dict[str, str] = Field(default_factory=dict)
    reasoning: str = ""


class StructuredLearnerFact(BaseModel):
    memory_type: str
    fact_category: str
    fact_value: str
    fact_label: str
    normalized_key: str
    fact_confidence: str = "medium"
    is_self_reported: bool = True
    source_message: str
    supporting_span: str
    captured_at: str
    tenant_id: str
    user_id: str
    course_id: str | None = None
    lesson_id: str | None = None
    session_id: str | None = None


class StructuredLearnerFactClassification(BaseModel):
    fact_category: str
    fact_value: str
    fact_label: str
    fact_confidence: str = "medium"


LessonReference.model_rebuild(_types_namespace=globals())
LearnerLessonMemoryInput.model_rebuild(_types_namespace=globals())
DiscussionFactExtraction.model_rebuild(_types_namespace=globals())
DiscussionFactDuplicateDecision.model_rebuild(_types_namespace=globals())
BatchedDiscussionFactDuplicateDecision.model_rebuild(_types_namespace=globals())
StructuredLearnerFact.model_rebuild(_types_namespace=globals())
StructuredLearnerFactClassification.model_rebuild(_types_namespace=globals())


def _log(message: str) -> None:
    if message.startswith("[Agno Learner Memory Agent]"):
        message = f"🧠LM {message}"
    else:
        message = f"🧠LM [Agno Learner Memory Agent] {message}"
    print(message, file=sys.stderr)


def _log(message: str) -> None:
    prefix = "\U0001F9E0LM [Agno Learner Memory Agent]"
    if message.startswith("[Agno Learner Memory Agent]"):
        message = message.replace("[Agno Learner Memory Agent]", prefix, 1)
    else:
        message = f"{prefix} {message}"
    print(message, file=sys.stderr)


def _clean_text(value: Any) -> str:
    if value is None:
        return ""
    return str(value).strip()


def _encode_resp(parts: list[bytes]) -> bytes:
    payload = [f"*{len(parts)}\r\n".encode("utf-8")]
    for part in parts:
        payload.append(f"${len(part)}\r\n".encode("utf-8"))
        payload.append(part + b"\r\n")
    return b"".join(payload)


def _read_line(sock: socket.socket) -> bytes:
    chunks = bytearray()
    while True:
        chunk = sock.recv(1)
        if not chunk:
            raise ConnectionError("Redis connection closed unexpectedly.")
        chunks.extend(chunk)
        if chunks.endswith(b"\r\n"):
            return bytes(chunks[:-2])


def _read_exact(sock: socket.socket, size: int) -> bytes:
    chunks = bytearray()
    while len(chunks) < size:
        chunk = sock.recv(size - len(chunks))
        if not chunk:
            raise ConnectionError("Redis connection closed unexpectedly.")
        chunks.extend(chunk)
    return bytes(chunks)


def _parse_resp(sock: socket.socket) -> Any:
    prefix = _read_exact(sock, 1)
    if prefix == b"+":
        return _read_line(sock).decode("utf-8", errors="replace")
    if prefix == b"-":
        raise RuntimeError(_read_line(sock).decode("utf-8", errors="replace"))
    if prefix == b":":
        return int(_read_line(sock))
    if prefix == b"$":
        length = int(_read_line(sock))
        if length < 0:
            return None
        data = _read_exact(sock, length)
        _read_exact(sock, 2)
        return data.decode("utf-8", errors="replace")
    if prefix == b"*":
        count = int(_read_line(sock))
        if count < 0:
            return None
        return [_parse_resp(sock) for _ in range(count)]
    raise RuntimeError(f"Unsupported Redis RESP prefix: {prefix!r}")


def _run_redis_command(*parts: object) -> Any:
    encoded_parts = [str(part).encode("utf-8") for part in parts]
    with socket.create_connection(
        (PREPARED_CONTEXT_REDIS_HOST, PREPARED_CONTEXT_REDIS_PORT),
        timeout=2.5,
    ) as sock:
        sock.settimeout(2.5)
        if PREPARED_CONTEXT_REDIS_DB:
            sock.sendall(_encode_resp([b"SELECT", str(PREPARED_CONTEXT_REDIS_DB).encode("utf-8")]))
            _parse_resp(sock)
        sock.sendall(_encode_resp(encoded_parts))
        return _parse_resp(sock)


def _load_prepared_context_from_redis(prepared_context_id: str) -> dict[str, Any] | None:
    if not _clean_text(prepared_context_id):
        return None
    _log(
        "[Agno Learner Memory Agent] Starting prepared coaching context Redis read for duplicate checking. "
        f"preparedContextId={prepared_context_id}"
    )
    try:
        raw = _run_redis_command("GET", f"prepared_coaching_context:{prepared_context_id}")
        if isinstance(raw, str) and raw.strip():
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                _log(
                    "[Agno Learner Memory Agent] Loaded prepared coaching context from Redis for duplicate checking. "
                    f"preparedContextId={prepared_context_id} "
                    f"generalFacts={len(parsed.get('general_facts') or [])} "
                    f"courseFacts={len(parsed.get('course_facts') or [])}"
                )
                return parsed
        _log(
            "[Agno Learner Memory Agent] Prepared coaching context Redis read finished without a cached entry. "
            f"preparedContextId={prepared_context_id}"
        )
    except Exception as error:
        _log(
            "[Agno Learner Memory Agent] Failed to load prepared coaching context from Redis, "
            f"falling back to Hindsight recall. error={error}"
        )
    return None


def _memory_lines_from_text(text: Any) -> list[str]:
    return [
        line.strip()
        for line in str(text or "").splitlines()
        if line.strip()
    ]


def _discussion_fact_base_url() -> str:
    return DEFAULT_DISCUSSION_FACT_MODEL_URL.removesuffix("/chat/completions").rstrip("/")


def _build_user_course_bank_id(tenant_id: str, user_id: str, course_id: str) -> str:
    return f"tenant:{tenant_id}:user:{user_id}:course:{course_id}"


def _build_user_bank_id(tenant_id: str, user_id: str) -> str:
    return f"tenant:{tenant_id}:user:{user_id}"


def _discussion_skill_root() -> Path:
    return _repo_root() / "agents" / "learner-memory" / "skills"


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


def _build_user_bank_body(*, tenant_id: str, user_id: str) -> dict[str, Any]:
    return {
        "name": f"Tenant {tenant_id} Learner {user_id}",
        "background": (
            f"Persistent learner profile memory for user {user_id} inside tenant {tenant_id}. "
            "Store enduring user preferences, prior knowledge, communication style, and personal facts "
            "useful across courses."
        ),
        "retain_mission": "Store durable learner profile facts that are not limited to a single course.",
        "reflect_mission": (
            "Answer questions about the learner's general profile using only retained tenant-user facts."
        ),
    }


def _build_memory_content(payload: LearnerLessonMemoryInput, *, captured_at_iso: str) -> str:
    course_title = _clean_text(payload.courseTitle) or f"Course {payload.courseId}"
    if payload.eventType == "coaching_discussion_message":
        discussion_message = _clean_text(payload.discussionMessage) or "No learner message provided."
        lesson_title = _clean_text(payload.lessonTitle) or "Coaching discussion"
        session_id = _clean_text(payload.sessionId) or "no-session"
        source = _clean_text(payload.source) or "coach-page"
        return "\n".join(
            [
                f"[coaching_discussion] Learner {payload.userId} sent a coaching message in course \"{course_title}\".",
                f"Message: {discussion_message}",
                f"Captured at: {captured_at_iso}",
                f"Tenant ID: {payload.tenantId}",
                f"User ID: {payload.userId}",
                f"Course ID: {payload.courseId}",
                f"Lesson ID: {payload.lessonId}",
                f"Lesson Title: {lesson_title}",
                f"Session ID: {session_id}",
                f"Source: {source}",
            ]
        )

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
    bank_body: dict[str, Any],
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
            json=bank_body,
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
        "discussion fact extraction"
        if payload.eventType == "coaching_discussion_message"
        else "course completion memory capture"
        if payload.eventType == "course_enrollment_completed"
        else "difficulty signal memory capture"
        if payload.eventType == "difficulty_signal_detected"
        else "learner memory capture"
    )
    _log(
        f"[Agno Learner Memory Agent] {event_label} starts working. "
        f"user={payload.userId} course={payload.courseId} lesson={payload.lessonId} event={payload.eventType}"
    )


def _normalize_fact_items(values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        fact = _clean_text(value).rstrip(".")
        if not fact:
            continue
        key = fact.casefold()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(fact)
    return normalized


def _normalize_for_comparison(value: str) -> str:
    parsed_structured_fact = _parse_structured_fact_text(value)
    if parsed_structured_fact:
        normalized_parts = [
            parsed_structured_fact.fact_label,
            parsed_structured_fact.fact_value,
            parsed_structured_fact.normalized_key,
        ]
        return " ".join(
            " ".join(_clean_text(part).casefold().replace(".", " ").replace(",", " ").split())
            for part in normalized_parts
            if _clean_text(part)
        ).strip()

    normalized = _clean_text(value).casefold()
    for prefix in (
        "[learner_general_fact]",
        "[learner_course_fact]",
        "[coaching_discussion]",
        "[lesson_completion]",
        "[quiz_result]",
        "[difficulty_signal]",
        "[course_completion]",
    ):
        normalized = normalized.replace(prefix, "")
    for fragment in (
        "captured at:",
        "observed from coaching message:",
        "tenant id:",
        "user id:",
        "course id:",
        "lesson id:",
        "lesson title:",
        "session id:",
        "source:",
    ):
        if fragment in normalized:
            normalized = normalized.split(fragment, 1)[0]
    return " ".join(normalized.replace(".", " ").replace(",", " ").split())


def _slugify_fact_value(value: str) -> str:
    cleaned = _clean_text(value).casefold()
    chars: list[str] = []
    last_was_sep = False
    for character in cleaned:
        if character.isalnum():
            chars.append(character)
            last_was_sep = False
        elif not last_was_sep:
            chars.append("_")
            last_was_sep = True
    return "".join(chars).strip("_") or "fact"


def _extract_topic_from_fact(fact: str) -> str:
    lowered = _clean_text(fact).casefold()
    patterns = (
        ("does not understand how this course expects", ""),
        ("does not understand how the course expects", ""),
        ("does not understand how this course wants", ""),
        ("does not understand why", ""),
        ("does not yet understand how this course", ""),
        ("does not yet understand how the course", ""),
        ("is confused about why", ""),
        ("is still confused about why", ""),
        ("is confused about", ""),
        ("is still confused about", ""),
        ("prefers", ""),
        ("likes", ""),
        ("learns better when", ""),
        ("already knows", ""),
        ("knows", ""),
    )
    topic = lowered
    for prefix, replacement in patterns:
        if prefix in topic:
            topic = topic.replace(prefix, replacement, 1).strip()
            break
    topic = topic.strip(" .")
    return _slugify_fact_value(topic or fact)


def _classify_structured_fact(*, fact: str, scope_label: str) -> tuple[str, str]:
    lowered = _clean_text(fact).casefold()
    if "prefers" in lowered or "likes" in lowered or "learns better when" in lowered:
        if "english is not" in lowered or "simple" in lowered or "direct explanations" in lowered:
            return "communication_preference", _extract_topic_from_fact(fact)
        return "style_preference", _extract_topic_from_fact(fact)
    if "first language is not english" in lowered:
        return "communication_preference", "simple_direct_english"
    if "does not understand" in lowered or "confused" in lowered or "unclear" in lowered:
        if scope_label == "tenant:user:course":
            return "confusion_topic", _extract_topic_from_fact(fact)
        return "difficulty_area", _extract_topic_from_fact(fact)
    if "knows" in lowered or "understands" in lowered:
        return "known_topic", _extract_topic_from_fact(fact)
    if "experience" in lowered or "worked as" in lowered or "has been a" in lowered or "has two years" in lowered or "has led" in lowered:
        return "background", _extract_topic_from_fact(fact)
    if scope_label == "tenant:user:course":
        return "course_relevant_fact", _extract_topic_from_fact(fact)
    return "learner_profile_fact", _extract_topic_from_fact(fact)


def _fact_confidence_for_text(fact: str) -> str:
    lowered = _clean_text(fact).casefold()
    if any(marker in lowered for marker in ("prefers", "likes", "does not understand", "is confused", "already knows", "first language")):
        return "high"
    return "medium"


def _classify_structured_fact_with_agent(
    *,
    fact: str,
    scope_label: str,
    payload: LearnerLessonMemoryInput,
    source_message: str,
) -> StructuredLearnerFactClassification | None:
    course_scope = (
        f"course_id={payload.courseId}; course_title={_clean_text(payload.courseTitle) or payload.courseId}"
        if scope_label == "tenant:user:course"
        else "not course scoped"
    )
    prompt = "\n".join(
        [
            "Classify this learner fact for structured Hindsight retention.",
            f"Scope: {scope_label}",
            f"Fact: {fact}",
            f"Original learner message: {source_message}",
            f"Course scope: {course_scope}",
            "Return only the structured classification.",
        ]
    )
    try:
        response = _discussion_fact_structurer_agent().run(prompt)
        content = response.content
        if isinstance(content, StructuredLearnerFactClassification):
            return content
        if isinstance(content, dict):
            return StructuredLearnerFactClassification.model_validate(content)
        if isinstance(content, str):
            parsed = json.loads(content)
            if isinstance(parsed, dict):
                return StructuredLearnerFactClassification.model_validate(parsed)
    except Exception as error:
        _log(
            "[Agno Learner Memory Agent] Structured fact classifier skill failed, "
            f"falling back to rule-based classification. error={error}"
        )
    return None


def _build_structured_fact(
    *,
    fact: str,
    scope_label: str,
    payload: LearnerLessonMemoryInput,
    captured_at_iso: str,
    source_message: str,
) -> StructuredLearnerFact:
    classification = _classify_structured_fact_with_agent(
        fact=fact,
        scope_label=scope_label,
        payload=payload,
        source_message=source_message,
    )
    if classification is None:
        fact_category, fact_value = _classify_structured_fact(fact=fact, scope_label=scope_label)
        fact_label = _clean_text(fact).rstrip(".")
        fact_confidence = _fact_confidence_for_text(fact)
    else:
        fact_category = _clean_text(classification.fact_category) or (
            "course_relevant_fact" if scope_label == "tenant:user:course" else "learner_profile_fact"
        )
        fact_value = _slugify_fact_value(classification.fact_value)
        fact_label = _clean_text(classification.fact_label).rstrip(".") or _clean_text(fact).rstrip(".")
        fact_confidence = _clean_text(classification.fact_confidence).casefold() or "medium"
    memory_type = "learner_course_fact" if scope_label == "tenant:user:course" else "learner_profile_fact"
    normalized_key_parts = [memory_type, fact_category, fact_value]
    if scope_label == "tenant:user:course":
        normalized_key_parts.append(payload.courseId)
    return StructuredLearnerFact(
        memory_type=memory_type,
        fact_category=fact_category,
        fact_value=fact_value,
        fact_label=fact_label,
        normalized_key=":".join(normalized_key_parts),
        fact_confidence=fact_confidence if fact_confidence in {"high", "medium", "low"} else "medium",
        is_self_reported=True,
        source_message=source_message,
        supporting_span=_clean_text(fact).rstrip("."),
        captured_at=captured_at_iso,
        tenant_id=payload.tenantId,
        user_id=payload.userId,
        course_id=payload.courseId if scope_label == "tenant:user:course" else None,
        lesson_id=payload.lessonId if scope_label == "tenant:user:course" else None,
        session_id=payload.sessionId if scope_label == "tenant:user:course" else None,
    )


def _structured_fact_to_memory_content(structured_fact: StructuredLearnerFact) -> str:
    return structured_fact.model_dump_json(ensure_ascii=False)


def _parse_structured_fact_text(value: str) -> StructuredLearnerFact | None:
    text = _clean_text(value)
    if not text.startswith("{"):
        return None
    try:
        parsed = json.loads(text)
    except Exception:
        return None
    if not isinstance(parsed, dict):
        return None
    memory_type = _clean_text(parsed.get("memory_type"))
    if memory_type not in {"learner_profile_fact", "learner_course_fact"}:
        return None
    try:
        return StructuredLearnerFact.model_validate(parsed)
    except Exception:
        return None


def _discussion_fact_model() -> OpenAIChat:
    return OpenAIChat(
        id=DEFAULT_DISCUSSION_FACT_MODEL,
        base_url=_discussion_fact_base_url(),
        api_key=DEFAULT_DISCUSSION_FACT_MODEL_API_KEY,
        temperature=0,
        max_tokens=900,
    )


def _discussion_fact_parser_model() -> OpenAIChat:
    return OpenAIChat(
        id=DEFAULT_DISCUSSION_FACT_MODEL,
        base_url=_discussion_fact_base_url(),
        api_key=DEFAULT_DISCUSSION_FACT_MODEL_API_KEY,
        temperature=0,
        max_tokens=500,
    )


def _discussion_fact_structurer_agent() -> Agent:
    global _DISCUSSION_FACT_STRUCTURER_AGENT
    if _DISCUSSION_FACT_STRUCTURER_AGENT is None:
        _DISCUSSION_FACT_STRUCTURER_AGENT = Agent(
            name="Learner Discussion Fact Structurer",
            model=_discussion_fact_model(),
            skills=Skills(loaders=[LocalSkills(str(_discussion_skill_root()))]),
            instructions=[
                "You classify one extracted learner fact into the structured learner-memory schema.",
                "Load the discussion-fact-structurer skill instructions before classifying the fact.",
                "Respect the provided scope strictly.",
                "Choose the most specific category supported by the skill.",
                "Return only structured output matching the schema.",
            ],
            expected_output=(
                "Return JSON with keys fact_category, fact_value, fact_label, fact_confidence."
            ),
            output_schema=StructuredLearnerFactClassification,
            parser_model=_discussion_fact_parser_model(),
            parser_model_prompt="""
Convert the response into the exact StructuredLearnerFactClassification schema.
Return valid JSON only.
- fact_category: string
- fact_value: string
- fact_label: string
- fact_confidence: high, medium, or low
Do not include markdown fences or extra keys.
""".strip(),
            use_json_mode=True,
            retries=0,
            markdown=False,
            telemetry=False,
            debug_mode=False,
        )
    return _DISCUSSION_FACT_STRUCTURER_AGENT


def _discussion_fact_agent() -> Agent:
    global _DISCUSSION_FACT_AGENT
    if _DISCUSSION_FACT_AGENT is None:
        _DISCUSSION_FACT_AGENT = Agent(
            name="Learner Discussion Fact Extractor",
            model=_discussion_fact_model(),
            skills=Skills(loaders=[LocalSkills(str(_discussion_skill_root()))]),
            instructions=[
                "You extract durable learner facts from a single coaching message.",
                "Load the discussion-fact-extractor skill instructions before extracting any facts.",
                "Use the skill reference if needed to decide whether a fact belongs in tenant:user or tenant:user:course memory.",
                "Return only stable facts worth storing for future coaching.",
            ],
            expected_output="""
Return valid JSON only with this exact shape:
{
  "general_facts": ["..."],
  "course_facts": ["..."],
  "reasoning": "..."
}
Do not include markdown fences or any extra text.
""".strip(),
            retries=0,
            markdown=False,
            telemetry=False,
        )
    return _DISCUSSION_FACT_AGENT


def _parse_recall_lines(text: str) -> list[str]:
    memories: list[str] = []
    for raw_line in text.splitlines():
        line = _clean_text(raw_line)
        if not line:
            continue
        if line.lower() == "no relevant memories found.":
            return []
        if ". " in line and line.split(". ", 1)[0].isdigit():
            line = line.split(". ", 1)[1]
        memories.append(line)
    return memories


def _parse_discussion_fact_text(text: str) -> DiscussionFactExtraction:
    stripped = _clean_text(text)
    if stripped.startswith("{") and stripped.endswith("}"):
        try:
            payload = json.loads(stripped)
            return DiscussionFactExtraction.model_validate(payload)
        except Exception:
            pass

    general_facts: list[str] = []
    course_facts: list[str] = []
    reasoning_parts: list[str] = []
    current_section = ""
    for raw_line in text.splitlines():
        line = _clean_text(raw_line)
        if not line:
            continue
        lowered = line.casefold().replace("*", "")
        if "general_facts" in lowered:
            current_section = "general"
            continue
        if "course_facts" in lowered:
            current_section = "course"
            continue
        if "reasoning" in lowered:
            current_section = "reasoning"
            continue
        if line.startswith("- "):
            item = _clean_text(line[2:])
            if current_section == "general":
                general_facts.append(item)
            elif current_section == "course":
                course_facts.append(item)
            elif current_section == "reasoning":
                reasoning_parts.append(item)
            continue
        if current_section == "reasoning":
            reasoning_parts.append(line)
    return DiscussionFactExtraction(
        general_facts=_normalize_fact_items(general_facts),
        course_facts=_normalize_fact_items(course_facts),
        reasoning=" ".join(reasoning_parts).strip(),
    )


def _parse_duplicate_decision_text(text: str) -> DiscussionFactDuplicateDecision:
    lowered = text.casefold()
    duplicate_markers = (
        '"is_duplicate": true',
        '"is_duplicate":true',
        "is_duplicate: true",
        "is_duplicate=true",
        "verdict: duplicate",
        "duplicate: true",
        "duplicate=true",
    )
    non_duplicate_markers = (
        '"is_duplicate": false',
        '"is_duplicate":false',
        "is_duplicate: false",
        "is_duplicate=false",
        "verdict: not duplicate",
        "not duplicate",
        "duplicate: false",
        "duplicate=false",
    )
    if any(marker in lowered for marker in non_duplicate_markers):
        is_duplicate = False
    elif any(marker in lowered for marker in duplicate_markers):
        is_duplicate = True
    else:
        is_duplicate = False
    matched_memory = ""
    reasoning = _clean_text(text)
    for raw_line in text.splitlines():
        line = _clean_text(raw_line)
        if line.casefold().startswith("matched_memory"):
            matched_memory = _clean_text(line.split(":", 1)[1] if ":" in line else "")
    return DiscussionFactDuplicateDecision(
        is_duplicate=is_duplicate,
        matched_memory=matched_memory,
        reasoning=reasoning,
    )


def _parse_batched_duplicate_decision_text(text: str) -> BatchedDiscussionFactDuplicateDecision:
    duplicate_facts: list[str] = []
    matched_memories: dict[str, str] = {}
    reasoning_parts: list[str] = []
    current_section = ""
    for raw_line in text.splitlines():
        line = _clean_text(raw_line)
        if not line:
            continue
        lowered = line.casefold().replace("*", "")
        if "duplicate_facts" in lowered:
            current_section = "duplicates"
            continue
        if "matched_memories" in lowered:
            current_section = "matches"
            continue
        if "reasoning" in lowered:
            current_section = "reasoning"
            continue
        if current_section == "duplicates" and line.startswith("- "):
            duplicate_facts.append(_clean_text(line[2:]))
            continue
        if current_section == "matches" and ":" in line:
            key, value = line.split(":", 1)
            matched_memories[_clean_text(key).lstrip("- ").strip()] = _clean_text(value)
            continue
        if current_section == "reasoning":
            reasoning_parts.append(line)
    return BatchedDiscussionFactDuplicateDecision(
        duplicate_facts=_normalize_fact_items(duplicate_facts),
        matched_memories=matched_memories,
        reasoning=" ".join(reasoning_parts).strip(),
    )


def _build_hindsight_tools(
    *,
    bank_id: str,
    hindsight_url: str,
    hindsight_api_key: str | None,
    tags: list[str] | None = None,
    recall_tags: list[str] | None = None,
) -> HindsightTools:
    return HindsightTools(
        bank_id=bank_id,
        hindsight_api_url=hindsight_url,
        api_key=hindsight_api_key,
        budget="low",
        max_tokens=500,
        tags=tags,
        recall_tags=recall_tags,
        enable_reflect=False,
    )


def _discussion_fact_duplicate_agent() -> Agent:
    global _DISCUSSION_FACT_DUPLICATE_AGENT
    if _DISCUSSION_FACT_DUPLICATE_AGENT is None:
        _DISCUSSION_FACT_DUPLICATE_AGENT = Agent(
            name="Learner Discussion Fact Duplicate Judge",
            model=_discussion_fact_model(),
            skills=Skills(loaders=[LocalSkills(str(_discussion_skill_root()))]),
            instructions=[
                "You decide whether a newly extracted learner fact is already present in memory.",
                "Load the discussion-fact-extractor skill instructions before making the duplicate decision.",
                "Treat paraphrases with the same meaning as duplicates.",
                "Mark facts as non-duplicates only when they add meaningfully new information.",
            ],
            expected_output=(
                "Return JSON with keys is_duplicate, matched_memory, reasoning."
            ),
            output_schema=DiscussionFactDuplicateDecision,
            parser_model=_discussion_fact_parser_model(),
            parser_model_prompt="""
Convert the response into the exact DiscussionFactDuplicateDecision schema.
Return valid JSON only.
- is_duplicate: true or false
- matched_memory: string
- reasoning: short string
Do not include markdown fences or extra keys.
""".strip(),
            use_json_mode=True,
            retries=0,
            markdown=False,
            telemetry=False,
        )
    return _DISCUSSION_FACT_DUPLICATE_AGENT


def _batched_discussion_fact_duplicate_agent() -> Agent:
    return Agent(
        name="Learner Discussion Fact Duplicate Batch Judge",
        model=_discussion_fact_model(),
        skills=Skills(loaders=[LocalSkills(str(_discussion_skill_root()))]),
        instructions=[
            "You receive a list of newly extracted learner facts and a list of recalled memory candidates for one bank.",
            "Load the discussion-fact-extractor skill instructions before deciding duplicates.",
            "Mark a fact as duplicate only when a recalled memory already expresses the same meaning.",
            "Return only duplicates and their best matched memory.",
        ],
        expected_output=(
            "Return JSON with keys duplicate_facts, matched_memories, reasoning."
        ),
        output_schema=BatchedDiscussionFactDuplicateDecision,
        parser_model=_discussion_fact_parser_model(),
        parser_model_prompt="""
Convert the response into the exact BatchedDiscussionFactDuplicateDecision schema.
Return valid JSON only.
- duplicate_facts: list of strings
- matched_memories: object mapping duplicate fact string to best matching recalled memory string
- reasoning: short string
Do not include markdown fences or extra keys.
""".strip(),
        use_json_mode=True,
        retries=0,
        markdown=False,
        telemetry=False,
    )


def _extract_discussion_facts(payload: LearnerLessonMemoryInput) -> DiscussionFactExtraction:
    agent = _discussion_fact_agent()
    course_title = _clean_text(payload.courseTitle) or f"Course {payload.courseId}"
    lesson_title = _clean_text(payload.lessonTitle) or "Coaching discussion"
    prompt = "\n".join(
        [
            "Extract learner facts from this coaching discussion message.",
            f"Tenant ID: {payload.tenantId}",
            f"User ID: {payload.userId}",
            f"Course ID: {payload.courseId}",
            f"Course Title: {course_title}",
            f"Lesson Title: {lesson_title}",
            f"Session ID: {_clean_text(payload.sessionId) or 'no-session'}",
            f"Source: {_clean_text(payload.source) or 'coach-page'}",
            "Message:",
            _clean_text(payload.discussionMessage) or "No message provided.",
        ]
    )
    try:
        response = agent.run(prompt)
        content = response.content
        if isinstance(content, DiscussionFactExtraction):
            extraction = content
        elif isinstance(content, dict):
            extraction = DiscussionFactExtraction.model_validate(content)
        else:
            extraction = _parse_discussion_fact_text(str(content))
    except Exception as error:
        _log(f"[Agno Learner Memory Agent] Discussion fact extractor failed: {error}")
        raise RuntimeError(f"discussion fact extraction failed: {error}") from error
    extraction.general_facts = _normalize_fact_items(extraction.general_facts)
    extraction.course_facts = _normalize_fact_items(extraction.course_facts)
    extraction.reasoning = _clean_text(extraction.reasoning)
    return extraction


def _extract_discussion_facts_only(payload: LearnerLessonMemoryInput) -> dict[str, Any]:
    _log("[Agno Learner Memory Agent] Discussion event extraction-only path started.")
    _log("[Agno Learner Memory Agent] Loading discussion-fact-extractor skill for fast fact extraction.")
    try:
        extraction = _extract_discussion_facts(payload)
    except Exception as error:
        return {
            "success": False,
            "workflowName": "learner-memory-agent",
            "action": "extract_discussion_facts_only",
            "tenantId": payload.tenantId,
            "userId": payload.userId,
            "courseId": payload.courseId,
            "lessonId": payload.lessonId,
            "generalFacts": [],
            "courseFacts": [],
            "reasoning": "",
            "error": f"{type(error).__name__}: {error}",
        }

    _log("[Agno Learner Memory Agent] Extracted discussion facts:")
    _log(f"[Agno Learner Memory Agent] Extracted general facts: {extraction.general_facts}")
    _log(f"[Agno Learner Memory Agent] Extracted course facts: {extraction.course_facts}")
    if extraction.reasoning:
        _log(f"[Agno Learner Memory Agent] Extraction reasoning: {extraction.reasoning}")
    _log("[Agno Learner Memory Agent] Fast extraction completed. Coaching agent can start now while retention continues.")

    return {
        "success": True,
        "workflowName": "learner-memory-agent",
        "action": "extract_discussion_facts_only",
        "tenantId": payload.tenantId,
        "userId": payload.userId,
        "courseId": payload.courseId,
        "lessonId": payload.lessonId,
        "generalFacts": extraction.general_facts,
        "courseFacts": extraction.course_facts,
        "reasoning": extraction.reasoning,
    }


def _recall_similar_memories(
    *,
    hindsight_url: str,
    hindsight_api_key: str | None,
    bank_id: str,
    fact: str,
    recall_tags: list[str] | None = None,
) -> list[str]:
    _log(
        f"[Agno Learner Memory Agent] Recalling similar memories via HindsightTools from bank={bank_id}"
    )
    tools = _build_hindsight_tools(
        bank_id=bank_id,
        hindsight_url=hindsight_url,
        hindsight_api_key=hindsight_api_key,
        recall_tags=recall_tags,
    )
    try:
        recalled = tools.recall_memory(None, fact)
        return _parse_recall_lines(recalled)[:5]
    finally:
        client = getattr(tools, "_client", None)
        if client is not None:
            try:
                client.close()
            except Exception:
                pass


def _recall_bank_context(
    *,
    hindsight_url: str,
    hindsight_api_key: str | None,
    bank_id: str,
    query: str,
    recall_tags: list[str] | None = None,
) -> list[str]:
    _log(f"[Agno Learner Memory Agent] Recalling bank context once via HindsightTools from bank={bank_id}")
    tools = _build_hindsight_tools(
        bank_id=bank_id,
        hindsight_url=hindsight_url,
        hindsight_api_key=hindsight_api_key,
        recall_tags=recall_tags,
    )
    try:
        recalled = tools.recall_memory(None, query)
        return _parse_recall_lines(recalled)[:8]
    finally:
        client = getattr(tools, "_client", None)
        if client is not None:
            try:
                client.close()
            except Exception:
                pass


def _local_duplicate_filter(
    facts: list[str],
    candidate_memories: list[str],
) -> tuple[list[str], dict[str, str]]:
    unresolved: list[str] = []
    duplicates: dict[str, str] = {}
    normalized_candidates = [
        (_normalize_for_comparison(memory), memory)
        for memory in candidate_memories
        if _normalize_for_comparison(memory)
    ]
    for fact in facts:
        normalized_fact = _normalize_for_comparison(fact)
        exact_match = next(
            (memory for normalized, memory in normalized_candidates if normalized == normalized_fact),
            "",
        )
        if exact_match:
            duplicates[fact] = exact_match
            continue
        unresolved.append(fact)
    return unresolved, duplicates


def _judge_duplicate_fact(
    *,
    fact: str,
    scope_label: str,
    candidate_memories: list[str],
) -> DiscussionFactDuplicateDecision:
    if not candidate_memories:
        return DiscussionFactDuplicateDecision(is_duplicate=False, matched_memory="", reasoning="No similar memories found.")

    prompt = "\n".join(
        [
            "Decide whether the new learner fact is already present in memory.",
            f"Scope: {scope_label}",
            f"New fact: {fact}",
            "Candidate memories:",
            *[f"- {memory}" for memory in candidate_memories],
            "Treat same-meaning paraphrases as duplicates. Return matched_memory only when duplicate=true.",
        ]
    )
    try:
        response = _discussion_fact_duplicate_agent().run(prompt)
        content = response.content
        if isinstance(content, DiscussionFactDuplicateDecision):
            return content
        if isinstance(content, dict):
            return DiscussionFactDuplicateDecision.model_validate(content)
        return _parse_duplicate_decision_text(str(content))
    except Exception as error:
        _log(f"[Agno Learner Memory Agent] Duplicate judge failed, defaulting to not-duplicate: {error}")
        return DiscussionFactDuplicateDecision(
            is_duplicate=False,
            matched_memory="",
            reasoning=f"duplicate judge failed: {error}",
        )


def _judge_duplicate_facts_batch(
    *,
    scope_label: str,
    facts: list[str],
    candidate_memories: list[str],
) -> BatchedDiscussionFactDuplicateDecision:
    if not facts or not candidate_memories:
        return BatchedDiscussionFactDuplicateDecision(
            duplicate_facts=[],
            matched_memories={},
            reasoning="No unresolved facts or candidate memories to compare.",
        )

    prompt = "\n".join(
        [
            "Decide which new learner facts are duplicates of recalled memories.",
            f"Scope: {scope_label}",
            "New facts:",
            *[f"- {fact}" for fact in facts],
            "Candidate memories:",
            *[f"- {memory}" for memory in candidate_memories],
            "Return only the facts that are duplicates. Treat paraphrases with the same meaning as duplicates.",
        ]
    )
    try:
        response = _batched_discussion_fact_duplicate_agent().run(prompt)
        content = response.content
        if isinstance(content, BatchedDiscussionFactDuplicateDecision):
            return content
        if isinstance(content, dict):
            return BatchedDiscussionFactDuplicateDecision.model_validate(content)
        return _parse_batched_duplicate_decision_text(str(content))
    except Exception as error:
        _log(f"[Agno Learner Memory Agent] Batched duplicate judge failed, defaulting to no duplicates: {error}")
        return BatchedDiscussionFactDuplicateDecision(
            duplicate_facts=[],
            matched_memories={},
            reasoning=f"batched duplicate judge failed: {error}",
        )


def _retain_memory_item(
    *,
    hindsight_url: str,
    hindsight_api_key: str | None,
    bank_id: str,
    content: str,
    tags: list[str],
) -> dict[str, Any]:
    _log(
        f"[Agno Learner Memory Agent] Retaining learner fact via Hindsight HTTP async retain into bank={bank_id}"
    )
    try:
        headers = {"Content-Type": "application/json"}
        if hindsight_api_key:
            headers["Authorization"] = f"Bearer {hindsight_api_key}"
        retain_response = httpx.post(
            f"{hindsight_url}/v1/default/banks/{bank_id}/memories",
            json={
                "items": [
                    {
                        "content": content,
                        "tags": tags,
                    }
                ],
                "async": True,
            },
            headers=headers,
            timeout=httpx.Timeout(MEMORY_HTTP_TIMEOUT_SECONDS),
        )
        if retain_response.status_code >= 400:
            raise RuntimeError(
                f"Hindsight retain HTTP {retain_response.status_code}: {retain_response.text}"
            )
        retain_result = retain_response.json()
        operation_id = _clean_text(retain_result.get("operation_id"))
        if not operation_id and not bool(retain_result.get("async")):
            raise RuntimeError("Hindsight async retain did not return an operation id.")
        return {
            "success": True,
            "message": "Memory queued successfully.",
            "operationId": operation_id or None,
        }
    except Exception as error:
        content_preview = _clean_text(content).replace("\n", " ")
        if len(content_preview) > 320:
            content_preview = content_preview[:317] + "..."
        _log(
            "[Agno Learner Memory Agent] Structured fact retain failed. "
            f"bank={bank_id} errorType={type(error).__name__} error={error!r} "
            f"contentPreview={content_preview}"
        )
        raise


def _process_fact_scope(
    *,
    scope_label: str,
    bank_id: str,
    facts: list[str],
    hindsight_url: str,
    hindsight_api_key: str | None,
    source_message: str,
    payload: LearnerLessonMemoryInput,
    captured_at_iso: str,
    prepared_candidate_memories: list[str] | None = None,
) -> dict[str, Any]:
    skipped_facts: list[str] = []
    stored_facts: list[str] = []
    memory_contents: list[str] = []

    for fact in facts:
        if prepared_candidate_memories is not None:
            candidate_memories = prepared_candidate_memories
            _log(
                f"[Agno Learner Memory Agent] {scope_label} branch is using prepared Redis memories "
                f"instead of Hindsight recall for duplicate checking."
            )
        else:
            candidate_memories = _recall_similar_memories(
                hindsight_url=hindsight_url,
                hindsight_api_key=hindsight_api_key,
                bank_id=bank_id,
                fact=fact,
            )
        normalized_fact = _normalize_for_comparison(fact)
        exact_match = next(
            (
                memory
                for memory in candidate_memories
                if _normalize_for_comparison(memory) == normalized_fact
            ),
            "",
        )
        duplicate_decision = (
            DiscussionFactDuplicateDecision(
                is_duplicate=True,
                matched_memory=exact_match,
                reasoning=f"Exact normalized duplicate found in the {scope_label} bank.",
            )
            if exact_match
            else _judge_duplicate_fact(
                fact=fact,
                scope_label=scope_label,
                candidate_memories=candidate_memories,
            )
        )
        if duplicate_decision.is_duplicate:
            skipped_facts.append(fact)
            _log(
                f"[Agno Learner Memory Agent] {scope_label} branch skipping duplicate fact: "
                f"fact=\"{fact}\" matched=\"{duplicate_decision.matched_memory}\" "
                f"reason=\"{duplicate_decision.reasoning}\""
            )
            continue

        structured_fact = _build_structured_fact(
            fact=fact,
            scope_label=scope_label,
            payload=payload,
            captured_at_iso=captured_at_iso,
            source_message=source_message,
        )
        memory_content = _structured_fact_to_memory_content(structured_fact)
        tags = [
            "scope:learner_course" if scope_label == "tenant:user:course" else "scope:learner_general",
            "type:structured_learner_fact",
            f"category:{structured_fact.fact_category}",
            "source:coaching_discussion",
        ]
        _log("[Agno Learner Memory Agent] Structured learner fact prepared for retention:")
        _log(memory_content)

        _retain_memory_item(
            hindsight_url=hindsight_url,
            hindsight_api_key=hindsight_api_key,
            bank_id=bank_id,
            content=memory_content,
            tags=tags,
        )
        stored_facts.append(fact)
        memory_contents.append(memory_content)

    return {
        "stored_facts": stored_facts,
        "skipped_facts": skipped_facts,
        "memory_contents": memory_contents,
    }


def _retain_discussion_fact_memories(payload: LearnerLessonMemoryInput) -> dict[str, Any]:
    hindsight_url = (payload.hindsightApiUrl or DEFAULT_HINDSIGHT_URL).rstrip("/")
    hindsight_api_key = payload.hindsightApiKey or DEFAULT_HINDSIGHT_API_KEY
    general_bank_id = _build_user_bank_id(payload.tenantId, payload.userId)
    course_bank_id = _build_user_course_bank_id(payload.tenantId, payload.userId, payload.courseId)
    captured_at_iso = datetime.now(timezone.utc).isoformat()
    prepared_context = _load_prepared_context_from_redis(_clean_text(payload.preparedContextId))
    prepared_general_memories = (
        _memory_lines_from_text(prepared_context.get("tenant_user_memories"))
        if isinstance(prepared_context, dict)
        else None
    )
    prepared_course_memories = (
        _memory_lines_from_text(prepared_context.get("tenant_user_course_memories"))
        if isinstance(prepared_context, dict)
        else None
    )

    _log("[Agno Learner Memory Agent] Discussion event uses the skill-based fact extraction path.")
    if payload.preExtractedGeneralFacts or payload.preExtractedCourseFacts or _clean_text(payload.preExtractionReasoning):
        extraction = DiscussionFactExtraction(
            general_facts=_normalize_fact_items(payload.preExtractedGeneralFacts),
            course_facts=_normalize_fact_items(payload.preExtractedCourseFacts),
            reasoning=_clean_text(payload.preExtractionReasoning),
        )
        _log("[Agno Learner Memory Agent] Reusing pre-extracted discussion facts from the route.")
        _log("[Agno Learner Memory Agent] Coaching agent and learner-memory retention are now working in parallel.")
        _log(f"[Agno Learner Memory Agent] Reused general facts: {extraction.general_facts}")
        _log(f"[Agno Learner Memory Agent] Reused course facts: {extraction.course_facts}")
        if extraction.reasoning:
            _log(f"[Agno Learner Memory Agent] Reused extraction reasoning: {extraction.reasoning}")
    else:
        _log("[Agno Learner Memory Agent] Loading discussion-fact-extractor skill for learner message analysis.")
        try:
            extraction = _extract_discussion_facts(payload)
        except Exception as error:
            return {
                "success": True,
                "workflowName": "learner-memory-agent",
                "action": "extract_discussion_facts_fallback_noop",
                "tenantId": payload.tenantId,
                "userId": payload.userId,
                "courseId": payload.courseId,
                "lessonId": payload.lessonId,
                "memoryContent": f"Discussion fact extraction was skipped because the extractor failed: {error}",
                "retentionMode": "discussion_skill_failed_noop",
                "generalFactsStored": [],
                "courseFactsStored": [],
                "duplicateGeneralFactsSkipped": [],
                "duplicateCourseFactsSkipped": [],
            }
        _log("[Agno Learner Memory Agent] Extracted discussion facts:")
        _log(f"[Agno Learner Memory Agent] Extracted general facts: {extraction.general_facts}")
        _log(f"[Agno Learner Memory Agent] Extracted course facts: {extraction.course_facts}")
        if extraction.reasoning:
            _log(f"[Agno Learner Memory Agent] Extraction reasoning: {extraction.reasoning}")

    if not extraction.general_facts and not extraction.course_facts:
        _log("[Agno Learner Memory Agent] No retainable learner facts were found in the discussion message.")
        return {
            "success": True,
            "workflowName": "learner-memory-agent",
            "action": "extract_discussion_facts",
            "tenantId": payload.tenantId,
            "userId": payload.userId,
            "courseId": payload.courseId,
            "lessonId": payload.lessonId,
            "memoryContent": "No retainable learner facts were extracted from the discussion message.",
            "retentionMode": "discussion_skill_noop",
            "generalFactsStored": [],
            "courseFactsStored": [],
        }

    if prepared_general_memories is not None:
        _log(
            "[Agno Learner Memory Agent] Prepared Redis general-bank memories are ready for duplicate checking. "
            f"count={len(prepared_general_memories)}"
        )
    if prepared_course_memories is not None:
        _log(
            "[Agno Learner Memory Agent] Prepared Redis course-bank memories are ready for duplicate checking. "
            f"count={len(prepared_course_memories)}"
        )

    general_bank_created, general_bank_error = _ensure_bank_exists(
        hindsight_url=hindsight_url,
        hindsight_api_key=hindsight_api_key,
        bank_id=general_bank_id,
        bank_body=_build_user_bank_body(tenant_id=payload.tenantId, user_id=payload.userId),
    )
    if general_bank_error:
        return {
            "success": False,
            "workflowName": "learner-memory-agent",
            "action": "create_general_user_bank",
            "tenantId": payload.tenantId,
            "userId": payload.userId,
            "courseId": payload.courseId,
            "lessonId": payload.lessonId,
            "bankId": general_bank_id,
            "error": general_bank_error,
        }

    course_bank_created, course_bank_error = _ensure_bank_exists(
        hindsight_url=hindsight_url,
        hindsight_api_key=hindsight_api_key,
        bank_id=course_bank_id,
        bank_body=_build_bank_body(
            tenant_id=payload.tenantId,
            user_id=payload.userId,
            course_id=payload.courseId,
        ),
    )
    if course_bank_error:
        return {
            "success": False,
            "workflowName": "learner-memory-agent",
            "action": "create_course_user_bank",
            "tenantId": payload.tenantId,
            "userId": payload.userId,
            "courseId": payload.courseId,
            "lessonId": payload.lessonId,
            "bankId": course_bank_id,
            "error": course_bank_error,
        }

    general_memory_contents: list[str] = []
    course_memory_contents: list[str] = []
    skipped_general_facts: list[str] = []
    skipped_course_facts: list[str] = []
    source_message = _clean_text(payload.discussionMessage) or "No message provided."
    try:
        _log("[Agno Learner Memory Agent] General-fact branch and course-fact branch start working in parallel.")
        branch_results: dict[str, dict[str, Any]] = {}
        branch_errors: dict[str, BaseException] = {}

        def _run_scope_branch(
            branch_name: str,
            scope_label: str,
            bank_id: str,
            facts: list[str],
            prepared_candidate_memories: list[str] | None,
        ) -> None:
            local_skipped: list[str] = []
            local_memory_contents: list[str] = []
            _log(f"[Agno Learner Memory Agent] {branch_name} branch started in parallel.")
            if prepared_candidate_memories is not None:
                _log(
                    f"[Agno Learner Memory Agent] {branch_name} branch is using prepared Redis memories "
                    f"instead of Hindsight recall for duplicate checking."
                )
            for fact in facts:
                if prepared_candidate_memories is not None:
                    candidate_memories = prepared_candidate_memories
                else:
                    candidate_memories = _recall_similar_memories(
                        hindsight_url=hindsight_url,
                        hindsight_api_key=hindsight_api_key,
                        bank_id=bank_id,
                        fact=fact,
                    )
                normalized_fact = _normalize_for_comparison(fact)
                exact_match = next(
                    (
                        memory
                        for memory in candidate_memories
                        if _normalize_for_comparison(memory) == normalized_fact
                    ),
                    "",
                )
                duplicate_decision = (
                    DiscussionFactDuplicateDecision(
                        is_duplicate=True,
                        matched_memory=exact_match,
                        reasoning=f"Exact normalized duplicate found in the {scope_label} bank.",
                    )
                    if exact_match
                    else _judge_duplicate_fact(
                        fact=fact,
                        scope_label=scope_label,
                        candidate_memories=candidate_memories,
                    )
                )
                if duplicate_decision.is_duplicate:
                    local_skipped.append(fact)
                    _log(
                        f"[Agno Learner Memory Agent] {branch_name} branch skipping duplicate fact: "
                        f"fact=\"{fact}\" matched=\"{duplicate_decision.matched_memory}\" "
                        f"reason=\"{duplicate_decision.reasoning}\""
                    )
                    continue

                scope_for_fact = "tenant:user:course" if branch_name == "Course" else "tenant:user"
                structured_fact = _build_structured_fact(
                    fact=fact,
                    scope_label=scope_for_fact,
                    payload=payload,
                    captured_at_iso=captured_at_iso,
                    source_message=source_message,
                )
                memory_content = _structured_fact_to_memory_content(structured_fact)
                tags = [
                    "scope:learner_course" if branch_name == "Course" else "scope:learner_general",
                    "type:structured_learner_fact",
                    f"category:{structured_fact.fact_category}",
                    "source:coaching_discussion",
                ]
                _log("[Agno Learner Memory Agent] Structured learner fact prepared for retention:")
                _log(memory_content)

                _retain_memory_item(
                    hindsight_url=hindsight_url,
                    hindsight_api_key=hindsight_api_key,
                    bank_id=bank_id,
                    content=memory_content,
                    tags=tags,
                )
                local_memory_contents.append(memory_content)

            branch_results[branch_name] = {
                "skipped_facts": local_skipped,
                "memory_contents": local_memory_contents,
            }
            _log(
                f"[Agno Learner Memory Agent] {branch_name} branch finished in parallel. "
                f"stored={len(local_memory_contents)} skipped={len(local_skipped)}"
            )

        def _run_scope_branch_guarded(
            branch_name: str,
            scope_label: str,
            bank_id: str,
            facts: list[str],
            prepared_candidate_memories: list[str] | None,
        ) -> None:
            try:
                _run_scope_branch(branch_name, scope_label, bank_id, facts, prepared_candidate_memories)
            except BaseException as error:  # noqa: BLE001
                branch_errors[branch_name] = error

        general_thread = threading.Thread(
            target=_run_scope_branch_guarded,
            args=("General", "tenant:user", general_bank_id, extraction.general_facts, prepared_general_memories),
            daemon=True,
        )
        course_thread = threading.Thread(
            target=_run_scope_branch_guarded,
            args=("Course", "tenant:user:course", course_bank_id, extraction.course_facts, prepared_course_memories),
            daemon=True,
        )
        general_thread.start()
        course_thread.start()
        general_thread.join()
        course_thread.join()

        if branch_errors:
            first_branch, first_error = next(iter(branch_errors.items()))
            raise RuntimeError(f"{first_branch} branch failed: {first_error}")

        general_memory_contents = list(branch_results.get("General", {}).get("memory_contents", []))
        course_memory_contents = list(branch_results.get("Course", {}).get("memory_contents", []))
        skipped_general_facts = list(branch_results.get("General", {}).get("skipped_facts", []))
        skipped_course_facts = list(branch_results.get("Course", {}).get("skipped_facts", []))
    except Exception as error:
        return {
            "success": False,
            "workflowName": "learner-memory-agent",
            "action": "retain_discussion_fact_memories",
            "tenantId": payload.tenantId,
            "userId": payload.userId,
            "courseId": payload.courseId,
            "lessonId": payload.lessonId,
            "generalBankId": general_bank_id,
            "courseBankId": course_bank_id,
            "error": f"{type(error).__name__}: {error}",
        }

    if general_memory_contents:
        _log("[Agno Learner Memory Agent] Stored learner general facts in tenant:user bank:")
        for content in general_memory_contents:
            _log(content)
    if skipped_general_facts:
        _log(f"[Agno Learner Memory Agent] Duplicate general facts skipped: {skipped_general_facts}")
    if course_memory_contents:
        _log("[Agno Learner Memory Agent] Stored learner course facts in tenant:user:course bank:")
        for content in course_memory_contents:
            _log(content)
    if skipped_course_facts:
        _log(f"[Agno Learner Memory Agent] Duplicate course facts skipped: {skipped_course_facts}")

    stored_general_facts = [fact for fact in extraction.general_facts if fact not in skipped_general_facts]
    stored_course_facts = [fact for fact in extraction.course_facts if fact not in skipped_course_facts]

    summary_lines = [
        "Skill-based coaching discussion fact extraction completed.",
        f"General bank: {general_bank_id}",
        f"Course bank: {course_bank_id}",
    ]
    if stored_general_facts:
        summary_lines.append(f"General facts stored: {', '.join(stored_general_facts)}")
    if stored_course_facts:
        summary_lines.append(f"Course facts stored: {', '.join(stored_course_facts)}")
    if skipped_general_facts:
        summary_lines.append(f"Duplicate general facts skipped: {', '.join(skipped_general_facts)}")
    if skipped_course_facts:
        summary_lines.append(f"Duplicate course facts skipped: {', '.join(skipped_course_facts)}")
    if extraction.reasoning:
        summary_lines.append(f"Reasoning: {extraction.reasoning}")

    return {
        "success": True,
        "workflowName": "learner-memory-agent",
        "action": "extract_discussion_facts",
        "tenantId": payload.tenantId,
        "userId": payload.userId,
        "courseId": payload.courseId,
        "lessonId": payload.lessonId,
        "bankId": course_bank_id,
        "generalBankId": general_bank_id,
        "courseBankId": course_bank_id,
        "bankCreated": course_bank_created,
        "generalBankCreated": general_bank_created,
        "capturedAt": captured_at_iso,
        "memoryContent": "\n".join(summary_lines),
        "generalFactsStored": stored_general_facts,
        "courseFactsStored": stored_course_facts,
        "duplicateGeneralFactsSkipped": skipped_general_facts,
        "duplicateCourseFactsSkipped": skipped_course_facts,
        "retentionMode": "discussion_skill_fact_extraction",
    }


def _retain_payload(payload: LearnerLessonMemoryInput) -> dict[str, Any]:
    if payload.eventType == "coaching_discussion_message":
        return _retain_discussion_fact_memories(payload)

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
        bank_body=_build_bank_body(
            tenant_id=payload.tenantId,
            user_id=payload.userId,
            course_id=payload.courseId,
        ),
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
        if payload.eventType == "coaching_discussion_message":
            _log("[Agno Learner Memory Agent] Retaining learner coaching-discussion event via Hindsight HTTP async retain.")
        elif payload.eventType == "quiz_completed":
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

    if payload.eventType == "coaching_discussion_message":
        _log("[Agno Learner Memory Agent] Collected learner coaching-discussion event:")
    elif payload.eventType == "quiz_completed":
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


def extract_discussion_facts_payload(raw_input: dict[str, Any]) -> dict[str, Any]:
    payload = LearnerLessonMemoryInput.model_validate(raw_input)
    _log_event_start(payload)
    return _extract_discussion_facts_only(payload)


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
