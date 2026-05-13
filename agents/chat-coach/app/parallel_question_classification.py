from __future__ import annotations

import json
import os
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable, Literal

from pydantic import BaseModel, Field


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _chat_coach_site_packages() -> Path:
    return _repo_root() / "agents" / "chat-coach" / ".venv" / "Lib" / "site-packages"


def _ensure_chat_coach_site_packages() -> None:
    site_packages = _chat_coach_site_packages()
    site_packages_str = str(site_packages)
    if site_packages.exists() and site_packages_str not in sys.path:
        sys.path.append(site_packages_str)


_ensure_chat_coach_site_packages()

from agno.agent import Agent
from agno.models.openai import OpenAIChat
from agno.workflow import StepInput, StepOutput

DEFAULT_CLASSIFICATION_MODEL = os.getenv("COACH_MODE_JUDGE_MODEL", "openai/gpt-oss-120b:free")
OPENROUTER_COMPLETIONS_URL = os.getenv("COACH_MODE_JUDGE_URL", "https://openrouter.ai/api/v1/chat/completions")
OPENROUTER_API_KEY = os.getenv("COACH_MODE_JUDGE_API_KEY") or os.getenv("OPENAI_API_KEY")


class QuestionClassification(BaseModel):
    intent: Literal["concept", "quiz", "stuck", "progress", "off_topic"]
    topic: str = Field(description="The specific topic or subject of the learner question.")
    difficulty_expected: Literal["basic", "intermediate", "advanced"]
    is_course_related: bool
    is_repeat_question: bool
    reasoning: str = Field(description="Why this classification was chosen.")


def _openrouter_base_url() -> str:
    return OPENROUTER_COMPLETIONS_URL.removesuffix("/chat/completions").rstrip("/")


def _one_line_preview(value: Any, *, limit: int = 280) -> str:
    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def _as_list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _clean_text(value: object) -> str:
    return str(value or "").strip()


@lru_cache(maxsize=1)
def _classification_model() -> OpenAIChat:
    return OpenAIChat(
        id=DEFAULT_CLASSIFICATION_MODEL,
        api_key=OPENROUTER_API_KEY,
        base_url=_openrouter_base_url(),
        temperature=0,
        max_tokens=220,
    )


@lru_cache(maxsize=1)
def _classification_parser_model() -> OpenAIChat:
    return OpenAIChat(
        id=DEFAULT_CLASSIFICATION_MODEL,
        api_key=OPENROUTER_API_KEY,
        base_url=_openrouter_base_url(),
        temperature=0,
        max_tokens=220,
    )


@lru_cache(maxsize=1)
def _classifier_agent() -> Agent:
    return Agent(
        model=_classification_model(),
        instructions="""
You are a precise question classifier for a coding coaching platform.

Classify the learner message using this exact meaning:
- intent:
  - concept: asking to understand a course concept or topic
  - quiz: asking about a quiz, mistake, answer, score, or assessment result
  - stuck: explicitly confused, blocked, or asking for a simpler explanation
  - progress: asking what to study next, what was completed, or learning progress
  - off_topic: not related to the current course
- topic: short topic name, specific and concise
- difficulty_expected: how advanced the answer should be
- is_course_related: true only if the question is about the current course context
- is_repeat_question: true only if the same topic clearly appears as a repeated struggle from the provided learner context
- reasoning: one short justification

Semantic guidance:
- If the learner asks what the course is about, what it covers, or wants an overview, that is `concept`, not `progress`.
- If the learner asks what this course adds beyond a concept they already know (for example Scrum), that is `concept`.
- Use `progress` only for explicit study-sequencing or completion-status questions such as "what should I study next?" or "how am I doing?".

Return valid JSON only with exactly these keys:
- intent
- topic
- difficulty_expected
- is_course_related
- is_repeat_question
- reasoning
""".strip(),
    )


@lru_cache(maxsize=1)
def _classifier_repair_agent() -> Agent:
    return Agent(
        model=_classification_model(),
        instructions="""
You are a semantic classification recovery agent.

The primary classifier produced malformed or unusable output.
Ignore the malformed text if it conflicts with the learner question.
Reclassify directly from the learner question and course context.

Important semantic rules:
- "What is this course about?" => concept
- "What does this course add beyond Scrum?" => concept
- "How is this different from Scrum?" => concept
- Only use progress for explicit sequencing/progress questions.

Return valid JSON only with exactly these keys:
- intent
- topic
- difficulty_expected
- is_course_related
- is_repeat_question
- reasoning
""".strip(),
    )


