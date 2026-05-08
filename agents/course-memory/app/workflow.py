from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone
from typing import Any

import httpx
from pydantic import BaseModel

from agno.workflow import Step, StepInput, StepOutput, Workflow


DEFAULT_HINDSIGHT_URL = os.getenv("HINDSIGHT_API_URL", "http://127.0.0.1:8888")
DEFAULT_HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY", "")


class CourseMemoryAssemblyInput(BaseModel):
    courseId: str
    learningApiUrl: str
    authToken: str
    tenantId: str | None = None
    requesterUserId: str | None = None
    requesterName: str | None = None
    hindsightApiUrl: str | None = None
    hindsightApiKey: str | None = None
    supplementalSources: list[dict[str, str]] | None = None


def _log(message: str) -> None:
    print(message, file=sys.stderr)


def _strip_html(value: str) -> str:
    return re.sub(r"\s+", " ", re.sub(r"<[^>]*>", " ", value)).strip()


def _normalize_text(value: Any) -> str:
    if not isinstance(value, str):
        return ""
    return _strip_html(value).replace("\uFFFD", "'").strip()


def _sanitize_string_dict(source: dict[str, Any]) -> dict[str, str]:
    result: dict[str, str] = {}
    for key, value in source.items():
        if value is None:
            continue
        text = str(value).strip()
        if text:
            result[key] = text
    return result


def _build_course_bank_id(tenant_id: str, course_id: str) -> str:
    return f"tenant:{tenant_id}:course:{course_id}"


def _build_learning_endpoint(learning_api_url: str, suffix: str) -> str:
    return f"{learning_api_url.rstrip('/')}/{suffix.lstrip('/')}"


def _normalize_supplemental_sources(raw_sources: Any) -> list[dict[str, str]]:
    normalized: list[dict[str, str]] = []
    if not isinstance(raw_sources, list):
        return normalized

    for index, raw_source in enumerate(raw_sources):
        if not isinstance(raw_source, dict):
            continue

        text = _normalize_text(raw_source.get("text") or "")
        if not text:
            continue

        title = _normalize_text(raw_source.get("title") or "") or f"Supplemental Source {index + 1}"
        kind = _normalize_text(raw_source.get("kind") or "") or "supplemental_course_source"
        normalized.append(
            {
                "title": title,
                "kind": kind,
                "text": text,
            }
        )

    return normalized


def _extract_supplemental_source_from_document_text(document_text: str) -> dict[str, str] | None:
    normalized_text = str(document_text or "").strip()
    if not normalized_text:
        return None

    lines = [line.strip() for line in normalized_text.splitlines() if line.strip()]
    if len(lines) < 3:
        return None

    source_title_line = next(
        (line for line in lines if line.startswith("Supplemental Course Source:")),
        "",
    )
    if not source_title_line:
        return None

    title = _normalize_text(source_title_line.split(":", 1)[1] if ":" in source_title_line else "")
    source_text_lines = lines[lines.index(source_title_line) + 1 :]
    source_text = _normalize_text("\n".join(source_text_lines))
    if not source_text:
        return None

    return {
        "title": title or "Recovered Supplemental Source",
        "kind": "supplemental_course_source",
        "text": source_text,
    }


def _load_existing_supplemental_sources(
    *,
    tenant_id: str,
    course_id: str,
    hindsight_url: str,
    hindsight_api_key: str,
) -> list[dict[str, str]]:
    if not tenant_id or not course_id:
        return []

    bank_id = _build_course_bank_id(tenant_id, course_id)
    headers = {"Content-Type": "application/json"}
    if hindsight_api_key:
        headers["Authorization"] = f"Bearer {hindsight_api_key}"

    try:
        with httpx.Client(timeout=30.0) as client:
            list_response = client.get(
                f"{hindsight_url.rstrip('/')}/v1/default/banks/{bank_id}/documents",
                headers=headers,
                params={"limit": 200, "offset": 0},
            )
            if list_response.status_code >= 400:
                return []

            list_payload = list_response.json()
            raw_items = list_payload.get("items") if isinstance(list_payload, dict) else []
            document_ids = [
                str(item.get("id") or "").strip()
                for item in raw_items
                if isinstance(item, dict) and ":source:" in str(item.get("id") or "")
            ]

            recovered_sources: list[dict[str, str]] = []
            for document_id in document_ids:
                detail_response = client.get(
                    f"{hindsight_url.rstrip('/')}/v1/default/banks/{bank_id}/documents/{document_id}",
                    headers=headers,
                )
                if detail_response.status_code >= 400:
                    continue

                detail_payload = detail_response.json()
                if not isinstance(detail_payload, dict):
                    continue

                recovered = _extract_supplemental_source_from_document_text(
                    str(detail_payload.get("original_text") or "")
                )
                if recovered:
                    recovered_sources.append(recovered)

            return recovered_sources
    except (httpx.HTTPError, ValueError):
        return []


def _parse_lesson_content(raw_content: Any) -> Any:
    if isinstance(raw_content, (dict, list)):
        return raw_content

    if isinstance(raw_content, str):
        trimmed = raw_content.strip()
        if trimmed.startswith("{") or trimmed.startswith("["):
            try:
                return json.loads(trimmed)
            except json.JSONDecodeError:
                return raw_content
        return raw_content

    return raw_content


def _looks_like_ai_generated_content(parsed_content: Any) -> bool:
    if not isinstance(parsed_content, dict):
        return False

    if parsed_content.get("type") in {"slide", "quiz", "interactive"}:
        return True

    if isinstance(parsed_content.get("actions"), list):
        return True

    content_block = parsed_content.get("content")
    if isinstance(content_block, dict) and content_block.get("type") in {"slide", "quiz", "interactive"}:
        return True

    return False


