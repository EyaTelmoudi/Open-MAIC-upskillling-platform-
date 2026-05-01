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
            if quiz.get("correctAnswer"):
                lines.append(f"  Correct Answer: {', '.join(quiz['correctAnswer'])}")
            if quiz.get("analysis"):
                lines.append(f"  Explanation: {quiz['analysis']}")

    return "\n".join(line for line in lines if line.strip())


def assemble_course_memory_payload(step_input: StepInput) -> StepOutput:
    payload = CourseMemoryAssemblyInput.model_validate(step_input.input)

    _log("")
    _log("============================================================")
    _log("[Agno Course Memory Agent] Request received")
    _log("- Workflow: course-memory-agent")
    _log("- Action: assemble_published_course")
    _log(f"- Time: {datetime.now(timezone.utc).isoformat()}")
    _log(f"- Course ID: {payload.courseId}")

    with httpx.Client(timeout=60.0) as client:
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
            elif isinstance(parsed_content, str):
                text = _normalize_text(parsed_content)
                if text:
                    lesson_explanations.append(text)
                    explanations.append(text)

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
        "modulesCount": len(modules),
        "lessonsCount": len(assembled_lessons),
        "quizzesCount": len(assembled_quizzes),
        "teacherParolesCount": len(teacher_paroles),
        "explanationsCount": len(explanations),
        "lessons": assembled_lessons,
        "quizzes": assembled_quizzes,
        "teacherParoles": teacher_paroles,
        "explanations": explanations,
    }

    _log("[Agno Course Memory Agent] Step 1 complete: course content assembled.")
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
        "lessons": cleaned_lessons,
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

    documents: list[dict[str, Any]] = []

    overview_lines = [
        f"Course Title: {course_title}",
        f"Category: {cleaned_payload.get('category') or 'Unknown'}",
        f"Difficulty: {cleaned_payload.get('difficulty') or 'Unknown'}",
    ]
    description = str(cleaned_payload.get("description") or "").strip()
    if description:
        overview_lines.append(f"Course Description: {description}")
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

    bank_id = f"tenant:{tenant_id}:courses"
    bank_name = f"Tenant {tenant_id} Courses"
    bank_body = {
        "name": bank_name,
        "background": f"Published course knowledge for tenant {tenant_id}.",
        "retain_mission": (
            "Store published course knowledge, quiz answers, and teacher explanations so future "
            "course support agents can answer learner questions accurately."
        ),
        "reflect_mission": (
            "Answer course questions using retained published course knowledge for this tenant only."
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
        _log("[Agno Course Memory Agent] Workflow complete: the course knowledge retain job is queued in the company bank.")
    else:
        _log("[Agno Course Memory Agent] Workflow complete: the course knowledge is now retained in the company bank.")
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
    description="Separate AgentOS workflow that assembles the official course payload, cleans it, prepares course knowledge documents, and retains them in the company Hindsight bank.",
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
            description="Resolve the tenant company bank and retain the prepared course knowledge documents in Hindsight.",
            executor=retain_documents_in_hindsight,
        ),
    ],
)
