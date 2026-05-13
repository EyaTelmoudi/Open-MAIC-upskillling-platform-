from __future__ import annotations

import json
import os
import sys
from functools import lru_cache
from pathlib import Path
from typing import Any, Callable

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

DEFAULT_ANSWER_MODEL = os.getenv("COACH_MODE_JUDGE_MODEL", "openai/gpt-oss-120b:free")
OPENROUTER_COMPLETIONS_URL = os.getenv("COACH_MODE_JUDGE_URL", "https://openrouter.ai/api/v1/chat/completions")
OPENROUTER_API_KEY = os.getenv("COACH_MODE_JUDGE_API_KEY") or os.getenv("OPENAI_API_KEY")


class FinalCoachingAnswer(BaseModel):
    answer: str = Field(description="Direct answer to the learner question, grounded only in the provided context.")
    why_this_matters: str = Field(description="One short sentence explaining why the answer matters.")
    common_mistake: str = Field(description="A short common mistake to avoid. Use empty string if not applicable.")
    next_step: str = Field(description="One concrete next step for the learner.")
    follow_up_prompts: list[str] = Field(description="One or two short follow-up prompts.")


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _as_dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _openrouter_base_url() -> str:
    return OPENROUTER_COMPLETIONS_URL.removesuffix("/chat/completions").rstrip("/")


def _format_structured_answer(payload: dict[str, Any]) -> str:
    answer = _clean_text(payload.get("answer"))
    why_this_matters = _clean_text(payload.get("why_this_matters") or payload.get("whyThisMatters"))
    common_mistake = _clean_text(payload.get("common_mistake") or payload.get("commonMistake"))
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
        sections.append("Follow-up prompts:\n" + "\n".join(f"- {prompt}" for prompt in follow_up_prompts[:2]))
    return "\n\n".join(sections).strip()


def _sanitize_answer_text(answer: str, validated_context: dict[str, Any]) -> str:
    sanitized = answer.strip()
    course_title = _clean_text(validated_context.get("course_title"))
    if course_title:
        sanitized = sanitized.replace("the current course", course_title)
    return sanitized


def _one_line_preview(value: object, *, limit: int = 280) -> str:
    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def _is_explicit_progress_question(question: str) -> bool:
    normalized_question = _clean_text(question).lower()
    progress_markers = [
        "what should i study next",
        "what next",
        "study next",
        "next lesson",
        "progress",
        "how am i doing",
        "where am i",
        "what should i review",
        "what lesson next",
        "which lesson next",
        "continue next",
    ]
    return any(marker in normalized_question for marker in progress_markers)


def _build_fallback_structured_answer(
    *,
    question: str,
    answer_context: dict[str, Any],
    validated_context: dict[str, Any],
    question_intent: dict[str, Any],
) -> dict[str, Any]:
    intent = _clean_text(question_intent.get("intent")) or "concept"
    topic = _clean_text(question_intent.get("topic")) or "course topic"
    course_title = _clean_text(validated_context.get("course_title")) or "this course"
    passages = _clean_text(answer_context.get("course_passages"))
    style_hint = _clean_text(answer_context.get("learning_style_hint")).lower()

    concise = "short" in style_hint or "concise" in style_hint
    question_lower = _clean_text(question).lower()

    if intent == "stuck" or "simpler" in question_lower or "confused" in question_lower:
        answer = (
            f"In simple words, {course_title} teaches you to write the plan before asking AI to write code. "
            "That plan includes requirements, user stories, acceptance criteria, architecture, and tests, "
            "so the generated code is clearer and less error-prone."
        )
        why_this_matters = "It helps you avoid jumping straight into AI-generated code without clear guidance."
        common_mistake = "Starting with code generation before defining the requirements and structure."
        next_step = "Watch Lesson 1, then write a very small feature spec before generating any code."
        follow_up_prompts = [
            "Can you explain that with one simple example?",
            "What is the first thing I should put in a spec?",
        ]
    elif "scrum" in question_lower:
        answer = (
            "The course adds spec-driven development on top of Scrum: instead of moving from backlog items "
            "straight toward implementation, you first create detailed specs that AI can use to generate code "
            "more safely and consistently."
        )
        why_this_matters = "It keeps Agile work structured while reducing low-quality AI-generated code."
        common_mistake = "Using Scrum tasks alone without turning them into clear specs for AI."
        next_step = "Compare one Scrum backlog item with the spec elements shown in Lesson 1."
        follow_up_prompts = [
            "How is a spec different from a user story?",
            "Can this fit into a normal Scrum workflow?",
        ]
    elif "course" in question_lower or "overview" in topic.lower():
        answer = (
            f"{course_title} is about using specs before AI coding. You define what to build and how it should "
            "work first, then AI helps generate code from that plan."
        )
        why_this_matters = "A clear spec leads to code that is more maintainable and closer to the real product need."
        common_mistake = "Prompting AI for code too early without requirements, structure, or acceptance criteria."
        next_step = "Start with Lesson 1 and note the parts of the spec the course emphasizes."
        follow_up_prompts = [
            "What are the main parts of the spec?",
            "Can you explain the idea with a small example?",
        ]
    else:
        answer = (
            f"{course_title} focuses on using clear specifications before AI-generated code. "
            "The goal is to keep development structured, documented, and easier to maintain."
        )
        why_this_matters = "The course tries to prevent messy AI-assisted development by making the plan explicit first."
        common_mistake = "Letting AI generate code before the requirements and architecture are defined."
        next_step = "Review Lesson 1 and identify the spec elements mentioned in the course material."
        follow_up_prompts = [
            f"Can you explain {topic} more simply?",
            "What example does the course give for this idea?",
        ]

    if not passages:
        why_this_matters = "This keeps the answer aligned with the available course context."

    if concise:
        follow_up_prompts = follow_up_prompts[:2]

    return {
        "answer": answer,
        "why_this_matters": why_this_matters,
        "common_mistake": common_mistake,
        "next_step": next_step,
        "follow_up_prompts": follow_up_prompts,
    }


