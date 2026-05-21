from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import quote
from uuid import UUID

import httpx
from sqlalchemy import text
from pydantic import BaseModel

from agno.workflow import Step, StepInput, StepOutput, Workflow


DEFAULT_QUIZ_REWRITE_MODEL = os.getenv("SOLO_CHALLENGE_QUIZ_REWRITE_MODEL", "openai/gpt-oss-120b:free")
DEFAULT_LLM_TIMEOUT_SECONDS = float(os.getenv("SOLO_CHALLENGE_LLM_TIMEOUT_SECONDS", "45"))
DEFAULT_HINDSIGHT_URL = os.getenv("HINDSIGHT_URL", os.getenv("HINDSIGHT_API_URL", "http://127.0.0.1:8888"))
DEFAULT_HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY", "")


class SoloChallengeStartInput(BaseModel):
    tenantId: str | None = None
    userId: str | None = None
    role: str | None = None
    source: str = "learning-shell"
    pagePath: str = "/courses"


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _solo_challenge_skill_path() -> Path:
    return _repo_root() / "agents" / "solo-challenge" / "skills" / "solo-challenge-mode-selector" / "SKILL.md"


def _load_solo_challenge_skill_text() -> str:
    skill_path = _solo_challenge_skill_path()
    try:
        raw = skill_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        _log(
            "[Agno Solo Challenge Agent] Solo challenge mode skill file was not found. "
            f"Path={skill_path}"
        )
        return ""

    if raw.startswith("---"):
        parts = raw.split("---", 2)
        if len(parts) == 3:
            raw = parts[2]
    return raw.strip()


def _solo_challenge_mode_skill_path(mode: str) -> Path:
    safe_mode = _clean_text(mode).replace("_", "-")
    return _repo_root() / "agents" / "solo-challenge" / "skills" / safe_mode / "SKILL.md"


def _load_solo_challenge_mode_skill_text(mode: str) -> str:
    skill_path = _solo_challenge_mode_skill_path(mode)
    try:
        raw = skill_path.read_text(encoding="utf-8")
    except FileNotFoundError:
        _log(
            "[Agno Solo Challenge Agent] Solo challenge detailed mode skill file was not found. "
            f"Path={skill_path}"
        )
        return ""

    if raw.startswith("---"):
        parts = raw.split("---", 2)
        if len(parts) == 3:
            raw = parts[2]
    _log(
        "[Agno Solo Challenge Agent] Loaded detailed skill for selected mode. "
        f"mode={mode} path={skill_path}"
    )
    return raw.strip()


def _load_dependencies() -> dict[str, Any]:
    from common.database import SessionLocal
    from common.models import Course, Enrollment
    from services.learning.services.learner_context import build_learner_context_response

    return {
        "SessionLocal": SessionLocal,
        "Course": Course,
        "Enrollment": Enrollment,
        "build_learner_context_response": build_learner_context_response,
    }


def _log(message: str) -> None:
    try:
        print(message, flush=True)
    except UnicodeEncodeError:
        safe_message = message.encode(
            sys.stdout.encoding or "utf-8",
            errors="backslashreplace",
        ).decode(sys.stdout.encoding or "utf-8", errors="strict")
        print(safe_message, flush=True)


def _clean_text(value: Any) -> str:
    return value.strip() if isinstance(value, str) else ""


def _normalize_text(value: Any) -> str:
    return " ".join(_clean_text(str(value or "")).lower().split())


def _build_user_course_bank_id(tenant_id: str, user_id: str, course_id: str) -> str:
    return f"tenant:{tenant_id}:user:{user_id}:course:{course_id}"


def _build_course_bank_id(tenant_id: str, course_id: str) -> str:
    return f"tenant:{tenant_id}:course:{course_id}"


def _recall_user_course_memory(*, tenant_id: str, user_id: str, course_id: str) -> dict[str, Any]:
    bank_id = _build_user_course_bank_id(tenant_id, user_id, course_id)
    hindsight_url = DEFAULT_HINDSIGHT_URL.rstrip("/")
    headers = {"Content-Type": "application/json"}
    if DEFAULT_HINDSIGHT_API_KEY:
        headers["Authorization"] = f"Bearer {DEFAULT_HINDSIGHT_API_KEY}"

    payload = {
        "query": (
            "What are this learner's difficulties, weak concepts, repeated confusions, "
            "and quiz answers or quiz topics they got wrong in this course?"
        ),
        "budget": "mid",
        "max_tokens": 1400,
        "include": {
            "facts": {},
        },
    }

    _log(f"[Agno Solo Challenge Agent] Calling Hindsight recall for learner-course bank {bank_id}")

    with httpx.Client(timeout=120.0, trust_env=False) as client:
        response = client.post(
            f"{hindsight_url}/v1/default/banks/{quote(bank_id, safe='')}/memories/recall",
            headers=headers,
            json=payload,
        )

    response_payload = response.json() if response.content else {}
    if not response.is_success:
        error_message = (
            _clean_text(response_payload.get("error")) if isinstance(response_payload, dict) else ""
        ) or (
            _clean_text(response_payload.get("detail")) if isinstance(response_payload, dict) else ""
        ) or f"Hindsight recall failed with status {response.status_code}."
        raise RuntimeError(error_message)

    results = [
        item
        for item in (response_payload.get("results") if isinstance(response_payload, dict) else []) or []
        if isinstance(item, dict)
    ]
    supporting_memories = [
        {
            "text": _clean_text(item.get("text") or item.get("content")),
            "type": _clean_text(item.get("type")) or "memory",
        }
        for item in results
        if _clean_text(item.get("text") or item.get("content"))
    ][:8]

    return {
        "bankId": bank_id,
        "results": results,
        "supportingMemories": supporting_memories,
    }


