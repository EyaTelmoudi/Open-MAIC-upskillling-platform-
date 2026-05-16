from __future__ import annotations

import asyncio
import json
import os
import sys
import threading
from pathlib import Path
from typing import Any, Callable

from pydantic import BaseModel


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

from agno.workflow import StepInput, StepOutput
from hindsight_client import Hindsight

DEFAULT_HINDSIGHT_URL = os.getenv("HINDSIGHT_API_URL", "http://127.0.0.1:8888")
DEFAULT_HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY") or None
REFLECT_TIMEOUT_SECONDS = float(os.getenv("CHAT_COACH_HINDSIGHT_REFLECT_READ_TIMEOUT_SECONDS", "150"))
RECALL_TIMEOUT_SECONDS = float(os.getenv("CHAT_COACH_HINDSIGHT_RECALL_READ_TIMEOUT_SECONDS", "45"))


class AnswerContext(BaseModel):
    learner_synthesis: str
    known_difficulties: str
    learning_style_hint: str
    course_passages: str
    discussion_general_facts: list[str]
    discussion_course_facts: list[str]
    discussion_fact_reasoning: str
    course_id: str
    module_context: str
    original_question: str
    intent: str
    difficulty_expected: str
    is_repeat_question: bool
    recent_chat_history: str


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _as_dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _call_async_in_isolated_thread(async_factory: Callable[[], Any]) -> Any:
    result_holder: dict[str, Any] = {}
    error_holder: dict[str, BaseException] = {}

    def _runner() -> None:
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            result_holder["value"] = loop.run_until_complete(async_factory())
        except BaseException as error:  # noqa: BLE001
            error_holder["error"] = error
        finally:
            try:
                pending = [task for task in asyncio.all_tasks(loop) if not task.done()]
                for task in pending:
                    task.cancel()
                if pending:
                    loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            except Exception:
                pass
            asyncio.set_event_loop(None)
            loop.close()

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
    thread.join()
    if "error" in error_holder:
        raise error_holder["error"]
    return result_holder.get("value")


def _fetch_hindsight_context_sync(
    *,
    learner_bank_id: str,
    course_bank_id: str,
    question: str,
    topic: str,
    hindsight_url: str,
    hindsight_api_key: str | None,
) -> dict[str, str]:
    async def _areflect_and_recall() -> dict[str, str]:
        learner_client = Hindsight(
            base_url=hindsight_url,
            api_key=hindsight_api_key or None,
            timeout=REFLECT_TIMEOUT_SECONDS,
        )
        course_client = Hindsight(
            base_url=hindsight_url,
            api_key=hindsight_api_key or None,
            timeout=RECALL_TIMEOUT_SECONDS,
        )
        try:
            try:
                learner_reflect = await learner_client.areflect(
                    bank_id=learner_bank_id,
                    query=(
                        "What do I know about this learner's style, difficulties, goals, and past struggles? "
                        f"Focus on anything related to: {topic or question}"
                    ),
                    budget="mid",
                    max_tokens=800,
                )
                learner_synthesis = _clean_text(getattr(learner_reflect, "text", "")) or "No learner profile yet."
            except Exception:
                learner_synthesis = "No learner profile yet."

            learner_recall = await learner_client.arecall(
                bank_id=learner_bank_id,
                query=(
                    "recorded learner difficulties, misunderstandings, blockers, or recurring confusion "
                    f"related to: {topic or question}. Exclude style preferences and general profile facts."
                ),
                budget="mid",
                max_tokens=800,
            )
            known_difficulties = _clean_text(
                "\n".join(
                    _clean_text(getattr(result, "content", "") or getattr(result, "text", ""))
                    for result in getattr(learner_recall, "results", [])
                )
            )
            if not known_difficulties or known_difficulties == "No relevant memories found.":
                known_difficulties = "No recorded difficulties on this topic."

            course_recall = await course_client.arecall(
                bank_id=course_bank_id,
                query=question,
                budget="high",
                max_tokens=1500,
            )
            course_passages = _clean_text(
                "\n".join(
                    _clean_text(getattr(result, "content", "") or getattr(result, "text", ""))
                    for result in getattr(course_recall, "results", [])
                )
            )
            if not course_passages or course_passages == "No relevant memories found.":
                course_passages = "No relevant course content found."

            return {
                "learner_synthesis": learner_synthesis,
                "known_difficulties": known_difficulties,
                "course_passages": course_passages,
            }
        finally:
            try:
                await learner_client.aclose()
            except Exception:
                pass
            try:
                await course_client.aclose()
            except Exception:
                pass

    return _call_async_in_isolated_thread(_areflect_and_recall)