def _extract_slide_explanations(content: dict[str, Any]) -> list[str]:
    if content.get("type") != "slide":
        return []

    canvas = content.get("canvas") or {}
    elements = canvas.get("elements") or []
    explanations: list[str] = []

    for element in elements:
        if not isinstance(element, dict):
            continue
        if element.get("type") != "text":
            continue
        text = _normalize_text(element.get("content") or "")
        if text:
            explanations.append(text)

    return explanations


def _summarize_lesson_for_retain(lesson: dict[str, Any]) -> str:
    lines = [
        f"Course Title: {lesson.get('courseTitle')}",
        f"Lesson Title: {lesson.get('title')}",
        f"Content Type: {lesson.get('contentType')}",
    ]

    if lesson.get("teacherParoles"):
        lines.append("Teacher Explanations:")
        lines.extend(f"- {text}" for text in lesson["teacherParoles"])

    if lesson.get("explanations"):
        lines.append("Lesson Knowledge:")
        lines.extend(f"- {text}" for text in lesson["explanations"])

    if lesson.get("quizQuestions"):
        lines.append("Quiz Knowledge:")
        for quiz in lesson["quizQuestions"]:
            lines.append(f"- Question: {quiz.get('question')}")
            if quiz.get("options"):
                lines.append(f"  Answer Options: {', '.join(str(option) for option in quiz['options'])}")
            if quiz.get("correctAnswer"):
                lines.append(f"  Correct Answer: {', '.join(quiz['correctAnswer'])}")
            if quiz.get("analysis"):
                lines.append(f"  Explanation: {quiz['analysis']}")

    return "\n".join(line for line in lines if line.strip())


def _build_traditional_payload(
    course: dict[str, Any],
    payload: CourseMemoryAssemblyInput,
    modules_summary: list[dict[str, Any]],
    lessons: list[dict[str, Any]],
    quizzes: list[dict[str, Any]],
    explanations: list[str],
    supplemental_sources: list[dict[str, str]],
) -> dict[str, Any]:
    return {
        "courseId": course.get("id"),
        "tenantId": course.get("tenant_id") or payload.tenantId,
        "requesterUserId": payload.requesterUserId,
        "requesterName": payload.requesterName,
        "title": course.get("title"),
        "description": course.get("description"),
        "category": course.get("category"),
        "difficulty": course.get("difficulty"),
        "duration": course.get("duration"),
        "xpReward": course.get("xp_reward"),
        "modulesCount": len(modules_summary),
        "modules": modules_summary,
        "contentStrategy": "traditional",
        "lessons": lessons,
        "quizzes": quizzes,
        "teacherParoles": [],
        "explanations": explanations,
        "teacherParolesCount": 0,
        "explanationsCount": len(explanations),
        "lessonsCount": len(lessons),
        "quizzesCount": len(quizzes),
        "supplementalSources": supplemental_sources,
    }


def _load_traditional_quiz_questions(
    client: httpx.Client,
    payload: CourseMemoryAssemblyInput,
    course_id: str,
    assessment_id: str,
) -> list[dict[str, Any]]:
    questions_url = _build_learning_endpoint(
        payload.learningApiUrl,
        f"assessments/{assessment_id}/memory-questions",
    )
    response = client.get(
        questions_url,
        headers={"Authorization": f"Bearer {payload.authToken}"},
    )
    if response.status_code >= 400:
        _log("[Agno Course Memory Agent] Failed to load traditional quiz questions from the learning API.")
        _log(f"- Course ID: {course_id}")
        _log(f"- Assessment ID: {assessment_id}")
        _log(f"- Learning API status: {response.status_code}")
        return []

    raw_questions = response.json()
    if not isinstance(raw_questions, list):
        return []

    normalized_questions: list[dict[str, Any]] = []
    for question in raw_questions:
        if not isinstance(question, dict):
            continue

        normalized_questions.append(
            {
                "questionId": question.get("id"),
                "question": _normalize_text(question.get("text") or ""),
                "correctAnswer": [
                    str(question.get("correct_answer") or "").strip()
                ]
                if str(question.get("correct_answer") or "").strip()
                else [],
                "analysis": "",
                "options": [
                    str(option).strip()
                    for option in (question.get("options") or [])
                    if str(option).strip()
                ],
            }
        )

    return normalized_questions


def _normalize_preloaded_quiz_questions(raw_questions: Any) -> list[dict[str, Any]]:
    if not isinstance(raw_questions, list):
        return []

    normalized_questions: list[dict[str, Any]] = []
    for question in raw_questions:
        if not isinstance(question, dict):
            continue

        options = [
            str(option).strip()
            for option in (question.get("options") or [])
            if str(option).strip()
        ]
        correct_answer = str(question.get("correct_answer") or question.get("correctAnswer") or "").strip()
        normalized_questions.append(
            {
                "questionId": question.get("id") or question.get("questionId"),
                "question": _normalize_text(question.get("text") or question.get("question") or ""),
                "correctAnswer": [correct_answer] if correct_answer else [],
                "analysis": _normalize_text(question.get("analysis") or ""),
                "options": options,
            }
        )

    return normalized_questions


def _load_course_assessments(
    client: httpx.Client,
    payload: CourseMemoryAssemblyInput,
) -> list[dict[str, Any]]:
    assessments_url = _build_learning_endpoint(payload.learningApiUrl, "assessments")
    response = client.get(
        assessments_url,
        headers={"Authorization": f"Bearer {payload.authToken}"},
    )
    if response.status_code >= 400:
        _log("[Agno Course Memory Agent] Failed to load traditional course assessments from the learning API.")
        _log(f"- Learning API status: {response.status_code}")
        return []

    data = response.json()
    return data if isinstance(data, list) else []


