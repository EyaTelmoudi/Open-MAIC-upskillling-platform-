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

from .answer_from_context import FinalCoachingAnswer

DEFAULT_ANSWER_MODEL = os.getenv("COACH_MODE_JUDGE_MODEL", "openai/gpt-oss-120b:free")
OPENROUTER_COMPLETIONS_URL = os.getenv("COACH_MODE_JUDGE_URL", "https://openrouter.ai/api/v1/chat/completions")
OPENROUTER_API_KEY = os.getenv("COACH_MODE_JUDGE_API_KEY") or os.getenv("OPENAI_API_KEY")
MAX_QUALITY_GATE_REGENERATIONS = 2


class QualityGateDecision(BaseModel):
    verdict: Literal["pass", "regenerate"]
    reasoning: str = Field(description="Why the answer passed or why it needed repair.")
    answers_user_question: bool = Field(description="Whether the answer directly addresses the learner question.")
    matches_merged_context: bool = Field(description="Whether the answer is grounded in the merged answer context.")
    respects_learner_style: bool = Field(description="Whether the answer matches the learner's preferred style.")
    wrong_intent_branch_detected: bool = Field(
        description="Whether the answer appears to come from the wrong branch for the detected intent."
    )
    corrected_answer: FinalCoachingAnswer | None = Field(
        default=None,
        description="Provide a full corrected answer only when verdict is regenerate.",
    )


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _as_dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _one_line_preview(value: object, *, limit: int = 280) -> str:
    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


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


@lru_cache(maxsize=1)
def _quality_gate_model() -> OpenAIChat:
    return OpenAIChat(
        id=DEFAULT_ANSWER_MODEL,
        api_key=OPENROUTER_API_KEY,
        base_url=_openrouter_base_url(),
        temperature=0,
        max_tokens=1100,
    )


@lru_cache(maxsize=1)
def _quality_gate_parser_model() -> OpenAIChat:
    return OpenAIChat(
        id=DEFAULT_ANSWER_MODEL,
        api_key=OPENROUTER_API_KEY,
        base_url=_openrouter_base_url(),
        temperature=0,
        max_tokens=700,
    )


@lru_cache(maxsize=1)
def _quality_gate_agent() -> Agent:
    return Agent(
        model=_quality_gate_model(),
        parser_model=_quality_gate_parser_model(),
        parser_model_prompt="""
Convert the result into the exact QualityGateDecision schema.
Return valid JSON only.
- verdict: pass or regenerate
- reasoning: short explanation
- answers_user_question: true or false
- matches_merged_context: true or false
- respects_learner_style: true or false
- wrong_intent_branch_detected: true or false
- corrected_answer: null when verdict is pass, otherwise a full FinalCoachingAnswer object
Do not include markdown fences or extra keys.
""".strip(),
        output_schema=QualityGateDecision,
        instructions="""
You are the final quality guard for a coding coaching answer.

Your job:
1. Check whether the generated answer actually answers the learner's question.
2. Check whether it is consistent with the merged answer context.
3. Check whether it follows the intended learner style.

Return:
- verdict=pass if the answer is relevant, grounded, and directly responsive.
- verdict=regenerate if the answer misses the learner question, follows the wrong branch, or is not grounded in the provided context.

If you regenerate:
- produce a corrected FinalCoachingAnswer
- use only the provided merged context
- keep the answer concise when the learner prefers short answers
- do not mention the quality gate
- do not invent unsupported course content
""".strip(),
    )


def _build_quality_gate_prompt(
    *,
    question: str,
    question_intent: dict[str, Any],
    answer_context: dict[str, Any],
    current_structured_answer: dict[str, Any],
    current_answer_text: str,
) -> str:
    return json.dumps(
        {
            "question": question,
            "question_intent": question_intent,
            "answer_context": answer_context,
            "current_structured_answer": current_structured_answer,
            "current_answer_text": current_answer_text,
            "quality_rules": {
                "must_answer_the_user_question": True,
                "must_match_the_merged_context": True,
                "must_respect_learner_style": True,
                "must_not_use_wrong_intent_branch": True,
            },
        },
        ensure_ascii=False,
        indent=2,
    )


