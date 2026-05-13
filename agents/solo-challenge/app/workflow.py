from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timezone
from typing import Any
from uuid import UUID

import httpx
from sqlalchemy import text
from pydantic import BaseModel

from agno.workflow import Step, StepInput, StepOutput, Workflow


DEFAULT_QUIZ_REWRITE_MODEL = os.getenv("SOLO_CHALLENGE_QUIZ_REWRITE_MODEL", "openai/gpt-oss-120b:free")
DEFAULT_LLM_TIMEOUT_SECONDS = float(os.getenv("SOLO_CHALLENGE_LLM_TIMEOUT_SECONDS", "45"))


class SoloChallengeStartInput(BaseModel):
    tenantId: str | None = None
    userId: str | None = None
    role: str | None = None
    source: str = "learning-shell"
    pagePath: str = "/courses"


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


def _build_fallback_recreated_question(
    question: dict[str, Any],
    *,
    display_order: int,
) -> dict[str, Any]:
    options = _normalize_public_options(
        [
            option.get("label") or option.get("value")
            for option in question.get("options") or []
            if isinstance(option, dict)
        ]
    )
    return {
        "questionId": question["questionId"],
        "text": question["text"],
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
    latest_across_courses = previous_content.get("latestFailedQuizAssessmentAcrossCourses")
    if isinstance(latest_across_courses, dict) and latest_across_courses:
        return latest_across_courses

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
    _log("[Agno Solo Challenge Agent] Workflow kickoff: preparing the first welcome challenge.")
    _log("[Agno Solo Challenge Agent] Step 1 queued: validate and load learner context.")
    _log("[Agno Solo Challenge Agent] Step 2 queued: analyze weak spots in parallel.")
    _log("[Agno Solo Challenge Agent] Step 3 queued: select challenge type and difficulty.")

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
            "message": "Solo Challenge Agent started its workflow and is preparing the first challenge.",
            "nextStep": "validate_and_load_learner_context",
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
    build_learner_context_response = dependencies["build_learner_context_response"]

    db = SessionLocal()
    try:
        learner_id = UUID(user_id)

        query = (
            db.query(Enrollment, Course)
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
                "The workflow will stop before challenge generation."
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

        enrollment, course = latest_pair
        learner_context = build_learner_context_response(
            db,
            user_id=learner_id,
            course_id=course.id,
        )
        latest_failed_quiz_across_courses = _fetch_latest_failed_quiz_assessment_across_courses(
            db,
            user_id=user_id,
            tenant_id=tenant_id or None,
        )
        last_failed_assessment = _fetch_last_failed_quiz_assessment_for_course(
            db,
            user_id=user_id,
            course_id=str(course.id),
        )

        _log(
            "[Agno Solo Challenge Agent] Latest enrolled course resolved. "
            f"courseId={course.id} title={course.title!r} enrollmentStatus={enrollment.status}"
        )
        _log_latest_course_and_failed_assessment(
            user_id=user_id,
            role=_clean_text(previous_content.get("role")) or None,
            tenant_id=tenant_id or None,
            course_id=str(course.id),
            course_title=course.title,
            enrollment_status=enrollment.status,
            enrolled_at=enrollment.enrolled_at.isoformat() if enrollment.enrolled_at else None,
            last_failed_assessment=last_failed_assessment,
            latest_failed_quiz_across_courses=latest_failed_quiz_across_courses,
        )
        _log_loaded_learner_context(learner_context)
        _log_collected_user_context(
            tenant_id=tenant_id or None,
            user_id=user_id,
            role=_clean_text(previous_content.get("role")) or None,
            course_id=str(course.id),
            course_title=course.title,
            enrollment_status=enrollment.status,
            enrolled_at=enrollment.enrolled_at.isoformat() if enrollment.enrolled_at else None,
            learner_context=learner_context,
            latest_failed_quiz_across_courses=latest_failed_quiz_across_courses,
        )

        return StepOutput(
            content={
                **previous_content,
                "success": True,
                "action": "latest_enrolled_course_context_loaded",
                "status": "learner_context_loaded",
                "courseId": str(course.id),
                "courseTitle": course.title,
                "enrollmentStatus": enrollment.status,
                "enrolledAt": enrollment.enrolled_at.isoformat() if enrollment.enrolled_at else None,
                "latestFailedQuizAssessmentAcrossCourses": latest_failed_quiz_across_courses,
                "lastFailedQuizAssessment": last_failed_assessment,
                "learnerContext": learner_context,
                "message": "Loaded learner context from the latest enrolled published course.",
                "nextStep": "analyze_weak_spots_parallel",
            },
            success=True,
        )
    finally:
        db.close()


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
    description="Kick off the Solo Challenge agent workflow when a learner enters the learning experience.",
    input_schema=SoloChallengeStartInput,
    telemetry=False,
    steps=[
        Step(
            name="kickoff-solo-challenge",
            description="Start the Solo Challenge workflow and print the first terminal traces.",
            executor=kickoff_solo_challenge,
        ),
        Step(
            name="load-latest-enrolled-course-context",
            description="Resolve the latest enrolled published course and load learner context for it.",
            executor=load_latest_enrolled_course_context,
        ),
        Step(
            name="select-latest-failed-quiz-for-recreation",
            description="Choose the learner's latest failed quiz so the solo challenge can target it.",
            executor=select_latest_failed_quiz_for_recreation,
        ),
        Step(
            name="recreate-quiz-from-last-failed-quiz",
            description="Rebuild a fresh quiz payload from the learner's latest failed quiz and print it in the terminal.",
            executor=recreate_quiz_from_last_failed_quiz,
        ),
    ],
)