def _normalize_match_key(value: Any) -> str:
    return re.sub(r"\s+", " ", str(value or "").strip().lower())


def _resolve_traditional_assessment_id(
    lesson: dict[str, Any],
    module_id: str,
    course_assessments: list[dict[str, Any]],
    used_assessment_ids: set[str],
) -> str:
    explicit_assessment_id = str(lesson.get("assessment_id") or "").strip()
    if explicit_assessment_id:
        return explicit_assessment_id

    lesson_content_type = str(lesson.get("content_type") or lesson.get("contentType") or "").strip().lower()
    if lesson_content_type != "quiz":
        return ""

    lesson_title = _normalize_match_key(lesson.get("title") or "")
    module_assessments = [
        assessment
        for assessment in course_assessments
        if str(assessment.get("module_id") or "").strip() == module_id
    ]

    exact_title_match = [
        assessment
        for assessment in module_assessments
        if _normalize_match_key(assessment.get("title") or "") == lesson_title
        and str(assessment.get("id") or "").strip() not in used_assessment_ids
    ]
    if exact_title_match:
        return str(exact_title_match[0].get("id") or "").strip()

    unused_module_assessments = [
        assessment
        for assessment in module_assessments
        if str(assessment.get("id") or "").strip() not in used_assessment_ids
    ]
    if len(unused_module_assessments) == 1:
        return str(unused_module_assessments[0].get("id") or "").strip()

    quiz_named_match = [
        assessment
        for assessment in unused_module_assessments
        if "quiz" in _normalize_match_key(assessment.get("title") or "")
    ]
    if len(quiz_named_match) == 1:
        return str(quiz_named_match[0].get("id") or "").strip()

    return ""


