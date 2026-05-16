from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from queue import Queue
from threading import Thread
from typing import Any
from uuid import UUID

import httpx
from pydantic import BaseModel

from agno.workflow import Parallel, Step, StepInput, StepOutput, Workflow

from .enrichment_steps import (
    compose_coaching_response_step,
    detect_affect_signal_step,
    finalize_intent_step,
    load_prepared_context_step,
    merge_parallel_enrichment_step,
    parse_synthesis_step,
)



DEFAULT_HINDSIGHT_URL = os.getenv("HINDSIGHT_API_URL", "http://127.0.0.1:8888")
DEFAULT_HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY", "")
DEFAULT_QUESTION = (
    "In this HTML course, why is the alt attribute important for images, "
    "and what does the course say about the src attribute?"
)
DEFAULT_CLASSIFICATION_MODEL = os.getenv("COACH_MODE_JUDGE_MODEL", "openai/gpt-oss-120b:free")
HINDSIGHT_REFLECT_READ_TIMEOUT_SECONDS = float(os.getenv("CHAT_COACH_HINDSIGHT_REFLECT_READ_TIMEOUT_SECONDS", "150"))
CHAT_COACH_LOG_PREFIX = "\U0001F3AFCC [Agno Chat Coach Agent]"

if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

_WEAK_TOPIC_STOP_WORDS = {
    "a",
    "an",
    "and",
    "answer",
    "answers",
    "because",
    "best",
    "can",
    "choose",
    "correct",
    "course",
    "define",
    "does",
    "explain",
    "false",
    "following",
    "from",
    "how",
    "important",
    "into",
    "is",
    "lesson",
    "main",
    "most",
    "not",
    "option",
    "question",
    "quiz",
    "select",
    "should",
    "shows",
    "that",
    "the",
    "these",
    "this",
    "true",
    "use",
    "used",
    "using",
    "what",
    "which",
    "why",
    "with",
}
_STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "for",
    "from",
    "how",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "what",
    "which",
    "why",
    "with",
}


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _learner_memory_workflow() -> Any:
    workflow_path = _repo_root() / "agents" / "learner-memory" / "app" / "workflow.py"
    module_name = f"openmaic_learner_memory_workflow_{int(time.time() * 1000)}"
    spec = importlib.util.spec_from_file_location(module_name, workflow_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load learner-memory workflow from {workflow_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    if hasattr(module, "LessonReference"):
        module.LessonReference.model_rebuild(_types_namespace=module.__dict__)
    if hasattr(module, "LearnerLessonMemoryInput"):
        module.LearnerLessonMemoryInput.model_rebuild(_types_namespace=module.__dict__)
    return module

def _log(message: str) -> None:
    if message.startswith("[Agno Chat Coach Agent]"):
        message = message.replace("[Agno Chat Coach Agent]", CHAT_COACH_LOG_PREFIX, 1)
    try:
        print(message, file=sys.stderr, flush=True)
    except UnicodeEncodeError:
        safe_message = message.encode(
            sys.stderr.encoding or "utf-8",
            errors="backslashreplace",
        ).decode(sys.stderr.encoding or "utf-8", errors="strict")
        print(safe_message, file=sys.stderr, flush=True)


def _log_validation_context_layers(context: dict[str, Any]) -> None:
    coach_context = {
        "tenant_id": context.get("tenant_id"),
        "course_id": context.get("course_id"),
        "course_title": context.get("course_title"),
        "user_id": context.get("user_id"),
        "bank_id": context.get("bank_id"),
        "prepared_context_id": context.get("prepared_context_id"),
        "current_lesson_id": context.get("current_lesson_id"),
        "current_lesson_title": context.get("current_lesson_title"),
        "ordered_lessons_count": len(_as_list(context.get("ordered_lessons"))),
        "learner_discussion_general_facts": context.get("learner_discussion_general_facts"),
        "learner_discussion_course_facts": context.get("learner_discussion_course_facts"),
        "learner_discussion_reasoning": context.get("learner_discussion_reasoning"),
        "session_id": context.get("session_id"),
        "session_turns": context.get("session_turns"),
        "conversation_turns": context.get("conversation_turns"),
        "updated_at": context.get("updated_at"),
    }

    _log("[Agno Chat Coach Agent] Collected coaching context:")
    _log(json.dumps(coach_context, indent=2, ensure_ascii=False))


def _is_validation_context_valid(context: dict[str, Any]) -> bool:
    return bool(
        context.get("tenant_id")
        and context.get("course_id")
        and context.get("user_id")
    )


def _build_classification_input(question: str, context: dict[str, Any]) -> dict[str, Any]:
    return {
        "question": question,
        "course_name": _clean_text(context.get("course_title")) or context.get("course_id"),
        "current_lesson": _clean_text(context.get("current_lesson_title")) or None,
        "learner_discussion_general_facts": _as_list(context.get("learner_discussion_general_facts")),
        "learner_discussion_course_facts": _as_list(context.get("learner_discussion_course_facts")),
        "learner_discussion_reasoning": _clean_text(context.get("learner_discussion_reasoning")) or None,
        "conversation_history": {
            "conversation_turns": int(context.get("conversation_turns") or 0),
            "history_available": False,
            "note": "Only the conversation turn count is currently available in this workflow.",
        },
        "validated_context": context,
    }


def _format_validation_context_for_answer(context: dict[str, Any]) -> str:
    coach_context = {
        "tenant_id": context.get("tenant_id"),
        "course_id": context.get("course_id"),
        "course_title": context.get("course_title"),
        "bank_id": context.get("bank_id"),
        "prepared_context_id": context.get("prepared_context_id"),
        "user_id": context.get("user_id"),
        "current_lesson_id": context.get("current_lesson_id"),
        "current_lesson_title": context.get("current_lesson_title"),
        "ordered_lessons_count": len(_as_list(context.get("ordered_lessons"))),
        "learner_discussion_general_facts": context.get("learner_discussion_general_facts"),
        "learner_discussion_course_facts": context.get("learner_discussion_course_facts"),
        "learner_discussion_reasoning": context.get("learner_discussion_reasoning"),
        "session_id": context.get("session_id"),
        "conversation_turns": context.get("conversation_turns"),
        "updated_at": context.get("updated_at"),
    }

    return json.dumps(coach_context, indent=2, ensure_ascii=False)


def _build_course_bank_id(tenant_id: str, course_id: str) -> str:
    return f"tenant:{tenant_id}:course:{course_id}"


class ChatCoachQuestionInput(BaseModel):
    tenantId: str
    courseId: str
    userId: str | None = None
    question: str = DEFAULT_QUESTION
    learnerContext: dict[str, object] | None = None
    hindsightApiUrl: str | None = None
    hindsightApiKey: str | None = None
    authToken: str | None = None
    conversationTurns: int = 0
    sessionId: str | None = None
    sessionTurns: list[dict[str, Any]] = []
    source: str | None = None
    lessonId: str | None = None
    pagePath: str | None = None
    learnerDiscussionGeneralFacts: list[str] = []
    learnerDiscussionCourseFacts: list[str] = []
    learnerDiscussionReasoning: str | None = None
    preparedContextId: str | None = None


class PreparedCoachingContextKickoffInput(BaseModel):
    tenantId: str
    courseId: str
    userId: str
    question: str
    sessionId: str | None = None
    preparedContextId: str
    learnerDiscussionGeneralFacts: list[str] = []
    learnerDiscussionCourseFacts: list[str] = []
    learnerDiscussionReasoning: str | None = None


class PreparedCoachingContextFactsInput(BaseModel):
    preparedContextId: str
    learnerDiscussionGeneralFacts: list[str] = []
    learnerDiscussionCourseFacts: list[str] = []
    learnerDiscussionReasoning: str | None = None


def _log_session_context(payload: ChatCoachQuestionInput) -> None:
    session_id = _clean_text(payload.sessionId) or "none"
    session_turns = payload.sessionTurns if isinstance(payload.sessionTurns, list) else []
    _log(
        f"[Agno Chat Coach Agent] Session context received. sessionId={session_id} priorSessionTurnCount={len(session_turns)}"
    )
    if session_turns:
        _log("[Agno Chat Coach Agent] Incoming sessionTurns context:")
        _log(json.dumps(session_turns, indent=2, ensure_ascii=False))


def _load_platform_dependencies():
    from common.auth import decode_token
    from common.database import SessionLocal
    from common.models import Course, Lesson, Module

    return {
        "Course": Course,
        "Lesson": Lesson,
        "Module": Module,
        "SessionLocal": SessionLocal,
        "decode_token": decode_token,
    }


def _tokenize(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9_<>/-]+", text.lower())
        if len(token) > 1 and token not in _STOP_WORDS
    }


def _weak_topic_tokens(text: str) -> list[str]:
    return [
        token
        for token in re.findall(r"[a-z0-9_/-]+", text.lower())
        if len(token) > 2 and token not in _WEAK_TOPIC_STOP_WORDS
    ]


def _select_supporting_memories(
    memories: list[dict[str, object]],
    *,
    query: str,
    answer: str,
    limit: int = 3,
) -> list[dict[str, object]]:
    query_tokens = _tokenize(query)
    answer_tokens = _tokenize(answer)

    scored: list[tuple[int, dict[str, object]]] = []
    for memory in memories:
        text = str(memory.get("text") or "")
        if not text.strip():
            continue

        memory_tokens = _tokenize(text)
        query_overlap = len(query_tokens & memory_tokens)
        answer_overlap = len(answer_tokens & memory_tokens)
        score = (query_overlap * 4) + (answer_overlap * 2)
        if score > 0:
            scored.append((score, memory))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [memory for _, memory in scored[:limit]]


def _as_dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _resolve_judge_url() -> str | None:
    explicit = _clean_text(os.getenv("COACH_MODE_JUDGE_URL"))
    if explicit:
        return explicit

    base_url = _clean_text(os.getenv("OPENAI_BASE_URL"))
    if base_url:
        return f"{base_url.rstrip('/')}/chat/completions"

    return "https://openrouter.ai/api/v1/chat/completions"


def _resolve_judge_api_key() -> str | None:
    return _clean_text(os.getenv("COACH_MODE_JUDGE_API_KEY")) or _clean_text(os.getenv("OPENAI_API_KEY")) or None


def _guess_topic_from_question(question: str, weak_topics: list[str], lesson_name: str) -> str:
    normalized_question = question.lower()
    for weak_topic in weak_topics:
        if weak_topic and weak_topic.lower() in normalized_question:
            return weak_topic

    lesson_tokens = [
        token
        for token in _weak_topic_tokens(lesson_name)
        if token not in {"lesson", "module", "quiz", "course"}
    ]
    if lesson_tokens:
        return lesson_tokens[0]

    question_tokens = [
        token
        for token in _weak_topic_tokens(question)
        if token not in {"help", "explain", "understand", "question", "quiz", "course", "lesson"}
    ]
    if question_tokens:
        return question_tokens[0]

    return "course topic"


def _rule_based_classification(question: str, context: dict[str, Any]) -> dict[str, Any]:
    normalized_question = question.lower().strip()
    weak_topics = [str(topic) for topic in _as_list(context.get("weak_topics"))]
    topic = _guess_topic_from_question(
        question,
        weak_topics,
        _clean_text(context.get("current_lesson_title")) or _clean_text(context.get("course_title")),
    )

    progress_markers = [
        "what should i study next",
        "what next",
        "study next",
        "next lesson",
        "progress",
        "how am i doing",
        "where am i",
        "what should i review",
    ]
    stuck_markers = [
        "i'm stuck",
        "im stuck",
        "i am stuck",
        "don't understand",
        "do not understand",
        "simpler",
        "simple explanation",
        "explain simply",
        "confused",
        "hard to understand",
    ]
    quiz_markers = [
        "quiz",
        "score",
        "failed",
        "wrong answer",
        "correct answer",
        "mistake",
        "result",
        "why did i fail",
        "assessment",
    ]
    concept_markers = [
        "what is",
        "what does",
        "how does",
        "why is",
        "explain",
        "define",
        "meaning of",
    ]
    off_topic_markers = [
        "weather",
        "football",
        "soccer",
        "movie",
        "politics",
        "recipe",
        "restaurant",
        "stock price",
        "bitcoin",
    ]

    if any(marker in normalized_question for marker in progress_markers):
        intent = "progress"
        difficulty = "basic"
        course_related = True
        reasoning = "The learner is asking about study sequence or progress."
    elif any(marker in normalized_question for marker in stuck_markers):
        intent = "stuck"
        difficulty = "basic"
        course_related = True
        reasoning = "The learner says they are stuck or wants a simpler explanation."
    elif any(marker in normalized_question for marker in quiz_markers):
        intent = "quiz"
        difficulty = "intermediate"
        course_related = True
        reasoning = "The learner refers to a quiz, result, or mistake."
    elif any(marker in normalized_question for marker in off_topic_markers):
        intent = "off_topic"
        difficulty = "basic"
        course_related = False
        reasoning = "The question appears unrelated to the course."
    elif any(marker in normalized_question for marker in concept_markers):
        intent = "concept"
        difficulty = "basic"
        course_related = True
        reasoning = "The learner is asking to understand a course concept."
    else:
        intent = "concept"
        difficulty = "intermediate"
        course_related = True
        reasoning = "The question is treated as a course concept question by default."

    completed_titles = [str(item).lower() for item in _as_list(context.get("completed_lesson_titles"))]
    is_repeat = bool(topic and any(topic.lower() in title for title in completed_titles))

    return {
        "intent": intent,
        "topic": topic,
        "difficulty_expected": difficulty,
        "is_course_related": course_related,
        "is_repeat": is_repeat,
        "reasoning": reasoning,
        "classification_mode": "rules_only",
    }


def _normalize_classification_payload(raw: dict[str, Any], question: str, context: dict[str, Any]) -> dict[str, Any]:
    allowed_intents = {"concept", "quiz", "stuck", "progress", "off_topic"}
    allowed_difficulties = {"basic", "intermediate", "advanced"}

    intent = _clean_text(raw.get("intent")).lower()
    if intent not in allowed_intents:
        intent = "concept"

    difficulty_expected = _clean_text(raw.get("difficulty_expected")).lower()
    if difficulty_expected not in allowed_difficulties:
        difficulty_expected = "intermediate"

    topic = _clean_text(raw.get("topic")) or _guess_topic_from_question(
        question,
        [str(topic) for topic in _as_list(context.get("weak_topics"))],
        _clean_text(context.get("current_lesson_title")) or _clean_text(context.get("course_title")),
    )

    reasoning = _clean_text(raw.get("reasoning")) or "The classification was derived from the available course and learner context."
    classification_mode = _clean_text(raw.get("classification_mode")) or "rules_only"

    normalized_question = question.lower().strip()
    concept_override_markers = [
        "what is this course about",
        "what this course is about",
        "what does this course add",
        "what new thing does this course add",
        "what new thing does the course add",
        "how is this different from scrum",
        "how is this course different from scrum",
        "i already know scrum",
    ]
    if any(marker in normalized_question for marker in concept_override_markers):
        if intent != "concept":
            reasoning = (
                f"{reasoning} Intent was corrected to concept because the learner is asking for course meaning, "
                "comparison, or added value rather than progress guidance."
            )
        intent = "concept"

    return {
        "intent": intent,
        "topic": topic,
        "difficulty_expected": difficulty_expected,
        "is_course_related": bool(raw.get("is_course_related", intent != "off_topic")),
        "is_repeat": bool(raw.get("is_repeat", False)),
        "reasoning": reasoning,
        "classification_mode": classification_mode,
    }


def _format_structured_answer(payload: dict[str, Any]) -> str:
    answer = _clean_text(payload.get("answer"))
    why_this_matters = _clean_text(
        payload.get("why_this_matters") or payload.get("whyThisMatters")
    )
    common_mistake = _clean_text(
        payload.get("common_mistake") or payload.get("commonMistake")
    )
    next_step = _clean_text(payload.get("next_step") or payload.get("nextStep"))
    follow_up_prompts = [
        _clean_text(item)
        for item in _as_list(payload.get("follow_up_prompts") or payload.get("followUpPrompts"))
        if _clean_text(item)
    ]

    sections: list[str] = []
    if answer:
        sections.append(f"Answer:\n{answer}")
    if why_this_matters:
        sections.append(f"Why this matters:\n{why_this_matters}")
    if common_mistake:
        sections.append(f"Common mistake:\n{common_mistake}")
    if next_step:
        sections.append(f"Next step:\n{next_step}")
    if follow_up_prompts:
        sections.append(
            "Follow-up prompts:\n" + "\n".join(f"- {prompt}" for prompt in follow_up_prompts[:2])
        )

    return "\n\n".join(sections).strip()


def _parse_json_object_response(raw_text: str) -> dict[str, Any] | None:
    text = _clean_text(raw_text)
    if not text:
        return None

    decoder = json.JSONDecoder()
    candidates = [text]
    if "{" in text:
        candidates.append(text[text.find("{") :])

    for candidate in candidates:
        try:
            parsed, _ = decoder.raw_decode(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _call_structured_llm(
    *,
    system_prompt: str,
    user_prompt: str,
    max_tokens: int,
) -> dict[str, Any] | None:
    judge_api_key = _resolve_judge_api_key()
    judge_url = _resolve_judge_url()
    if not judge_api_key or not judge_url:
        return None

    headers = {
        "Authorization": f"Bearer {judge_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": _clean_text(os.getenv("COACH_MODE_JUDGE_MODEL")) or DEFAULT_CLASSIFICATION_MODEL,
        "temperature": 0,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "response_format": {"type": "json_object"},
    }

    try:
        with httpx.Client(timeout=30.0, trust_env=False) as client:
            response = client.post(judge_url, headers=headers, json=payload)
            response.raise_for_status()
        response_payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        _log(f"[Agno Chat Coach Agent] Structured LLM call failed: {error}")
        return None

    if not isinstance(response_payload, dict):
        return None
    if response_payload.get("error"):
        _log(
            "[Agno Chat Coach Agent] Structured LLM provider returned an error payload: "
            + json.dumps(response_payload.get("error"), ensure_ascii=False)
        )
        return None

    choices = response_payload.get("choices")
    if not isinstance(choices, list) or not choices:
        return None

    first_choice = choices[0] if isinstance(choices[0], dict) else {}
    message = first_choice.get("message") if isinstance(first_choice, dict) else {}
    content = message.get("content") if isinstance(message, dict) else None

    raw_text = ""
    if isinstance(content, str):
        raw_text = content
    elif isinstance(content, list):
        raw_text = "\n".join(
            str(item.get("text") or "")
            for item in content
            if isinstance(item, dict)
        )

    return _parse_json_object_response(raw_text)


def _extract_answer_text(raw_answer: str) -> str:
    text = raw_answer.strip()

    candidate_json = text
    if text.lower().startswith("answer:"):
        candidate_json = text.split(":", 1)[1].strip()

    parsed = None
    decoder = json.JSONDecoder()

    for candidate in (candidate_json, text):
        brace_index = candidate.find("{")
        if brace_index < 0:
            continue
        try:
            parsed, _ = decoder.raw_decode(candidate[brace_index:])
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            formatted = _format_structured_answer(parsed)
            if formatted:
                return formatted

    if text.startswith("{") and text.endswith("}"):
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            formatted = _format_structured_answer(parsed)
            if formatted:
                return formatted
    return text


def _failed_step(
    payload: ChatCoachQuestionInput,
    action: str,
    error: str,
    *,
    bank_id: str | None = None,
) -> StepOutput:
    return StepOutput(
        content={
            "success": False,
            "workflowName": "chat-coach-agent",
            "action": action,
            "tenantId": payload.tenantId,
            "courseId": payload.courseId,
            "userId": payload.userId,
            "bankId": bank_id,
            "question": payload.question,
            "error": error,
        },
        success=False,
    )


def _run_coro_sync(coro: Any) -> Any:
    try:
        asyncio.get_running_loop()
    except RuntimeError:
        return asyncio.run(coro)

    result_queue: Queue[tuple[bool, Any]] = Queue(maxsize=1)

    def _runner() -> None:
        try:
            result = asyncio.run(coro)
            result_queue.put((True, result))
        except Exception as error:
            result_queue.put((False, error))

    thread = Thread(target=_runner, daemon=True)
    thread.start()
    success, payload = result_queue.get()
    thread.join()
    if success:
        return payload
    raise payload


def _intent_to_hindsight_budget(intent: str) -> str:
    if intent == "stuck":
        return "high"
    return "mid"


def _intent_to_hindsight_max_tokens(intent: str) -> int:
    if intent == "stuck":
        return 700
    if intent == "quiz":
        return 500
    return 420


def _extract_quiz_identifier(context: dict[str, Any]) -> str | None:
    latest_attempt = _as_dict(context.get("latest_quiz_attempt"))
    lesson_id = _clean_text(latest_attempt.get("lessonId"))
    if lesson_id:
        return lesson_id
    current_lesson_id = _clean_text(context.get("current_lesson_id"))
    return current_lesson_id or None


def _build_reflect_query(intent: str, topic: str, context: dict[str, Any]) -> str | None:
    lesson_title = (
        _clean_text(context.get("current_lesson_title"))
        or _clean_text(context.get("lesson_title"))
        or "the current lesson"
    )
    clean_topic = topic or "this topic"

    if intent == "concept":
        return (
            f"Explain '{clean_topic}' as covered in this course.\n"
            "Be clear and direct. Use examples if the course material includes them.\n"
            f"Focus only on what is taught in lesson '{lesson_title}' and related lessons.\n"
            "Keep the answer concise and grounded in the course."
        )
    if intent == "quiz":
        return (
            f"A learner answered a quiz question about '{clean_topic}' incorrectly.\n"
            "Explain the correct understanding of this concept from the course.\n"
            "What do learners commonly misunderstand about this?\n"
            "What is the reasoning behind the correct answer?\n"
            "Keep the answer concise and grounded in the course."
        )
    if intent == "stuck":
        return (
            f"A learner is struggling to understand '{clean_topic}'.\n"
            "Provide the simplest possible explanation of this concept from the course.\n"
            "If there is an analogy or real-world example in the course material, use it.\n"
            "Break it down step by step.\n"
            "Keep the answer concise and grounded in the course."
        )
    return None


def _sanitize_answer_text(answer: str, context: dict[str, Any]) -> str:
    sanitized = answer
    current_lesson_id = _clean_text(context.get("current_lesson_id"))
    current_lesson_title = _clean_text(context.get("current_lesson_title"))
    course_id = _clean_text(context.get("course_id"))
    course_title = _clean_text(context.get("course_title"))

    if current_lesson_id and current_lesson_title:
        sanitized = sanitized.replace(current_lesson_id, current_lesson_title)
    if course_id and course_title:
        sanitized = sanitized.replace(course_id, course_title)

    sanitized = re.sub(r"Lesson\s+[0-9a-f]{8}-[0-9a-f-]{27}", current_lesson_title or "the current lesson", sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r"\b[0-9a-f]{8}-[0-9a-f-]{27}\b", "", sanitized, flags=re.IGNORECASE)
    sanitized = re.sub(r"\n{3,}", "\n\n", sanitized)
    return sanitized.strip()


def _extract_supporting_memories_from_based_on(based_on: object, *, limit: int = 3) -> list[dict[str, Any]]:
    based_on_dict = _as_dict(based_on)
    if not based_on_dict:
        return []

    if isinstance(based_on_dict.get("memories"), list):
        return [item for item in based_on_dict["memories"][:limit] if isinstance(item, dict)]

    flattened: list[dict[str, Any]] = []
    for value in based_on_dict.values():
        if not isinstance(value, list):
            continue
        for item in value:
            if isinstance(item, dict):
                flattened.append(item)
            if len(flattened) >= limit:
                return flattened
    return flattened[:limit]


def _is_repeat_topic(topic: str, context: dict[str, Any]) -> bool:
    normalized_topic = _clean_text(topic).lower()
    if not normalized_topic:
        return False

    for weak_topic in _as_list(context.get("weak_topics")):
        if normalized_topic in _clean_text(weak_topic).lower():
            return True

    for weak_area in _as_list(context.get("weak_areas")):
        if not isinstance(weak_area, dict):
            continue
        for candidate in _as_list(weak_area.get("derived_topics")):
            if normalized_topic in _clean_text(candidate).lower():
                return True
    return False


def _build_progress_answer(context: dict[str, Any], question_intent: dict[str, Any]) -> dict[str, Any]:
    ordered_lessons = [
        lesson
        for lesson in _as_list(context.get("ordered_lessons"))
        if isinstance(lesson, dict)
    ]
    completed_lesson_ids = {str(item) for item in _as_list(context.get("lessons_completed"))}
    weak_topics = [_clean_text(item) for item in _as_list(context.get("weak_topics")) if _clean_text(item)]
    weak_areas = [
        area for area in _as_list(context.get("weak_areas"))
        if isinstance(area, dict)
    ]

    next_lesson = next(
        (
            lesson
            for lesson in ordered_lessons
            if _clean_text(lesson.get("id")) not in completed_lesson_ids
        ),
        None,
    )

    if next_lesson:
        next_step = (
            f"Continue with {_clean_text(next_lesson.get('title'))}."
            if _clean_text(next_lesson.get("title"))
            else "Continue with your next incomplete lesson."
        )
        answer = (
            f"You've completed {len(completed_lesson_ids)} lesson(s) so far. "
            f"The next best step is {_clean_text(next_lesson.get('title')) or 'your next incomplete lesson'}."
        )
    elif weak_areas:
        focus_lesson = _clean_text(weak_areas[0].get("lesson_title")) or "the quiz area you struggled with"
        next_step = f"Review {focus_lesson} and retry the related quiz concepts."
        answer = (
            "You have finished the lesson sequence, so the best next move is targeted review. "
            f"Start with {focus_lesson} because that is where your recent mistakes came from."
        )
    else:
        next_step = "Review the main course concepts and ask about any topic you want to reinforce."
        answer = (
            "You have completed the current lesson sequence. The best next step is to review the core course ideas "
            "and deepen any topic that still feels weak."
        )

    why_this_matters = (
        "Progress guidance should match what you have already completed and where you previously struggled."
    )
    common_mistake = (
        f"Learners often move on too quickly without revisiting weak topics like {', '.join(weak_topics[:3])}."
        if weak_topics
        else ""
    )
    follow_up_prompts = [
        "Can you help me review the topic I struggled with most?",
        "Can you quiz me on the key idea I should review next?",
    ]

    return {
        "answer": answer,
        "why_this_matters": why_this_matters,
        "common_mistake": common_mistake,
        "next_step": next_step,
        "follow_up_prompts": follow_up_prompts,
        "intent": question_intent.get("intent"),
    }


async def _run_hindsight_pipeline(
    *,
    context: dict[str, Any],
    question_intent: dict[str, Any],
    shaped_query: str,
    hindsight_url: str,
    hindsight_api_key: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    headers = {"Content-Type": "application/json"}
    if hindsight_api_key:
        headers["Authorization"] = f"Bearer {hindsight_api_key}"

    course_bank = _clean_text(context.get("bank_id")) or _build_course_bank_id(
        _clean_text(context.get("tenant_id")),
        _clean_text(context.get("course_id")),
    )
    intent = _clean_text(question_intent.get("intent")) or "concept"
    course_id = _clean_text(context.get("course_id"))
    current_lesson_id = _clean_text(context.get("current_lesson_id"))

    reflect_tags = [f"course:{course_id}"] if course_id else []
    reflect_tags_match = "all_strict"
    if intent == "quiz" and current_lesson_id:
        reflect_tags.append(f"lesson:{current_lesson_id}")

    reflect_payload = {
        "query": shaped_query,
        "budget": _intent_to_hindsight_budget(intent),
        "max_tokens": _intent_to_hindsight_max_tokens(intent),
        "tags": reflect_tags,
        "tags_match": reflect_tags_match if len(reflect_tags) > 1 else "all_strict",
        "include": {"facts": {}},
    }
    reflect_timeout = httpx.Timeout(
        connect=10.0,
        read=HINDSIGHT_REFLECT_READ_TIMEOUT_SECONDS,
        write=30.0,
        pool=30.0,
    )

    async with httpx.AsyncClient(trust_env=False) as client:
        reflect_response = await client.post(
            f"{hindsight_url.rstrip('/')}/v1/default/banks/{course_bank}/reflect",
            headers=headers,
            json=reflect_payload,
            timeout=reflect_timeout,
        )

    reflect_response.raise_for_status()
    return reflect_response.json(), {}


def _build_final_answer_payload(
    *,
    intent: str,
    reflect_result: dict[str, Any],
    recall_result: dict[str, Any],
    context: dict[str, Any],
    question_intent: dict[str, Any],
    question: str,
) -> dict[str, Any]:
    course_answer = _clean_text(reflect_result.get("text"))
    recall_results = [
        item for item in _as_list(recall_result.get("results"))
        if isinstance(item, dict)
    ]
    past_struggles = [
        _clean_text(item.get("text"))
        for item in recall_results[:5]
        if _clean_text(item.get("text"))
    ]
    is_repeat_topic = _is_repeat_topic(_clean_text(question_intent.get("topic")), context)

    intent_specific_rules = ""
    if intent == "quiz":
        intent_specific_rules = (
            "- Stay very close to the course wording when explaining why the quiz answer is correct.\n"
            "- Do not invent new labels, umbrella terms, or renamed concepts that are not stated in the grounded answer.\n"
            "- Explain the correct answer in plain language and keep the answer section under 90 words.\n"
            "- If the learner asks about a correct option, explicitly explain why that option is correct and why the wrong option is wrong.\n"
        )
    elif intent == "concept":
        intent_specific_rules = (
            "- Reuse the course wording closely and avoid introducing new labels unless they appear in the grounded answer.\n"
            "- Keep the answer section under 110 words.\n"
        )
    elif intent == "stuck":
        intent_specific_rules = (
            "- Use very plain language.\n"
            "- Reuse the course wording closely before simplifying it.\n"
            "- Keep the answer section under 110 words.\n"
        )

    system_prompt = (
        f"You are an AI Coach for the course \"{_clean_text(context.get('course_title'))}\".\n"
        "You have already retrieved a grounded answer from course memory.\n"
        "Your job is to format this into a short, grounded coaching response."
    )
    user_prompt = f"""
Grounded course answer:
{course_answer}

Learner question:
{_clean_text(question)}

Learner context:
- Completed lessons: {_as_list(context.get('completed_lesson_titles'))}
- Known weak areas: {_as_list(context.get('weak_topics'))}
- This topic is {'a repeated struggle' if is_repeat_topic else 'a new question'}
- Past coaching notes: {past_struggles}

Intent: {intent}

Format the response as JSON:
{{
  "answer": "clear direct answer",
  "why_this_matters": "relevance to the course",
  "common_mistake": "what learners typically get wrong (for quiz/stuck intents)",
  "next_step": "specific actionable recommendation",
  "follow_up_prompts": ["question 1", "question 2"]
}}

Rules:
- Only use information from the grounded course answer.
- If the grounded answer has no relevant content, say so honestly.
- Adapt tone: {'simpler language, more encouragement' if intent == 'stuck' else 'direct and clear'}
- Do not mention internal UUIDs, raw lesson IDs, or bank IDs.
- Keep "answer" to 120 words or fewer.
- Keep the whole response compact and practical.
{intent_specific_rules.strip()}
""".strip()

    llm_payload = _call_structured_llm(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=220,
    )
    if llm_payload:
        return llm_payload

    fallback_payload = {
        "answer": course_answer or "I could not find a grounded course answer for this question.",
        "why_this_matters": (
            "This answer is grounded in the course memory and aligned with your learning context."
            if course_answer
            else "The course memory did not return enough grounded detail."
        ),
        "common_mistake": (
            "Learners often focus on the surface wording instead of the underlying concept."
            if intent in {"quiz", "stuck"}
            else ""
        ),
        "next_step": "Ask a follow-up question about the part you want to review next.",
        "follow_up_prompts": [
            "Can you explain the same point in a different way?",
            "Can you connect this to the lesson I just completed?",
        ],
    }
    return fallback_payload


def _ensure_validated_content(step_input: StepInput) -> dict[str, Any]:
    previous_content = _as_dict(step_input.previous_step_content)
    if previous_content.get("validatedContext"):
        return previous_content

    _log(
        "[Agno Chat Coach Agent] Previous validation context was missing from the workflow chain. Re-running validation step."
    )
    validation_output = validate_and_collect_context(step_input)
    return _as_dict(validation_output.content)


def _ensure_classified_content(step_input: StepInput) -> dict[str, Any]:
    classified_step_content = step_input.get_step_content("classify-question-intent")
    if isinstance(classified_step_content, dict):
        return classified_step_content

    previous_content = _ensure_validated_content(step_input)
    if previous_content.get("success") is False:
        return previous_content
    if previous_content.get("questionIntent"):
        return previous_content

    _log(
        "[Agno Chat Coach Agent] Previous question intent was missing from the workflow chain. Re-running classification step."
    )
    validated_context = _as_dict(previous_content.get("validatedContext"))
    question = _clean_text(previous_content.get("question"))
    raw_classification = _rule_based_classification(question, validated_context)
    question_intent = _normalize_classification_payload(raw_classification, question, validated_context)
    return {
        **previous_content,
        "action": "classify_question_intent",
        "questionIntent": question_intent,
    }


def _ensure_answer_context_content(step_input: StepInput) -> dict[str, Any]:
    answer_context_step_content = step_input.get_step_content("build-answer-context")
    if isinstance(answer_context_step_content, dict):
        return answer_context_step_content

    return _ensure_classified_content(step_input)


def _store_stuck_difficulty_signal(
    *,
    validated_context: dict[str, Any],
    question_intent: dict[str, Any],
    hindsight_api_url: str,
    hindsight_api_key: str,
) -> dict[str, Any]:
    intent = _clean_text(question_intent.get("intent")) or "concept"
    if intent != "stuck":
        return {
            "success": True,
            "action": "skip_difficulty_signal_memory",
            "reason": "intent_not_stuck",
        }

    tenant_id = _clean_text(validated_context.get("tenant_id"))
    user_id = _clean_text(validated_context.get("user_id"))
    course_id = _clean_text(validated_context.get("course_id"))
    course_title = _clean_text(validated_context.get("course_title")) or None
    current_lesson_id = _clean_text(validated_context.get("current_lesson_id"))
    session_id = _clean_text(validated_context.get("session_id"))
    lesson_id = current_lesson_id or (f"discussion-session:{session_id}" if session_id else f"course:{course_id}")
    lesson_title = _clean_text(validated_context.get("current_lesson_title")) or None
    topic = _clean_text(question_intent.get("topic")) or None

    if not tenant_id or not user_id or not course_id or not lesson_id:
        return {
            "success": False,
            "action": "store_difficulty_signal_memory",
            "error": "Missing tenant, user, course, or lesson/session identifier for learner difficulty retention.",
        }

    payload = {
        "tenantId": tenant_id,
        "userId": user_id,
        "courseId": course_id,
        "courseTitle": course_title,
        "lessonId": lesson_id,
        "lessonTitle": lesson_title,
        "eventType": "difficulty_signal_detected",
        "difficultySignal": "stuck",
        "difficultyTopic": topic,
        "lessonReferenceIds": [],
        "supportReferences": [],
        "hindsightApiUrl": hindsight_api_url,
        "hindsightApiKey": hindsight_api_key,
    }

    _log(
        "[Agno Chat Coach Agent] Launching learner-memory agent for stuck intent. "
        f"userId={user_id} courseId={course_id} topic={topic or 'unknown'} difficulty=stuck"
    )
    learner_memory_module = _learner_memory_workflow()
    content = _as_dict(learner_memory_module.retain_learner_memory_payload(payload))
    if bool(content.get("success")):
        _log("[Agno Chat Coach Agent] Learner difficulty signal stored successfully via learner-memory agent.")
        if _clean_text(content.get("memoryContent")):
            _log("[Agno Chat Coach Agent] Learner-memory retained difficulty signal content:")
            _log(_clean_text(content.get("memoryContent")))
    else:
        _log(
            "[Agno Chat Coach Agent] Learner difficulty signal storage failed: "
            f"{_clean_text(content.get('error')) or 'unknown error'}"
        )
    return content


def store_stuck_difficulty_memory(step_input: StepInput) -> StepOutput:
    previous_content = _ensure_classified_content(step_input)
    if previous_content.get("success") is False:
        return StepOutput(content=previous_content, success=False)

    validated_context = _as_dict(previous_content.get("validatedContext"))
    question_intent = _as_dict(previous_content.get("questionIntent"))
    difficulty_memory = _store_stuck_difficulty_signal(
        validated_context=validated_context,
        question_intent=question_intent,
        hindsight_api_url=_clean_text(previous_content.get("hindsightApiUrl")) or DEFAULT_HINDSIGHT_URL,
        hindsight_api_key=_clean_text(previous_content.get("hindsightApiKey")) or DEFAULT_HINDSIGHT_API_KEY,
    )

    return StepOutput(
        content={
            **previous_content,
            "learnerDifficultyMemory": difficulty_memory,
        },
        success=True,
    )


def _normalize_uuid(value: str | None) -> UUID:
    if not value:
        raise ValueError("Missing required UUID value")
    return UUID(str(value).strip())


def validate_and_collect_context(step_input: StepInput) -> StepOutput:
    payload = ChatCoachQuestionInput.model_validate(step_input.input)
    _log_session_context(payload)
    bank_id = _build_course_bank_id(payload.tenantId, payload.courseId)
    hindsight_url = (payload.hindsightApiUrl or DEFAULT_HINDSIGHT_URL).rstrip("/")
    hindsight_api_key = payload.hindsightApiKey or DEFAULT_HINDSIGHT_API_KEY

    if not payload.authToken:
        return _failed_step(
            payload,
            "validate_and_collect_context",
            "Missing auth token for coach validation.",
            bank_id=bank_id,
        )

    if not payload.userId:
        return _failed_step(
            payload,
            "validate_and_collect_context",
            "Missing userId for coach validation.",
            bank_id=bank_id,
        )

    try:
        dependencies = _load_platform_dependencies()
        decode_token = dependencies["decode_token"]
        SessionLocal = dependencies["SessionLocal"]
        Course = dependencies["Course"]
        Lesson = dependencies["Lesson"]
        Module = dependencies["Module"]
    except Exception as error:
        return _failed_step(
            payload,
            "validate_and_collect_context",
            f"Coach validation dependencies are unavailable: {error}",
            bank_id=bank_id,
        )

    jwt_payload = decode_token(payload.authToken)
    if jwt_payload is None:
        return _failed_step(
            payload,
            "validate_and_collect_context",
            "Invalid or expired JWT token.",
            bank_id=bank_id,
        )

    jwt_tenant_id = str(jwt_payload.get("tenantId") or "").strip() or None
    jwt_user_id = str(jwt_payload.get("sub") or "").strip() or None
    if jwt_tenant_id != payload.tenantId:
        return _failed_step(
            payload,
            "validate_and_collect_context",
            "Tenant mismatch between JWT and request body.",
            bank_id=bank_id,
        )

    if jwt_user_id != payload.userId:
        return _failed_step(
            payload,
            "validate_and_collect_context",
            "User mismatch between JWT and request body.",
            bank_id=bank_id,
        )

    try:
        course_uuid = _normalize_uuid(payload.courseId)
        _normalize_uuid(payload.tenantId)
        _normalize_uuid(payload.userId)
    except ValueError as error:
        return _failed_step(
            payload,
            "validate_and_collect_context",
            str(error),
            bank_id=bank_id,
        )

    db = SessionLocal()
    try:
        course = db.query(Course).filter(Course.id == course_uuid).first()
        lesson_rows = (
            db.query(
                Lesson.id,
                Lesson.assessment_id,
                Lesson.title,
                Lesson.order,
                Module.id.label("module_id"),
                Module.title.label("module_title"),
                Module.order.label("module_order"),
            )
            .join(Module, Lesson.module_id == Module.id)
            .filter(Module.course_id == course_uuid)
            .order_by(Module.order.asc(), Lesson.order.asc(), Lesson.title.asc())
            .all()
        )
        lesson_ids = [row.id for row in lesson_rows]
        lesson_title_by_id = {
            str(row.id): str(row.title or "").strip()
            for row in lesson_rows
        }
        lesson_ids_by_assessment = {
            row.assessment_id: row.id
            for row in lesson_rows
            if row.assessment_id is not None
        }
        ordered_lessons = [
            {
                "id": str(row.id),
                "title": str(row.title or "").strip(),
                "assessment_id": str(row.assessment_id) if row.assessment_id else None,
                "module_id": str(row.module_id) if row.module_id else None,
                "module_title": str(row.module_title or "").strip() or None,
                "module_order": int(row.module_order or 0),
                "lesson_order": int(row.order or 0),
            }
            for row in lesson_rows
        ]
        current_lesson_title = lesson_title_by_id.get(_clean_text(payload.lessonId)) if payload.lessonId else None

        validated_context = {
            "tenant_id": payload.tenantId,
            "course_id": payload.courseId,
            "user_id": payload.userId,
            "course_title": str(getattr(course, "title", "") or "").strip() or payload.courseId,
            "current_lesson_id": _clean_text(payload.lessonId) or None,
            "current_lesson_title": current_lesson_title,
            "bank_id": bank_id,
            "ordered_lessons": ordered_lessons,
            "session_id": _clean_text(payload.sessionId) or None,
            "session_turns": payload.sessionTurns if isinstance(payload.sessionTurns, list) else [],
            "conversation_turns": max(0, int(payload.conversationTurns or 0)),
            "prepared_context_id": _clean_text(payload.preparedContextId) or None,
            "learner_discussion_general_facts": payload.learnerDiscussionGeneralFacts if isinstance(payload.learnerDiscussionGeneralFacts, list) else [],
            "learner_discussion_course_facts": payload.learnerDiscussionCourseFacts if isinstance(payload.learnerDiscussionCourseFacts, list) else [],
            "learner_discussion_reasoning": _clean_text(payload.learnerDiscussionReasoning) or None,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
    finally:
        db.close()

    _log("[Agno Chat Coach Agent] Coaching context collection completed.")
    if validated_context.get("learner_discussion_general_facts") or validated_context.get("learner_discussion_course_facts"):
        _log(
            "[Agno Chat Coach Agent] Learner-memory extracted facts received before coaching execution: "
            f"general={validated_context.get('learner_discussion_general_facts')} "
            f"course={validated_context.get('learner_discussion_course_facts')}"
        )
    prepared_context_id = _clean_text(payload.preparedContextId)
    _log_validation_context_layers(validated_context)
    _log(
        f"[Agno Chat Coach Agent] Coaching context status: {'READY' if _is_validation_context_valid(validated_context) else 'MISSING_IDENTIFIERS'}"
    )

    return StepOutput(
        content={
            "success": True,
            "workflowName": "chat-coach-agent",
            "action": "validate_and_collect_context",
            "tenantId": payload.tenantId,
            "courseId": payload.courseId,
            "userId": payload.userId,
            "bankId": bank_id,
            "question": payload.question,
            "validatedContext": validated_context,
            "validationContextIsValid": _is_validation_context_valid(validated_context),
            "conversationTurns": validated_context["conversation_turns"],
            "sessionId": validated_context["session_id"],
            "sessionTurns": validated_context["session_turns"],
            "preparedContextId": prepared_context_id or None,
            "hindsightApiUrl": payload.hindsightApiUrl,
            "hindsightApiKey": payload.hindsightApiKey,
        },
        success=True,
    )


def ask_hindsight_course_question(step_input: StepInput) -> StepOutput:
    _log("ai coaching agnet finished the parallel section")
    previous_content = _ensure_answer_context_content(step_input)
    if previous_content and previous_content.get("success") is False:
        return StepOutput(content=previous_content, success=False)

    if previous_content:
        validated_context = _as_dict(previous_content.get("validatedContext"))
        question_intent = _as_dict(previous_content.get("questionIntent"))
        question = _clean_text(previous_content.get("question"))
        hindsight_url = _clean_text(previous_content.get("hindsightApiUrl")) or DEFAULT_HINDSIGHT_URL
        hindsight_api_key = _clean_text(previous_content.get("hindsightApiKey")) or DEFAULT_HINDSIGHT_API_KEY
        validation_ok = bool(previous_content.get("validationContextIsValid"))
        intent = _clean_text(question_intent.get("intent")) or "concept"
        answer_context = _as_dict(previous_content.get("answerContext"))

        if not validation_ok:
            answer = "I cannot continue because the course or learner validation context is invalid."
            _log("[Agno Chat Coach Agent] Hindsight stage skipped because validation context is invalid.")
            return StepOutput(
                content={
                    "success": True,
                    "workflowName": "chat-coach-agent",
                    "action": "validation_failed_before_hindsight",
                    "tenantId": previous_content.get("tenantId"),
                    "courseId": previous_content.get("courseId"),
                    "userId": previous_content.get("userId"),
                    "bankId": previous_content.get("bankId"),
                    "question": question,
                    "answer": answer,
                    "validatedContext": validated_context,
                    "validationContextIsValid": False,
                    "questionIntent": question_intent,
                    "answerContext": answer_context,
                    "basedOn": {},
                    "supportingMemories": [],
                    "trace": None,
                    "usage": None,
                },
                success=True,
            )

        if intent == "off_topic":
            course_name = _clean_text(validated_context.get("course_title")) or "this course"
            answer = (
                f"I can only answer questions about {course_name}. "
                "Try asking about one of the topics covered in this course."
            )
            _log("[Agno Chat Coach Agent] Off-topic intent detected. Hindsight was skipped.")
            _log(f"[Agno Chat Coach Agent] Final coaching answer:\n{answer}")
            return StepOutput(
                content={
                    "success": True,
                    "workflowName": "chat-coach-agent",
                    "action": "off_topic_decline",
                    "tenantId": previous_content.get("tenantId"),
                    "courseId": previous_content.get("courseId"),
                    "userId": previous_content.get("userId"),
                    "bankId": previous_content.get("bankId"),
                    "question": question,
                    "answer": answer,
                    "validatedContext": validated_context,
                    "validationContextIsValid": True,
                    "questionIntent": question_intent,
                    "answerContext": answer_context,
                    "basedOn": {},
                    "supportingMemories": [],
                    "trace": None,
                    "usage": None,
                },
                success=True,
            )

        if intent == "progress":
            progress_payload = _build_progress_answer(validated_context, question_intent)
            answer = _sanitize_answer_text(_format_structured_answer(progress_payload), validated_context)
            _log("[Agno Chat Coach Agent] Progress answer built from learner context:")
            _log(json.dumps(progress_payload, indent=2, ensure_ascii=False))
            return StepOutput(
                content={
                    "success": True,
                    "workflowName": "chat-coach-agent",
                    "action": "progress_answer_from_context",
                    "tenantId": previous_content.get("tenantId"),
                    "courseId": previous_content.get("courseId"),
                    "userId": previous_content.get("userId"),
                    "bankId": previous_content.get("bankId"),
                    "question": question,
                    "answer": answer or progress_payload.get("answer"),
                    "validatedContext": validated_context,
                    "validationContextIsValid": True,
                "questionIntent": question_intent,
                "answerContext": answer_context,
                "basedOn": {},
                "supportingMemories": [],
                "sessionId": validated_context.get("session_id"),
                "sessionTurns": validated_context.get("session_turns"),
                "trace": None,
                "usage": None,
                "structuredAnswer": progress_payload,
                },
                success=True,
            )

        shaped_query = _build_reflect_query(
            intent,
            _clean_text(question_intent.get("topic")) or "this topic",
            validated_context,
        )
        if not shaped_query:
            return StepOutput(
                content={
                    **previous_content,
                    "success": False,
                    "action": "missing_reflect_query",
                    "error": f"Unable to build a Hindsight reflect query for intent '{intent}'.",
                },
                success=False,
            )

        _log("[Agno Chat Coach Agent] Hindsight reflect query:")
        _log(shaped_query)

        try:
            reflect_result, recall_result = _run_coro_sync(
                _run_hindsight_pipeline(
                    context=validated_context,
                    question_intent=question_intent,
                    shaped_query=shaped_query,
                    hindsight_url=hindsight_url,
                    hindsight_api_key=hindsight_api_key,
                )
            )
        except Exception as error:
            error_message = str(error).strip() or f"{type(error).__name__}"
            _log(
                "[Agno Chat Coach Agent] Hindsight reflect/recall failed: "
                f"{type(error).__name__}: {error_message}"
            )
            return StepOutput(
                content={
                    **previous_content,
                    "success": False,
                    "action": "run_hindsight_pipeline",
                    "error": f"Hindsight reflect/recall failed: {error_message}",
                },
                success=False,
            )

        _log("[Agno Chat Coach Agent] Hindsight reflect result:")
        _log(json.dumps(reflect_result, indent=2, ensure_ascii=False))
        _log("[Agno Chat Coach Agent] Hindsight recall result:")
        _log(json.dumps(recall_result, indent=2, ensure_ascii=False))

        structured_answer = _build_final_answer_payload(
            intent=intent,
            reflect_result=reflect_result,
            recall_result=recall_result,
            context=validated_context,
            question_intent=question_intent,
            question=question,
        )
        answer = _sanitize_answer_text(
            _format_structured_answer(structured_answer) or _clean_text(structured_answer.get("answer")),
            validated_context,
        )
        supporting_memories = _extract_supporting_memories_from_based_on(reflect_result.get("based_on"))

        _log("[Agno Chat Coach Agent] Final coaching answer payload:")
        _log(json.dumps(structured_answer, indent=2, ensure_ascii=False))

        return StepOutput(
            content={
                "success": True,
                "workflowName": "chat-coach-agent",
                "action": "ask_hindsight_course_question",
                "tenantId": previous_content.get("tenantId"),
                "courseId": previous_content.get("courseId"),
                "userId": previous_content.get("userId"),
                "bankId": previous_content.get("bankId"),
                "question": question,
                "answer": answer,
                "validatedContext": validated_context,
                "validationContextIsValid": True,
                "questionIntent": question_intent,
                "answerContext": answer_context,
                "basedOn": _as_dict(reflect_result.get("based_on")),
                "supportingMemories": supporting_memories,
                "sessionId": validated_context.get("session_id"),
                "sessionTurns": validated_context.get("session_turns"),
                "trace": _as_dict(reflect_result.get("trace")),
                "usage": _as_dict(reflect_result.get("usage")),
                "structuredAnswer": structured_answer,
                "recallResult": recall_result,
                "retainResult": None,
            },
            success=True,
        )
    else:
        payload = ChatCoachQuestionInput.model_validate(step_input.input)
    return StepOutput(
        content={
            "success": True,
            "workflowName": "chat-coach-agent",
            "action": "return_validated_context_and_intent_only",
            "tenantId": payload.tenantId,
            "courseId": payload.courseId,
            "userId": payload.userId,
            "bankId": _build_course_bank_id(payload.tenantId, payload.courseId),
            "question": payload.question,
            "answer": "Validation context and question intent collected successfully. Check the terminal for the full details.",
            "validatedContext": _as_dict(payload.learnerContext),
            "validationContextIsValid": _is_validation_context_valid(_as_dict(payload.learnerContext)),
            "questionIntent": {},
            "basedOn": {},
            "supportingMemories": [],
            "sessionId": _clean_text(payload.sessionId) or None,
            "sessionTurns": payload.sessionTurns if isinstance(payload.sessionTurns, list) else [],
            "trace": None,
            "usage": None,
        },
        success=True,
    )


chat_coach_workflow = Workflow(
    name="chat-coach-agent",
    description=(
        "Separate AgentOS workflow that validates tenant, learner, and session context before sending the "
        "learner question to Hindsight and returning a grounded answer."
    ),
    steps=[
        Step(
            name="validate-and-collect-context",
            executor=validate_and_collect_context,
        ),
        Step(
            name="load-prepared-context",
            executor=lambda step_input: load_prepared_context_step(step_input, log=_log),
        ),
        Parallel(
            Step(
                name="parse-synthesis",
                executor=lambda step_input: parse_synthesis_step(step_input, log=_log),
            ),
            Step(
                name="detect-affect-signal",
                executor=lambda step_input: detect_affect_signal_step(step_input, log=_log),
            ),
            Step(
                name="finalize-intent",
                executor=lambda step_input: finalize_intent_step(step_input, log=_log),
            ),
            name="parallel-enrichment-wave",
        ),
        Step(
            name="merge-parallel-enrichment",
            executor=lambda step_input: merge_parallel_enrichment_step(step_input, log=_log),
        ),
        Step(
            name="compose-coaching-response",
            executor=lambda step_input: compose_coaching_response_step(step_input, log=_log),
        ),
    ],
)
