from __future__ import annotations

import json
import mimetypes
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from pydantic import BaseModel

from agno.workflow import Step, StepInput, StepOutput, Workflow

COMMON_SRC = Path(__file__).resolve().parents[3] / "upskilling_platform" / "packages" / "common" / "src"
if str(COMMON_SRC) not in sys.path:
    sys.path.insert(0, str(COMMON_SRC))

from common.storage import upload_file_tenant


DEFAULT_HINDSIGHT_URL = os.getenv("HINDSIGHT_API_URL", "http://127.0.0.1:8888")
DEFAULT_HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY", "")
DEFAULT_STT_URL = os.getenv("FASTER_WHISPER_SERVER_URL", "http://127.0.0.1:8011")
DEFAULT_STT_MODEL = os.getenv("FASTER_WHISPER_MODEL", "Systran/faster-whisper-small")


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
    previewMode: str | None = None
    forceRetention: bool = False


class CourseMemoryDeleteInput(BaseModel):
    courseId: str
    tenantId: str
    requesterUserId: str | None = None
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


def _slugify(value: str) -> str:
    normalized = re.sub(r"[^a-zA-Z0-9]+", "-", str(value or "").strip().lower())
    return normalized.strip("-") or "item"


def _guess_filename_from_url(url: str, fallback_stem: str) -> str:
    parsed = urlparse(url)
    candidate = Path(parsed.path).name.strip()
    if candidate:
        return candidate
    return f"{fallback_stem}.bin"


def _pdf_escape(value: str) -> str:
    return value.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")


def _wrap_pdf_lines(value: str, max_chars: int = 92) -> list[str]:
    wrapped: list[str] = []
    for raw_line in str(value or "").splitlines() or [""]:
        line = raw_line.strip()
        if not line:
            wrapped.append("")
            continue

        current = ""
        for word in line.split():
            next_line = word if not current else f"{current} {word}"
            if len(next_line) <= max_chars:
                current = next_line
                continue
            if current:
                wrapped.append(current)
            current = word
        if current:
            wrapped.append(current)
    return wrapped or [""]


def _build_transcript_pdf(
    *,
    course_title: str,
    lesson_title: str,
    transcript_text: str,
    source_url: str,
) -> bytes:
    lines = [
        f"Course Transcript: {course_title or 'Untitled course'}",
        f"Lesson: {lesson_title or 'Untitled lesson'}",
        f"Generated At: {datetime.now(timezone.utc).isoformat()}",
        f"Video Source: {source_url or 'Unknown'}",
        "",
    ]
    lines.extend(_wrap_pdf_lines(transcript_text))

    page_line_capacity = 42
    pages = [
        lines[index : index + page_line_capacity]
        for index in range(0, len(lines), page_line_capacity)
    ] or [[]]

    pdf_objects: list[bytes] = []

    def add_object(payload: str | bytes) -> int:
        data = payload.encode("latin-1", errors="replace") if isinstance(payload, str) else payload
        pdf_objects.append(data)
        return len(pdf_objects)

    font_id = add_object("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>")

    page_ids: list[int] = []
    content_ids: list[int] = []
    pages_id_placeholder = 0

    for page_lines in pages:
        content_stream_lines = ["BT", "/F1 10 Tf", "50 790 Td", "14 TL"]
        first_line = True
        for line in page_lines:
            escaped_line = _pdf_escape(line)
            if first_line:
                content_stream_lines.append(f"({_pdf_escape(line)}) Tj")
                first_line = False
            else:
                content_stream_lines.append("T*")
                content_stream_lines.append(f"({escaped_line}) Tj")
        if first_line:
            content_stream_lines.append("( ) Tj")
        content_stream_lines.append("ET")
        content_stream = "\n".join(content_stream_lines).encode("latin-1", errors="replace")
        content_id = add_object(
            b"<< /Length " + str(len(content_stream)).encode("ascii") + b" >>\nstream\n" + content_stream + b"\nendstream"
        )
        content_ids.append(content_id)
        page_ids.append(0)

    pages_id_placeholder = len(pdf_objects) + 1
    add_object("<< /Type /Pages /Kids [] /Count 0 >>")

    for index, content_id in enumerate(content_ids):
        page_object = (
            f"<< /Type /Page /Parent {pages_id_placeholder} 0 R /MediaBox [0 0 595 842] "
            f"/Resources << /Font << /F1 {font_id} 0 R >> >> /Contents {content_id} 0 R >>"
        )
        page_ids[index] = add_object(page_object)

    kids = " ".join(f"{page_id} 0 R" for page_id in page_ids)
    pdf_objects[pages_id_placeholder - 1] = (
        f"<< /Type /Pages /Kids [{kids}] /Count {len(page_ids)} >>".encode("latin-1")
    )

    catalog_id = add_object(f"<< /Type /Catalog /Pages {pages_id_placeholder} 0 R >>")

    output = bytearray(b"%PDF-1.4\n%\xe2\xe3\xcf\xd3\n")
    offsets = [0]
    for object_id, payload in enumerate(pdf_objects, start=1):
        offsets.append(len(output))
        output.extend(f"{object_id} 0 obj\n".encode("ascii"))
        output.extend(payload)
        output.extend(b"\nendobj\n")

    xref_offset = len(output)
    output.extend(f"xref\n0 {len(pdf_objects) + 1}\n".encode("ascii"))
    output.extend(b"0000000000 65535 f \n")
    for offset in offsets[1:]:
        output.extend(f"{offset:010d} 00000 n \n".encode("ascii"))
    output.extend(
        (
            f"trailer\n<< /Size {len(pdf_objects) + 1} /Root {catalog_id} 0 R >>\n"
            f"startxref\n{xref_offset}\n%%EOF"
        ).encode("ascii")
    )
    return bytes(output)


def _extract_global_learning_objectives(cleaned_payload: dict[str, Any]) -> list[str]:
    objectives: list[str] = []

    for explanation in cleaned_payload.get("explanations") or []:
        normalized = _normalize_text(explanation)
        if normalized:
            objectives.append(normalized)

    if objectives:
        return objectives

    for lesson in cleaned_payload.get("lessons") or []:
        if not isinstance(lesson, dict):
            continue
        title = _normalize_text(lesson.get("title") or "")
        if title:
            objectives.append(f"Understand {title}")

    return objectives[:5]


def _format_course_overview_preview(document: dict[str, Any], cleaned_payload: dict[str, Any]) -> str:
    module_titles = [
        _normalize_text(module.get("title") or "")
        for module in (cleaned_payload.get("modules") or [])
        if isinstance(module, dict) and _normalize_text(module.get("title") or "")
    ]
    objectives = _extract_global_learning_objectives(cleaned_payload)
    lines = [
        "Contenu du premier retain de course overview",
        "Course Overview",
        f"document_id: {document.get('document_id') or 'course:unknown:overview'}",
        f"update_mode: {document.get('update_mode') or 'replace'}",
        f"titre: {cleaned_payload.get('title') or 'Untitled course'}",
        f"description: {cleaned_payload.get('description') or 'Aucune description'}",
        f"difficulte: {cleaned_payload.get('difficulty') or 'Unknown'}",
        f"duree: {cleaned_payload.get('duration') if cleaned_payload.get('duration') is not None else 'Unknown'}",
        "modules:",
    ]

    if module_titles:
        lines.extend(f"- {title}" for title in module_titles)
    else:
        lines.append("- Aucun module")

    lines.append("objectifs pedagogiques globaux:")
    if objectives:
        lines.extend(f"- {objective}" for objective in objectives)
    else:
        lines.append("- Aucun objectif global explicite")

    return "\n".join(lines)