@lru_cache(maxsize=1)
def _answer_model() -> OpenAIChat:
    return OpenAIChat(
        id=DEFAULT_ANSWER_MODEL,
        api_key=OPENROUTER_API_KEY,
        base_url=_openrouter_base_url(),
        temperature=0.2,
        max_tokens=900,
    )


@lru_cache(maxsize=1)
def _answer_parser_model() -> OpenAIChat:
    return OpenAIChat(
        id=DEFAULT_ANSWER_MODEL,
        api_key=OPENROUTER_API_KEY,
        base_url=_openrouter_base_url(),
        temperature=0,
        max_tokens=400,
    )


@lru_cache(maxsize=1)
def _answer_agent() -> Agent:
    return Agent(
        model=_answer_model(),
        parser_model=_answer_parser_model(),
        parser_model_prompt="""
Convert the response into the exact FinalCoachingAnswer schema.
Return valid JSON only.
- answer: concise grounded answer
- why_this_matters: one short sentence
- common_mistake: short string, may be empty
- next_step: one actionable next step
- follow_up_prompts: one or two short learner-facing prompts
Do not include markdown fences or extra keys.
""".strip(),
        output_schema=FinalCoachingAnswer,
        instructions="""
You are the final answering agent for a coding coaching platform.

Use only the provided merged answer context.
Do not call external tools.
Do not invent course content that is not present in the provided context.
Respect the learner profile and answer style.
If the learner prefers short answers, keep the answer compact.
Use the course passages as the factual source of truth.
Use learner_synthesis and learning_style_hint only to adapt style and emphasis.
If known_difficulties says no recorded difficulties, do not invent any.
""".strip(),
    )


def _build_answer_prompt(
    *,
    question: str,
    answer_context: dict[str, Any],
    validated_context: dict[str, Any],
    question_intent: dict[str, Any],
) -> str:
    return json.dumps(
        {
            "question": question,
            "answer_context": answer_context,
            "validated_context_summary": {
                "course_title": _clean_text(validated_context.get("course_title")),
                "current_lesson_title": _clean_text(validated_context.get("current_lesson_title")) or None,
                "completed_lesson_titles": [
                    str(item) for item in _as_list(validated_context.get("completed_lesson_titles"))
                ],
                "weak_topics": [str(item) for item in _as_list(validated_context.get("weak_topics"))],
            },
            "question_intent": question_intent,
        },
        ensure_ascii=False,
        indent=2,
    )