def _build_classifier_prompt(question: str, context: dict[str, Any]) -> str:
    return json.dumps(
        {
            "question": question,
            "course_name": _clean_text(context.get("course_title")) or _clean_text(context.get("course_id")) or "Unknown course",
            "current_lesson": _clean_text(context.get("current_lesson_title")) or None,
            "completed_lessons": [str(item) for item in _as_list(context.get("completed_lesson_titles"))],
            "weak_areas": _as_list(context.get("weak_areas")),
            "weak_topics": [str(item) for item in _as_list(context.get("weak_topics"))],
            "conversation_turns": int(context.get("conversation_turns") or 0),
        },
        ensure_ascii=False,
        indent=2,
    )


def _build_classification_input(question: str, context: dict[str, Any]) -> dict[str, Any]:
    return {
        "question": question,
        "course_name": _clean_text(context.get("course_title")) or _clean_text(context.get("course_id")) or None,
        "current_lesson": _clean_text(context.get("current_lesson_title")) or None,
        "completed_lessons": [str(item) for item in _as_list(context.get("completed_lesson_titles"))],
        "weak_areas": _as_list(context.get("weak_areas")),
        "weak_topics": [str(item) for item in _as_list(context.get("weak_topics"))],
        "conversation_history": {
            "conversation_turns": int(context.get("conversation_turns") or 0),
            "history_available": False,
            "note": "Only the conversation turn count is currently available in this workflow.",
        },
        "validated_context": context,
    }


def _build_repair_prompt(question: str, context: dict[str, Any], malformed_content: object) -> str:
    return json.dumps(
        {
            "learner_question": question,
            "course_name": _clean_text(context.get("course_title")) or _clean_text(context.get("course_id")) or None,
            "current_lesson": _clean_text(context.get("current_lesson_title")) or None,
            "completed_lessons": [str(item) for item in _as_list(context.get("completed_lesson_titles"))],
            "weak_topics": [str(item) for item in _as_list(context.get("weak_topics"))],
            "conversation_turns": int(context.get("conversation_turns") or 0),
            "malformed_classifier_output": _clean_text(malformed_content),
        },
        ensure_ascii=False,
        indent=2,
    )


def _parse_json_object_response(raw_text: object) -> dict[str, Any] | None:
    text = _clean_text(raw_text)
    if not text:
        return None

    candidates = [text]
    if "{" in text and "}" in text:
        candidates.append(text[text.find("{") : text.rfind("}") + 1])

    for candidate in candidates:
        try:
            parsed = json.loads(candidate)
        except Exception:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _normalize_structured_classification(classification: QuestionClassification) -> dict[str, Any]:
    intent = classification.intent
    is_course_related = bool(classification.is_course_related)
    reasoning = classification.reasoning.strip()

    # Guard against inconsistent model outputs such as:
    # intent="off_topic" while is_course_related=true.
    if intent == "off_topic" and is_course_related:
        intent = "concept"
        reasoning = (
            f"{reasoning} Adjusted to concept because the question was marked course-related."
            if reasoning
            else "Adjusted to concept because the question was marked course-related."
        )

    return {
        "intent": intent,
        "topic": classification.topic.strip(),
        "difficulty_expected": classification.difficulty_expected,
        "is_course_related": is_course_related,
        "is_repeat": bool(classification.is_repeat_question),
        "reasoning": reasoning,
        "classification_mode": "llm_structured",
    }


def _classify_with_repair_prompt(
    question: str,
    context: dict[str, Any],
    malformed_content: object,
    log: Callable[[str], None],
) -> dict[str, Any] | None:
    try:
        response = _classifier_repair_agent().run(_build_repair_prompt(question, context, malformed_content))
    except Exception as error:
        log(f"[Agno Chat Coach Agent] Structured classification repair failed. error={error}")
        return None

    content = getattr(response, "content", None)
    parsed = _parse_json_object_response(content)
    if not isinstance(parsed, dict):
        log(
            "[Agno Chat Coach Agent] Structured classification repair returned unexpected content. "
            f"type={type(content).__name__}"
        )
        return None

    log("[Agno Chat Coach Agent] Branch A repaired structured classification response:")
    log(json.dumps(parsed, indent=2, ensure_ascii=False))
    repaired = {
        "intent": _clean_text(parsed.get("intent")) or "concept",
        "topic": _clean_text(parsed.get("topic")) or "course topic",
        "difficulty_expected": _clean_text(parsed.get("difficulty_expected")) or "intermediate",
        "is_course_related": bool(parsed.get("is_course_related", True)),
        "is_repeat": bool(parsed.get("is_repeat_question", False)),
        "reasoning": _clean_text(parsed.get("reasoning")) or "Recovered from malformed classifier output.",
        "classification_mode": "llm_structured_repaired",
    }
    repaired["classification_mode"] = "llm_structured_repaired"
    return repaired