def _extract_style_hint(synthesis: str) -> str:
    synthesis_lower = synthesis.lower()
    keywords = {
        "short answer": "prefers short answers",
        "short explanation": "prefers concise explanations",
        "real example": "prefers real examples",
        "example": "prefers concrete examples",
        "step-by-step": "needs step-by-step explanations",
        "diagram": "learns better with diagrams",
        "hands-on": "prefers hands-on exercises",
        "practice": "prefers hands-on exercises",
        "theory": "comfortable with theory first",
    }
    for keyword, hint in keywords.items():
        if keyword in synthesis_lower:
            return hint
    return "no specific style detected yet"


def _format_recent_chat_history(session_turns: list[Any]) -> str:
    if not session_turns:
        return "No prior messages."

    formatted_turns: list[str] = []
    for turn in session_turns[-4:]:
        if not isinstance(turn, dict):
            continue
        user_message = _clean_text(turn.get("user_message") or turn.get("userMessage"))
        agent_answer = _clean_text(turn.get("agent_answer") or turn.get("agentAnswer"))
        if user_message:
            formatted_turns.append(f"Learner: {user_message}")
        if agent_answer:
            formatted_turns.append(f"Coach: {agent_answer}")
    return "\n".join(formatted_turns) if formatted_turns else "No prior messages."


def _build_module_context(validated_context: dict[str, Any]) -> str:
    current_lesson = _clean_text(validated_context.get("current_lesson_title"))
    if current_lesson:
        return f"Current lesson: {current_lesson}"

    ordered_lessons = [
        lesson for lesson in _as_list(validated_context.get("ordered_lessons"))
        if isinstance(lesson, dict)
    ]
    if ordered_lessons:
        first_lesson = ordered_lessons[0]
        title = _clean_text(first_lesson.get("title"))
        module_title = _clean_text(first_lesson.get("module_title"))
        if title and module_title:
            return f"Course starts in {module_title} with lesson {title}"
        if title:
            return f"Course starts with lesson {title}"

    return "Unknown module"


def _build_session_state_summary(
    *,
    question: str,
    question_intent: dict[str, Any],
    validated_context: dict[str, Any],
    session_turns: list[Any],
) -> dict[str, Any]:
    return {
        "original_question": question,
        "intent": _clean_text(question_intent.get("intent")) or "concept",
        "topic": _clean_text(question_intent.get("topic")) or "unknown",
        "difficulty_expected": _clean_text(question_intent.get("difficulty_expected")) or "intermediate",
        "is_repeat_question": bool(question_intent.get("is_repeat")),
        "course_id": _clean_text(validated_context.get("course_id")),
        "course_title": _clean_text(validated_context.get("course_title")),
        "current_lesson_title": _clean_text(validated_context.get("current_lesson_title")) or None,
        "discussion_general_facts": [str(item) for item in _as_list(validated_context.get("learner_discussion_general_facts"))],
        "discussion_course_facts": [str(item) for item in _as_list(validated_context.get("learner_discussion_course_facts"))],
        "discussion_fact_reasoning": _clean_text(validated_context.get("learner_discussion_reasoning")) or None,
        "module_context": _build_module_context(validated_context),
        "recent_chat_history": _format_recent_chat_history(session_turns),
    }


