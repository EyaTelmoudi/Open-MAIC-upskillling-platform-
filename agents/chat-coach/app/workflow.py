from __future__ import annotations

import asyncio
import json
import os
import re
import sys
import time
from collections import Counter, defaultdict
from datetime import datetime, timezone
from queue import Queue
from threading import Thread
from typing import Any
from uuid import UUID

import httpx
from pydantic import BaseModel

from agno.workflow import Step, StepInput, StepOutput, Workflow


DEFAULT_HINDSIGHT_URL = os.getenv("HINDSIGHT_API_URL", "http://127.0.0.1:8888")
DEFAULT_HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY", "")
DEFAULT_QUESTION = (
    "In this HTML course, why is the alt attribute important for images, "
    "and what does the course say about the src attribute?"
)
DEFAULT_CLASSIFICATION_MODEL = os.getenv("COACH_MODE_JUDGE_MODEL", "openai/gpt-oss-120b:free")
CHAT_COACH_RATE_LIMIT_WINDOW_SECONDS = int(os.getenv("CHAT_COACH_RATE_LIMIT_WINDOW_SECONDS", "60"))
CHAT_COACH_RATE_LIMIT_REQUESTS = int(os.getenv("CHAT_COACH_RATE_LIMIT_REQUESTS", "12"))
HINDSIGHT_REFLECT_READ_TIMEOUT_SECONDS = float(os.getenv("CHAT_COACH_HINDSIGHT_REFLECT_READ_TIMEOUT_SECONDS", "150"))
HINDSIGHT_RECALL_READ_TIMEOUT_SECONDS = float(os.getenv("CHAT_COACH_HINDSIGHT_RECALL_READ_TIMEOUT_SECONDS", "60"))

_RATE_LIMIT_BUCKETS: dict[str, list[float]] = defaultdict(list)
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

CLASSIFICATION_PROMPT = """
You are classifying a learner question for a specific course coaching agent.

Course: {course_name}
Current lesson: {lesson_name}
Learner's completed lessons: {completed_lessons}
Learner's known weak areas: {weak_areas}
Conversation turns so far: {turns}

Question: "{question}"

Classify this question. Return ONLY valid JSON, no other text:
{{
  "intent": one of ["concept", "quiz", "stuck", "progress", "off_topic"],
  "topic": "short topic name (e.g. 'recursion', 'binary search')",
  "difficulty_expected": one of ["basic", "intermediate", "advanced"],
  "is_course_related": true or false,
  "is_repeat": true or false,
  "reasoning": "one sentence explanation of your classification"
}}

intent definitions:
- concept: learner wants to understand something from the course material
- quiz: learner is asking about a quiz question, result, or mistake
- stuck: learner says they don't understand or asks for simpler explanation
- progress: learner asks what to study next, how they're doing, or where they are
- off_topic: question is unrelated to this course
""".strip()


def _log(message: str) -> None:
    try:
        print(message, flush=True)
    except UnicodeEncodeError:
        safe_message = message.encode(
            sys.stdout.encoding or "utf-8",
            errors="backslashreplace",
        ).decode(sys.stdout.encoding or "utf-8", errors="strict")
        print(safe_message, flush=True)


def _log_validation_context_layers(context: dict[str, Any]) -> None:
    platform_layer = {
        "tenant_id": context.get("tenant_id"),
        "course_id": context.get("course_id"),
        "course_is_published": context.get("course_is_published"),
        "bank_id": context.get("bank_id"),
        "hindsight_bank_populated": context.get("hindsight_bank_populated"),
        "hindsight_bank_document_count": context.get("hindsight_bank_document_count"),
        "tenant_status": context.get("tenant_status"),
    }

    learner_layer = {
        "user_id": context.get("user_id"),
        "learner_enrolled": context.get("learner_enrolled"),
        "learner_enrollment_status": context.get("learner_enrollment_status"),
        "lessons_completed": context.get("lessons_completed"),
        "quiz_scores": context.get("quiz_scores"),
        "weak_areas": context.get("weak_areas"),
        "weak_topics": context.get("weak_topics"),
        "failed_quiz_count": context.get("failed_quiz_count"),
        "latest_quiz_attempt": context.get("latest_quiz_attempt"),
    }

    session_security_layer = {
        "user_bank_id": context.get("user_bank_id"),
        "session_id": context.get("session_id"),
        "session_turns": context.get("session_turns"),
        "conversation_turns": context.get("conversation_turns"),
        "rate_limit": context.get("rate_limit"),
        "updated_at": context.get("updated_at"),
    }

    _log("[Agno Chat Coach Agent] Collected validation context:")
    _log(
        json.dumps(
            {
                "layer_1_platform_validation": platform_layer,
                "layer_2_learner_validation": learner_layer,
                "layer_3_session_and_security": session_security_layer,
            },
            indent=2,
            ensure_ascii=False,
        )
    )