def _classify_with_output_schema(question: str, context: dict[str, Any], log: Callable[[str], None]) -> dict[str, Any] | None:
    if not OPENROUTER_API_KEY:
        log("[Agno Chat Coach Agent] Structured classification unavailable, missing judge API key.")
        return None

    log(
        "[Agno Chat Coach Agent] Branch A started: structured question classification. "
        f"model={DEFAULT_CLASSIFICATION_MODEL}"
    )
    log("[Agno Chat Coach Agent] Branch A classification input:")
    log(json.dumps(_build_classification_input(question, context), indent=2, ensure_ascii=False))
    log("[Agno Chat Coach Agent] Branch A sending structured classification request.")

    try:
        response = _classifier_agent().run(_build_classifier_prompt(question, context))
    except Exception as error:
        log(f"[Agno Chat Coach Agent] Structured classification failed, using rules fallback. error={error}")
        return None

    content = getattr(response, "content", None)
    status = getattr(response, "status", None)
    log(
        "[Agno Chat Coach Agent] Structured classification run completed: "
        f"status={status or 'unknown'} model={DEFAULT_CLASSIFICATION_MODEL}"
    )

    parsed = _parse_json_object_response(content)
    if isinstance(parsed, dict):
        log("[Agno Chat Coach Agent] Branch A structured classification response:")
        log(json.dumps(parsed, indent=2, ensure_ascii=False))
        normalized = {
            "intent": _clean_text(parsed.get("intent")) or "concept",
            "topic": _clean_text(parsed.get("topic")) or "course topic",
            "difficulty_expected": _clean_text(parsed.get("difficulty_expected")) or "intermediate",
            "is_course_related": bool(parsed.get("is_course_related", True)),
            "is_repeat": bool(parsed.get("is_repeat_question", False)),
            "reasoning": _clean_text(parsed.get("reasoning")) or "The classifier returned a valid JSON result.",
            "classification_mode": "llm_json",
        }
        return normalized

    if content is not None:
        repaired = _classify_with_repair_prompt(question, context, content, log)
        if repaired is not None:
            log("[Agno Chat Coach Agent] Structured classification was recovered by the LLM repair step.")
            return repaired
        log(
            "[Agno Chat Coach Agent] Structured classification returned unexpected content, using rules fallback. "
            f"type={type(content).__name__}"
        )
        if content is not None:
            log(f"[Agno Chat Coach Agent] Branch A unexpected content preview: {_one_line_preview(content)}")
        return None

    return _normalize_structured_classification(content)


def classify_question_intent_parallel(
    step_input: StepInput,
    *,
    ensure_validated_content: Callable[[StepInput], dict[str, Any]],
    rule_based_classification: Callable[[str, dict[str, Any]], dict[str, Any]],
    normalize_classification_payload: Callable[[dict[str, Any], str, dict[str, Any]], dict[str, Any]],
    log: Callable[[str], None],
) -> StepOutput:
    previous_content = ensure_validated_content(step_input)
    if previous_content.get("success") is False:
        return StepOutput(content=previous_content, success=False)

    log("[Agno Chat Coach Agent] Branch A entered parallel section.")

    validated_context = previous_content.get("validatedContext")
    validated_context = validated_context if isinstance(validated_context, dict) else {}
    question = _clean_text(previous_content.get("question"))

    structured_classification = _classify_with_output_schema(question, validated_context, log)
    if structured_classification is None:
        log("[Agno Chat Coach Agent] Branch A falling back to rule-based classification.")
    raw_classification = structured_classification or rule_based_classification(question, validated_context)
    question_intent = normalize_classification_payload(raw_classification, question, validated_context)

    log("[Agno Chat Coach Agent] Branch A normalized classification result:")
    log(json.dumps(question_intent, indent=2, ensure_ascii=False))
    log(
        "[Agno Chat Coach Agent] Branch A classification decision: "
        f"intent={question_intent.get('intent')} "
        f"topic={question_intent.get('topic')} "
        f"difficulty={question_intent.get('difficulty_expected')} "
        f"mode={question_intent.get('classification_mode')}"
    )
    log(f"[Agno Chat Coach Agent] Branch A classification reason: {question_intent.get('reasoning')}")
    log("[Agno Chat Coach Agent] Branch A finished.")

    return StepOutput(
        content={
            **previous_content,
            "action": "classify_question_intent",
            "questionIntent": question_intent,
        },
        success=True,
    )