def build_answer_context_step(
    step_input: StepInput,
    *,
    ensure_classified_content: Callable[[StepInput], dict[str, Any]],
    log: Callable[[str], None],
) -> StepOutput:
    previous_content = ensure_classified_content(step_input)
    if previous_content.get("success") is False:
        return StepOutput(content=previous_content, success=False)

    log("[Agno Chat Coach Agent] build_answer_context started.")

    validated_context = _as_dict(previous_content.get("validatedContext"))
    question_intent = _as_dict(previous_content.get("questionIntent"))
    question = _clean_text(previous_content.get("question"))
    user_id = _clean_text(previous_content.get("userId")) or _clean_text(validated_context.get("user_id"))
    course_id = _clean_text(previous_content.get("courseId")) or _clean_text(validated_context.get("course_id"))
    course_bank_id = _clean_text(validated_context.get("bank_id")) or _clean_text(previous_content.get("bankId"))
    hindsight_url = _clean_text(previous_content.get("hindsightApiUrl")) or DEFAULT_HINDSIGHT_URL
    hindsight_api_key = _clean_text(previous_content.get("hindsightApiKey")) or DEFAULT_HINDSIGHT_API_KEY
    topic = _clean_text(question_intent.get("topic"))
    session_turns = _as_list(validated_context.get("session_turns"))
    discussion_general_facts = [str(item) for item in _as_list(validated_context.get("learner_discussion_general_facts"))]
    discussion_course_facts = [str(item) for item in _as_list(validated_context.get("learner_discussion_course_facts"))]
    discussion_fact_reasoning = _clean_text(validated_context.get("learner_discussion_reasoning"))

    log(
        "[Agno Chat Coach Agent] build_answer_context inputs: "
        f"userId={user_id} courseId={course_id} topic={topic or 'unknown'}"
    )
    session_state_summary = _build_session_state_summary(
        question=question,
        question_intent=question_intent,
        validated_context=validated_context,
        session_turns=session_turns,
    )
    log("[Agno Chat Coach Agent] build_answer_context session_state paragraph:")
    log(json.dumps(session_state_summary, indent=2, ensure_ascii=False))
    if discussion_general_facts or discussion_course_facts:
        log("[Agno Chat Coach Agent] build_answer_context received learner discussion facts:")
        log(
            json.dumps(
                {
                    "discussion_general_facts": discussion_general_facts,
                    "discussion_course_facts": discussion_course_facts,
                    "discussion_fact_reasoning": discussion_fact_reasoning or None,
                },
                indent=2,
                ensure_ascii=False,
            )
        )

    try:
        hindsight_data = _fetch_hindsight_context_sync(
            learner_bank_id=user_id,
            course_bank_id=course_bank_id,
            question=question,
            topic=topic,
            hindsight_url=hindsight_url,
            hindsight_api_key=hindsight_api_key,
        )
    except Exception as error:
        log(f"[Agno Chat Coach Agent] build_answer_context Hindsight fetch failed: {error}")
        return StepOutput(
            content={
                **previous_content,
                "success": False,
                "action": "build_answer_context",
                "error": f"Failed to build answer context: {error}",
            },
            success=False,
        )

    log("[Agno Chat Coach Agent] build_answer_context reflect_on_memory paragraph:")
    log(
        json.dumps(
            {
                "learner_synthesis": _clean_text(hindsight_data.get("learner_synthesis")) or "No learner profile yet.",
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    log("[Agno Chat Coach Agent] build_answer_context recall_memory paragraph:")
    log(
        json.dumps(
            {
                "known_difficulties": _clean_text(hindsight_data.get("known_difficulties"))
                or "No recorded difficulties on this topic.",
                "course_passages": _clean_text(hindsight_data.get("course_passages")) or "No relevant course content found.",
            },
            indent=2,
            ensure_ascii=False,
        )
    )

    answer_context = AnswerContext(
        learner_synthesis=_clean_text(hindsight_data.get("learner_synthesis")) or "No learner profile yet.",
        known_difficulties=_clean_text(hindsight_data.get("known_difficulties")) or "No recorded difficulties on this topic.",
        learning_style_hint=_extract_style_hint(_clean_text(hindsight_data.get("learner_synthesis"))),
        course_passages=_clean_text(hindsight_data.get("course_passages")) or "No relevant course content found.",
        discussion_general_facts=discussion_general_facts,
        discussion_course_facts=discussion_course_facts,
        discussion_fact_reasoning=discussion_fact_reasoning,
        course_id=course_id,
        module_context=_build_module_context(validated_context),
        original_question=question,
        intent=_clean_text(question_intent.get("intent")) or "concept",
        difficulty_expected=_clean_text(question_intent.get("difficulty_expected")) or "intermediate",
        is_repeat_question=bool(question_intent.get("is_repeat")),
        recent_chat_history=_format_recent_chat_history(session_turns),
    )

    log("[Agno Chat Coach Agent] build_answer_context full ready context paragraph:")
    log(answer_context.model_dump_json(indent=2))
    log("[Agno Chat Coach Agent] build_answer_context finished.")

    return StepOutput(
        content={
            **previous_content,
            "action": "build_answer_context",
            "answerContext": answer_context.model_dump(),
        },
        success=True,
    )