def assemble_course_memory_payload(step_input: StepInput) -> StepOutput:
    payload = CourseMemoryAssemblyInput.model_validate(step_input.input)

    _log("")
    _log("============================================================")
    _log("[Agno Course Memory Agent] Request received")
    _log("- Workflow: course-memory-agent")
    _log("- Action: assemble_published_course")
    _log(f"- Time: {datetime.now(timezone.utc).isoformat()}")
    _log(f"- Course ID: {payload.courseId}")

    memory_curriculum_url = _build_learning_endpoint(payload.learningApiUrl, "memory-curriculum")

    with httpx.Client(timeout=60.0) as client:
        response = client.get(
            memory_curriculum_url,
            headers={"Authorization": f"Bearer {payload.authToken}"},
        )

        if response.status_code >= 400:
            _log("[Agno Course Memory Agent] Memory curriculum endpoint unavailable, falling back to the published course endpoint.")
            _log(f"- Learning API status: {response.status_code}")
            response = client.get(
                payload.learningApiUrl,
                headers={"Authorization": f"Bearer {payload.authToken}"},
            )

    if response.status_code >= 400:
        _log("[Agno Course Memory Agent] Failed to load the published course from the learning API.")
        _log(f"- Learning API status: {response.status_code}")
        _log("============================================================")
        _log("")
        return StepOutput(
            content={
                "success": False,
                "workflowName": "course-memory-agent",
                "courseId": payload.courseId,
                "error": f"Learning API returned status {response.status_code}",
            },
            success=False,
        )

    course = response.json()
    modules = course.get("modules") or []

    supplemental_sources = _normalize_supplemental_sources(payload.supplementalSources)
    effective_tenant_id = str(course.get("tenant_id") or payload.tenantId or "").strip()
    if not supplemental_sources and effective_tenant_id:
        recovered_sources = _load_existing_supplemental_sources(
            tenant_id=effective_tenant_id,
            course_id=str(course.get("id") or payload.courseId),
            hindsight_url=payload.hindsightApiUrl or DEFAULT_HINDSIGHT_URL,
            hindsight_api_key=payload.hindsightApiKey or DEFAULT_HINDSIGHT_API_KEY,
        )
        if recovered_sources:
            supplemental_sources = recovered_sources
            _log(
                f"[Agno Course Memory Agent] Recovered {len(recovered_sources)} supplemental course source(s) from Hindsight for course {payload.courseId}."
            )
    modules_summary: list[dict[str, Any]] = []
    is_ai_generated = False

    for module in modules:
        module_id = module.get("id")
        module_title = module.get("title")
        module_lessons = module.get("lessons") or []
        modules_summary.append(
            {
                "moduleId": module_id,
                "title": module_title,
                "description": _normalize_text(module.get("description") or ""),
                "order": module.get("order"),
                "lessonCount": len(module_lessons),
            }
        )
        for lesson in module_lessons:
            parsed_content = _parse_lesson_content(lesson.get("content"))
            if _looks_like_ai_generated_content(parsed_content):
                is_ai_generated = True
                break
        if is_ai_generated:
            break

    if not is_ai_generated:
        assembled_lessons: list[dict[str, Any]] = []
        assembled_quizzes: list[dict[str, Any]] = []
        explanations: list[str] = []

        with httpx.Client(timeout=60.0) as client:
            course_assessments = _load_course_assessments(client=client, payload=payload)
            used_assessment_ids: set[str] = set()
            for module in modules:
                module_id = module.get("id")
                module_title = module.get("title")
                for lesson in module.get("lessons") or []:
                    lesson_content = _normalize_text(lesson.get("content") or "")
                    lesson_quizzes = _normalize_preloaded_quiz_questions(
                        lesson.get("quiz_questions") or lesson.get("quizQuestions")
                    )

                    assessment_id = str(lesson.get("assessment_id") or lesson.get("assessmentId") or "").strip()

                    if not assessment_id:
                        assessment_id = _resolve_traditional_assessment_id(
                            lesson=lesson,
                            module_id=str(module_id or "").strip(),
                            course_assessments=course_assessments,
                            used_assessment_ids=used_assessment_ids,
                        )

                    if assessment_id and not lesson_quizzes:
                        used_assessment_ids.add(assessment_id)
                        lesson_quizzes = _load_traditional_quiz_questions(
                            client=client,
                            payload=payload,
                            course_id=str(course.get("id") or ""),
                            assessment_id=assessment_id,
                        )
                    elif assessment_id:
                        used_assessment_ids.add(assessment_id)

                    for quiz in lesson_quizzes:
                        assembled_quizzes.append(
                            {
                                **quiz,
                                "lessonId": lesson.get("id"),
                                "lessonTitle": lesson.get("title"),
                                "moduleId": module_id,
                                "moduleTitle": module_title,
                            }
                        )

                    lesson_explanations = [lesson_content] if lesson_content else []
                    explanations.extend(lesson_explanations)

                    assembled_lessons.append(
                        {
                            "lessonId": lesson.get("id"),
                            "moduleId": module_id,
                            "moduleTitle": module_title,
                            "courseId": course.get("id"),
                            "courseTitle": course.get("title"),
                            "title": lesson.get("title"),
                            "contentType": lesson.get("content_type"),
                            "assessmentId": assessment_id or None,
                            "duration": lesson.get("duration"),
                            "teacherParoles": [],
                            "explanations": lesson_explanations,
                            "quizQuestions": lesson_quizzes,
                        }
                    )

        assembled_payload = _build_traditional_payload(
            course=course,
            payload=payload,
            modules_summary=modules_summary,
            lessons=assembled_lessons,
            quizzes=assembled_quizzes,
            explanations=explanations,
            supplemental_sources=supplemental_sources,
        )

        _log("[Agno Course Memory Agent] Step 1 complete: course content assembled.")
        _log("[Agno Course Memory Agent] Detected course strategy: Traditional course.")
        _log(f"- Course title: {assembled_payload['title']}")
        _log(f"- Tenant ID: {assembled_payload['tenantId']}")
        _log(f"- Modules collected: {assembled_payload['modulesCount']}")
        _log(f"- Lessons collected: {assembled_payload['lessonsCount']}")
        _log(f"- Quizzes collected: {assembled_payload['quizzesCount']}")
        _log(f"- Supplemental sources collected: {len(supplemental_sources)}")
        _log("[Agno Course Memory Agent] Full assembled payload:")
        _log(json.dumps(assembled_payload, ensure_ascii=False, indent=2))

        return StepOutput(
            content={
                "success": True,
                "workflowName": "course-memory-agent",
                "action": "assemble_published_course",
                "courseId": payload.courseId,
                "learningApiUrl": payload.learningApiUrl,
                "assembledPayload": assembled_payload,
                "hindsightApiUrl": payload.hindsightApiUrl or DEFAULT_HINDSIGHT_URL,
                "hindsightApiKey": payload.hindsightApiKey or DEFAULT_HINDSIGHT_API_KEY,
            },
            success=True,
        )

    assembled_lessons: list[dict[str, Any]] = []
    assembled_quizzes: list[dict[str, Any]] = []
    teacher_paroles: list[str] = []
    explanations: list[str] = []

    for module in modules:
        module_id = module.get("id")
        module_title = module.get("title")
        for lesson in module.get("lessons") or []:
            parsed_content = _parse_lesson_content(lesson.get("content"))
            lesson_teacher_paroles: list[str] = []
            lesson_explanations: list[str] = []
            lesson_quizzes: list[dict[str, Any]] = []

            if isinstance(parsed_content, dict):
                for action in parsed_content.get("actions") or []:
                    if isinstance(action, dict) and action.get("type") == "speech":
                        text = _normalize_text(action.get("text") or action.get("content") or "")
                        if text:
                            lesson_teacher_paroles.append(text)
                            teacher_paroles.append(text)

                content_block = parsed_content.get("content")
                if isinstance(content_block, dict):
                    slide_explanations = _extract_slide_explanations(content_block)
                    if slide_explanations:
                        lesson_explanations.extend(slide_explanations)
                        explanations.extend(slide_explanations)

                    if content_block.get("type") == "quiz":
                        for question in content_block.get("questions") or []:
                            if not isinstance(question, dict):
                                continue
                            answers = [
                                str(answer).strip()
                                for answer in (question.get("answer") or [])
                                if str(answer).strip()
                            ]
                            analysis = _normalize_text(question.get("analysis") or "")
                            if analysis:
                                lesson_explanations.append(analysis)
                                explanations.append(analysis)
                            quiz_item = {
                                "questionId": question.get("id"),
                                "question": _normalize_text(question.get("question") or ""),
                                "correctAnswer": answers,
                                "analysis": analysis,
                                "options": question.get("options") or [],
                            }
                            lesson_quizzes.append(quiz_item)
                            assembled_quizzes.append(
                                {
                                    **quiz_item,
                                    "lessonId": lesson.get("id"),
                                    "lessonTitle": lesson.get("title"),
                                    "moduleId": module_id,
                                    "moduleTitle": module_title,
                                }
                            )

            assembled_lessons.append(
                {
                    "lessonId": lesson.get("id"),
                    "moduleId": module_id,
                    "moduleTitle": module_title,
                    "courseId": course.get("id"),
                    "courseTitle": course.get("title"),
                    "title": lesson.get("title"),
                    "contentType": lesson.get("content_type"),
                    "duration": lesson.get("duration"),
                    "teacherParoles": lesson_teacher_paroles,
                    "explanations": lesson_explanations,
                    "quizQuestions": lesson_quizzes,
                }
            )

    assembled_payload = {
        "courseId": course.get("id"),
        "tenantId": course.get("tenant_id") or payload.tenantId,
        "requesterUserId": payload.requesterUserId,
        "requesterName": payload.requesterName,
        "title": course.get("title"),
        "description": course.get("description"),
        "category": course.get("category"),
        "difficulty": course.get("difficulty"),
        "duration": course.get("duration"),
        "xpReward": course.get("xp_reward"),
        "modulesCount": len(modules),
        "modules": modules_summary,
        "lessonsCount": len(assembled_lessons),
        "quizzesCount": len(assembled_quizzes),
        "teacherParolesCount": len(teacher_paroles),
        "explanationsCount": len(explanations),
        "contentStrategy": "ai_generated" if is_ai_generated else "traditional",
        "lessons": assembled_lessons,
        "quizzes": assembled_quizzes,
        "teacherParoles": teacher_paroles,
        "explanations": explanations,
        "supplementalSources": supplemental_sources,
    }

    _log("[Agno Course Memory Agent] Step 1 complete: course content assembled.")
    _log(
        f"[Agno Course Memory Agent] Detected course strategy: {'AI-generated course' if is_ai_generated else 'Traditional course'}."
    )
    _log(f"- Course title: {assembled_payload['title']}")
    _log(f"- Tenant ID: {assembled_payload['tenantId']}")
    _log(f"- Modules collected: {assembled_payload['modulesCount']}")
    _log(f"- Lessons collected: {assembled_payload['lessonsCount']}")
    _log(f"- Quizzes collected: {assembled_payload['quizzesCount']}")
    _log(f"- Teacher paroles collected: {assembled_payload['teacherParolesCount']}")
    _log(f"- Explanations collected: {assembled_payload['explanationsCount']}")
    _log("[Agno Course Memory Agent] Full assembled payload:")
    _log(json.dumps(assembled_payload, ensure_ascii=False, indent=2))

    return StepOutput(
        content={
            "success": True,
            "workflowName": "course-memory-agent",
            "action": "assemble_published_course",
            "courseId": payload.courseId,
            "learningApiUrl": payload.learningApiUrl,
            "assembledPayload": assembled_payload,
            "hindsightApiUrl": payload.hindsightApiUrl or DEFAULT_HINDSIGHT_URL,
            "hindsightApiKey": payload.hindsightApiKey or DEFAULT_HINDSIGHT_API_KEY,
        },
        success=True,
    )