def _is_validation_context_valid(context: dict[str, Any]) -> bool:
    return bool(
        context.get("tenant_id")
        and context.get("course_id")
        and context.get("user_id")
        and context.get("course_is_published") is True
        and context.get("hindsight_bank_populated") is True
        and context.get("tenant_status") == "active"
        and context.get("learner_enrolled") is True
    )


def _build_classification_input(question: str, context: dict[str, Any]) -> dict[str, Any]:
    return {
        "question": question,
        "course_name": _clean_text(context.get("course_title")) or context.get("course_id"),
        "current_lesson": _clean_text(context.get("current_lesson_title")) or None,
        "completed_lessons": _as_list(context.get("completed_lesson_titles")),
        "weak_areas": _as_list(context.get("weak_areas")),
        "weak_topics": _as_list(context.get("weak_topics")),
        "conversation_history": {
            "conversation_turns": int(context.get("conversation_turns") or 0),
            "history_available": False,
            "note": "Only the conversation turn count is currently available in this workflow.",
        },
        "validated_context": context,
    }


def _log_classification_input(question: str, context: dict[str, Any]) -> None:
    _log("[Agno Chat Coach Agent] Classification input:")
    _log(
        json.dumps(
            _build_classification_input(question, context),
            indent=2,
            ensure_ascii=False,
        )
    )


def _log_classification_decision(question_intent: dict[str, Any]) -> None:
    intent = _clean_text(question_intent.get("intent")) or "unknown"
    topic = _clean_text(question_intent.get("topic")) or "unknown"
    difficulty = _clean_text(question_intent.get("difficulty_expected")) or "unknown"
    reasoning = _clean_text(question_intent.get("reasoning")) or "No reasoning provided."
    classification_mode = _clean_text(question_intent.get("classification_mode")) or "unknown"

    _log(
        "[Agno Chat Coach Agent] Classification decision: "
        f"intent={intent} topic={topic} difficulty={difficulty} mode={classification_mode}"
    )
    _log(f"[Agno Chat Coach Agent] Classification reason: {reasoning}")


def _format_validation_context_for_answer(context: dict[str, Any]) -> str:
    platform_layer = {
        "tenant_id": context.get("tenant_id"),
        "course_id": context.get("course_id"),
        "course_is_published": context.get("course_is_published"),
        "bank_id": context.get("bank_id"),
        "hindsight_bank_populated": context.get("hindsight_bank_populated"),
        "hindsight_bank_document_count": context.get("hindsight_bank_document_count"),
        "tenant_status": context.get("tenant_status"),
    }

    learner_layer = {
        "user_id": context.get("user_id"),
        "learner_enrolled": context.get("learner_enrolled"),
        "learner_enrollment_status": context.get("learner_enrollment_status"),
        "lessons_completed": context.get("lessons_completed"),
        "quiz_scores": context.get("quiz_scores"),
        "weak_areas": context.get("weak_areas"),
        "weak_topics": context.get("weak_topics"),
        "failed_quiz_count": context.get("failed_quiz_count"),
        "latest_quiz_attempt": context.get("latest_quiz_attempt"),
    }

    session_security_layer = {
        "user_bank_id": context.get("user_bank_id"),
        "conversation_turns": context.get("conversation_turns"),
        "rate_limit": context.get("rate_limit"),
        "updated_at": context.get("updated_at"),
    }

    return json.dumps(
        {
            "layer_1_platform_validation": platform_layer,
            "layer_2_learner_validation": learner_layer,
            "layer_3_session_and_security": session_security_layer,
        },
        indent=2,
        ensure_ascii=False,
    )


def _build_course_bank_id(tenant_id: str, course_id: str) -> str:
    return f"tenant:{tenant_id}:course:{course_id}"