def quality_gate_answer_step(
    step_input: StepInput,
    *,
    log: Callable[[str], None],
) -> StepOutput:
    previous_content = _as_dict(step_input.previous_step_content)
    if previous_content.get("success") is False:
        return StepOutput(content=previous_content, success=False)

    question = _clean_text(previous_content.get("question"))
    question_intent = _as_dict(previous_content.get("questionIntent"))
    answer_context = _as_dict(previous_content.get("answerContext"))
    validated_context = _as_dict(previous_content.get("validatedContext"))
    current_answer_text = _clean_text(previous_content.get("answer"))
    current_structured_answer = _as_dict(previous_content.get("structuredAnswer"))
    regeneration_count = int(previous_content.get("qualityGateRegenerationCount") or 0)

    log("[Agno Chat Coach Agent] Quality gate step started.")
    log(
        "[Agno Chat Coach Agent] Quality gate input summary: "
        f"intent={_clean_text(question_intent.get('intent')) or 'unknown'} "
        f"question=\"{_one_line_preview(question)}\" "
        f"regenerationCount={regeneration_count}/{MAX_QUALITY_GATE_REGENERATIONS} "
        f"currentAnswer=\"{_one_line_preview(current_answer_text)}\""
    )

    if regeneration_count >= MAX_QUALITY_GATE_REGENERATIONS:
        log(
            "[Agno Chat Coach Agent] Quality gate regeneration limit reached. "
            f"maxRegenerations={MAX_QUALITY_GATE_REGENERATIONS}"
        )
        return StepOutput(
            content={
                **previous_content,
                "action": "quality_gate_regeneration_limit_reached",
                "qualityGateRegenerationCount": regeneration_count,
            },
            success=True,
        )

    if not current_answer_text:
        log("[Agno Chat Coach Agent] Quality gate failed because no answer was available to review.")
        return StepOutput(
            content={
                **previous_content,
                "success": False,
                "action": "quality_gate_answer",
                "error": "Missing generated answer before quality gate.",
            },
            success=False,
        )

    def _return_existing_answer_due_to_quality_gate_failure(reason: str) -> StepOutput:
        log(
            "[Agno Chat Coach Agent] Quality gate fallback activated. "
            f"Returning the existing answer. reason={reason}"
        )
        return StepOutput(
            content={
                **previous_content,
                "success": True,
                "action": "quality_gate_fallback_to_existing_answer",
                "qualityGate": {
                    "verdict": "pass",
                    "reasoning": f"Quality gate failed; existing answer was returned. reason={reason}",
                    "answers_user_question": True,
                    "matches_merged_context": True,
                    "respects_learner_style": True,
                    "wrong_intent_branch_detected": False,
                    "corrected_answer": None,
                },
                "qualityGateRegenerationCount": regeneration_count,
            },
            success=True,
        )

    prompt_payload = _build_quality_gate_prompt(
        question=question,
        question_intent=question_intent,
        answer_context=answer_context,
        current_structured_answer=current_structured_answer,
        current_answer_text=current_answer_text,
    )
    log("[Agno Chat Coach Agent] Quality gate prompt payload:")
    log(prompt_payload)
    log("[Agno Chat Coach Agent] Quality gate sending review request.")

    try:
        response = _quality_gate_agent().run(prompt_payload)
    except Exception as error:
        log(f"[Agno Chat Coach Agent] Quality gate failed: {error}")
        return _return_existing_answer_due_to_quality_gate_failure(str(error))

    content = getattr(response, "content", None)
    status = getattr(response, "status", None)
    usage = getattr(response, "usage", None)
    log(
        "[Agno Chat Coach Agent] Quality gate run completed: "
        f"status={status or 'unknown'} model={DEFAULT_ANSWER_MODEL}"
    )

    if not isinstance(content, QualityGateDecision):
        log(
            "[Agno Chat Coach Agent] Quality gate returned unexpected content. "
            f"type={type(content).__name__}"
        )
        return _return_existing_answer_due_to_quality_gate_failure(
            f"invalid structured content type={type(content).__name__}"
        )

    log("[Agno Chat Coach Agent] Quality gate structured response:")
    log(content.model_dump_json(indent=2))
    log("[Agno Chat Coach Agent] Quality gate evaluation summary:")
    log(
        json.dumps(
            {
                "answers_user_question": content.answers_user_question,
                "matches_merged_context": content.matches_merged_context,
                "respects_learner_style": content.respects_learner_style,
                "wrong_intent_branch_detected": content.wrong_intent_branch_detected,
                "verdict": content.verdict,
                "reasoning": _clean_text(content.reasoning),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    log(
        "[Agno Chat Coach Agent] Quality gate verdict: "
        f"{content.verdict.upper()} reasoning={_clean_text(content.reasoning)}"
    )

    if content.verdict == "pass":
        log("[Agno Chat Coach Agent] Quality gate accepted the generated answer.")
        return StepOutput(
            content={
                **previous_content,
                "action": "quality_gate_answer_pass",
                "qualityGate": content.model_dump(),
                "qualityGateRegenerationCount": regeneration_count,
                "usage": usage if isinstance(usage, dict) else previous_content.get("usage"),
            },
            success=True,
        )

    corrected = content.corrected_answer.model_dump() if content.corrected_answer is not None else {}
    corrected_answer_text = _sanitize_answer_text(_format_structured_answer(corrected), validated_context)

    if not corrected_answer_text:
        log("[Agno Chat Coach Agent] Quality gate requested regeneration but produced an empty corrected answer.")
        return _return_existing_answer_due_to_quality_gate_failure("empty regenerated answer")

    log("[Agno Chat Coach Agent] Quality gate regenerated the answer.")
    log("[Agno Chat Coach Agent] Quality gate final learner answer:")
    log(corrected_answer_text)

    return StepOutput(
        content={
            **previous_content,
            "action": "quality_gate_answer_regenerated",
            "answer": corrected_answer_text,
            "structuredAnswer": corrected,
            "qualityGate": content.model_dump(),
            "qualityGateRegenerationCount": regeneration_count + 1,
            "usage": usage if isinstance(usage, dict) else previous_content.get("usage"),
        },
        success=True,
    )