def _parse_embedded_answer_json(text: str) -> dict[str, Any] | None:
    cleaned = _clean_text(text)
    if not cleaned:
        return None

    decoder = json.JSONDecoder()
    candidates = [cleaned]
    if "{" in cleaned:
        candidates.append(cleaned[cleaned.find("{") :])

    for candidate in candidates:
        try:
            parsed, _ = decoder.raw_decode(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _extract_failed_quiz_signature(failed_quiz: dict[str, Any] | None) -> dict[str, str]:
    if not isinstance(failed_quiz, dict):
        return {}

    wrong_answers = failed_quiz.get("wrongAnswers")
    wrong_answers = wrong_answers if isinstance(wrong_answers, list) else []
    first_wrong = next((item for item in wrong_answers if isinstance(item, dict)), None)

    return {
        "attemptId": _clean_text(failed_quiz.get("attemptId")),
        "questionId": _clean_text(first_wrong.get("questionId")) if isinstance(first_wrong, dict) else "",
        "question": _clean_text(first_wrong.get("question")) if isinstance(first_wrong, dict) else "",
        "correctAnswer": _clean_text(first_wrong.get("correctAnswer")) if isinstance(first_wrong, dict) else "",
        "completedAt": _clean_text(failed_quiz.get("completedAt")),
    }


def _latest_failed_quiz_already_remediated(
    db: Any,
    *,
    user_id: str,
    course_id: str,
    latest_failed_quiz: dict[str, Any] | None,
) -> bool:
    signature = _extract_failed_quiz_signature(latest_failed_quiz)
    attempt_id = signature.get("attemptId")
    question_id = signature.get("questionId")
    question_text = signature.get("question")
    completed_at = signature.get("completedAt")

    if not attempt_id and not question_id and not question_text:
        return False

    row = db.execute(
        text(
            """
            SELECT id
            FROM solo_challenge_attempts
            WHERE user_id = CAST(:user_id AS uuid)
              AND course_id = CAST(:course_id AS uuid)
              AND is_correct = TRUE
              AND (
                    quiz_payload->>'sourceFailedQuizAttemptId' = :attempt_id
                 OR quiz_payload->>'sourceFailedQuestionId' = :question_id
                 OR lower(quiz_payload->>'sourceFailedQuestion') = lower(:question_text)
              )
              AND (
                    CAST(:completed_at AS timestamp) IS NULL
                 OR created_at >= CAST(:completed_at AS timestamp)
              )
            ORDER BY created_at DESC
            LIMIT 1
            """
        ),
        {
            "user_id": user_id,
            "course_id": course_id,
            "attempt_id": attempt_id or None,
            "question_id": question_id or None,
            "question_text": question_text or None,
            "completed_at": completed_at or None,
        },
    ).mappings().first()

    return bool(row)


def _call_hindsight_reflect(
    *,
    bank_id: str,
    query: str,
    max_tokens: int,
) -> dict[str, Any]:
    hindsight_url = DEFAULT_HINDSIGHT_URL.rstrip("/")
    headers = {"Content-Type": "application/json"}
    if DEFAULT_HINDSIGHT_API_KEY:
        headers["Authorization"] = f"Bearer {DEFAULT_HINDSIGHT_API_KEY}"

    payload = {
        "query": query,
        "max_tokens": max_tokens,
    }

    with httpx.Client(timeout=180.0, trust_env=False) as client:
        response = client.post(
            f"{hindsight_url}/v1/default/banks/{quote(bank_id, safe='')}/reflect",
            headers=headers,
            json=payload,
        )

    response_payload = response.json() if response.content else {}
    if not response.is_success:
        error_message = (
            _clean_text(response_payload.get("error")) if isinstance(response_payload, dict) else ""
        ) or (
            _clean_text(response_payload.get("detail")) if isinstance(response_payload, dict) else ""
        ) or f"Hindsight reflect failed with status {response.status_code}."
        raise RuntimeError(error_message)

    answer_text = ""
    parsed_answer: dict[str, Any] | None = None
    if isinstance(response_payload, dict):
        answer_text = _clean_text(response_payload.get("answer"))
        if answer_text:
            parsed_answer = _parse_embedded_answer_json(answer_text)

        if not parsed_answer:
            text_payload = _clean_text(response_payload.get("text"))
            if text_payload:
                parsed_from_text = _parse_embedded_answer_json(text_payload)
                if isinstance(parsed_from_text, dict):
                    parsed_answer = parsed_from_text
                    answer_text = text_payload

        if not parsed_answer and isinstance(response_payload.get("mode"), str):
            parsed_answer = response_payload

    if not answer_text:
        answer_text = _clean_text(response.text)

    if not parsed_answer:
        parsed_answer = _parse_embedded_answer_json(answer_text)

    return {
        "bankId": bank_id,
        "answer": answer_text,
        "parsedAnswer": parsed_answer,
        "rawResponse": response_payload if isinstance(response_payload, dict) else {},
    }


def _reflect_solo_challenge_mode(
    *,
    tenant_id: str,
    course_id: str,
    course_title: str,
    learner_memories: list[dict[str, Any]],
    latest_failed_quiz: dict[str, Any] | None,
) -> dict[str, Any]:
    bank_id = _build_course_bank_id(tenant_id, course_id)
    learner_memory_lines = [
        f"- {memory.get('text')}"
        for memory in learner_memories
        if _clean_text(memory.get("text"))
    ]
    learner_memory_block = "\n".join(learner_memory_lines) if learner_memory_lines else "- No specific learner difficulty memories were recalled."
    failed_quiz_block = json.dumps(latest_failed_quiz, ensure_ascii=False, indent=2) if isinstance(latest_failed_quiz, dict) and latest_failed_quiz else "null"
    skill_text = _load_solo_challenge_skill_text()

    reflect_query = (
        "You are the Solo Challenge Agent for a gamified learning platform.\n"
        "Follow the skill instructions below exactly, then use the provided learner and course context to choose the best challenge mode only.\n"
        "Always return valid JSON only.\n\n"
        "=== SOLO CHALLENGE SKILL ===\n"
        f"{skill_text or 'Skill file unavailable. Use the current course, learner memory, and failed-quiz context to choose the best mode.'}\n"
        "=== END SOLO CHALLENGE SKILL ===\n\n"
        "Return JSON with exactly these keys:\n"
        "{\n"
        '  "mode": "...",\n'
        '  "mode_reason": "..."\n'
        "}\n\n"
        f"Current course title: {course_title or course_id}\n"
        f"Current course bank id: {bank_id}\n"
        "Learner-course memory context for this same current course:\n"
        f"{learner_memory_block}\n\n"
        "Latest failed quiz context for this same current course from the platform database:\n"
        f"{failed_quiz_block}\n"
    )

    _log(f"[Agno Solo Challenge Agent] Calling Hindsight reflect for mode selection on course bank {bank_id}")
    return _call_hindsight_reflect(
        bank_id=bank_id,
        query=reflect_query,
        max_tokens=900,
    )


def _generate_solo_challenge_from_mode(
    *,
    tenant_id: str,
    course_id: str,
    course_title: str,
    learner_memories: list[dict[str, Any]],
    latest_failed_quiz: dict[str, Any] | None,
    selected_mode: str,
    mode_reason: str,
) -> dict[str, Any]:
    bank_id = _build_course_bank_id(tenant_id, course_id)
    _log(
        "[Agno Solo Challenge Agent] Preparing the learner challenge question. "
        f"mode={selected_mode} courseId={course_id} courseTitle={course_title or course_id}"
    )
    learner_memory_lines = [
        f"- {memory.get('text')}"
        for memory in learner_memories
        if _clean_text(memory.get("text"))
    ]
    learner_memory_block = "\n".join(learner_memory_lines) if learner_memory_lines else "- No specific learner difficulty memories were recalled."
    failed_quiz_block = json.dumps(latest_failed_quiz, ensure_ascii=False, indent=2) if isinstance(latest_failed_quiz, dict) and latest_failed_quiz else "null"
    mode_skill_text = _load_solo_challenge_mode_skill_text(selected_mode)

    reflect_query = (
        "You are the Solo Challenge Agent for a gamified learning platform.\n"
        "A mode has already been selected. Your job now is to generate exactly one grounded multiple-choice question for that selected mode.\n"
        "Always return valid JSON only.\n\n"
        f"Selected mode: {selected_mode}\n"
        f"Mode reason: {mode_reason or 'No reason provided'}\n\n"
        "=== MODE SKILL ===\n"
        f"{mode_skill_text or 'No mode skill file was available. Generate one grounded four-option multiple-choice question that matches the selected mode.'}\n"
        "=== END MODE SKILL ===\n\n"
        "Return JSON with exactly these keys:\n"
        "{\n"
        '  "challenge_title": "...",\n'
        '  "intro": "...",\n'
        '  "question": "...",\n'
        '  "options": ["...", "...", "...", "..."],\n'
        '  "correct_answer": "...",\n'
        '  "explanation": "..."\n'
        "}\n\n"
        f"Current course title: {course_title or course_id}\n"
        f"Current course bank id: {bank_id}\n"
        "Learner-course memory context for this same current course:\n"
        f"{learner_memory_block}\n\n"
        "Latest failed quiz context for this same current course from the platform database:\n"
        f"{failed_quiz_block}\n"
    )

    _log(
        "[Agno Solo Challenge Agent] Calling Hindsight reflect for question generation "
        f"with mode {selected_mode} on course bank {bank_id}"
    )
    return _call_hindsight_reflect(
        bank_id=bank_id,
        query=reflect_query,
        max_tokens=1400,
    )


def _resolve_llm_url() -> str | None:
    explicit = _clean_text(os.getenv("SOLO_CHALLENGE_LLM_URL"))
    if explicit:
        return explicit

    coach_url = _clean_text(os.getenv("COACH_MODE_JUDGE_URL"))
    if coach_url:
        return coach_url

    base_url = _clean_text(os.getenv("OPENAI_BASE_URL"))
    if base_url:
        return f"{base_url.rstrip('/')}/chat/completions"

    return "https://openrouter.ai/api/v1/chat/completions"


def _resolve_llm_api_key() -> str | None:
    return (
        _clean_text(os.getenv("SOLO_CHALLENGE_LLM_API_KEY"))
        or _clean_text(os.getenv("COACH_MODE_JUDGE_API_KEY"))
        or _clean_text(os.getenv("OPENROUTER_API_KEY"))
        or _clean_text(os.getenv("OPENAI_API_KEY"))
        or None
    )


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
    api_key = _resolve_llm_api_key()
    url = _resolve_llm_url()
    if not api_key or not url:
        _log(
            "[Agno Solo Challenge Agent] Structured LLM configuration missing. "
            f"urlPresent={bool(url)} apiKeyPresent={bool(api_key)}"
        )
        return None

    model_id = (
        _clean_text(os.getenv("SOLO_CHALLENGE_QUIZ_REWRITE_MODEL"))
        or _clean_text(os.getenv("COACH_MODE_JUDGE_MODEL"))
        or DEFAULT_QUIZ_REWRITE_MODEL
    )
    _log(
        "[Agno Solo Challenge Agent] Structured LLM request prepared. "
        f"url={url} model={model_id} apiKeyPresent=true"
    )

    payload = {
        "model": model_id,
        "temperature": 0.4,
        "max_tokens": max_tokens,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "response_format": {"type": "json_object"},
    }
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    try:
        with httpx.Client(timeout=DEFAULT_LLM_TIMEOUT_SECONDS, trust_env=False) as client:
            response = client.post(url, headers=headers, json=payload)
            response.raise_for_status()
        response_payload = response.json()
    except (httpx.HTTPError, ValueError) as error:
        _log(f"[Agno Solo Challenge Agent] Structured LLM call failed: {error}")
        return None

    if not isinstance(response_payload, dict):
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

    parsed = _parse_json_object_response(raw_text)
    if parsed is None:
        _log("[Agno Solo Challenge Agent] Structured LLM response was not a valid JSON object.")
    return parsed


def _normalize_public_options(options: Any) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    for index, option in enumerate(options or []):
        if isinstance(option, dict):
            value = _clean_text(option.get("value")) or _clean_text(option.get("label"))
            label = _clean_text(option.get("label")) or value
        else:
            value = _clean_text(option)
            label = value
        if not value:
            continue
        normalized.append(
            {
                "id": chr(ord("A") + index),
                "value": value,
                "label": label,
            }
        )
    return normalized


def _resolve_correct_option_id(
    options: list[dict[str, Any]],
    correct_answers: list[str],
) -> str | None:
    normalized_correct_answers = {
        _normalize_text(answer)
        for answer in correct_answers or []
        if _normalize_text(answer)
    }
    if not normalized_correct_answers:
        return None

    for option in options or []:
        label = _clean_text(option.get("label") or option.get("value"))
        if _normalize_text(label) in normalized_correct_answers:
            return _clean_text(option.get("id")) or None
    return None


def _log_recreated_quiz(quiz_payload: dict[str, Any]) -> None:
    _log("[Agno Solo Challenge Agent] Recreated quiz ready for the learner:")
    _log(
        json.dumps(
            {
                "courseId": quiz_payload.get("courseId"),
                "courseTitle": quiz_payload.get("courseTitle"),
                "lessonId": quiz_payload.get("lessonId"),
                "lessonTitle": quiz_payload.get("lessonTitle"),
                "source": quiz_payload.get("source"),
                "questionCount": len(quiz_payload.get("questions") or []),
                "focusMode": quiz_payload.get("focusMode"),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    for question in quiz_payload.get("questions") or []:
        _log(
            f"[Agno Solo Challenge Agent] Recreated Question {question.get('displayOrder')}: "
            f"{_clean_text(question.get('text'))}"
        )
        for option in question.get("options") or []:
            _log(
                f"[Agno Solo Challenge Agent]   {option.get('id')}. "
                f"{_clean_text(option.get('label') or option.get('value'))}"
            )


def _log_failed_quiz_source_questions(
    failed_quiz: dict[str, Any],
    questions: list[dict[str, Any]],
    *,
    focus_mode: str,
) -> None:
    _log("[Agno Solo Challenge Agent] Source questions from the selected failed quiz:")
    _log(
        json.dumps(
            {
                "courseId": failed_quiz.get("courseId"),
                "courseTitle": failed_quiz.get("courseTitle"),
                "lessonId": failed_quiz.get("lessonId"),
                "lessonTitle": failed_quiz.get("lessonTitle"),
                "assessmentId": failed_quiz.get("assessmentId"),
                "source": failed_quiz.get("source"),
                "focusMode": focus_mode,
                "questionCount": len(questions),
            },
            indent=2,
            ensure_ascii=False,
        )
    )
    for question in questions:
        _log(
            f"[Agno Solo Challenge Agent] Failed Quiz Question {question.get('displayOrder')}: "
            f"{_clean_text(question.get('text'))}"
        )
        for option in question.get("options") or []:
            _log(
                f"[Agno Solo Challenge Agent]   {option.get('id')}. "
                f"{_clean_text(option.get('label') or option.get('value'))}"
            )
        correct_answers = [
            _clean_text(answer)
            for answer in question.get("correctAnswers") or []
            if _clean_text(answer)
        ]
        if correct_answers:
            _log(f"[Agno Solo Challenge Agent]   Correct answer(s): {', '.join(correct_answers)}")


def _build_fallback_recreated_question(
    question: dict[str, Any],
    *,
    display_order: int,
    lesson_title: str | None = None,
) -> dict[str, Any]:
    options = _normalize_public_options(
        [
            option.get("label") or option.get("value")
            for option in question.get("options") or []
            if isinstance(option, dict)
        ]
    )
    base_text = _clean_text(question.get("text"))
    cleaned_lesson_title = _clean_text(lesson_title)
    if cleaned_lesson_title and cleaned_lesson_title.lower() not in base_text.lower():
        base_text = f'According to the lesson "{cleaned_lesson_title}", {base_text[:1].lower()}{base_text[1:]}' if base_text else f'According to the lesson "{cleaned_lesson_title}", what is correct?'
    return {
        "questionId": question["questionId"],
        "text": base_text,
        "questionType": question.get("questionType") or "multiple_choice",
        "displayOrder": display_order,
        "options": options,
        "correctAnswers": question.get("correctAnswers") or [],
        "generationMode": "fallback_original_question",
    }


def _generate_llm_recreated_question(
    *,
    source_question: dict[str, Any],
    failed_quiz: dict[str, Any],
) -> dict[str, Any] | None:
    lesson_title = _clean_text(failed_quiz.get("lessonTitle"))
    original_options = [
        _clean_text(option.get("label") or option.get("value"))
        for option in source_question.get("options") or []
        if isinstance(option, dict)
    ]
    correct_answers = [
        _clean_text(answer)
        for answer in (source_question.get("correctAnswers") or [])
        if _clean_text(answer)
    ]

    system_prompt = (
        "You generate one fresh multiple-choice quiz question for a learner. "
        "Keep the same concept as the failed source question, but rewrite it so it is not a copy. "
        "Make the question self-contained and explicitly mention the lesson title when one is provided. "
        "Return valid JSON only with keys: question, options, correct_answer, explanation."
    )
    user_prompt = json.dumps(
        {
            "course_title": failed_quiz.get("courseTitle"),
            "lesson_title": failed_quiz.get("lessonTitle"),
            "failed_question": source_question.get("text"),
            "failed_question_options": original_options,
            "correct_answer": correct_answers[0] if correct_answers else None,
            "learner_wrong_answer": next(
                (
                    item.get("userAnswer")
                    for item in failed_quiz.get("wrongAnswers") or []
                    if _normalize_text(item.get("question")) == _normalize_text(source_question.get("text"))
                ),
                None,
            ),
            "goal": "Create a new beginner-friendly question that checks the same concept with different wording and plausible distractors.",
            "rules": [
                "Use exactly 4 answer options.",
                "Include the correct answer inside options.",
                "Do not copy the original question wording exactly.",
                "Keep options concise and realistic.",
                "If lesson_title is provided, explicitly mention it in the question text.",
            ],
        },
        ensure_ascii=False,
        indent=2,
    )

    payload = _call_structured_llm(
        system_prompt=system_prompt,
        user_prompt=user_prompt,
        max_tokens=500,
    )
    if not isinstance(payload, dict):
        _log("[Agno Solo Challenge Agent] LLM quiz recreation returned no usable payload. Falling back to original question.")
        return None

    question_text = _clean_text(payload.get("question"))
    options_raw = payload.get("options")
    correct_answer = _clean_text(payload.get("correct_answer"))
    explanation = _clean_text(payload.get("explanation"))

    if not question_text or not isinstance(options_raw, list):
        _log("[Agno Solo Challenge Agent] LLM quiz recreation response missed question/options. Falling back to original question.")
        return None

    cleaned_options = []
    seen: set[str] = set()
    for option in options_raw:
        label = _clean_text(option)
        if not label:
            continue
        normalized = label.lower()
        if normalized in seen:
            continue
        seen.add(normalized)
        cleaned_options.append(label)

    if correct_answer and correct_answer.lower() not in {option.lower() for option in cleaned_options}:
        cleaned_options.append(correct_answer)

    if len(cleaned_options) != 4 or not correct_answer:
        _log(
            "[Agno Solo Challenge Agent] LLM quiz recreation response had invalid options/correct answer. "
            "Falling back to original question."
        )
        return None

    if lesson_title and lesson_title.lower() not in question_text.lower():
        question_text = f'According to the lesson "{lesson_title}", {question_text[:1].lower()}{question_text[1:]}'

    _log("[Agno Solo Challenge Agent] LLM recreated a fresh quiz question successfully.")
    return {
        "questionId": source_question["questionId"],
        "text": question_text,
        "questionType": "multiple_choice",
        "options": _normalize_public_options(cleaned_options),
        "correctAnswers": [correct_answer],
        "explanation": explanation or None,
        "generationMode": "llm_recreated_question",
    }


def _log_loaded_learner_context(context: dict[str, Any]) -> None:
    summary = {
        "courseId": context.get("courseId"),
        "courseTitle": context.get("courseTitle"),
        "enrollment": context.get("enrollment") or {},
        "progressSummary": context.get("progressSummary") or {},
        "currentLesson": context.get("currentLesson"),
        "lastOpenedLesson": context.get("lastOpenedLesson"),
        "lastCompletedLesson": context.get("lastCompletedLesson"),
        "latestQuizAttempt": context.get("latestQuizAttempt"),
        "failedQuizCount": context.get("failedQuizCount"),
        "failedQuizzes": context.get("failedQuizzes") or [],
        "updatedAt": context.get("updatedAt"),
    }

    _log("[Agno Solo Challenge Agent] Loaded learner context from the latest enrolled course:")
    _log(json.dumps(summary, indent=2, ensure_ascii=False))


def _log_collected_user_context(
    *,
    tenant_id: str | None,
    user_id: str,
    role: str | None,
    course_id: str,
    course_title: str,
    enrollment_status: str,
    enrolled_at: str | None,
    learner_context: dict[str, Any],
    latest_failed_quiz_across_courses: dict[str, Any] | None,
) -> None:
    progress_summary = learner_context.get("progressSummary") or {}
    collected_context = {
        "layer_1_identity_and_scope": {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "role": role,
        },
        "layer_2_latest_enrolled_course": {
            "course_id": course_id,
            "course_title": course_title,
            "enrollment_status": enrollment_status,
            "enrolled_at": enrolled_at,
        },
        "layer_3_last_failed_quiz_across_courses": latest_failed_quiz_across_courses,
        "layer_4_progress_and_quizzes": {
            "progress_summary": progress_summary,
            "current_lesson": learner_context.get("currentLesson"),
            "last_opened_lesson": learner_context.get("lastOpenedLesson"),
            "last_completed_lesson": learner_context.get("lastCompletedLesson"),
            "latest_quiz_attempt": learner_context.get("latestQuizAttempt"),
            "failed_quiz_count": learner_context.get("failedQuizCount"),
            "failed_quizzes": learner_context.get("failedQuizzes") or [],
        },
        "layer_5_full_learner_context_payload": learner_context,
    }

    _log("[Agno Solo Challenge Agent] Collected user context:")
    _log(json.dumps(collected_context, indent=2, ensure_ascii=False))


def _fetch_last_failed_quiz_assessment_for_course(
    db: Any,
    *,
    user_id: str,
    course_id: str,
) -> dict[str, Any] | None:
    traditional_failed = db.execute(
        text(
            """
            SELECT
                qa.id AS attempt_id,
                qa.assessment_id,
                l.id AS lesson_id,
                l.title AS lesson_title,
                qa.score,
                qa.passed,
                qa.completed_at,
                qa.started_at,
                qa.wrong_answers,
                'traditional' AS source
            FROM quiz_attempts qa
            JOIN assessments a ON a.id = qa.assessment_id
            JOIN lessons l ON l.assessment_id = a.id
            JOIN modules m ON m.id = l.module_id
            WHERE qa.user_id = CAST(:user_id AS uuid)
              AND m.course_id = CAST(:course_id AS uuid)
              AND COALESCE(qa.passed, FALSE) = FALSE
            ORDER BY qa.completed_at DESC NULLS LAST, qa.started_at DESC
            LIMIT 1
            """
        ),
        {"user_id": user_id, "course_id": course_id},
    ).mappings().first()

    ai_failed = db.execute(
        text(
            """
            SELECT
                a.id AS attempt_id,
                NULL AS assessment_id,
                a.lesson_id,
                l.title AS lesson_title,
                a.score,
                a.passed,
                a.completed_at,
                a.wrong_answers,
                'ai_generated' AS source
            FROM ai_platform_lesson_quiz_attempts a
            JOIN lessons l ON l.id = a.lesson_id
            WHERE a.user_id = CAST(:user_id AS uuid)
              AND a.course_id = CAST(:course_id AS uuid)
              AND a.passed = FALSE
            ORDER BY a.completed_at DESC
            LIMIT 1
            """
        ),
        {"user_id": user_id, "course_id": course_id},
    ).mappings().first()

    candidates: list[tuple[datetime, dict[str, Any]]] = []
    for row in (traditional_failed, ai_failed):
        if not row:
            continue
        ordered_at = row["completed_at"] or row["started_at"]
        if not ordered_at:
            continue
        candidates.append(
            (
                ordered_at,
                {
                    "attemptId": str(row["attempt_id"]) if row["attempt_id"] else None,
                    "assessmentId": str(row["assessment_id"]) if row["assessment_id"] else None,
                    "lessonId": str(row["lesson_id"]) if row["lesson_id"] else None,
                    "lessonTitle": row["lesson_title"],
                    "score": float(row["score"] or 0),
                    "passed": bool(row["passed"]),
                    "completedAt": row["completed_at"].isoformat() if row["completed_at"] else None,
                    "startedAt": row["started_at"].isoformat() if row.get("started_at") else None,
                    "wrongAnswers": row["wrong_answers"] or [],
                    "source": row["source"],
                },
            )
        )

    if not candidates:
        return None

    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def _fetch_latest_failed_quiz_assessment_across_courses(
    db: Any,
    *,
    user_id: str,
    tenant_id: str | None,
) -> dict[str, Any] | None:
    traditional_query = """
        SELECT
            qa.id AS attempt_id,
            qa.assessment_id,
            c.id AS course_id,
            c.title AS course_title,
            l.id AS lesson_id,
            l.title AS lesson_title,
            qa.score,
            qa.passed,
            qa.completed_at,
            qa.started_at,
            qa.wrong_answers,
            'traditional' AS source
        FROM quiz_attempts qa
        JOIN assessments a ON a.id = qa.assessment_id
        JOIN lessons l ON l.assessment_id = a.id
        JOIN modules m ON m.id = l.module_id
        JOIN courses c ON c.id = m.course_id
        WHERE qa.user_id = CAST(:user_id AS uuid)
          AND COALESCE(qa.passed, FALSE) = FALSE
    """
    ai_query = """
        SELECT
            a.id AS attempt_id,
            NULL AS assessment_id,
            c.id AS course_id,
            c.title AS course_title,
            a.lesson_id,
            l.title AS lesson_title,
            a.score,
            a.passed,
            a.completed_at,
            a.wrong_answers,
            'ai_generated' AS source
        FROM ai_platform_lesson_quiz_attempts a
        JOIN lessons l ON l.id = a.lesson_id
        JOIN modules m ON m.id = l.module_id
        JOIN courses c ON c.id = m.course_id
        WHERE a.user_id = CAST(:user_id AS uuid)
          AND a.passed = FALSE
    """

    params: dict[str, Any] = {"user_id": user_id}
    if tenant_id:
        traditional_query += " AND c.tenant_id = CAST(:tenant_id AS uuid)"
        ai_query += " AND c.tenant_id = CAST(:tenant_id AS uuid)"
        params["tenant_id"] = tenant_id

    traditional_query += " ORDER BY qa.completed_at DESC NULLS LAST, qa.started_at DESC LIMIT 1"
    ai_query += " ORDER BY a.completed_at DESC LIMIT 1"

    traditional_failed = db.execute(
        text(traditional_query),
        params,
    ).mappings().first()

    ai_failed = db.execute(
        text(ai_query),
        params,
    ).mappings().first()

    candidates: list[tuple[datetime, dict[str, Any]]] = []
    for row in (traditional_failed, ai_failed):
        if not row:
            continue
        ordered_at = row["completed_at"] or row.get("started_at")
        if not ordered_at:
            continue
        candidates.append(
            (
                ordered_at,
                {
                    "attemptId": str(row["attempt_id"]) if row["attempt_id"] else None,
                    "assessmentId": str(row["assessment_id"]) if row["assessment_id"] else None,
                    "courseId": str(row["course_id"]) if row["course_id"] else None,
                    "courseTitle": row["course_title"],
                    "lessonId": str(row["lesson_id"]) if row["lesson_id"] else None,
                    "lessonTitle": row["lesson_title"],
                    "score": float(row["score"] or 0),
                    "passed": bool(row["passed"]),
                    "completedAt": row["completed_at"].isoformat() if row["completed_at"] else None,
                    "startedAt": row["started_at"].isoformat() if row.get("started_at") else None,
                    "wrongAnswers": row["wrong_answers"] or [],
                    "source": row["source"],
                },
            )
        )

    if not candidates:
        return None

    candidates.sort(key=lambda item: item[0], reverse=True)
    return candidates[0][1]


def _log_latest_course_and_failed_assessment(
    *,
    user_id: str,
    role: str | None,
    tenant_id: str | None,
    course_id: str,
    course_title: str,
    enrollment_status: str,
    enrolled_at: str | None,
    last_failed_assessment: dict[str, Any] | None,
    latest_failed_quiz_across_courses: dict[str, Any] | None,
) -> None:
    payload = {
        "latest_enrolled_course": {
            "course_id": course_id,
            "course_title": course_title,
            "enrollment_status": enrollment_status,
            "enrolled_at": enrolled_at,
        },
        "last_failed_quiz_assessment_for_that_course": last_failed_assessment,
        "latest_failed_quiz_assessment_across_courses": latest_failed_quiz_across_courses,
        "user_scope": {
            "tenant_id": tenant_id,
            "user_id": user_id,
            "role": role,
        },
    }

    _log("[Agno Solo Challenge Agent] Collected latest enrolled course and last failed quiz assessment:")
    _log(json.dumps(payload, indent=2, ensure_ascii=False))


def _select_latest_failed_quiz_source(previous_content: dict[str, Any]) -> dict[str, Any] | None:
    last_failed_for_course = previous_content.get("lastFailedQuizAssessment")
    if isinstance(last_failed_for_course, dict) and last_failed_for_course:
        return {
            **last_failed_for_course,
            "courseId": previous_content.get("courseId"),
            "courseTitle": previous_content.get("courseTitle"),
        }
    return None


def _fetch_traditional_quiz_questions(
    db: Any,
    *,
    assessment_id: str,
) -> list[dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT id, text, type, options, correct_answer, points, "order" AS display_order
            FROM questions
            WHERE assessment_id = CAST(:assessment_id AS uuid)
            ORDER BY "order"
            """
        ),
        {"assessment_id": assessment_id},
    ).mappings().all()
    return [
        {
            "questionId": str(row["id"]),
            "text": row["text"],
            "questionType": row["type"],
            "options": _normalize_public_options(row["options"]),
            "correctAnswers": [_clean_text(row["correct_answer"])],
            "displayOrder": int(row["display_order"] or 0),
            "points": int(row["points"] or 0),
        }
        for row in rows
    ]


def _fetch_ai_generated_quiz_questions(
    db: Any,
    *,
    lesson_id: str,
) -> list[dict[str, Any]]:
    rows = db.execute(
        text(
            """
            SELECT id, text, question_type, options, correct_answers, explanation, display_order
            FROM ai_platform_lesson_quiz_questions
            WHERE lesson_id = CAST(:lesson_id AS uuid)
            ORDER BY display_order
            """
        ),
        {"lesson_id": lesson_id},
    ).mappings().all()
    return [
        {
            "questionId": str(row["id"]),
            "text": row["text"],
            "questionType": row["question_type"],
            "options": _normalize_public_options(row["options"]),
            "correctAnswers": [
                _clean_text(answer)
                for answer in (row["correct_answers"] or [])
                if _clean_text(answer)
            ],
            "displayOrder": int(row["display_order"] or 0),
            "explanation": row["explanation"],
        }
        for row in rows
    ]


def _filter_questions_to_failed_focus(
    questions: list[dict[str, Any]],
    *,
    wrong_answers: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], str]:
    target_texts = {
        _normalize_text(item.get("question"))
        for item in wrong_answers
        if isinstance(item, dict) and _normalize_text(item.get("question"))
    }
    if not target_texts:
        return questions, "full_failed_quiz"

    filtered = [
        question
        for question in questions
        if _normalize_text(question.get("text")) in target_texts
    ]
    if filtered:
        return filtered, "wrong_questions_only"
    return questions, "full_failed_quiz"


def kickoff_solo_challenge(step_input: StepInput) -> StepOutput:
    payload = SoloChallengeStartInput.model_validate(step_input.input)
    started_at = datetime.now(timezone.utc).isoformat()

    _log(
        f"[Agno Solo Challenge Agent] Solo challenge agent starts working. "
        f"source={payload.source} path={payload.pagePath}"
    )
    _log(
        f"[Agno Solo Challenge Agent] Learner login mission received. "
        f"userId={payload.userId or 'unknown'} tenantId={payload.tenantId or 'unknown'} role={payload.role or 'unknown'}"
    )
    _log("[Agno Solo Challenge Agent] Workflow kickoff: preparing a challenge from the learner's latest failed quiz.")
    _log("[Agno Solo Challenge Agent] Step 1 queued: load the latest enrolled published course.")
    _log("[Agno Solo Challenge Agent] Step 2 queued: select the learner's latest failed quiz.")
    _log("[Agno Solo Challenge Agent] Step 3 queued: reformulate that failed quiz into a fresh challenge.")

    return StepOutput(
        content={
            "success": True,
            "workflowName": "solo-challenge-agent",
            "action": "challenge_kickoff_started",
            "tenantId": payload.tenantId,
            "userId": payload.userId,
            "role": payload.role,
            "source": payload.source,
            "pagePath": payload.pagePath,
            "startedAt": started_at,
            "status": "warming_up",
            "message": "Solo Challenge Agent started and is preparing a challenge from the learner's latest failed quiz.",
            "nextStep": "load_latest_enrolled_course_context",
        },
        success=True,
    )


def load_latest_enrolled_course_context(step_input: StepInput) -> StepOutput:
    previous_content = step_input.previous_step_content
    if not isinstance(previous_content, dict):
        return StepOutput(
            content={
                "success": False,
                "workflowName": "solo-challenge-agent",
                "action": "load_latest_enrolled_course_context_failed",
                "error": "Previous kickoff result is missing.",
            },
            success=False,
            error="Previous kickoff result is missing.",
        )

    user_id = _clean_text(previous_content.get("userId"))
    tenant_id = _clean_text(previous_content.get("tenantId"))
    if not user_id:
        return StepOutput(
            content={
                **previous_content,
                "success": False,
                "action": "load_latest_enrolled_course_context_failed",
                "error": "Missing userId for learner context lookup.",
            },
            success=False,
            error="Missing userId for learner context lookup.",
        )

    dependencies = _load_dependencies()
    SessionLocal = dependencies["SessionLocal"]
    Course = dependencies["Course"]
    Enrollment = dependencies["Enrollment"]

    db = SessionLocal()
    try:
        learner_id = UUID(user_id)

        query = (
            db.query(
                Enrollment.id.label("enrollment_id"),
                Enrollment.status.label("enrollment_status"),
                Enrollment.enrolled_at.label("enrolled_at"),
                Course.id.label("course_id"),
                Course.title.label("course_title"),
            )
            .join(Course, Course.id == Enrollment.course_id)
            .filter(Enrollment.user_id == learner_id, Course.is_published == True)
        )
        if tenant_id:
            query = query.filter(Course.tenant_id == UUID(tenant_id))

        latest_pair = (
            query.order_by(Enrollment.enrolled_at.desc(), Course.created_at.desc()).first()
        )

        if not latest_pair:
            _log(
                "[Agno Solo Challenge Agent] No published enrolled course was found for this learner. "
                "The workflow will stop here."
            )
            return StepOutput(
                content={
                    **previous_content,
                    "success": False,
                    "action": "no_latest_enrolled_course_found",
                    "status": "waiting_for_enrollment",
                    "message": "No published enrolled course was found for this learner.",
                },
                success=False,
                error="No published enrolled course was found for this learner.",
            )

        _log(
            "[Agno Solo Challenge Agent] Latest enrolled course resolved. "
            f"courseId={latest_pair.course_id} title={latest_pair.course_title!r} "
            f"enrollmentStatus={latest_pair.enrollment_status}"
        )
        _log("[Agno Solo Challenge Agent] Latest enrolled course details:")
        _log(
            json.dumps(
                {
                    "tenantId": tenant_id or None,
                    "userId": user_id,
                    "courseId": str(latest_pair.course_id),
                    "courseTitle": latest_pair.course_title,
                    "enrollmentStatus": latest_pair.enrollment_status,
                    "enrolledAt": latest_pair.enrolled_at.isoformat() if latest_pair.enrolled_at else None,
                },
                indent=2,
                ensure_ascii=False,
            )
        )

        latest_failed_quiz_across_courses = _fetch_latest_failed_quiz_assessment_across_courses(
            db,
            user_id=user_id,
            tenant_id=tenant_id or None,
        )
        last_failed_assessment_for_latest_course = _fetch_last_failed_quiz_assessment_for_course(
            db,
            user_id=user_id,
            course_id=str(latest_pair.course_id),
        )
        remediated_latest_failed_quiz_for_latest_course = _latest_failed_quiz_already_remediated(
            db,
            user_id=user_id,
            course_id=str(latest_pair.course_id),
            latest_failed_quiz=last_failed_assessment_for_latest_course,
        )
        if remediated_latest_failed_quiz_for_latest_course:
            _log(
                "[Agno Solo Challenge Agent] The latest failed quiz for the latest course was already remediated "
                "by a later correct solo challenge. It will not be reused."
            )
            last_failed_assessment_for_latest_course = None

        challenge_course_id = str(latest_pair.course_id)
        challenge_course_title = latest_pair.course_title
        challenge_enrollment_status = latest_pair.enrollment_status
        challenge_enrolled_at = latest_pair.enrolled_at.isoformat() if latest_pair.enrolled_at else None
        challenge_course_source = "latest_enrolled_course"
        last_failed_assessment = last_failed_assessment_for_latest_course
        remediated_latest_failed_quiz = remediated_latest_failed_quiz_for_latest_course

        if isinstance(latest_failed_quiz_across_courses, dict) and latest_failed_quiz_across_courses:
            failed_quiz_course_id = _clean_text(latest_failed_quiz_across_courses.get("courseId"))
            failed_quiz_course_title = _clean_text(latest_failed_quiz_across_courses.get("courseTitle"))
            failed_quiz_remediated = _latest_failed_quiz_already_remediated(
                db,
                user_id=user_id,
                course_id=failed_quiz_course_id,
                latest_failed_quiz=latest_failed_quiz_across_courses,
            ) if failed_quiz_course_id else False

            if failed_quiz_course_id and not failed_quiz_remediated:
                challenge_course_id = failed_quiz_course_id
                challenge_course_title = failed_quiz_course_title or challenge_course_title
                challenge_course_source = "latest_failed_quiz_course"
                last_failed_assessment = latest_failed_quiz_across_courses
                remediated_latest_failed_quiz = False
                _log(
                    "[Agno Solo Challenge Agent] Challenge course switched to the latest failed-quiz course. "
                    f"courseId={challenge_course_id} courseTitle={challenge_course_title!r}"
                )
            elif failed_quiz_remediated:
                _log(
                    "[Agno Solo Challenge Agent] The latest failed quiz across courses was already remediated. "
                    "The workflow will stay on the latest enrolled course."
                )

        _log("[Agno Solo Challenge Agent] Latest failed quiz context collected:")
        _log(
            json.dumps(
                {
                    "latestFailedQuizAssessmentAcrossCourses": latest_failed_quiz_across_courses,
                    "lastFailedQuizAssessmentForLatestCourse": last_failed_assessment_for_latest_course,
                    "latestFailedQuizForLatestCourseAlreadyRemediated": remediated_latest_failed_quiz_for_latest_course,
                    "selectedChallengeCourseId": challenge_course_id,
                    "selectedChallengeCourseTitle": challenge_course_title,
                    "selectedChallengeCourseSource": challenge_course_source,
                },
                indent=2,
                ensure_ascii=False,
            )
        )

        return StepOutput(
            content={
                **previous_content,
                "success": True,
                "action": "latest_enrolled_course_resolved",
                "status": "latest_course_logged",
                "courseId": challenge_course_id,
                "courseTitle": challenge_course_title,
                "enrollmentStatus": challenge_enrollment_status,
                "enrolledAt": challenge_enrolled_at,
                "challengeCourseSource": challenge_course_source,
                "latestEnrolledCourse": {
                    "courseId": str(latest_pair.course_id),
                    "courseTitle": latest_pair.course_title,
                    "enrollmentStatus": latest_pair.enrollment_status,
                    "enrolledAt": latest_pair.enrolled_at.isoformat() if latest_pair.enrolled_at else None,
                },
                "latestFailedQuizAssessmentAcrossCourses": latest_failed_quiz_across_courses,
                "lastFailedQuizAssessment": last_failed_assessment,
                "latestFailedQuizForLatestCourseAlreadyRemediated": remediated_latest_failed_quiz,
                "message": "Resolved the challenge course and collected failed quiz context.",
                "nextStep": "recall_learner_course_difficulties",
            },
            success=True,
        )
    finally:
        db.close()


def recall_learner_course_difficulties(step_input: StepInput) -> StepOutput:
    previous_content = step_input.previous_step_content
    if not isinstance(previous_content, dict):
        return StepOutput(
            content={
                "success": False,
                "workflowName": "solo-challenge-agent",
                "action": "recall_learner_course_difficulties_failed",
                "error": "Previous latest-course result is missing.",
            },
            success=False,
            error="Previous latest-course result is missing.",
        )

    tenant_id = _clean_text(previous_content.get("tenantId"))
    user_id = _clean_text(previous_content.get("userId"))
    course_id = _clean_text(previous_content.get("courseId"))
    if not tenant_id or not user_id or not course_id:
        return StepOutput(
            content={
                **previous_content,
                "success": False,
                "action": "recall_learner_course_difficulties_failed",
                "error": "Missing tenantId, userId, or courseId for learner-course recall.",
            },
            success=False,
            error="Missing tenantId, userId, or courseId for learner-course recall.",
        )

    recall_result = _recall_user_course_memory(
        tenant_id=tenant_id,
        user_id=user_id,
        course_id=course_id,
    )

    _log("[Agno Solo Challenge Agent] Learner-course recall results for difficulties and wrong quiz answers:")
    _log(
        json.dumps(
            {
                "bankId": recall_result["bankId"],
                "supportingMemories": recall_result["supportingMemories"],
            },
            indent=2,
            ensure_ascii=False,
        )
    )

    return StepOutput(
        content={
            **previous_content,
            "success": True,
            "action": "learner_course_difficulties_recalled",
            "status": "learner_course_recall_logged",
            "learnerCourseRecall": recall_result,
            "message": "Recalled and logged learner-course difficulty memories from Hindsight.",
            "nextStep": "choose_solo_challenge_mode",
        },
        success=True,
    )


def choose_solo_challenge_mode(step_input: StepInput) -> StepOutput:
    previous_content = step_input.previous_step_content
    if not isinstance(previous_content, dict):
        return StepOutput(
            content={
                "success": False,
                "workflowName": "solo-challenge-agent",
                "action": "choose_solo_challenge_mode_failed",
                "error": "Previous learner-course recall result is missing.",
            },
            success=False,
            error="Previous learner-course recall result is missing.",
        )

    tenant_id = _clean_text(previous_content.get("tenantId"))
    course_id = _clean_text(previous_content.get("courseId"))
    course_title = _clean_text(previous_content.get("courseTitle"))
    learner_course_recall = previous_content.get("learnerCourseRecall")
    learner_memories = (
        learner_course_recall.get("supportingMemories")
        if isinstance(learner_course_recall, dict)
        else []
    )
    learner_memories = learner_memories if isinstance(learner_memories, list) else []
    latest_failed_quiz = _select_latest_failed_quiz_source(previous_content)

    if not tenant_id or not course_id:
        return StepOutput(
            content={
                **previous_content,
                "success": False,
                "action": "choose_solo_challenge_mode_failed",
                "error": "Missing tenantId or courseId for course-bank reflect.",
            },
            success=False,
            error="Missing tenantId or courseId for course-bank reflect.",
        )

    reflect_result = _reflect_solo_challenge_mode(
        tenant_id=tenant_id,
        course_id=course_id,
        course_title=course_title,
        learner_memories=learner_memories,
        latest_failed_quiz=latest_failed_quiz,
    )

    parsed_answer = reflect_result.get("parsedAnswer") if isinstance(reflect_result, dict) else None
    if not isinstance(parsed_answer, dict):
        return StepOutput(
            content={
                **previous_content,
                "success": False,
                "action": "choose_solo_challenge_mode_failed",
                "error": "Course-bank reflect did not return a valid structured mode payload.",
            },
            success=False,
            error="Course-bank reflect did not return a valid structured mode payload.",
        )

    mode = _clean_text(parsed_answer.get("mode")) or "unknown"
    mode_reason = _clean_text(parsed_answer.get("mode_reason"))
    _log("[Agno Solo Challenge Agent] Solo challenge operating mode decided:")
    _log(
        json.dumps(
            {
                "mode": mode,
                "modeReason": mode_reason,
                "courseId": course_id,
                "courseTitle": course_title,
            },
            indent=2,
            ensure_ascii=False,
        )
    )

    return StepOutput(
        content={
            **previous_content,
            "success": True,
            "action": "solo_challenge_mode_selected",
            "status": "challenge_mode_selected",
            "challengeMode": mode,
            "challengeModeReason": mode_reason or None,
            "message": "Selected the solo challenge operating mode from course-bank reflect.",
            "nextStep": "reflect_course_quiz_for_learner",
        },
        success=True,
    )


def reflect_course_quiz_for_learner(step_input: StepInput) -> StepOutput:
    previous_content = step_input.previous_step_content
    if not isinstance(previous_content, dict):
        return StepOutput(
            content={
                "success": False,
                "workflowName": "solo-challenge-agent",
                "action": "reflect_course_quiz_for_learner_failed",
                "error": "Previous mode-selection result is missing.",
            },
            success=False,
            error="Previous mode-selection result is missing.",
        )

    tenant_id = _clean_text(previous_content.get("tenantId"))
    course_id = _clean_text(previous_content.get("courseId"))
    course_title = _clean_text(previous_content.get("courseTitle"))
    mode = _clean_text(previous_content.get("challengeMode")) or "general_course_reinforcement"
    mode_reason = _clean_text(previous_content.get("challengeModeReason"))
    learner_course_recall = previous_content.get("learnerCourseRecall")
    learner_memories = (
        learner_course_recall.get("supportingMemories")
        if isinstance(learner_course_recall, dict)
        else []
    )
    learner_memories = learner_memories if isinstance(learner_memories, list) else []
    latest_failed_quiz = _select_latest_failed_quiz_source(previous_content)

    if not tenant_id or not course_id:
        return StepOutput(
            content={
                **previous_content,
                "success": False,
                "action": "reflect_course_quiz_for_learner_failed",
                "error": "Missing tenantId or courseId for question-generation reflect.",
            },
            success=False,
            error="Missing tenantId or courseId for question-generation reflect.",
        )

    reflect_result = _generate_solo_challenge_from_mode(
        tenant_id=tenant_id,
        course_id=course_id,
        course_title=course_title,
        learner_memories=learner_memories,
        latest_failed_quiz=latest_failed_quiz,
        selected_mode=mode,
        mode_reason=mode_reason,
    )

    parsed_answer = reflect_result.get("parsedAnswer") if isinstance(reflect_result, dict) else None
    if not isinstance(parsed_answer, dict):
        return StepOutput(
            content={
                **previous_content,
                "success": False,
                "action": "reflect_course_quiz_for_learner_failed",
                "error": "Question-generation reflect did not return a valid structured quiz payload.",
            },
            success=False,
            error="Question-generation reflect did not return a valid structured quiz payload.",
        )

    options_raw = parsed_answer.get("options")
    question_text = _clean_text(parsed_answer.get("question"))
    correct_answer = _clean_text(parsed_answer.get("correct_answer"))
    challenge_title = _clean_text(parsed_answer.get("challenge_title")) or "Solo challenge"
    intro = _clean_text(parsed_answer.get("intro"))
    explanation = _clean_text(parsed_answer.get("explanation")) or None
    failed_signature = _extract_failed_quiz_signature(latest_failed_quiz)

    if not question_text or not isinstance(options_raw, list):
        return StepOutput(
            content={
                **previous_content,
                "success": False,
                "action": "reflect_course_quiz_for_learner_failed",
                "error": "Structured reflect payload is missing question/options.",
            },
            success=False,
            error="Structured reflect payload is missing question/options.",
        )

    normalized_options = _normalize_public_options(options_raw)
    correct_option_id = _resolve_correct_option_id(normalized_options, [correct_answer] if correct_answer else [])
    if len(normalized_options) != 4 or not correct_option_id:
        return StepOutput(
            content={
                **previous_content,
                "success": False,
                "action": "reflect_course_quiz_for_learner_failed",
                "error": "Structured reflect payload did not produce a valid 4-option multiple-choice question.",
            },
            success=False,
            error="Structured reflect payload did not produce a valid 4-option multiple-choice question.",
        )

    recreated_quiz = {
        "courseId": course_id,
        "courseTitle": course_title or None,
        "lessonId": _clean_text(latest_failed_quiz.get("lessonId")) if isinstance(latest_failed_quiz, dict) else None,
        "lessonTitle": _clean_text(latest_failed_quiz.get("lessonTitle")) if isinstance(latest_failed_quiz, dict) else None,
        "assessmentId": _clean_text(latest_failed_quiz.get("assessmentId")) if isinstance(latest_failed_quiz, dict) else None,
        "source": "hindsight_reflect_personalized",
        "focusMode": mode,
        "sourceFailedQuizAttemptId": failed_signature.get("attemptId") or None,
        "sourceFailedQuestionId": failed_signature.get("questionId") or None,
        "sourceFailedQuestion": failed_signature.get("question") or None,
        "sourceFailedCorrectAnswer": failed_signature.get("correctAnswer") or None,
        "sourceFailedCompletedAt": failed_signature.get("completedAt") or None,
        "questionCount": 1,
        "challengeTitle": challenge_title,
        "challengeIntro": intro or None,
        "modeReason": mode_reason or None,
        "questions": [
            {
                "questionId": f"{mode}:{course_id}",
                "text": question_text,
                "questionType": "multiple_choice",
                "displayOrder": 1,
                "options": normalized_options,
                "generationMode": mode,
                "correctOptionId": correct_option_id,
                "explanation": explanation,
            }
        ],
    }

    _log("[Agno Solo Challenge Agent] Generated personalized solo challenge quiz from course-bank reflect:")
    _log_recreated_quiz(recreated_quiz)

    return StepOutput(
        content={
            **previous_content,
            "success": True,
            "action": "course_quiz_generated_via_reflect",
            "status": "challenge_ready",
            "generatedQuiz": reflect_result,
            "recreatedQuiz": recreated_quiz,
            "message": "Generated and logged a personalized solo challenge quiz from course-bank reflect.",
        },
        success=True,
    )


def select_latest_failed_quiz_for_recreation(step_input: StepInput) -> StepOutput:
    previous_content = step_input.previous_step_content
    if not isinstance(previous_content, dict):
        return StepOutput(
            content={
                "success": False,
                "workflowName": "solo-challenge-agent",
                "action": "select_latest_failed_quiz_for_recreation_failed",
                "error": "Previous learner context result is missing.",
            },
            success=False,
            error="Previous learner context result is missing.",
        )

    selected_failed_quiz = _select_latest_failed_quiz_source(previous_content)
    if not selected_failed_quiz:
        _log("[Agno Solo Challenge Agent] No failed quiz was found for this learner. Recreated quiz generation will stop.")
        return StepOutput(
            content={
                **previous_content,
                "success": False,
                "action": "no_failed_quiz_available_for_recreation",
                "status": "no_failed_quiz_available",
                "message": "No failed quiz was found for this learner.",
            },
            success=False,
            error="No failed quiz was found for this learner.",
        )

    _log("[Agno Solo Challenge Agent] Selected the latest failed quiz for recreation:")
    _log(json.dumps(selected_failed_quiz, indent=2, ensure_ascii=False))

    return StepOutput(
        content={
            **previous_content,
            "success": True,
            "action": "latest_failed_quiz_selected_for_recreation",
            "selectedFailedQuiz": selected_failed_quiz,
            "status": "failed_quiz_selected",
            "message": "Selected the learner's latest failed quiz for recreation.",
            "nextStep": "recreate_quiz_from_last_failed_quiz",
        },
        success=True,
    )


def recreate_quiz_from_last_failed_quiz(step_input: StepInput) -> StepOutput:
    previous_content = step_input.previous_step_content
    if not isinstance(previous_content, dict):
        return StepOutput(
            content={
                "success": False,
                "workflowName": "solo-challenge-agent",
                "action": "recreate_quiz_from_last_failed_quiz_failed",
                "error": "Previous failed-quiz selection result is missing.",
            },
            success=False,
            error="Previous failed-quiz selection result is missing.",
        )

    selected_failed_quiz = previous_content.get("selectedFailedQuiz")
    if not isinstance(selected_failed_quiz, dict) or not selected_failed_quiz:
        return StepOutput(
            content={
                **previous_content,
                "success": False,
                "action": "recreate_quiz_from_last_failed_quiz_failed",
                "error": "Selected failed quiz payload is missing.",
            },
            success=False,
            error="Selected failed quiz payload is missing.",
        )

    lesson_id = _clean_text(selected_failed_quiz.get("lessonId"))
    assessment_id = _clean_text(selected_failed_quiz.get("assessmentId"))
    source = _clean_text(selected_failed_quiz.get("source")) or "traditional"
    wrong_answers = selected_failed_quiz.get("wrongAnswers")
    wrong_answers = wrong_answers if isinstance(wrong_answers, list) else []
    first_wrong_answer = next((item for item in wrong_answers if isinstance(item, dict)), {})

    dependencies = _load_dependencies()
    SessionLocal = dependencies["SessionLocal"]
    db = SessionLocal()
    try:
        if assessment_id:
            question_bank = _fetch_traditional_quiz_questions(db, assessment_id=assessment_id)
        elif lesson_id:
            question_bank = _fetch_ai_generated_quiz_questions(db, lesson_id=lesson_id)
        else:
            question_bank = []

        if not question_bank:
            return StepOutput(
                content={
                    **previous_content,
                    "success": False,
                    "action": "recreate_quiz_from_last_failed_quiz_failed",
                    "error": "No source quiz questions were found for the selected failed quiz.",
                },
                success=False,
                error="No source quiz questions were found for the selected failed quiz.",
            )

        recreated_questions, focus_mode = _filter_questions_to_failed_focus(
            question_bank,
            wrong_answers=wrong_answers,
        )
        _log_failed_quiz_source_questions(
            selected_failed_quiz,
            recreated_questions,
            focus_mode=focus_mode,
        )

        llm_recreated_questions: list[dict[str, Any]] = []
        for index, question in enumerate(recreated_questions, start=1):
            regenerated_question = _generate_llm_recreated_question(
                source_question=question,
                failed_quiz=selected_failed_quiz,
            )
            if not regenerated_question:
                regenerated_question = _build_fallback_recreated_question(
                    question,
                    display_order=index,
                    lesson_title=_clean_text(selected_failed_quiz.get("lessonTitle")) or None,
                )
            else:
                regenerated_question["displayOrder"] = index
            llm_recreated_questions.append(regenerated_question)

        public_questions = [
            {
                "questionId": question["questionId"],
                "text": question["text"],
                "questionType": question.get("questionType") or "multiple_choice",
                "displayOrder": question["displayOrder"],
                "options": question["options"],
                "generationMode": question.get("generationMode"),
                "correctOptionId": _resolve_correct_option_id(
                    question.get("options") or [],
                    question.get("correctAnswers") or [],
                ),
                "explanation": _clean_text(question.get("explanation")) or None,
            }
            for question in llm_recreated_questions
        ]

        recreated_quiz = {
            "courseId": _clean_text(selected_failed_quiz.get("courseId")) or _clean_text(previous_content.get("courseId")),
            "courseTitle": _clean_text(selected_failed_quiz.get("courseTitle")) or _clean_text(previous_content.get("courseTitle")),
            "lessonId": lesson_id or None,
            "lessonTitle": _clean_text(selected_failed_quiz.get("lessonTitle")) or None,
            "assessmentId": assessment_id or None,
            "source": source,
            "focusMode": focus_mode,
            "sourceFailedQuizAttemptId": _clean_text(selected_failed_quiz.get("attemptId")) or None,
            "sourceFailedQuestionId": _clean_text(first_wrong_answer.get("questionId")) or None,
            "sourceFailedQuestion": _clean_text(first_wrong_answer.get("question")) or None,
            "sourceFailedCorrectAnswer": _clean_text(first_wrong_answer.get("correctAnswer")) or None,
            "sourceFailedCompletedAt": _clean_text(selected_failed_quiz.get("completedAt")) or None,
            "questionCount": len(public_questions),
            "questions": public_questions,
        }

        _log_recreated_quiz(recreated_quiz)

        return StepOutput(
            content={
                **previous_content,
                "success": True,
                "action": "recreated_quiz_ready",
                "status": "challenge_ready",
                "message": "A recreated quiz was prepared from the learner's latest failed quiz.",
                "recreatedQuiz": recreated_quiz,
                "nextStep": "present_challenge_to_learner",
            },
            success=True,
        )
    finally:
        db.close()


solo_challenge_workflow = Workflow(
    name="solo-challenge-agent",
    description="Collect learner context and let Hindsight reflect choose the best solo challenge mode for the latest course.",
    input_schema=SoloChallengeStartInput,
    telemetry=False,
    steps=[
        Step(
            name="kickoff-solo-challenge",
            description="Start the Solo Challenge workflow and print the initial terminal traces.",
            executor=kickoff_solo_challenge,
        ),
        Step(
            name="load-latest-enrolled-course-context",
            description="Resolve the latest enrolled published course and collect failed quiz context from the platform database.",
            executor=load_latest_enrolled_course_context,
        ),
        Step(
            name="recall-learner-course-difficulties",
            description="Recall the learner-course bank from Hindsight to inspect difficulties, confusion, and wrong quiz traces.",
            executor=recall_learner_course_difficulties,
        ),
        Step(
            name="choose-solo-challenge-mode",
            description="Use a lightweight course-bank reflect plus the selector skill to choose the best challenge mode.",
            executor=choose_solo_challenge_mode,
        ),
        Step(
            name="reflect-course-quiz-for-learner",
            description="Use course-bank reflect plus the detailed mode skill to generate one personalized question.",
            executor=reflect_course_quiz_for_learner,
        ),
    ],
)