def clean_course_content(step_input: StepInput) -> StepOutput:
    previous_content = step_input.previous_step_content
    if not isinstance(previous_content, dict):
        return StepOutput(
            content={"success": False, "error": "Assembled course payload is missing."},
            success=False,
            error="Assembled course payload is missing.",
        )

    assembled_payload = previous_content.get("assembledPayload")
    if not isinstance(assembled_payload, dict):
        return StepOutput(
            content={"success": False, "error": "Assembled course payload is invalid."},
            success=False,
            error="Assembled course payload is invalid.",
        )

    if str(assembled_payload.get("contentStrategy") or "").strip() == "traditional":
        _log("[Agno Course Memory Agent] Traditional course detected: skipping presentation-noise cleanup.")
        cleaned_payload = {
            "courseId": assembled_payload.get("courseId"),
            "tenantId": assembled_payload.get("tenantId"),
            "requesterUserId": assembled_payload.get("requesterUserId"),
            "requesterName": assembled_payload.get("requesterName"),
            "title": assembled_payload.get("title"),
            "description": _normalize_text(assembled_payload.get("description") or ""),
            "category": assembled_payload.get("category"),
            "difficulty": assembled_payload.get("difficulty"),
            "duration": assembled_payload.get("duration"),
            "xpReward": assembled_payload.get("xpReward"),
            "modulesCount": assembled_payload.get("modulesCount"),
            "modules": assembled_payload.get("modules") or [],
            "contentStrategy": "traditional",
            "lessons": assembled_payload.get("lessons") or [],
            "supplementalSources": _normalize_supplemental_sources(
                assembled_payload.get("supplementalSources")
            ),
        }

        return StepOutput(
            content={
                **previous_content,
                "action": "clean_course_content",
                "cleanedPayload": cleaned_payload,
            },
            success=True,
        )

    cleaned_lessons: list[dict[str, Any]] = []
    for lesson in assembled_payload.get("lessons") or []:
        if not isinstance(lesson, dict):
            continue
        cleaned_lesson = {
            "lessonId": lesson.get("lessonId"),
            "moduleId": lesson.get("moduleId"),
            "moduleTitle": lesson.get("moduleTitle"),
            "courseId": lesson.get("courseId"),
            "courseTitle": lesson.get("courseTitle"),
            "title": lesson.get("title"),
            "contentType": lesson.get("contentType"),
            "assessmentId": lesson.get("assessmentId"),
            "duration": lesson.get("duration"),
            "teacherParoles": [
                _normalize_text(text)
                for text in (lesson.get("teacherParoles") or [])
                if _normalize_text(text)
            ],
            "explanations": [
                _normalize_text(text)
                for text in (lesson.get("explanations") or [])
                if _normalize_text(text)
            ],
            "quizQuestions": [],
        }

        for quiz in lesson.get("quizQuestions") or []:
            if not isinstance(quiz, dict):
                continue
            cleaned_quiz = {
                "questionId": quiz.get("questionId"),
                "question": _normalize_text(quiz.get("question") or ""),
                "correctAnswer": [
                    str(answer).strip()
                    for answer in (quiz.get("correctAnswer") or [])
                    if str(answer).strip()
                ],
                "analysis": _normalize_text(quiz.get("analysis") or ""),
            }
            if cleaned_quiz["question"] or cleaned_quiz["analysis"] or cleaned_quiz["correctAnswer"]:
                cleaned_lesson["quizQuestions"].append(cleaned_quiz)

        cleaned_lessons.append(cleaned_lesson)

    cleaned_payload = {
        "courseId": assembled_payload.get("courseId"),
        "tenantId": assembled_payload.get("tenantId"),
        "requesterUserId": assembled_payload.get("requesterUserId"),
        "requesterName": assembled_payload.get("requesterName"),
        "title": assembled_payload.get("title"),
        "description": _normalize_text(assembled_payload.get("description") or ""),
        "category": assembled_payload.get("category"),
        "difficulty": assembled_payload.get("difficulty"),
        "duration": assembled_payload.get("duration"),
        "xpReward": assembled_payload.get("xpReward"),
        "modulesCount": assembled_payload.get("modulesCount"),
        "modules": assembled_payload.get("modules") or [],
        "contentStrategy": assembled_payload.get("contentStrategy") or "traditional",
        "lessons": cleaned_lessons,
        "supplementalSources": _normalize_supplemental_sources(
            assembled_payload.get("supplementalSources")
        ),
    }

    total_quiz_questions = sum(
        len(lesson.get("quizQuestions") or []) for lesson in cleaned_lessons if isinstance(lesson, dict)
    )
    _log("[Agno Course Memory Agent] Step 2 complete: presentation noise removed.")
    _log(f"- Clean lessons: {len(cleaned_lessons)}")
    _log(f"- Clean quiz questions: {total_quiz_questions}")
    _log("[Agno Course Memory Agent] Cleaned memory payload:")
    _log(json.dumps(cleaned_payload, ensure_ascii=False, indent=2))

    return StepOutput(
        content={
            **previous_content,
            "action": "clean_course_content",
            "cleanedPayload": cleaned_payload,
        },
        success=True,
    )