def _build_user_bank_id(tenant_id: str, user_id: str) -> str:
    return f"tenant:{tenant_id}:user:{user_id}:coach"


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
    from common.models import Course, Enrollment, Lesson, Module, Tenant, User, UserProgress
    from services.learning.services.learner_context import build_learner_context_response
    from sqlalchemy import text

    return {
        "Course": Course,
        "Enrollment": Enrollment,
        "Lesson": Lesson,
        "Module": Module,
        "SessionLocal": SessionLocal,
        "Tenant": Tenant,
        "User": User,
        "UserProgress": UserProgress,
        "build_learner_context_response": build_learner_context_response,
        "decode_token": decode_token,
        "sql_text": text,
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


def _derive_weak_areas(attempt_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    weak_areas: list[dict[str, Any]] = []

    for row in attempt_rows:
        lesson_id = _clean_text(row.get("lesson_id"))
        lesson_title = _clean_text(row.get("lesson_title"))
        score_value = row.get("score")
        completed_at = row.get("completed_at")
        wrong_answers_raw = row.get("wrong_answers")
        wrong_answers = wrong_answers_raw if isinstance(wrong_answers_raw, list) else []

        normalized_wrong_answers: list[dict[str, Any]] = []
        derived_topics: list[str] = []
        for wrong_answer in wrong_answers:
            if not isinstance(wrong_answer, dict):
                continue

            question_text = _clean_text(wrong_answer.get("question"))
            user_answer = wrong_answer.get("userAnswer")
            user_answers = wrong_answer.get("userAnswers")
            correct_answer = wrong_answer.get("correctAnswer")
            correct_answers = wrong_answer.get("correctAnswers")

            normalized_wrong_answers.append(
                {
                    "question": question_text or None,
                    "user_answer": user_answer if user_answer is not None else user_answers,
                    "correct_answer": correct_answer if correct_answer is not None else correct_answers,
                }
            )

            if question_text:
                derived_topics.append(question_text)

        weak_areas.append(
            {
                "lesson_id": lesson_id or None,
                "lesson_title": lesson_title or None,
                "score": round(float(score_value or 0) / 100, 4),
                "wrong_answer_count": len(normalized_wrong_answers),
                "latest_failed_at": completed_at.isoformat() if hasattr(completed_at, "isoformat") else None,
                "sample_wrong_answers": normalized_wrong_answers[:3],
                "derived_topics": derived_topics[:3],
            }
        )

    return weak_areas[:5]


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


def _parse_classification_response(raw_text: str) -> dict[str, Any] | None:
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


def _classify_question_with_judge(question: str, context: dict[str, Any]) -> dict[str, Any] | None:
    judge_api_key = _resolve_judge_api_key()
    judge_url = _resolve_judge_url()
    if not judge_api_key or not judge_url:
        missing_parts: list[str] = []
        if not judge_api_key:
            missing_parts.append("judge API key")
        if not judge_url:
            missing_parts.append("judge URL")
        _log(
            "[Agno Chat Coach Agent] LLM classification unavailable, using rules fallback. "
            f"Missing {' and '.join(missing_parts)}."
        )
        return None

    prompt = CLASSIFICATION_PROMPT.format(
        course_name=_clean_text(context.get("course_title")) or context.get("course_id") or "Unknown course",
        lesson_name=_clean_text(context.get("current_lesson_title")) or "Unknown lesson",
        completed_lessons=", ".join(str(item) for item in _as_list(context.get("completed_lesson_titles"))) or "None",
        weak_areas=json.dumps(_as_list(context.get("weak_areas")), ensure_ascii=False) or "None",
        turns=int(context.get("conversation_turns") or 0),
        question=question,
    )

    headers = {
        "Authorization": f"Bearer {judge_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": _clean_text(os.getenv("COACH_MODE_JUDGE_MODEL")) or DEFAULT_CLASSIFICATION_MODEL,
        "temperature": 0,
        "max_tokens": 150,
        "messages": [
            {"role": "system", "content": "You are a precise course-question classifier."},
            {"role": "user", "content": prompt},
        ],
        "response_format": {"type": "json_object"},
    }

    last_response_payload: dict[str, Any] | None = None
    last_error: str | None = None

    for attempt in range(1, 4):
        try:
            with httpx.Client(timeout=20.0, trust_env=False) as client:
                response = client.post(judge_url, headers=headers, json=payload)
                response.raise_for_status()
            response_payload = response.json()
            last_response_payload = response_payload if isinstance(response_payload, dict) else None
        except (httpx.HTTPError, ValueError) as error:
            last_error = str(error)
            _log(
                "[Agno Chat Coach Agent] LLM classification request failed. "
                f"attempt={attempt} error={error}"
            )
            if attempt < 3:
                continue
            _log(
                "[Agno Chat Coach Agent] LLM classification failed, using rules fallback. "
                f"error={error}"
            )
            return None

        _log("[Agno Chat Coach Agent] Raw LLM classification response:")
        _log(json.dumps(response_payload, indent=2, ensure_ascii=False))

        if isinstance(response_payload, dict) and response_payload.get("error"):
            error_payload = response_payload.get("error")
            _log(
                "[Agno Chat Coach Agent] LLM classification provider returned an error payload. "
                f"attempt={attempt} error={json.dumps(error_payload, ensure_ascii=False)}"
            )
            if attempt < 3:
                continue
            _log(
                "[Agno Chat Coach Agent] LLM classification provider returned an error payload, using rules fallback. "
                + json.dumps(error_payload, ensure_ascii=False)
            )
            return None

        choices = response_payload.get("choices") if isinstance(response_payload, dict) else None
        if not isinstance(choices, list) or not choices:
            _log(
                "[Agno Chat Coach Agent] LLM classification returned no choices. "
                f"attempt={attempt} payload_keys={list(response_payload.keys()) if isinstance(response_payload, dict) else type(response_payload).__name__}"
            )
            if attempt < 3:
                continue
            _log(
                "[Agno Chat Coach Agent] LLM classification returned no choices, using rules fallback. "
                f"payload_keys={list(response_payload.keys()) if isinstance(response_payload, dict) else type(response_payload).__name__}"
            )
            return None

        break
    else:
        if last_error:
            _log(
                "[Agno Chat Coach Agent] LLM classification exhausted retries, using rules fallback. "
                f"error={last_error}"
            )
        elif last_response_payload is not None:
            _log(
                "[Agno Chat Coach Agent] LLM classification exhausted retries, using rules fallback."
            )
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

    parsed = _parse_classification_response(raw_text)
    if not parsed:
        _log(
            "[Agno Chat Coach Agent] LLM classification returned no valid JSON, using rules fallback."
        )
        return None

    parsed["classification_mode"] = "llm"
    _log("[Agno Chat Coach Agent] LLM classification call succeeded.")
    return parsed


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
    parsed = _parse_classification_response(raw_text)
    return parsed if isinstance(parsed, dict) else None


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


def _build_recall_query(context: dict[str, Any]) -> str:
    return f"What topics has this learner struggled with in course {context['course_id']}?"


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
    user_bank = _clean_text(context.get("user_bank_id")) or _build_user_bank_id(
        _clean_text(context.get("tenant_id")),
        _clean_text(context.get("user_id")),
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
    recall_payload = {
        "query": _build_recall_query(context),
        "budget": "mid",
        "max_tokens": 260,
    }

    reflect_timeout = httpx.Timeout(
        connect=10.0,
        read=HINDSIGHT_REFLECT_READ_TIMEOUT_SECONDS,
        write=30.0,
        pool=30.0,
    )
    recall_timeout = httpx.Timeout(
        connect=10.0,
        read=HINDSIGHT_RECALL_READ_TIMEOUT_SECONDS,
        write=20.0,
        pool=20.0,
    )

    async with httpx.AsyncClient(trust_env=False) as client:
        reflect_task = asyncio.create_task(
            client.post(
                f"{hindsight_url.rstrip('/')}/v1/default/banks/{course_bank}/reflect",
                headers=headers,
                json=reflect_payload,
                timeout=reflect_timeout,
            )
        )
        recall_task = asyncio.create_task(
            client.post(
                f"{hindsight_url.rstrip('/')}/v1/default/banks/{user_bank}/memories/recall",
                headers=headers,
                json=recall_payload,
                timeout=recall_timeout,
            )
        )
        reflect_response, recall_response = await asyncio.gather(reflect_task, recall_task)

    reflect_response.raise_for_status()
    recall_response.raise_for_status()
    return reflect_response.json(), recall_response.json()


async def _retain_coaching_note(
    *,
    context: dict[str, Any],
    question_intent: dict[str, Any],
    hindsight_url: str,
    hindsight_api_key: str,
) -> dict[str, Any]:
    headers = {"Content-Type": "application/json"}
    if hindsight_api_key:
        headers["Authorization"] = f"Bearer {hindsight_api_key}"

    user_bank = _clean_text(context.get("user_bank_id")) or _build_user_bank_id(
        _clean_text(context.get("tenant_id")),
        _clean_text(context.get("user_id")),
    )
    course_id = _clean_text(context.get("course_id"))
    intent = _clean_text(question_intent.get("intent"))
    topic = _clean_text(question_intent.get("topic"))
    is_repeat_topic = _is_repeat_topic(topic, context)

    content = (
        f"Learner asked about '{topic}'. Intent: {intent}. "
        f"Is repeat: {is_repeat_topic}. "
        f"{'Marked as struggle area.' if intent == 'stuck' else ''}"
    ).strip()

    payload = {
        "items": [
            {
                "content": content,
                "context": f"course:{course_id} intent:{intent}",
                "timestamp": datetime.now(timezone.utc).isoformat(),
                "tags": [
                    f"course:{course_id}",
                    f"intent:{intent}",
                ],
            }
        ],
        "async": True,
    }

    async with httpx.AsyncClient(timeout=30.0, trust_env=False) as client:
        response = await client.post(
            f"{hindsight_url.rstrip('/')}/v1/default/banks/{user_bank}/memories",
            headers=headers,
            json=payload,
        )
    response.raise_for_status()
    return response.json()


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
    previous_content = _ensure_validated_content(step_input)
    if previous_content.get("success") is False:
        return previous_content
    if previous_content.get("questionIntent"):
        return previous_content

    _log(
        "[Agno Chat Coach Agent] Previous question intent was missing from the workflow chain. Re-running classification step."
    )
    question_intent = _build_question_intent_from_content(previous_content)
    return {
        **previous_content,
        "action": "classify_question_intent",
        "questionIntent": question_intent,
    }


def _apply_rate_limit(user_id: str) -> tuple[bool, int]:
    now = time.time()
    window_start = now - CHAT_COACH_RATE_LIMIT_WINDOW_SECONDS
    history = [timestamp for timestamp in _RATE_LIMIT_BUCKETS[user_id] if timestamp >= window_start]
    if len(history) >= CHAT_COACH_RATE_LIMIT_REQUESTS:
        _RATE_LIMIT_BUCKETS[user_id] = history
        return False, len(history)

    history.append(now)
    _RATE_LIMIT_BUCKETS[user_id] = history
    return True, len(history)


def _load_bank_population_state(
    bank_id: str,
    *,
    hindsight_url: str,
    hindsight_api_key: str,
) -> tuple[bool, int]:
    headers = {"Content-Type": "application/json"}
    if hindsight_api_key:
        headers["Authorization"] = f"Bearer {hindsight_api_key}"

    try:
        with httpx.Client(timeout=20.0) as client:
            response = client.get(
                f"{hindsight_url.rstrip('/')}/v1/default/banks/{bank_id}/documents",
                headers=headers,
                params={"limit": 1, "offset": 0},
            )
        if response.status_code >= 400:
            return False, 0

        payload = response.json()
        items = payload.get("items") if isinstance(payload, dict) else []
        if not isinstance(items, list):
            return False, 0
        return len(items) > 0, len(items)
    except (httpx.HTTPError, ValueError):
        return False, 0


def _normalize_uuid(value: str | None) -> UUID:
    if not value:
        raise ValueError("Missing required UUID value")
    return UUID(str(value).strip())


def _collect_lessons_completed(
    progress_rows: list[Any],
    lesson_ids_by_assessment: dict[UUID, UUID],
    latest_attempt_by_assessment: dict[UUID, dict[str, Any]],
) -> list[str]:
    completed_lessons = {
        str(progress.lesson_id)
        for progress in progress_rows
        if str(progress.status or "").strip() == "completed"
    }

    for assessment_id, attempt in latest_attempt_by_assessment.items():
        if not attempt.get("passed"):
            continue
        lesson_id = lesson_ids_by_assessment.get(assessment_id)
        if lesson_id:
            completed_lessons.add(str(lesson_id))

    return sorted(completed_lessons)


def _derive_weak_topics(attempt_rows: list[dict[str, Any]]) -> list[str]:
    token_counter: Counter[str] = Counter()
    lesson_counter: Counter[str] = Counter()

    for row in attempt_rows:
        lesson_title = str(row.get("lesson_title") or "").strip()
        if lesson_title:
            lesson_counter.update(_weak_topic_tokens(lesson_title))

        wrong_answers = row.get("wrong_answers")
        if not isinstance(wrong_answers, list):
            continue

        for wrong_answer in wrong_answers:
            if not isinstance(wrong_answer, dict):
                continue
            token_counter.update(_weak_topic_tokens(str(wrong_answer.get("question") or "")))
            token_counter.update(_weak_topic_tokens(str(wrong_answer.get("correctAnswer") or "")))
            correct_answers = wrong_answer.get("correctAnswers")
            if isinstance(correct_answers, list):
                for correct_answer in correct_answers:
                    token_counter.update(_weak_topic_tokens(str(correct_answer or "")))

    ranked = [token for token, count in token_counter.most_common() if count >= 2]
    if ranked:
        return ranked[:5]

    fallback = [token for token, count in lesson_counter.most_common() if count >= 2]
    return fallback[:5]


def classify_question_intent(step_input: StepInput) -> StepOutput:
    previous_content = _ensure_validated_content(step_input)
    if previous_content.get("success") is False:
        return StepOutput(content=previous_content, success=False)

    question_intent = _build_question_intent_from_content(previous_content)

    return StepOutput(
        content={
            **previous_content,
            "action": "classify_question_intent",
            "questionIntent": question_intent,
        },
        success=True,
    )


def _build_question_intent_from_content(previous_content: dict[str, Any]) -> dict[str, Any]:
    validated_context = _as_dict(previous_content.get("validatedContext"))
    question = _clean_text(previous_content.get("question"))
    _log_classification_input(question, validated_context)

    judge_classification = _classify_question_with_judge(question, validated_context)
    raw_classification = judge_classification or _rule_based_classification(question, validated_context)
    question_intent = _normalize_classification_payload(raw_classification, question, validated_context)

    _log("[Agno Chat Coach Agent] Question intent classification completed.")
    _log(
        "[Agno Chat Coach Agent] Chosen question intent: "
        + json.dumps(question_intent, ensure_ascii=False)
    )
    _log_classification_decision(question_intent)
    return question_intent


def validate_and_collect_context(step_input: StepInput) -> StepOutput:
    payload = ChatCoachQuestionInput.model_validate(step_input.input)
    _log_session_context(payload)
    bank_id = _build_course_bank_id(payload.tenantId, payload.courseId)
    user_bank_id = _build_user_bank_id(payload.tenantId, payload.userId or "anonymous")
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
        Tenant = dependencies["Tenant"]
        Course = dependencies["Course"]
        User = dependencies["User"]
        Enrollment = dependencies["Enrollment"]
        Lesson = dependencies["Lesson"]
        Module = dependencies["Module"]
        UserProgress = dependencies["UserProgress"]
        build_learner_context_response = dependencies["build_learner_context_response"]
        sql_text = dependencies["sql_text"]
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

    allowed, request_count = _apply_rate_limit(payload.userId)
    if not allowed:
        return _failed_step(
            payload,
            "validate_and_collect_context",
            f"Rate limit exceeded for user {payload.userId}.",
            bank_id=bank_id,
        )

    try:
        tenant_uuid = _normalize_uuid(payload.tenantId)
        course_uuid = _normalize_uuid(payload.courseId)
        user_uuid = _normalize_uuid(payload.userId)
    except ValueError as error:
        return _failed_step(
            payload,
            "validate_and_collect_context",
            str(error),
            bank_id=bank_id,
        )

    db = SessionLocal()
    try:
        tenant = db.query(Tenant).filter(Tenant.id == tenant_uuid).first()
        if not tenant:
            return _failed_step(
                payload,
                "validate_and_collect_context",
                f"Tenant {payload.tenantId} does not exist.",
                bank_id=bank_id,
            )

        if str(tenant.status or "").strip().lower() != "active":
            return _failed_step(
                payload,
                "validate_and_collect_context",
                f"Tenant {payload.tenantId} is not active.",
                bank_id=bank_id,
            )

        course = db.query(Course).filter(Course.id == course_uuid).first()
        if not course or course.tenant_id != tenant_uuid:
            return _failed_step(
                payload,
                "validate_and_collect_context",
                f"Course {payload.courseId} does not exist under tenant {payload.tenantId}.",
                bank_id=bank_id,
            )

        if not bool(course.is_published):
            return _failed_step(
                payload,
                "validate_and_collect_context",
                f"Course {payload.courseId} is unpublished; AI coach access is refused.",
                bank_id=bank_id,
            )

        user = db.query(User).filter(User.id == user_uuid).first()
        if not user or user.tenant_id != tenant_uuid:
            return _failed_step(
                payload,
                "validate_and_collect_context",
                f"User {payload.userId} does not belong to tenant {payload.tenantId}.",
                bank_id=bank_id,
            )

        bank_populated, bank_item_count = _load_bank_population_state(
            bank_id,
            hindsight_url=hindsight_url,
            hindsight_api_key=hindsight_api_key,
        )
        if not bank_populated:
            return _failed_step(
                payload,
                "validate_and_collect_context",
                f"Hindsight bank {bank_id} is missing or not populated by the Course Memory Agent.",
                bank_id=bank_id,
            )

        learner_context = build_learner_context_response(
            db,
            user_id=user_uuid,
            course_id=course_uuid,
        )

        enrollment = (
            db.query(Enrollment)
            .filter(Enrollment.user_id == user_uuid, Enrollment.course_id == course_uuid)
            .first()
        )

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
        progress_rows = (
            db.query(UserProgress)
            .filter(
                UserProgress.user_id == user_uuid,
                UserProgress.lesson_id.in_(lesson_ids or [UUID(int=0)]),
            )
            .all()
        )

        latest_traditional_rows = db.execute(
            sql_text(
                """
                SELECT DISTINCT ON (qa.assessment_id)
                    qa.assessment_id,
                    qa.score,
                    qa.passed,
                    qa.completed_at,
                    qa.wrong_answers
                FROM quiz_attempts qa
                JOIN assessments a ON a.id = qa.assessment_id
                JOIN lessons l ON l.assessment_id = a.id
                JOIN modules m ON m.id = l.module_id
                WHERE qa.user_id = :user_id
                  AND m.course_id = :course_id
                ORDER BY qa.assessment_id, qa.completed_at DESC NULLS LAST, qa.started_at DESC
                """
            ),
            {
                "user_id": str(user_uuid),
                "course_id": str(course_uuid),
            },
        ).mappings().all()

        latest_ai_rows = db.execute(
            sql_text(
                """
                SELECT DISTINCT ON (a.lesson_id)
                    a.lesson_id,
                    a.score,
                    a.passed,
                    a.completed_at,
                    a.wrong_answers
                FROM ai_platform_lesson_quiz_attempts a
                WHERE a.user_id = CAST(:user_id AS uuid)
                  AND a.course_id = CAST(:course_id AS uuid)
                ORDER BY a.lesson_id, a.completed_at DESC
                """
            ),
            {"user_id": str(user_uuid), "course_id": str(course_uuid)},
        ).mappings().all()

        latest_attempt_by_assessment = {
            row["assessment_id"]: dict(row) for row in latest_traditional_rows if row.get("assessment_id") is not None
        }
        quiz_scores = {
            f"quiz_{str(row['assessment_id'])}": round(float(row["score"] or 0) / 100, 4)
            for row in latest_traditional_rows
            if row.get("assessment_id") is not None
        }
        quiz_scores.update(
            {
                f"quiz_{str(row['lesson_id'])}": round(float(row["score"] or 0) / 100, 4)
                for row in latest_ai_rows
                if row.get("lesson_id") is not None
            }
        )

        failed_attempt_rows = db.execute(
            sql_text(
                """
                SELECT l.id AS lesson_id, l.title AS lesson_title, qa.score, qa.completed_at, qa.wrong_answers
                FROM quiz_attempts qa
                JOIN assessments a ON a.id = qa.assessment_id
                JOIN lessons l ON l.assessment_id = a.id
                JOIN modules m ON m.id = l.module_id
                WHERE qa.user_id = :user_id
                  AND m.course_id = :course_id
                  AND COALESCE(qa.passed, FALSE) = FALSE
                UNION ALL
                SELECT l.id AS lesson_id, l.title AS lesson_title, ai.score, ai.completed_at, ai.wrong_answers
                FROM ai_platform_lesson_quiz_attempts ai
                JOIN lessons l ON l.id = ai.lesson_id
                WHERE ai.user_id = CAST(:user_id AS uuid)
                  AND ai.course_id = CAST(:course_id AS uuid)
                  AND ai.passed = FALSE
                """
            ),
            {"user_id": str(user_uuid), "course_id": str(course_uuid)},
        ).mappings().all()

        lessons_completed = _collect_lessons_completed(
            progress_rows,
            lesson_ids_by_assessment,
            latest_attempt_by_assessment,
        )
        completed_lesson_titles = [
            lesson_title_by_id[lesson_id]
            for lesson_id in lessons_completed
            if lesson_id in lesson_title_by_id and lesson_title_by_id[lesson_id]
        ]
        failed_attempt_dicts = [dict(row) for row in failed_attempt_rows]
        weak_areas = _derive_weak_areas(failed_attempt_dicts)
        weak_topics = _derive_weak_topics(failed_attempt_dicts)

        validated_context = {
            "tenant_id": payload.tenantId,
            "course_id": payload.courseId,
            "user_id": payload.userId,
            "course_title": str(getattr(course, "title", "") or "").strip(),
            "current_lesson_id": _clean_text(payload.lessonId) or None,
            "current_lesson_title": current_lesson_title,
            "course_is_published": True,
            "bank_id": bank_id,
            "user_bank_id": user_bank_id,
            "ordered_lessons": ordered_lessons,
            "lessons_completed": lessons_completed,
            "completed_lesson_titles": completed_lesson_titles,
            "quiz_scores": quiz_scores,
            "weak_areas": weak_areas,
            "weak_topics": weak_topics,
            "session_id": _clean_text(payload.sessionId) or None,
            "session_turns": payload.sessionTurns if isinstance(payload.sessionTurns, list) else [],
            "conversation_turns": max(0, int(payload.conversationTurns or 0)),
            "learner_enrolled": enrollment is not None,
            "learner_enrollment_status": enrollment.status if enrollment else "not_enrolled",
            "tenant_status": str(tenant.status or "").strip(),
            "hindsight_bank_populated": bank_populated,
            "hindsight_bank_document_count": bank_item_count,
            "failed_quiz_count": int(learner_context.get("failedQuizCount") or 0),
            "latest_quiz_attempt": learner_context.get("latestQuizAttempt"),
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "rate_limit": {
                "window_seconds": CHAT_COACH_RATE_LIMIT_WINDOW_SECONDS,
                "max_requests": CHAT_COACH_RATE_LIMIT_REQUESTS,
                "current_request_count": request_count,
            },
        }
    finally:
        db.close()

    _log("[Agno Chat Coach Agent] Validation context collection completed.")
    _log_validation_context_layers(validated_context)
    _log(
        f"[Agno Chat Coach Agent] Validation context status: {'VALID' if _is_validation_context_valid(validated_context) else 'INVALID'}"
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
            "hindsightApiUrl": payload.hindsightApiUrl,
            "hindsightApiKey": payload.hindsightApiKey,
        },
        success=True,
    )


def ask_hindsight_course_question(step_input: StepInput) -> StepOutput:
    previous_content = _ensure_classified_content(step_input)
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
            retain_result = None
            try:
                retain_result = _run_coro_sync(
                    _retain_coaching_note(
                        context=validated_context,
                        question_intent=question_intent,
                        hindsight_url=hindsight_url,
                        hindsight_api_key=hindsight_api_key,
                    )
                )
            except Exception as error:
                _log(f"[Agno Chat Coach Agent] Progress retain failed: {error}")

            _log("[Agno Chat Coach Agent] Progress answer built from learner context:")
            _log(json.dumps(progress_payload, indent=2, ensure_ascii=False))
            if retain_result is not None:
                _log("[Agno Chat Coach Agent] Coaching note retain result:")
                _log(json.dumps(retain_result, indent=2, ensure_ascii=False))
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

        retain_result = None
        try:
            retain_result = _run_coro_sync(
                _retain_coaching_note(
                    context=validated_context,
                    question_intent=question_intent,
                    hindsight_url=hindsight_url,
                    hindsight_api_key=hindsight_api_key,
                )
            )
        except Exception as error:
            _log(f"[Agno Chat Coach Agent] Coaching note retain failed: {error}")

        _log("[Agno Chat Coach Agent] Final coaching answer payload:")
        _log(json.dumps(structured_answer, indent=2, ensure_ascii=False))
        if retain_result is not None:
            _log("[Agno Chat Coach Agent] Coaching note retain result:")
            _log(json.dumps(retain_result, indent=2, ensure_ascii=False))

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
                "basedOn": _as_dict(reflect_result.get("based_on")),
                "supportingMemories": supporting_memories,
                "sessionId": validated_context.get("session_id"),
                "sessionTurns": validated_context.get("session_turns"),
                "trace": _as_dict(reflect_result.get("trace")),
                "usage": _as_dict(reflect_result.get("usage")),
                "structuredAnswer": structured_answer,
                "recallResult": recall_result,
                "retainResult": retain_result,
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
            name="classify-question-intent",
            executor=classify_question_intent,
        ),
        Step(
            name="ask-hindsight-course-question",
            executor=ask_hindsight_course_question,
        ),
    ],
)