def answer_from_merged_context_step(
    step_input: StepInput,
    *,
    ensure_answer_context_content: Callable[[StepInput], dict[str, Any]],
    log: Callable[[str], None],
) -> StepOutput:
    log("ai coaching agnet finished the parallel section")
    previous_content = ensure_answer_context_content(step_input)
    if previous_content and previous_content.get("success") is False:
        return StepOutput(content=previous_content, success=False)

    if not previous_content:
        return StepOutput(
            content={
                "success": False,
                "action": "answer_from_merged_context",
                "error": "Missing workflow content before final answer generation.",
            },
            success=False,
        )

    validated_context = _as_dict(previous_content.get("validatedContext"))
    question_intent = _as_dict(previous_content.get("questionIntent"))
    answer_context = _as_dict(previous_content.get("answerContext"))
    question = _clean_text(previous_content.get("question"))
    validation_ok = bool(previous_content.get("validationContextIsValid"))
    intent = _clean_text(question_intent.get("intent")) or "concept"

    if not validation_ok:
        answer = "I cannot continue because the course or learner validation context is invalid."
        log("[Agno Chat Coach Agent] Final answer stage skipped because validation context is invalid.")
        return StepOutput(
            content={
                **previous_content,
                "success": True,
                "action": "validation_failed_before_final_answer",
                "answer": answer,
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
        log("[Agno Chat Coach Agent] Off-topic intent detected. Final answering agent was skipped.")
        log(f"[Agno Chat Coach Agent] Final coaching answer:\n{answer}")
        return StepOutput(
            content={
                **previous_content,
                "success": True,
                "action": "off_topic_decline",
                "answer": answer,
                "basedOn": {},
                "supportingMemories": [],
                "trace": None,
                "usage": None,
            },
            success=True,
        )

    if intent == "progress" and _is_explicit_progress_question(question):
        progress_payload = {
            "answer": "You can continue with the next lesson or review weak topics from your recent progress context.",
            "why_this_matters": "This keeps your learning sequence aligned with your course progress.",
            "common_mistake": "",
            "next_step": "Open the next lesson and review any weak topics before moving on.",
            "follow_up_prompts": [
                "What should I review first?",
                "What is the next lesson about?",
            ],
        }
        answer = _sanitize_answer_text(_format_structured_answer(progress_payload), validated_context)
        log("[Agno Chat Coach Agent] Progress answer built from merged context.")
        log(json.dumps(progress_payload, indent=2, ensure_ascii=False))
        return StepOutput(
            content={
                **previous_content,
                "success": True,
                "action": "progress_answer_from_context",
                "answer": answer,
                "structuredAnswer": progress_payload,
                "basedOn": {},
                "supportingMemories": [],
                "trace": None,
                "usage": None,
            },
            success=True,
        )
    elif intent == "progress":
        log(
            "[Agno Chat Coach Agent] Progress intent was detected, but the question is not an explicit progress request. "
            "Routing to the final answering agent instead."
        )

    if not answer_context:
        return StepOutput(
            content={
                **previous_content,
                "success": False,
                "action": "answer_from_merged_context",
                "error": "Missing answerContext for final answer generation.",
            },
            success=False,
        )

    log("[Agno Chat Coach Agent] Final answering agent started from merged answer context.")
    log(
        "[Agno Chat Coach Agent] Final answering agent input summary: "
        f"intent={intent} "
        f"question=\"{_one_line_preview(question)}\" "
        f"styleHint=\"{_clean_text(answer_context.get('learning_style_hint')) or 'none'}\""
    )
    log("[Agno Chat Coach Agent] Final answering agent received merged context:")
    log(json.dumps(answer_context, indent=2, ensure_ascii=False))
    log("[Agno Chat Coach Agent] Final answering agent prompt payload:")
    log(
        _build_answer_prompt(
            question=question,
            answer_context=answer_context,
            validated_context=validated_context,
            question_intent=question_intent,
        )
    )
    log("[Agno Chat Coach Agent] Final answering agent sending structured answer request.")

    def _return_fallback_answer(reason: str) -> StepOutput:
        fallback_structured_answer = _build_fallback_structured_answer(
            question=question,
            answer_context=answer_context,
            validated_context=validated_context,
            question_intent=question_intent,
        )
        fallback_answer = _sanitize_answer_text(
            _format_structured_answer(fallback_structured_answer),
            validated_context,
        )
        log(
            "[Agno Chat Coach Agent] Final answering fallback activated. "
            f"Returning a safe merged-context answer. reason={reason}"
        )
        log("[Agno Chat Coach Agent] Final answering fallback learner answer:")
        log(fallback_answer)
        return StepOutput(
            content={
                **previous_content,
                "success": True,
                "action": "answer_from_merged_context_fallback",
                "answer": fallback_answer,
                "structuredAnswer": fallback_structured_answer,
                "basedOn": {},
                "supportingMemories": [],
                "trace": None,
                "usage": {},
            },
            success=True,
        )

    try:
        prompt_payload = _build_answer_prompt(
            question=question,
            answer_context=answer_context,
            validated_context=validated_context,
            question_intent=question_intent,
        )
        response = _answer_agent().run(
            prompt_payload
        )
    except Exception as error:
        log(f"[Agno Chat Coach Agent] Final answering agent failed: {error}")
        return _return_fallback_answer(str(error))

    content = getattr(response, "content", None)
    status = getattr(response, "status", None)
    usage = getattr(response, "usage", None)
    log(
        "[Agno Chat Coach Agent] Final answering agent run completed: "
        f"status={status or 'unknown'} model={DEFAULT_ANSWER_MODEL}"
    )

    if not isinstance(content, FinalCoachingAnswer):
        log(
            "[Agno Chat Coach Agent] Final answering agent returned unexpected content. "
            f"type={type(content).__name__}"
        )
        log("[Agno Chat Coach Agent] Final answering agent result: INVALID")
        return _return_fallback_answer(
            f"invalid structured content type={type(content).__name__}"
        )

    structured_answer = content.model_dump()
    answer = _sanitize_answer_text(_format_structured_answer(structured_answer), validated_context)

    log("[Agno Chat Coach Agent] Final answering agent structured response:")
    log(content.model_dump_json(indent=2))
    log("[Agno Chat Coach Agent] Final answering agent result: VALID")
    log("[Agno Chat Coach Agent] Final answering agent formatted learner answer:")
    log(answer)
    log("[Agno Chat Coach Agent] Final coaching answer payload:")
    log(json.dumps(structured_answer, indent=2, ensure_ascii=False))

    return StepOutput(
        content={
            **previous_content,
            "success": True,
            "action": "answer_from_merged_context",
            "answer": answer,
            "structuredAnswer": structured_answer,
            "basedOn": {},
            "supportingMemories": [],
            "trace": None,
            "usage": usage if isinstance(usage, dict) else {},
        },
        success=True,
    )