def build_retention_documents(step_input: StepInput) -> StepOutput:
    previous_content = step_input.previous_step_content
    if not isinstance(previous_content, dict):
        return StepOutput(
            content={"success": False, "error": "Cleaned course payload is missing."},
            success=False,
            error="Cleaned course payload is missing.",
        )

    cleaned_payload = previous_content.get("cleanedPayload")
    if not isinstance(cleaned_payload, dict):
        return StepOutput(
            content={"success": False, "error": "Cleaned course payload is invalid."},
            success=False,
            error="Cleaned course payload is invalid.",
        )

    tenant_id = str(cleaned_payload.get("tenantId") or "").strip()
    course_id = str(cleaned_payload.get("courseId") or "").strip()
    course_title = str(cleaned_payload.get("title") or "").strip()
    content_strategy = str(cleaned_payload.get("contentStrategy") or "traditional").strip()

    documents: list[dict[str, Any]] = []
    module_titles = [
        _normalize_text(module.get("title") or "")
        for module in (cleaned_payload.get("modules") or [])
        if isinstance(module, dict) and _normalize_text(module.get("title") or "")
    ]

    overview_lines = [
        f"Course Title: {course_title}",
        f"Category: {cleaned_payload.get('category') or 'Unknown'}",
        f"Difficulty: {cleaned_payload.get('difficulty') or 'Unknown'}",
    ]
    description = str(cleaned_payload.get("description") or "").strip()
    if description:
        overview_lines.append(f"Course Description: {description}")
    if cleaned_payload.get("duration") is not None:
        overview_lines.append(f"Course Duration (minutes): {cleaned_payload.get('duration')}")
    if cleaned_payload.get("xpReward") is not None:
        overview_lines.append(f"XP Reward: {cleaned_payload.get('xpReward')}")
    if cleaned_payload.get("modulesCount") is not None:
        overview_lines.append(f"Modules Count: {cleaned_payload.get('modulesCount')}")
    if module_titles:
        overview_lines.append("Module Titles:")
        overview_lines.extend(f"- {title}" for title in module_titles)
    overview_lines.append("This course belongs to the company-specific learning catalog.")

    documents.append(
        {
            "content": "\n".join(overview_lines),
            "context": "published course overview",
            "document_id": f"course:{course_id}:overview",
            "metadata": _sanitize_string_dict(
                {
                    "tenantId": tenant_id,
                    "courseId": course_id,
                    "courseTitle": course_title,
                    "contentType": "course_overview",
                }
            ),
            "tags": [
                f"tenant:{tenant_id}",
                f"course:{course_id}",
                "content:course_overview",
            ],
        }
    )

    _log(
        f"[Agno Course Memory Agent] Building retention documents for {'AI-generated course' if content_strategy == 'ai_generated' else 'traditional course'}."
    )

    for index, source in enumerate(cleaned_payload.get("supplementalSources") or []):
        if not isinstance(source, dict):
            continue

        source_title = _normalize_text(source.get("title") or "") or f"Supplemental Source {index + 1}"
        source_kind = _normalize_text(source.get("kind") or "") or "supplemental_course_source"
        source_text = _normalize_text(source.get("text") or "")
        if not source_text:
            continue

        documents.append(
            {
                "content": "\n".join(
                    [
                        f"Course Title: {course_title}",
                        f"Supplemental Course Source: {source_title}",
                        source_text,
                    ]
                ),
                "context": "supplemental course source knowledge",
                "document_id": f"course:{course_id}:source:{index + 1}",
                "metadata": _sanitize_string_dict(
                    {
                        "tenantId": tenant_id,
                        "courseId": course_id,
                        "courseTitle": course_title,
                        "sourceTitle": source_title,
                        "contentType": source_kind,
                    }
                ),
                "tags": [
                    f"tenant:{tenant_id}",
                    f"course:{course_id}",
                    "content:supplemental_course_source",
                ],
            }
        )

    if content_strategy != "ai_generated":
        _log("[Agno Course Memory Agent] Traditional course detected: retaining course metadata, lesson knowledge, quiz knowledge, and private source documents.")
        _log(f"- Supplemental sources: {len(cleaned_payload.get('supplementalSources') or [])}")
        _log(f"- Modules: {len(module_titles)}")
        _log(f"- Lessons: {len(cleaned_payload.get('lessons') or [])}")
        _log(f"- XP reward: {cleaned_payload.get('xpReward')}")
        _log(f"- Duration: {cleaned_payload.get('duration')}")

    for lesson in cleaned_payload.get("lessons") or []:
        if not isinstance(lesson, dict):
            continue

        lesson_id = str(lesson.get("lessonId") or "").strip()
        lesson_title = str(lesson.get("title") or "").strip()

        lesson_document = {
            "content": _summarize_lesson_for_retain(lesson),
            "context": "published course lesson knowledge",
            "document_id": f"course:{course_id}:lesson:{lesson_id}",
            "metadata": _sanitize_string_dict(
                {
                    "tenantId": tenant_id,
                    "courseId": course_id,
                    "courseTitle": course_title,
                    "lessonId": lesson_id,
                    "lessonTitle": lesson_title,
                    "moduleId": lesson.get("moduleId"),
                    "moduleTitle": lesson.get("moduleTitle"),
                    "assessmentId": lesson.get("assessmentId"),
                    "contentType": str(lesson.get("contentType") or "lesson_knowledge"),
                }
            ),
            "tags": [
                f"tenant:{tenant_id}",
                f"course:{course_id}",
                f"lesson:{lesson_id}",
                "content:lesson_knowledge",
            ],
        }
        documents.append(lesson_document)

        for quiz in lesson.get("quizQuestions") or []:
            if not isinstance(quiz, dict):
                continue
            question_id = str(quiz.get("questionId") or "").strip()
            lines = [
                f"Course Title: {course_title}",
                f"Lesson Title: {lesson_title}",
                f"Quiz Question: {quiz.get('question')}",
            ]
            options = [str(option).strip() for option in (quiz.get("options") or []) if str(option).strip()]
            if options:
                lines.append(f"Answer Options: {', '.join(options)}")
            correct_answer = quiz.get("correctAnswer") or []
            if correct_answer:
                lines.append(f"Correct Answer: {', '.join(correct_answer)}")
            if quiz.get("analysis"):
                lines.append(f"Explanation: {quiz.get('analysis')}")

            documents.append(
                {
                    "content": "\n".join(line for line in lines if line.strip()),
                    "context": "published course quiz knowledge",
                    "document_id": f"course:{course_id}:lesson:{lesson_id}:quiz:{question_id}",
                    "metadata": _sanitize_string_dict(
                        {
                            "tenantId": tenant_id,
                            "courseId": course_id,
                            "courseTitle": course_title,
                            "lessonId": lesson_id,
                            "lessonTitle": lesson_title,
                            "questionId": question_id,
                            "contentType": "quiz_knowledge",
                        }
                    ),
                    "tags": [
                        f"tenant:{tenant_id}",
                        f"course:{course_id}",
                        f"lesson:{lesson_id}",
                        "content:quiz_knowledge",
                    ],
                }
            )

    _log("[Agno Course Memory Agent] Step 3 complete: retention documents prepared.")
    _log(f"- Documents prepared for retain: {len(documents)}")
    _log("[Agno Course Memory Agent] Retention documents preview:")
    _log(json.dumps(documents, ensure_ascii=False, indent=2))

    return StepOutput(
        content={
            **previous_content,
            "action": "build_retention_documents",
            "retentionDocuments": documents,
        },
        success=True,
    )