def _build_lesson_retain_content(lesson: dict[str, Any]) -> str:
    title = _normalize_text(lesson.get("title") or "") or "Untitled lesson"
    cleaned_html_content = _normalize_text(lesson.get("cleanedHtmlContent") or lesson.get("content") or "")
    content_type = _normalize_text(lesson.get("contentType") or "") or "unknown"
    duration = lesson.get("duration")

    lines = [
        f"Lesson Title: {title}",
        f"Lesson Content: {cleaned_html_content or 'No cleaned lesson content'}",
        f"Lesson Type: {content_type}",
        f"Lesson Duration (minutes): {duration if duration is not None else 'Unknown'}",
    ]

    support_documents = lesson.get("supportDocuments") or []
    if isinstance(support_documents, list) and support_documents:
        lines.append("Lesson Support Materials:")
        for document in support_documents:
            if not isinstance(document, dict):
                continue
            doc_title = _normalize_text(document.get("title") or "") or "Support document"
            doc_kind = _normalize_text(document.get("kind") or "") or "resource"
            lines.append(f"- Title: {doc_title}")
            lines.append(f"  Kind: {doc_kind}")
            extracted_text = _normalize_text(document.get("extractedText") or "")
            if extracted_text:
                lines.append(f"  Extracted Content: {extracted_text}")

    return "\n".join(lines)


def _format_lesson_preview(document: dict[str, Any], lesson: dict[str, Any], course_id: str) -> str:
    lesson_id = str(lesson.get("lessonId") or "").strip() or "unknown"
    lines = [
        "Lesson Content",
        f"document_id: {document.get('document_id') or f'course:{course_id}:lesson:{lesson_id}'}",
        f"update_mode: {document.get('update_mode') or 'replace'}",
        f"titre: {_normalize_text(lesson.get('title') or '') or 'Untitled lesson'}",
        f"contenu HTML nettoye: {_normalize_text(lesson.get('cleanedHtmlContent') or lesson.get('content') or '') or 'No cleaned lesson content'}",
        f"type: {_normalize_text(lesson.get('contentType') or '') or 'unknown'}",
        f"duree: {lesson.get('duration') if lesson.get('duration') is not None else 'Unknown'}",
    ]

    support_documents = lesson.get("supportDocuments") or []
    if isinstance(support_documents, list) and support_documents:
        lines.append("supports:")
        for document_item in support_documents:
            if not isinstance(document_item, dict):
                continue
            lines.append(
                f"- {_normalize_text(document_item.get('title') or '') or 'Support document'} ({_normalize_text(document_item.get('kind') or '') or 'resource'})"
            )
            extracted_text = _normalize_text(document_item.get("extractedText") or "")
            if extracted_text:
                lines.append(f"  contenu extrait: hidden ({len(extracted_text)} chars)")

    return "\n".join(lines)


def _is_quiz_lesson(lesson: dict[str, Any]) -> bool:
    if str(lesson.get("assessmentId") or "").strip():
        return True
    quiz_questions = lesson.get("quizQuestions") or []
    if isinstance(quiz_questions, list) and len(quiz_questions) > 0:
        return True
    return _normalize_text(lesson.get("contentType") or "").lower() == "quiz"


def _build_quiz_retain_content(course_title: str, lesson: dict[str, Any]) -> str:
    lines = [
        f"Course Title: {course_title}",
        f"Quiz Title: {_normalize_text(lesson.get('title') or '') or 'Untitled quiz'}",
        f"Quiz Duration (minutes): {lesson.get('duration') if lesson.get('duration') is not None else 'Unknown'}",
    ]

    for index, quiz in enumerate(lesson.get("quizQuestions") or [], start=1):
        if not isinstance(quiz, dict):
            continue
        lines.append(f"Question {index}: {_normalize_text(quiz.get('question') or '')}")
        options = [str(option).strip() for option in (quiz.get("options") or []) if str(option).strip()]
        if options:
            lines.append(f"Options: {', '.join(options)}")
        correct_answers = [str(answer).strip() for answer in (quiz.get("correctAnswer") or []) if str(answer).strip()]
        if correct_answers:
            lines.append(f"Correct Answer: {', '.join(correct_answers)}")
        analysis = _normalize_text(quiz.get("analysis") or "")
        if analysis:
            lines.append(f"Explanation: {analysis}")

    return "\n".join(line for line in lines if line.strip())


def _format_quiz_preview(document: dict[str, Any], lesson: dict[str, Any], course_id: str) -> str:
    lesson_id = str(lesson.get("lessonId") or "").strip() or "unknown"
    lines = [
        "Quiz Content",
        f"document_id: {document.get('document_id') or f'course:{course_id}:lesson:{lesson_id}:quiz'}",
        f"update_mode: {document.get('update_mode') or 'replace'}",
        f"titre: {_normalize_text(lesson.get('title') or '') or 'Untitled quiz'}",
        f"duree: {lesson.get('duration') if lesson.get('duration') is not None else 'Unknown'}",
    ]

    for index, quiz in enumerate(lesson.get("quizQuestions") or [], start=1):
        if not isinstance(quiz, dict):
            continue
        lines.append(f"question {index}: {_normalize_text(quiz.get('question') or '') or 'Untitled question'}")
        options = [str(option).strip() for option in (quiz.get("options") or []) if str(option).strip()]
        if options:
            lines.append(f"options: {', '.join(options)}")
        correct_answers = [str(answer).strip() for answer in (quiz.get("correctAnswer") or []) if str(answer).strip()]
        if correct_answers:
            lines.append(f"bonne reponse: {', '.join(correct_answers)}")

    return "\n".join(lines)


def _format_supplemental_source_preview(document: dict[str, Any], source: dict[str, Any], course_id: str, index: int) -> str:
    source_text = _normalize_text(source.get("text") or "")
    return "\n".join(
        [
            "Supplemental Source",
            f"document_id: {document.get('document_id') or f'course:{course_id}:source:{index + 1}'}",
            f"update_mode: {document.get('update_mode') or 'replace'}",
            f"titre: {_normalize_text(source.get('title') or '') or f'Supplemental Source {index + 1}'}",
            (
                f"contenu: hidden ({len(source_text)} chars)"
                if source_text
                else "contenu: No supplemental source content"
            ),
        ]
    )


def _build_course_bank_id(tenant_id: str, course_id: str) -> str:
    return f"tenant:{tenant_id}:course:{course_id}"


def _build_user_course_bank_id(tenant_id: str, requester_user_id: str, course_id: str) -> str:
    return f"tenant:{tenant_id}:user:{requester_user_id}:course:{course_id}"


def _extract_hindsight_document_ids(payload: Any) -> list[str]:
    if not isinstance(payload, dict):
        return []

    raw_items = payload.get("items") or payload.get("documents") or []
    document_ids: list[str] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        document_id = _normalize_text(item.get("id") or item.get("document_id") or "")
        if document_id:
            document_ids.append(document_id)

    return list(dict.fromkeys(document_ids))


def _check_course_bank_exists(
    *,
    client: httpx.Client,
    hindsight_url: str,
    bank_id: str,
    headers: dict[str, str],
) -> tuple[bool, int]:
    response = client.get(
        f"{hindsight_url}/v1/default/banks/{bank_id}/profile",
        headers=headers,
    )
    return response.status_code < 400, response.status_code