def retain_documents_in_hindsight(step_input: StepInput) -> StepOutput:
    previous_content = step_input.previous_step_content
    if not isinstance(previous_content, dict):
        return StepOutput(
            content={"success": False, "error": "Retention documents are missing."},
            success=False,
            error="Retention documents are missing.",
        )

    cleaned_payload = previous_content.get("cleanedPayload")
    retention_documents = previous_content.get("retentionDocuments")
    hindsight_url = str(previous_content.get("hindsightApiUrl") or DEFAULT_HINDSIGHT_URL).rstrip("/")
    hindsight_api_key = str(previous_content.get("hindsightApiKey") or DEFAULT_HINDSIGHT_API_KEY)

    if not isinstance(cleaned_payload, dict) or not isinstance(retention_documents, list):
        return StepOutput(
            content={"success": False, "error": "Retention input is invalid."},
            success=False,
            error="Retention input is invalid.",
        )

    tenant_id = str(cleaned_payload.get("tenantId") or "").strip()
    if not tenant_id:
        return StepOutput(
            content={"success": False, "error": "Tenant ID is required to resolve the company bank."},
            success=False,
            error="Tenant ID is required to resolve the company bank.",
        )

    course_id = str(cleaned_payload.get("courseId") or "").strip()
    if not course_id:
        return StepOutput(
            content={"success": False, "error": "Course ID is required to resolve the course bank."},
            success=False,
            error="Course ID is required to resolve the course bank.",
        )

    bank_id = _build_course_bank_id(tenant_id, course_id)
    bank_name = f"Tenant {tenant_id} Course {course_id}"
    bank_body = {
        "name": bank_name,
        "background": f"Published course knowledge for course {course_id} in tenant {tenant_id}.",
        "retain_mission": (
            "Store published course knowledge for this single course so future course support agents "
            "can answer learner questions accurately without mixing other courses."
        ),
        "reflect_mission": (
            "Answer course questions using retained published course knowledge for this course only."
        ),
    }

    retain_body = {
        "items": retention_documents,
        "async": True,
    }

    headers = {"Content-Type": "application/json"}
    if hindsight_api_key:
        headers["Authorization"] = f"Bearer {hindsight_api_key}"

    _log("[Agno Course Memory Agent] Step 4 starting: resolve company bank.")
    _log(f"- Hindsight URL: {hindsight_url}")
    _log(f"- Target bank ID: {bank_id}")
    _log("[Agno Course Memory Agent] Bank payload:")
    _log(json.dumps(bank_body, ensure_ascii=False, indent=2))
    _log("[Agno Course Memory Agent] Retain payload that will be sent to Hindsight:")
    _log(json.dumps(retain_body, ensure_ascii=False, indent=2))

    with httpx.Client(timeout=120.0) as client:
        bank_response = client.put(
            f"{hindsight_url}/v1/default/banks/{bank_id}",
            json=bank_body,
            headers=headers,
        )

        if bank_response.status_code >= 400:
            _log("[Agno Course Memory Agent] Failed while creating/updating the company bank.")
            _log(f"- Hindsight bank status: {bank_response.status_code}")
            _log(f"- Hindsight bank response: {bank_response.text}")
            return StepOutput(
                content={
                    **previous_content,
                    "success": False,
                    "bankId": bank_id,
                    "error": f"Hindsight bank creation failed with status {bank_response.status_code}",
                },
                success=False,
                error=f"Hindsight bank creation failed with status {bank_response.status_code}",
            )

        _log("[Agno Course Memory Agent] Step 4 complete: company bank resolved successfully.")

        _log("[Agno Course Memory Agent] Step 5 starting: retain cleaned course knowledge in Hindsight.")
        retain_response = client.post(
            f"{hindsight_url}/v1/default/banks/{bank_id}/memories",
            json=retain_body,
            headers=headers,
        )

    if retain_response.status_code >= 400:
        _log("[Agno Course Memory Agent] Hindsight retain failed.")
        _log(f"- Hindsight retain status: {retain_response.status_code}")
        _log(f"- Hindsight retain response: {retain_response.text}")
        _log("============================================================")
        _log("")
        return StepOutput(
            content={
                **previous_content,
                "success": False,
                "bankId": bank_id,
                "retainResponseStatus": retain_response.status_code,
                "retainResponseText": retain_response.text,
            },
            success=False,
            error=f"Hindsight retain failed with status {retain_response.status_code}",
        )

    retain_response_data = retain_response.json()
    is_async = bool(retain_response_data.get("async"))
    operation_id = retain_response_data.get("operation_id")
    operation_ids = retain_response_data.get("operation_ids")
    if is_async:
        _log("[Agno Course Memory Agent] Step 5 complete: course knowledge retain queued in Hindsight.")
        _log(f"- Target bank ID: {bank_id}")
        if operation_id:
            _log(f"- Hindsight operation ID: {operation_id}")
        if operation_ids:
            _log(f"- Hindsight operation IDs: {operation_ids}")
    else:
        _log("[Agno Course Memory Agent] Step 5 complete: cleaned course knowledge retained in Hindsight.")
        _log(f"- Target bank ID: {bank_id}")
    _log("[Agno Course Memory Agent] Hindsight retain response:")
    _log(json.dumps(retain_response_data, ensure_ascii=False, indent=2))
    if is_async:
        _log("[Agno Course Memory Agent] Workflow complete: the course knowledge retain job is queued in the dedicated course bank.")
    else:
        _log("[Agno Course Memory Agent] Workflow complete: the course knowledge is now retained in the dedicated course bank.")
    _log("============================================================")
    _log("")

    return StepOutput(
        content={
            **previous_content,
            "success": True,
            "action": "retain_documents_in_hindsight",
            "bankId": bank_id,
            "isAsync": is_async,
            "operationId": operation_id,
            "operationIds": operation_ids,
            "requesterUserId": cleaned_payload.get("requesterUserId"),
            "requesterName": cleaned_payload.get("requesterName"),
            "retainResponse": retain_response_data,
        },
        success=True,
    )


course_memory_workflow = Workflow(
    name="course-memory-agent",
    description="Separate AgentOS workflow that assembles the official course payload, cleans it, prepares course knowledge documents, and retains them in a dedicated Hindsight bank for one tenant course.",
    input_schema=CourseMemoryAssemblyInput,
    telemetry=False,
    steps=[
        Step(
            name="assemble-course-memory-payload",
            description="Load the official saved course and assemble the raw course memory payload.",
            executor=assemble_course_memory_payload,
        ),
        Step(
            name="clean-course-content",
            description="Remove presentation noise and keep only educationally meaningful course knowledge.",
            executor=clean_course_content,
        ),
        Step(
            name="build-retention-documents",
            description="Create several course and lesson memory documents with rich metadata for retain.",
            executor=build_retention_documents,
        ),
        Step(
            name="retain-documents-in-hindsight",
            description="Resolve the dedicated tenant course bank and retain the prepared course knowledge documents in Hindsight.",
            executor=retain_documents_in_hindsight,
        ),
    ],
)