def _build_course_bank_body(
    *,
    tenant_id: str,
    course_id: str,
) -> dict[str, Any]:
    return {
        "name": f"Tenant {tenant_id} Course {course_id}",
        "background": f"Published course knowledge for course {course_id} in tenant {tenant_id}.",
        "retain_mission": (
            "Store published course knowledge for this single course so future course support agents "
            "can answer learner questions accurately without mixing other courses."
        ),
        "reflect_mission": (
            "Answer course questions using retained published course knowledge for this course only."
        ),
    }


def _build_learning_endpoint(learning_api_url: str, suffix: str) -> str:
    return f"{learning_api_url.rstrip('/')}/{suffix.lstrip('/')}"


def _build_source_retain_document(
    *,
    course_id: str,
    course_title: str,
    tenant_id: str,
    source: dict[str, Any],
    source_index: int,
) -> dict[str, Any] | None:
    source_title = _normalize_text(source.get("title") or "") or f"Supplemental Source {source_index}"
    source_kind = _normalize_text(source.get("kind") or "") or "supplemental_course_source"
    source_text = _normalize_text(source.get("text") or "")
    if not source_text:
        return None

    return {
        "content": "\n".join(
            [
                f"Course Title: {course_title}",
                f"Supplemental Course Source: {source_title}",
                source_text,
            ]
        ),
        "context": "supplemental course source knowledge",
        "document_id": f"course:{course_id}:source:{source_index}",
        "update_mode": "replace",
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


def _build_lesson_retain_document(
    *,
    course_id: str,
    course_title: str,
    tenant_id: str,
    lesson: dict[str, Any],
) -> dict[str, Any]:
    lesson_id = str(lesson.get("lessonId") or lesson.get("id") or "").strip()
    lesson_title = str(lesson.get("title") or "").strip()
    return {
        "content": _build_lesson_retain_content(lesson),
        "context": "published course lesson knowledge",
        "document_id": f"course:{course_id}:lesson:{lesson_id}",
        "update_mode": "replace",
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


def _ensure_hindsight_course_banks(
    *,
    client: httpx.Client,
    hindsight_url: str,
    headers: dict[str, str],
    tenant_id: str,
    course_id: str,
    requester_user_id: str = "",
) -> None:
    bank_id = _build_course_bank_id(tenant_id, course_id)
    bank_response = client.put(
        f"{hindsight_url}/v1/default/banks/{bank_id}",
        json=_build_course_bank_body(tenant_id=tenant_id, course_id=course_id),
        headers=headers,
    )
    bank_response.raise_for_status()

    if requester_user_id:
        user_scoped_bank_id = _build_user_course_bank_id(tenant_id, requester_user_id, course_id)
        user_bank_response = client.put(
            f"{hindsight_url}/v1/default/banks/{user_scoped_bank_id}",
            json=_build_course_bank_body(tenant_id=tenant_id, course_id=course_id),
            headers=headers,
        )
        user_bank_response.raise_for_status()


def _retain_documents_now(
    *,
    client: httpx.Client,
    hindsight_url: str,
    headers: dict[str, str],
    tenant_id: str,
    course_id: str,
    documents: list[dict[str, Any]],
) -> list[str]:
    if not documents:
        return []

    bank_id = _build_course_bank_id(tenant_id, course_id)
    retain_response = client.post(
        f"{hindsight_url}/v1/default/banks/{bank_id}/memories",
        json={"items": documents, "async": True},
        headers=headers,
    )
    retain_response.raise_for_status()
    payload = retain_response.json()
    operation_ids: list[str] = []
    if payload.get("operation_id"):
        operation_ids.append(str(payload["operation_id"]))
    operation_ids.extend(
        str(operation_id).strip()
        for operation_id in (payload.get("operation_ids") or [])
        if str(operation_id).strip()
    )
    return list(dict.fromkeys(operation_ids))


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


def _extract_support_documents_from_html(content: Any) -> list[dict[str, str]]:
    source = str(content or "")
    matches = re.findall(r'<a[^>]*href="([^"]+)"[^>]*>(.*?)</a>', source, flags=re.IGNORECASE)
    documents: list[dict[str, str]] = []

    for href, label in matches:
        title = _normalize_text(label) or _normalize_text(href.rsplit("/", 1)[-1])
        url = str(href).strip()
        lower = f"{title} {url}".lower()
        kind = "resource"
        if ".pdf" in lower:
            kind = "pdf"
        elif ".mp4" in lower or ".mov" in lower or ".avi" in lower:
            kind = "video"

        if title or url:
            documents.append(
                {
                    "title": title,
                    "url": url,
                    "kind": kind,
                }
            )

    return documents


def _enrich_lesson_support_documents(
    raw_documents: Any,
    fallback_html_content: Any,
    supplemental_sources: list[dict[str, str]],
) -> list[dict[str, str]]:
    documents = raw_documents if isinstance(raw_documents, list) else _extract_support_documents_from_html(fallback_html_content)
    source_text_by_title = {
        _normalize_text(source.get("title") or "").lower(): _normalize_text(source.get("text") or "")
        for source in supplemental_sources
        if isinstance(source, dict) and _normalize_text(source.get("title") or "")
    }

    enriched: list[dict[str, str]] = []
    for document in documents:
        if not isinstance(document, dict):
            continue
        title = _normalize_text(document.get("title") or "")
        url = str(document.get("url") or "").strip()
        kind = _normalize_text(document.get("kind") or "") or "resource"
        extracted_text = _normalize_text(document.get("extractedText") or document.get("extracted_text") or "")
        if not extracted_text and title:
            extracted_text = source_text_by_title.get(title.lower(), "")

        enriched.append(
            {
                "title": title or "Support document",
                "url": url,
                "kind": kind,
                "extractedText": extracted_text,
            }
        )

    return enriched


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


def _transcribe_video_lesson(
    *,
    client: httpx.Client,
    lesson: dict[str, Any],
    course_title: str,
    course_id: str,
    tenant_id: str,
    lesson_index: int,
    total_videos: int,
) -> tuple[dict[str, Any], dict[str, str] | None]:
    video_url = str(lesson.get("videoUrl") or lesson.get("video_url") or "").strip()
    video_source_ref = str(
        lesson.get("videoSourceRef") or lesson.get("video_source_ref") or video_url
    ).strip()
    lesson_id = str(lesson.get("id") or lesson.get("lessonId") or "").strip() or f"lesson-{lesson_index}"
    lesson_title = _normalize_text(lesson.get("title") or "") or f"Lesson {lesson_index}"

    if not video_url:
        return lesson, None

    _log(
        f"[Agno Course Memory Agent] Video {lesson_index}/{total_videos} transcription started: lesson={lesson_id} title={lesson_title}"
    )

    media_response = client.get(video_url, follow_redirects=True)
    media_response.raise_for_status()
    media_bytes = media_response.content
    file_name = _guess_filename_from_url(video_url, _slugify(lesson_title))
    media_type = media_response.headers.get("content-type") or mimetypes.guess_type(file_name)[0] or "video/mp4"

    transcript_response = client.post(
        f"{DEFAULT_STT_URL.rstrip('/')}/v1/audio/transcriptions",
        files={"file": (file_name, media_bytes, media_type)},
        data={"response_format": "verbose_json", "model": DEFAULT_STT_MODEL},
        timeout=1800.0,
    )
    transcript_response.raise_for_status()
    transcript_payload = transcript_response.json()
    transcript_text = _normalize_text(transcript_payload.get("text") or "")
    if not transcript_text:
        raise RuntimeError(f"No transcript text returned for lesson {lesson_id}")

    pdf_bytes = _build_transcript_pdf(
        course_title=course_title,
        lesson_title=lesson_title,
        transcript_text=transcript_text,
        source_url=video_source_ref,
    )
    pdf_title = f"{lesson_title} Transcript.pdf"
    pdf_object_name = upload_file_tenant(
        "course-pdfs",
        tenant_id,
        "courses",
        course_id,
        "video-transcripts",
        f"{lesson_id}.pdf",
        file_data=pdf_bytes,
        content_type="application/pdf",
    )
    transcript_pdf_url = f"minio://course-pdfs/{pdf_object_name}"

    support_documents = list(lesson.get("support_documents") or lesson.get("supportDocuments") or [])
    support_documents.append(
        {
            "title": pdf_title,
            "url": transcript_pdf_url,
            "kind": "pdf",
            "extractedText": transcript_text,
        }
    )

    updated_lesson = {
        **lesson,
        "support_documents": support_documents,
        "supportDocuments": support_documents,
        "videoTranscriptText": transcript_text,
        "videoTranscriptPdfUrl": transcript_pdf_url,
        "videoSourceRef": video_source_ref,
    }
    supplemental_source = {
        "title": pdf_title,
        "kind": "course_video_transcript_pdf",
        "text": transcript_text,
    }
    _log(
        f"[Agno Course Memory Agent] Video {lesson_index}/{total_videos} transcription completed: lesson={lesson_id} pdf=minio://course-pdfs/{pdf_object_name}"
    )
    return updated_lesson, supplemental_source


def _augment_traditional_course_with_video_transcripts(
    *,
    course: dict[str, Any],
    auth_token: str,
    supplemental_sources: list[dict[str, str]],
    hindsight_url: str,
    hindsight_api_key: str,
    requester_user_id: str = "",
) -> tuple[dict[str, Any], list[dict[str, str]], list[str], list[str]]:
    tenant_id = str(course.get("tenant_id") or "").strip()
    course_id = str(course.get("id") or "").strip()
    course_title = _normalize_text(course.get("title") or "") or "Untitled course"
    if not tenant_id or not course_id:
        return course, supplemental_sources, [], []

    lessons_with_video: list[tuple[int, dict[str, Any]]] = []
    for module in course.get("modules") or []:
        for lesson in module.get("lessons") or []:
            video_url = str(lesson.get("video_url") or lesson.get("videoUrl") or "").strip()
            if video_url and _normalize_text(lesson.get("content_type") or lesson.get("contentType") or "").lower() == "video":
                lessons_with_video.append((len(lessons_with_video) + 1, lesson))

    if not lessons_with_video:
        return course, supplemental_sources, [], []

    _log(
        f"[Agno Course Memory Agent] Starting traditional video transcript pipeline for course {course_id} with {len(lessons_with_video)} video lesson(s)."
    )
    updated_sources = list(supplemental_sources)
    pre_retained_document_ids: list[str] = []
    pre_retain_operation_ids: list[str] = []
    headers = {"Authorization": f"Bearer {auth_token}"}
    hindsight_headers = {"Content-Type": "application/json"}
    if hindsight_api_key:
        hindsight_headers["Authorization"] = f"Bearer {hindsight_api_key}"

    with httpx.Client(headers=headers, timeout=300.0) as client:
        _ensure_hindsight_course_banks(
            client=client,
            hindsight_url=hindsight_url,
            headers=hindsight_headers,
            tenant_id=tenant_id,
            course_id=course_id,
            requester_user_id=requester_user_id,
        )
        for lesson_index, lesson in lessons_with_video:
            try:
                updated_lesson, supplemental_source = _transcribe_video_lesson(
                    client=client,
                    lesson=lesson,
                    course_title=course_title,
                    course_id=course_id,
                    tenant_id=tenant_id,
                    lesson_index=lesson_index,
                    total_videos=len(lessons_with_video),
                )
                lesson.update(updated_lesson)
                if supplemental_source:
                    source_index = len(updated_sources) + 1
                    updated_sources.append(supplemental_source)
                    lesson_retain_payload = {
                        "lessonId": updated_lesson.get("id") or updated_lesson.get("lessonId"),
                        "moduleId": updated_lesson.get("module_id") or updated_lesson.get("moduleId"),
                        "moduleTitle": updated_lesson.get("module_title") or updated_lesson.get("moduleTitle"),
                        "courseId": course_id,
                        "courseTitle": course_title,
                        "title": updated_lesson.get("title"),
                        "contentType": updated_lesson.get("content_type") or updated_lesson.get("contentType"),
                        "assessmentId": updated_lesson.get("assessment_id") or updated_lesson.get("assessmentId"),
                        "duration": updated_lesson.get("duration"),
                        "content": updated_lesson.get("content"),
                        "cleanedHtmlContent": _normalize_text(updated_lesson.get("content") or ""),
                        "supportDocuments": _enrich_lesson_support_documents(
                            updated_lesson.get("support_documents") or updated_lesson.get("supportDocuments"),
                            updated_lesson.get("content"),
                            updated_sources,
                        ),
                        "teacherParoles": [],
                        "explanations": [],
                        "quizQuestions": [],
                    }
                    lesson_document = _build_lesson_retain_document(
                        course_id=course_id,
                        course_title=course_title,
                        tenant_id=tenant_id,
                        lesson=lesson_retain_payload,
                    )
                    source_document = _build_source_retain_document(
                        course_id=course_id,
                        course_title=course_title,
                        tenant_id=tenant_id,
                        source=supplemental_source,
                        source_index=source_index,
                    )
                    if source_document is not None:
                        lesson_document_id = str(lesson_document.get("document_id") or "").strip()
                        source_document_id = str(source_document.get("document_id") or "").strip()
                        _log(
                            f"[Agno Course Memory Agent] Starting immediate lesson retain operation for {lesson_document_id}."
                        )
                        lesson_operation_ids = _retain_documents_now(
                            client=client,
                            hindsight_url=hindsight_url,
                            headers=hindsight_headers,
                            tenant_id=tenant_id,
                            course_id=course_id,
                            documents=[lesson_document],
                        )
                        _log(
                            f"[Agno Course Memory Agent] Completed immediate lesson retain operation for {lesson_document_id}. operation_ids={', '.join(lesson_operation_ids) if lesson_operation_ids else 'none'}"
                        )
                        _log(
                            f"[Agno Course Memory Agent] Starting immediate supplemental source retain operation for {source_document_id}."
                        )
                        source_operation_ids = _retain_documents_now(
                            client=client,
                            hindsight_url=hindsight_url,
                            headers=hindsight_headers,
                            tenant_id=tenant_id,
                            course_id=course_id,
                            documents=[source_document],
                        )
                        _log(
                            f"[Agno Course Memory Agent] Completed immediate supplemental source retain operation for {source_document_id}. operation_ids={', '.join(source_operation_ids) if source_operation_ids else 'none'}"
                        )
                        pre_retained_document_ids.extend([lesson_document_id, source_document_id])
                        pre_retain_operation_ids.extend(lesson_operation_ids)
                        pre_retain_operation_ids.extend(source_operation_ids)
            except Exception as exc:
                lesson_id = str(lesson.get("id") or "").strip() or f"lesson-{lesson_index}"
                _log(
                    f"[Agno Course Memory Agent] Video {lesson_index}/{len(lessons_with_video)} transcription failed: lesson={lesson_id} error={exc}"
                )

    _log(f"[Agno Course Memory Agent] Traditional video transcript pipeline finished for course {course_id}.")
    return (
        course,
        updated_sources,
        list(dict.fromkeys(pre_retained_document_ids)),
        list(dict.fromkeys(pre_retain_operation_ids)),
    )


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

    found_existing_course_bank = False
    bank_check_status = 0
    effective_tenant_id = str(payload.tenantId or "").strip()
    hindsight_url = payload.hindsightApiUrl or DEFAULT_HINDSIGHT_URL
    hindsight_api_key = payload.hindsightApiKey or DEFAULT_HINDSIGHT_API_KEY
    if effective_tenant_id:
        course_bank_id = _build_course_bank_id(effective_tenant_id, payload.courseId)
        headers: dict[str, str] = {}
        if hindsight_api_key:
            headers["Authorization"] = f"Bearer {hindsight_api_key}"
        with httpx.Client(timeout=60.0) as client:
            found_existing_course_bank, bank_check_status = _check_course_bank_exists(
                client=client,
                hindsight_url=hindsight_url,
                bank_id=course_bank_id,
                headers=headers,
            )
        _log(
            f"[Agno Course Memory Agent] Course bank existence check for {course_bank_id}: {'already exists' if found_existing_course_bank else 'not found'} (status={bank_check_status})."
        )
        if found_existing_course_bank and not payload.forceRetention:
            _log(
                f"[Agno Course Memory Agent] Course {payload.courseId} already exists in Hindsight memory; collection and retain workflow skipped."
            )
            return StepOutput(
                content={
                    "success": True,
                    "workflowName": "course-memory-agent",
                    "action": "assemble_published_course",
                    "courseId": payload.courseId,
                    "hindsightApiUrl": hindsight_url,
                    "hindsightApiKey": hindsight_api_key,
                    "previewMode": payload.previewMode,
                    "forceRetention": payload.forceRetention,
                    "foundExistingCourseBank": True,
                    "bankExistenceCheckStatus": bank_check_status,
                    "bankId": course_bank_id,
                    "skipCourseRetention": True,
                },
                success=True,
            )

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

    supplemental_sources = _normalize_supplemental_sources(payload.supplementalSources)
    course = response.json()
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
    course, supplemental_sources, pre_retained_document_ids, pre_retain_operation_ids = _augment_traditional_course_with_video_transcripts(
        course=course,
        auth_token=payload.authToken,
        supplemental_sources=supplemental_sources,
        hindsight_url=hindsight_url,
        hindsight_api_key=hindsight_api_key,
        requester_user_id=str(payload.requesterUserId or "").strip(),
    )
    modules = course.get("modules") or []
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
                            "videoUrl": lesson.get("video_url") or lesson.get("videoUrl"),
                            "videoSourceRef": lesson.get("video_source_ref") or lesson.get("videoSourceRef"),
                            "assessmentId": assessment_id or None,
                            "duration": lesson.get("duration"),
                            "content": lesson.get("content"),
                            "supportDocuments": _enrich_lesson_support_documents(
                                lesson.get("support_documents") or lesson.get("supportDocuments"),
                                lesson.get("content"),
                                supplemental_sources,
                            ),
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

        # Verbose assembly logs are intentionally muted to keep publish output concise.

        return StepOutput(
            content={
                "success": True,
                "workflowName": "course-memory-agent",
                "action": "assemble_published_course",
                "courseId": payload.courseId,
                "learningApiUrl": payload.learningApiUrl,
                "assembledPayload": assembled_payload,
                "hindsightApiUrl": hindsight_url,
                "hindsightApiKey": hindsight_api_key,
                "previewMode": payload.previewMode,
                "forceRetention": payload.forceRetention,
                "foundExistingCourseBank": found_existing_course_bank,
                "bankExistenceCheckStatus": bank_check_status,
                "preRetainedDocumentIds": pre_retained_document_ids,
                "preRetainOperationIds": pre_retain_operation_ids,
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
                    "videoUrl": lesson.get("video_url") or lesson.get("videoUrl"),
                    "videoSourceRef": lesson.get("video_source_ref") or lesson.get("videoSourceRef"),
                    "duration": lesson.get("duration"),
                    "content": lesson.get("content"),
                    "supportDocuments": _enrich_lesson_support_documents(
                        lesson.get("support_documents") or lesson.get("supportDocuments"),
                        lesson.get("content"),
                        supplemental_sources,
                    ),
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

    # Verbose assembly logs are intentionally muted to keep publish output concise.

    return StepOutput(
        content={
            "success": True,
            "workflowName": "course-memory-agent",
            "action": "assemble_published_course",
            "courseId": payload.courseId,
            "learningApiUrl": payload.learningApiUrl,
            "assembledPayload": assembled_payload,
            "hindsightApiUrl": hindsight_url,
            "hindsightApiKey": hindsight_api_key,
            "previewMode": payload.previewMode,
            "forceRetention": payload.forceRetention,
            "foundExistingCourseBank": found_existing_course_bank,
            "bankExistenceCheckStatus": bank_check_status,
            "preRetainedDocumentIds": pre_retained_document_ids,
            "preRetainOperationIds": pre_retain_operation_ids,
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

    if bool(previous_content.get("skipCourseRetention")):
        return StepOutput(
            content={
                **previous_content,
                "action": "clean_course_content",
            },
            success=True,
        )

    assembled_payload = previous_content.get("assembledPayload")
    if not isinstance(assembled_payload, dict):
        return StepOutput(
            content={"success": False, "error": "Assembled course payload is invalid."},
            success=False,
            error="Assembled course payload is invalid.",
        )

    if str(assembled_payload.get("contentStrategy") or "").strip() == "traditional":
        # Traditional cleanup skip log muted to avoid noisy publish output.
        normalized_sources = _normalize_supplemental_sources(assembled_payload.get("supplementalSources"))
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
            "lessons": [
                {
                    **lesson,
                    "cleanedHtmlContent": _normalize_text(lesson.get("content") or ""),
                    "supportDocuments": _enrich_lesson_support_documents(
                        lesson.get("supportDocuments"),
                        lesson.get("content"),
                        normalized_sources,
                    ),
                }
                for lesson in (assembled_payload.get("lessons") or [])
                if isinstance(lesson, dict)
            ],
            "supplementalSources": normalized_sources,
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
            "cleanedHtmlContent": _normalize_text(lesson.get("content") or ""),
            "supportDocuments": _enrich_lesson_support_documents(
                lesson.get("supportDocuments"),
                lesson.get("content"),
                _normalize_supplemental_sources(assembled_payload.get("supplementalSources")),
            ),
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
        "explanations": assembled_payload.get("explanations") or [],
        "lessons": cleaned_lessons,
        "supplementalSources": _normalize_supplemental_sources(
            assembled_payload.get("supplementalSources")
        ),
    }

    total_quiz_questions = sum(
        len(lesson.get("quizQuestions") or []) for lesson in cleaned_lessons if isinstance(lesson, dict)
    )
    # Verbose cleanup logs are intentionally muted to keep publish output concise.

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

    if bool(previous_content.get("skipCourseRetention")):
        return StepOutput(
            content={
                **previous_content,
                "action": "build_retention_documents",
            },
            success=True,
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
            "update_mode": "replace",
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

    overview_preview = _format_course_overview_preview(documents[0], cleaned_payload)

    preview_mode = str(previous_content.get("previewMode") or "").strip().lower()
    if preview_mode == "overview_preview_only":
        _log("[Agno Course Memory Agent] Prepared course overview retain preview:")
        _log(overview_preview)
        return StepOutput(
            content={
                **previous_content,
                "action": "build_retention_documents",
                "retentionDocuments": documents,
                "previewOnly": True,
                "previewDocument": documents[0],
                "overviewPreviewText": overview_preview,
            },
            success=True,
        )

    # Verbose retention-build logs are intentionally muted to keep publish output concise.

    source_preview_texts: list[str] = []
    quiz_preview_texts: list[str] = []

    for index, source in enumerate(cleaned_payload.get("supplementalSources") or []):
        if not isinstance(source, dict):
            continue

        source_title = _normalize_text(source.get("title") or "") or f"Supplemental Source {index + 1}"
        source_kind = _normalize_text(source.get("kind") or "") or "supplemental_course_source"
        source_text = _normalize_text(source.get("text") or "")
        if not source_text:
            continue

        source_document = {
            "content": "\n".join(
                [
                    f"Course Title: {course_title}",
                    f"Supplemental Course Source: {source_title}",
                    source_text,
                ]
            ),
            "context": "supplemental course source knowledge",
            "document_id": f"course:{course_id}:source:{index + 1}",
            "update_mode": "replace",
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
        documents.append(source_document)
        source_preview_texts.append(_format_supplemental_source_preview(source_document, source, course_id, index))

    if content_strategy != "ai_generated":
        # Traditional retention detail logs are intentionally muted.
        pass

    lesson_preview_texts: list[str] = []

    for lesson in cleaned_payload.get("lessons") or []:
        if not isinstance(lesson, dict):
            continue

        lesson_id = str(lesson.get("lessonId") or "").strip()
        lesson_title = str(lesson.get("title") or "").strip()

        if _is_quiz_lesson(lesson):
            quiz_document = {
                "content": _build_quiz_retain_content(course_title, lesson),
                "context": "published course quiz knowledge",
                "document_id": f"course:{course_id}:lesson:{lesson_id}:quiz",
                "update_mode": "replace",
                "metadata": _sanitize_string_dict(
                    {
                        "tenantId": tenant_id,
                        "courseId": course_id,
                        "courseTitle": course_title,
                        "lessonId": lesson_id,
                        "lessonTitle": lesson_title,
                        "assessmentId": lesson.get("assessmentId"),
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
            documents.append(quiz_document)
            quiz_preview_texts.append(_format_quiz_preview(quiz_document, lesson, course_id))
            continue

        lesson_document = {
            "content": _build_lesson_retain_content(lesson),
            "context": "published course lesson knowledge",
            "document_id": f"course:{course_id}:lesson:{lesson_id}",
            "update_mode": "replace",
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
        lesson_preview_texts.append(_format_lesson_preview(lesson_document, lesson, course_id))

    # Retention document preview is intentionally muted to avoid dumping payloads in the terminal.

    return StepOutput(
        content={
            **previous_content,
            "action": "build_retention_documents",
            "retentionDocuments": documents,
            "previewOnly": False,
            "overviewPreviewText": overview_preview,
            "lessonPreviewTexts": lesson_preview_texts,
            "quizPreviewTexts": quiz_preview_texts,
            "sourcePreviewTexts": source_preview_texts,
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

    if bool(previous_content.get("skipCourseRetention")):
        return StepOutput(
            content={
                **previous_content,
                "success": True,
                "action": "retain_documents_in_hindsight",
                "isAsync": False,
                "operationId": None,
                "operationIds": [],
            },
            success=True,
        )

    if bool(previous_content.get("previewOnly")):
        cleaned_payload = previous_content.get("cleanedPayload")
        preview_document = previous_content.get("previewDocument")
        return StepOutput(
            content={
                **previous_content,
                "success": True,
                "action": "retain_documents_in_hindsight",
                "courseId": cleaned_payload.get("courseId") if isinstance(cleaned_payload, dict) else None,
                "bankId": None,
                "previewOnly": True,
                "previewDocument": preview_document,
                "overviewPreviewText": previous_content.get("overviewPreviewText"),
                "lessonPreviewTexts": previous_content.get("lessonPreviewTexts") or [],
                "quizPreviewTexts": previous_content.get("quizPreviewTexts") or [],
                "sourcePreviewTexts": previous_content.get("sourcePreviewTexts") or [],
                "retainResponse": None,
            },
            success=True,
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
    requester_user_id = str(cleaned_payload.get("requesterUserId") or "").strip()
    user_scoped_bank_id = (
        _build_user_course_bank_id(tenant_id, requester_user_id, course_id) if requester_user_id else ""
    )

    retain_body = {
        "items": retention_documents,
        "async": True,
    }

    overview_preview = str(previous_content.get("overviewPreviewText") or "").strip()
    if overview_preview:
        _log("[Agno Course Memory Agent] Prepared course overview retain preview:")
        _log(overview_preview)
    lesson_preview_texts = previous_content.get("lessonPreviewTexts") or []
    for lesson_preview in lesson_preview_texts:
        preview_text = str(lesson_preview or "").strip()
        if not preview_text:
            continue
        _log("[Agno Course Memory Agent] Prepared lesson retain preview:")
        _log(preview_text)
    quiz_preview_texts = previous_content.get("quizPreviewTexts") or []
    for quiz_index, quiz_preview in enumerate(quiz_preview_texts, start=1):
        preview_text = str(quiz_preview or "").strip()
        if not preview_text:
            continue
        _log(f"[Agno Course Memory Agent] Prepared quiz {quiz_index} retain preview:")
        _log(preview_text)
    source_preview_texts = previous_content.get("sourcePreviewTexts") or []
    for source_index, source_preview in enumerate(source_preview_texts, start=1):
        preview_text = str(source_preview or "").strip()
        if not preview_text:
            continue
        _log(f"[Agno Course Memory Agent] Prepared supplemental source {source_index} retain preview:")
        _log(preview_text)

    headers = {"Content-Type": "application/json"}
    if hindsight_api_key:
        headers["Authorization"] = f"Bearer {hindsight_api_key}"

    pre_retained_document_ids = {
        str(document_id).strip()
        for document_id in (previous_content.get("preRetainedDocumentIds") or [])
        if str(document_id).strip()
    }
    pre_retain_operation_ids = [
        str(operation_id).strip()
        for operation_id in (previous_content.get("preRetainOperationIds") or [])
        if str(operation_id).strip()
    ]

    # Hindsight request payload logs are intentionally muted to avoid noisy terminal output.

    lesson_documents = [
        item
        for item in retention_documents
        if isinstance(item, dict)
        and str(item.get("document_id") or "").startswith(f"course:{course_id}:lesson:")
        and not str(item.get("document_id") or "").endswith(":quiz")
        and str(item.get("document_id") or "").strip() not in pre_retained_document_ids
    ]
    quiz_documents = [
        item
        for item in retention_documents
        if isinstance(item, dict)
        and str(item.get("document_id") or "").startswith(f"course:{course_id}:lesson:")
        and str(item.get("document_id") or "").endswith(":quiz")
    ]
    source_documents = [
        item
        for item in retention_documents
        if isinstance(item, dict)
        and str(item.get("document_id") or "").startswith(f"course:{course_id}:source:")
        and str(item.get("document_id") or "").strip() not in pre_retained_document_ids
    ]
    non_lesson_documents = [
        item
        for item in retention_documents
        if not (
            isinstance(item, dict)
            and str(item.get("document_id") or "").startswith(f"course:{course_id}:lesson:")
            and not str(item.get("document_id") or "").endswith(":quiz")
        )
        and not (
            isinstance(item, dict)
            and str(item.get("document_id") or "").startswith(f"course:{course_id}:lesson:")
            and str(item.get("document_id") or "").endswith(":quiz")
        )
        and not (
            isinstance(item, dict)
            and str(item.get("document_id") or "").startswith(f"course:{course_id}:source:")
        )
    ]

    operation_ids_collected: list[str] = list(pre_retain_operation_ids)
    retain_responses: list[dict[str, Any]] = []
    is_async = False

    with httpx.Client(timeout=120.0) as client:
        bank_response = client.put(
            f"{hindsight_url}/v1/default/banks/{bank_id}",
            json=_build_course_bank_body(tenant_id=tenant_id, course_id=course_id),
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

        if user_scoped_bank_id:
            user_bank_response = client.put(
                f"{hindsight_url}/v1/default/banks/{user_scoped_bank_id}",
                json=_build_course_bank_body(tenant_id=tenant_id, course_id=course_id),
                headers=headers,
            )
            if user_bank_response.status_code >= 400:
                _log("[Agno Course Memory Agent] Failed while creating/updating the user-scoped course bank.")
                _log(f"- Hindsight bank status: {user_bank_response.status_code}")
                _log(f"- Hindsight bank response: {user_bank_response.text}")
                return StepOutput(
                    content={
                        **previous_content,
                        "success": False,
                        "bankId": user_scoped_bank_id,
                        "error": f"Hindsight user-scoped bank creation failed with status {user_bank_response.status_code}",
                    },
                    success=False,
                    error=f"Hindsight user-scoped bank creation failed with status {user_bank_response.status_code}",
                )

        if non_lesson_documents:
            retain_response = client.post(
                f"{hindsight_url}/v1/default/banks/{bank_id}/memories",
                json={"items": non_lesson_documents, "async": True},
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
            retain_responses.append(retain_response_data)
            is_async = is_async or bool(retain_response_data.get("async"))
            if retain_response_data.get("operation_id"):
                operation_ids_collected.append(str(retain_response_data["operation_id"]))
            operation_ids_collected.extend(
                str(operation_id).strip()
                for operation_id in (retain_response_data.get("operation_ids") or [])
                if str(operation_id).strip()
            )

        for lesson_document in lesson_documents:
            lesson_document_id = str(lesson_document.get("document_id") or "").strip()
            _log(f"[Agno Course Memory Agent] Starting lesson retain operation for {lesson_document_id}.")
            lesson_retain_response = client.post(
                f"{hindsight_url}/v1/default/banks/{bank_id}/memories",
                json={"items": [lesson_document], "async": True},
                headers=headers,
            )

            if lesson_retain_response.status_code >= 400:
                _log("[Agno Course Memory Agent] Hindsight lesson retain failed.")
                _log(f"- Lesson document: {lesson_document_id}")
                _log(f"- Hindsight retain status: {lesson_retain_response.status_code}")
                _log(f"- Hindsight retain response: {lesson_retain_response.text}")
                _log("============================================================")
                _log("")
                return StepOutput(
                    content={
                        **previous_content,
                        "success": False,
                        "bankId": bank_id,
                        "retainResponseStatus": lesson_retain_response.status_code,
                        "retainResponseText": lesson_retain_response.text,
                    },
                    success=False,
                    error=f"Hindsight lesson retain failed with status {lesson_retain_response.status_code}",
                )

            lesson_retain_response_data = lesson_retain_response.json()
            retain_responses.append(lesson_retain_response_data)
            is_async = is_async or bool(lesson_retain_response_data.get("async"))
            lesson_operation_ids = []
            if lesson_retain_response_data.get("operation_id"):
                lesson_operation_ids.append(str(lesson_retain_response_data["operation_id"]))
            lesson_operation_ids.extend(
                str(operation_id).strip()
                for operation_id in (lesson_retain_response_data.get("operation_ids") or [])
                if str(operation_id).strip()
            )
            lesson_operation_ids = list(dict.fromkeys(lesson_operation_ids))
            operation_ids_collected.extend(lesson_operation_ids)
            _log(
                f"[Agno Course Memory Agent] Completed lesson retain operation for {lesson_document_id}. "
                f"operation_ids={', '.join(lesson_operation_ids) if lesson_operation_ids else 'none'}"
            )

        for quiz_document in quiz_documents:
            quiz_document_id = str(quiz_document.get("document_id") or "").strip()
            _log(f"[Agno Course Memory Agent] Starting quiz retain operation for {quiz_document_id}.")
            quiz_retain_response = client.post(
                f"{hindsight_url}/v1/default/banks/{bank_id}/memories",
                json={"items": [quiz_document], "async": True},
                headers=headers,
            )

            if quiz_retain_response.status_code >= 400:
                _log("[Agno Course Memory Agent] Hindsight quiz retain failed.")
                _log(f"- Quiz document: {quiz_document_id}")
                _log(f"- Hindsight retain status: {quiz_retain_response.status_code}")
                _log(f"- Hindsight retain response: {quiz_retain_response.text}")
                _log("============================================================")
                _log("")
                return StepOutput(
                    content={
                        **previous_content,
                        "success": False,
                        "bankId": bank_id,
                        "retainResponseStatus": quiz_retain_response.status_code,
                        "retainResponseText": quiz_retain_response.text,
                    },
                    success=False,
                    error=f"Hindsight quiz retain failed with status {quiz_retain_response.status_code}",
                )

            quiz_retain_response_data = quiz_retain_response.json()
            retain_responses.append(quiz_retain_response_data)
            is_async = is_async or bool(quiz_retain_response_data.get("async"))
            quiz_operation_ids = []
            if quiz_retain_response_data.get("operation_id"):
                quiz_operation_ids.append(str(quiz_retain_response_data["operation_id"]))
            quiz_operation_ids.extend(
                str(operation_id).strip()
                for operation_id in (quiz_retain_response_data.get("operation_ids") or [])
                if str(operation_id).strip()
            )
            quiz_operation_ids = list(dict.fromkeys(quiz_operation_ids))
            operation_ids_collected.extend(quiz_operation_ids)
            _log(
                f"[Agno Course Memory Agent] Completed quiz retain operation for {quiz_document_id}. "
                f"operation_ids={', '.join(quiz_operation_ids) if quiz_operation_ids else 'none'}"
            )

        for source_document in source_documents:
            source_document_id = str(source_document.get("document_id") or "").strip()
            _log(f"[Agno Course Memory Agent] Starting supplemental source retain operation for {source_document_id}.")
            source_retain_response = client.post(
                f"{hindsight_url}/v1/default/banks/{bank_id}/memories",
                json={"items": [source_document], "async": True},
                headers=headers,
            )

            if source_retain_response.status_code >= 400:
                _log("[Agno Course Memory Agent] Hindsight supplemental source retain failed.")
                _log(f"- Source document: {source_document_id}")
                _log(f"- Hindsight retain status: {source_retain_response.status_code}")
                _log(f"- Hindsight retain response: {source_retain_response.text}")
                _log("============================================================")
                _log("")
                return StepOutput(
                    content={
                        **previous_content,
                        "success": False,
                        "bankId": bank_id,
                        "retainResponseStatus": source_retain_response.status_code,
                        "retainResponseText": source_retain_response.text,
                    },
                    success=False,
                    error=f"Hindsight supplemental source retain failed with status {source_retain_response.status_code}",
                )

            source_retain_response_data = source_retain_response.json()
            retain_responses.append(source_retain_response_data)
            is_async = is_async or bool(source_retain_response_data.get("async"))
            source_operation_ids = []
            if source_retain_response_data.get("operation_id"):
                source_operation_ids.append(str(source_retain_response_data["operation_id"]))
            source_operation_ids.extend(
                str(operation_id).strip()
                for operation_id in (source_retain_response_data.get("operation_ids") or [])
                if str(operation_id).strip()
            )
            source_operation_ids = list(dict.fromkeys(source_operation_ids))
            operation_ids_collected.extend(source_operation_ids)
            _log(
                f"[Agno Course Memory Agent] Completed supplemental source retain operation for {source_document_id}. "
                f"operation_ids={', '.join(source_operation_ids) if source_operation_ids else 'none'}"
            )

    operation_ids = list(dict.fromkeys(operation_ids_collected))
    operation_id = operation_ids[0] if operation_ids else None

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
                "retainResponse": retain_responses[0] if retain_responses else retain_body,
                "retainResponses": retain_responses,
            },
            success=True,
    )


def delete_course_bank_in_hindsight(payload: CourseMemoryDeleteInput) -> dict[str, Any]:
    tenant_id = str(payload.tenantId or "").strip()
    course_id = str(payload.courseId or "").strip()
    requester_user_id = str(payload.requesterUserId or "").strip()
    hindsight_url = str(payload.hindsightApiUrl or DEFAULT_HINDSIGHT_URL).rstrip("/")
    hindsight_api_key = str(payload.hindsightApiKey or DEFAULT_HINDSIGHT_API_KEY)

    if not tenant_id:
        return {
            "success": False,
            "action": "delete_course_bank_in_hindsight",
            "courseId": course_id,
            "error": "Tenant ID is required to delete the course bank.",
        }

    if not course_id:
        return {
            "success": False,
            "action": "delete_course_bank_in_hindsight",
            "error": "Course ID is required to delete the course bank.",
        }

    bank_ids = [_build_course_bank_id(tenant_id, course_id)]
    if requester_user_id:
        bank_ids.append(_build_user_course_bank_id(tenant_id, requester_user_id, course_id))
    headers = {"Content-Type": "application/json"}
    if hindsight_api_key:
        headers["Authorization"] = f"Bearer {hindsight_api_key}"

    _log("[Agno Course Memory Agent] Starting action 'delete_course_bank'.")
    _log(f"- Hindsight URL: {hindsight_url}")
    for bank_id in bank_ids:
        _log(f"- Target bank ID: {bank_id}")

    deleted_bank_ids: list[str] = []
    deleted_document_ids: list[str] = []
    with httpx.Client(timeout=60.0) as client:
        for bank_id in bank_ids:
            _log(f"[Agno Course Memory Agent] Listing retained documents inside bank {bank_id}.")
            list_response = client.get(
                f"{hindsight_url}/v1/default/banks/{bank_id}/documents",
                headers=headers,
                params={"limit": 200, "offset": 0},
            )

            if list_response.status_code >= 400 and list_response.status_code != 404:
                _log("[Agno Course Memory Agent] Failed to list retained course documents before bank deletion.")
                _log(f"- Bank ID: {bank_id}")
                _log(f"- Hindsight list status: {list_response.status_code}")
                _log(f"- Hindsight list response: {list_response.text}")
                return {
                    "success": False,
                    "action": "delete_course_bank_in_hindsight",
                    "courseId": course_id,
                    "tenantId": tenant_id,
                    "bankId": bank_id,
                    "deletedBankIds": deleted_bank_ids,
                    "deletedDocumentIds": deleted_document_ids,
                    "error": f"Hindsight document listing failed with status {list_response.status_code}",
                }

            listed_document_ids = (
                []
                if list_response.status_code == 404
                else _extract_hindsight_document_ids(list_response.json())
            )

            if listed_document_ids:
                _log(
                    f"[Agno Course Memory Agent] Found {len(listed_document_ids)} retained course document(s) in bank {bank_id}."
                )
            else:
                _log(f"[Agno Course Memory Agent] No retained course documents found in bank {bank_id}.")

            for document_id in listed_document_ids:
                _log(
                    f"[Agno Course Memory Agent] Deleting retained course document {document_id} from bank {bank_id}."
                )
                delete_document_response = client.delete(
                    f"{hindsight_url}/v1/default/banks/{bank_id}/documents/{document_id}",
                    headers=headers,
                )

                if delete_document_response.status_code >= 400 and delete_document_response.status_code != 404:
                    _log("[Agno Course Memory Agent] Failed to delete a retained course document.")
                    _log(f"- Bank ID: {bank_id}")
                    _log(f"- Document ID: {document_id}")
                    _log(f"- Hindsight document delete status: {delete_document_response.status_code}")
                    _log(f"- Hindsight document delete response: {delete_document_response.text}")
                    return {
                        "success": False,
                        "action": "delete_course_bank_in_hindsight",
                        "courseId": course_id,
                        "tenantId": tenant_id,
                        "bankId": bank_id,
                        "deletedBankIds": deleted_bank_ids,
                        "deletedDocumentIds": deleted_document_ids,
                        "error": f"Hindsight document deletion failed with status {delete_document_response.status_code}",
                    }

                if delete_document_response.status_code != 404:
                    deleted_document_ids.append(f"{bank_id}:{document_id}")

            _log(f"[Agno Course Memory Agent] Deleting dedicated course bank {bank_id}.")
            response = client.delete(
                f"{hindsight_url}/v1/default/banks/{bank_id}",
                headers=headers,
            )

            if response.status_code >= 400 and response.status_code != 404:
                _log("[Agno Course Memory Agent] Failed to delete the dedicated course bank.")
                _log(f"- Bank ID: {bank_id}")
                _log(f"- Hindsight delete status: {response.status_code}")
                _log(f"- Hindsight delete response: {response.text}")
                return {
                    "success": False,
                    "action": "delete_course_bank_in_hindsight",
                    "courseId": course_id,
                    "tenantId": tenant_id,
                    "bankId": bank_id,
                    "deletedBankIds": deleted_bank_ids,
                    "deletedDocumentIds": deleted_document_ids,
                    "error": f"Hindsight bank deletion failed with status {response.status_code}",
                }
            if response.status_code != 404:
                deleted_bank_ids.append(bank_id)

    _log("[Agno Course Memory Agent] Finished action 'delete_course_bank'.")
    return {
        "success": True,
        "action": "delete_course_bank_in_hindsight",
        "courseId": course_id,
        "tenantId": tenant_id,
        "bankId": bank_ids[0],
        "deleted": len(deleted_bank_ids) > 0,
        "deletedBankIds": deleted_bank_ids,
        "deletedDocumentIds": deleted_document_ids,
    }


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
