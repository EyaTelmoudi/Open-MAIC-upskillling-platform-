from __future__ import annotations

import importlib.util
import sys
import types
import unittest
from pathlib import Path
from unittest.mock import patch


WORKFLOW_PATH = Path(__file__).resolve().parents[1] / "app" / "workflow.py"
agno_module = types.ModuleType("agno")
agno_workflow_module = types.ModuleType("agno.workflow")


class _Step:
    def __init__(self, *args, **kwargs) -> None:
        self.args = args
        self.kwargs = kwargs


class _StepInput:
    def __init__(self, input=None, previous_step_content=None) -> None:
        self.input = input
        self.previous_step_content = previous_step_content


class _StepOutput:
    def __init__(self, content=None, success=False, error=None) -> None:
        self.content = content
        self.success = success
        self.error = error


class _Workflow:
    def __init__(self, *args, **kwargs) -> None:
        self.args = args
        self.kwargs = kwargs


agno_workflow_module.Step = _Step
agno_workflow_module.StepInput = _StepInput
agno_workflow_module.StepOutput = _StepOutput
agno_workflow_module.Workflow = _Workflow
agno_module.workflow = agno_workflow_module
sys.modules.setdefault("agno", agno_module)
sys.modules["agno.workflow"] = agno_workflow_module

SPEC = importlib.util.spec_from_file_location("course_memory_workflow", WORKFLOW_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load workflow module from {WORKFLOW_PATH}")
workflow = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(workflow)


class FakeResponse:
    def __init__(self, status_code: int, payload: object) -> None:
        self.status_code = status_code
        self._payload = payload
        self.text = payload if isinstance(payload, str) else str(payload)

    def json(self):
        return self._payload


class FakeHttpxClient:
    def __init__(self, **kwargs) -> None:
        self.kwargs = kwargs

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        return None

    def get(self, url: str, *, headers=None, params=None):
        if url.endswith("/profile"):
            return FakeResponse(404, {"detail": "Not Found"})
        if url.endswith("/memory-curriculum"):
            return FakeResponse(
                200,
                {
                    "id": "course-1",
                    "tenant_id": "tenant-1",
                    "title": "AI Spec",
                    "description": "AI Spec",
                    "category": "Programming",
                    "difficulty": "Beginner",
                    "duration": 5,
                    "xp_reward": 500,
                    "modules": [
                        {
                            "id": "module-1",
                            "title": "Module 1",
                            "description": "Overview",
                            "order": 1,
                            "lessons": [
                                {
                                    "id": "lesson-1",
                                    "title": "Lesson 1",
                                    "content": "Lesson summary",
                                    "content_type": "video",
                                    "duration": 5,
                                    "order": 1,
                                }
                            ],
                        }
                    ],
                },
            )
        if url.endswith("/assessments"):
            return FakeResponse(200, [])
        if url.endswith("/documents"):
            return FakeResponse(
                200,
                {
                    "items": [
                        {"id": "course:course-1:source:1"},
                    ]
                },
            )
        if url.endswith("/documents/course:course-1:source:1"):
            return FakeResponse(
                200,
                {
                    "original_text": (
                        "Course Title: AI Spec\n"
                        "Supplemental Course Source: Spec Driven Development.pdf\n"
                        "The main risk is technical debt and spaghetti code."
                    )
                },
            )
        raise AssertionError(f"Unexpected URL: {url}")


class CourseMemoryWorkflowTests(unittest.TestCase):
    def test_build_retention_documents_prepares_overview_with_replace_mode(self) -> None:
        step_input = _StepInput(
            previous_step_content={
                "previewMode": "overview_preview_only",
                "cleanedPayload": {
                    "courseId": "course-1",
                    "tenantId": "tenant-1",
                    "title": "AI Spec",
                    "description": "Course description",
                    "difficulty": "Beginner",
                    "duration": 5,
                    "category": "Programming",
                    "modulesCount": 1,
                    "modules": [
                        {
                            "title": "Module 1",
                        }
                    ],
                    "explanations": ["Understand specification-first delivery."],
                    "lessons": [],
                    "supplementalSources": [],
                },
            }
        )

        result = workflow.build_retention_documents(step_input)

        self.assertTrue(result.success)
        preview_document = result.content["previewDocument"]
        self.assertEqual(preview_document["document_id"], "course:course-1:overview")
        self.assertEqual(preview_document["update_mode"], "replace")
        self.assertIn(
            "Contenu du premier retain de course overview",
            result.content["overviewPreviewText"],
        )
        self.assertIn("document_id: course:course-1:overview", result.content["overviewPreviewText"])
        self.assertIn("update_mode: replace", result.content["overviewPreviewText"])

    def test_build_retention_documents_prepares_one_replace_document_per_lesson(self) -> None:
        step_input = _StepInput(
            previous_step_content={
                "cleanedPayload": {
                    "courseId": "course-1",
                    "tenantId": "tenant-1",
                    "title": "AI Spec",
                    "description": "Course description",
                    "difficulty": "Beginner",
                    "duration": 5,
                    "category": "Programming",
                    "modulesCount": 1,
                    "modules": [{"title": "Module 1"}],
                    "lessons": [
                        {
                            "lessonId": "lesson-1",
                            "title": "Lesson 1",
                            "cleanedHtmlContent": "Clean lesson body",
                            "contentType": "video",
                            "duration": 7,
                            "moduleId": "module-1",
                            "moduleTitle": "Module 1",
                            "assessmentId": None,
                            "supportDocuments": [
                                {
                                    "title": "Spec Driven Development.pdf",
                                    "kind": "pdf",
                                    "extractedText": "Support material extracted text",
                                }
                            ],
                            "quizQuestions": [],
                        },
                        {
                            "lessonId": "lesson-2",
                            "title": "Lesson 2",
                            "cleanedHtmlContent": "Second lesson body",
                            "contentType": "quiz",
                            "duration": 3,
                            "moduleId": "module-1",
                            "moduleTitle": "Module 1",
                            "assessmentId": "assessment-2",
                            "quizQuestions": [],
                        },
                    ],
                    "supplementalSources": [],
                },
            }
        )

        result = workflow.build_retention_documents(step_input)

        self.assertTrue(result.success)
        lesson_documents = [
            item
            for item in result.content["retentionDocuments"]
            if item["document_id"].startswith("course:course-1:lesson:")
            and not item["document_id"].endswith(":quiz")
        ]
        quiz_documents = [
            item
            for item in result.content["retentionDocuments"]
            if item["document_id"].endswith(":quiz")
        ]
        self.assertEqual(len(lesson_documents), 1)
        self.assertEqual(len(quiz_documents), 1)
        self.assertEqual(lesson_documents[0]["update_mode"], "replace")
        self.assertIn("Lesson Title: Lesson 1", lesson_documents[0]["content"])
        self.assertIn("Lesson Content: Clean lesson body", lesson_documents[0]["content"])
        self.assertIn("Lesson Type: video", lesson_documents[0]["content"])
        self.assertIn("Lesson Duration (minutes): 7", lesson_documents[0]["content"])
        self.assertIn("Lesson Support Materials:", lesson_documents[0]["content"])
        self.assertIn("Extracted Content: Support material extracted text", lesson_documents[0]["content"])
        self.assertEqual(len(result.content["lessonPreviewTexts"]), 1)
        self.assertIn(
            "document_id: course:course-1:lesson:lesson-1",
            result.content["lessonPreviewTexts"][0],
        )
        self.assertIn("contenu HTML nettoye: Clean lesson body", result.content["lessonPreviewTexts"][0])
        self.assertIn("contenu extrait: Support material extracted text", result.content["lessonPreviewTexts"][0])
        self.assertEqual(len(result.content["quizPreviewTexts"]), 1)
        self.assertIn(
            "document_id: course:course-1:lesson:lesson-2:quiz",
            result.content["quizPreviewTexts"][0],
        )
        self.assertIn("Quiz Content", result.content["quizPreviewTexts"][0])

    def test_retain_documents_in_hindsight_separates_lesson_quiz_and_source_operations(self) -> None:
        class RecordingHttpxClient:
            def __init__(self, **kwargs) -> None:
                self.calls: list[tuple[str, str, object]] = []

            def __enter__(self):
                return self

            def __exit__(self, exc_type, exc, tb):
                return None

            def put(self, url: str, *, json=None, headers=None):
                self.calls.append(("PUT", url, json))
                return FakeResponse(200, {"success": True})

            def post(self, url: str, *, json=None, headers=None):
                self.calls.append(("POST", url, json))
                items = (json or {}).get("items") or []
                document_id = items[0].get("document_id") if items and isinstance(items[0], dict) else "unknown"
                suffix = document_id.split(":")[-1]
                return FakeResponse(200, {"async": True, "operation_id": f"op-{suffix}"})

        step_input = _StepInput(
            previous_step_content={
                "cleanedPayload": {
                    "courseId": "course-1",
                    "tenantId": "tenant-1",
                    "requesterUserId": None,
                },
                "retentionDocuments": [
                    {"document_id": "course:course-1:overview", "content": "overview"},
                    {"document_id": "course:course-1:lesson:lesson-1", "content": "lesson"},
                    {"document_id": "course:course-1:lesson:lesson-2:quiz", "content": "quiz"},
                    {"document_id": "course:course-1:source:1", "content": "source"},
                ],
                "overviewPreviewText": "overview preview",
                "lessonPreviewTexts": ["lesson preview"],
                "quizPreviewTexts": ["quiz preview"],
                "sourcePreviewTexts": ["source preview"],
                "hindsightApiUrl": "http://127.0.0.1:8888",
                "hindsightApiKey": "",
            }
        )

        with patch.object(workflow.httpx, "Client", RecordingHttpxClient):
            result = workflow.retain_documents_in_hindsight(step_input)

        self.assertTrue(result.success)
        self.assertEqual(
            result.content["operationIds"],
            ["op-overview", "op-lesson-1", "op-quiz", "op-1"],
        )

    def test_assemble_recovers_existing_supplemental_source_from_hindsight(self) -> None:
        step_input = _StepInput(
            input={
                "courseId": "course-1",
                "learningApiUrl": "http://learning/api/v1/courses/course-1",
                "authToken": "token",
                "tenantId": "tenant-1",
                "hindsightApiUrl": "http://127.0.0.1:8888",
            }
        )

        with patch.object(workflow, "httpx") as mock_httpx:
            mock_httpx.Client.side_effect = lambda **kwargs: FakeHttpxClient(**kwargs)

            result = workflow.assemble_course_memory_payload(step_input)

        self.assertTrue(result.success)
        assembled_payload = result.content["assembledPayload"]
        self.assertEqual(len(assembled_payload["supplementalSources"]), 1)
        self.assertEqual(
            assembled_payload["supplementalSources"][0]["title"],
            "Spec Driven Development.pdf",
        )
        self.assertIn(
            "technical debt and spaghetti code",
            assembled_payload["supplementalSources"][0]["text"],
        )

    def test_assemble_reports_existing_course_bank_before_continuing(self) -> None:
        checked_bank_profile_urls: list[str] = []
        learning_urls: list[str] = []

        class ExistingBankClient(FakeHttpxClient):
            def get(self, url: str, *, headers=None, params=None):
                if url.endswith("/profile"):
                    checked_bank_profile_urls.append(url)
                    return FakeResponse(
                        200,
                        {
                            "bank_id": "tenant:tenant-1:course:course-1",
                            "name": "Tenant tenant-1 Course course-1",
                        },
                    )
                learning_urls.append(url)
                return super().get(url, headers=headers, params=params)

        step_input = _StepInput(
            input={
                "courseId": "course-1",
                "learningApiUrl": "http://learning/api/v1/courses/course-1",
                "authToken": "token",
                "tenantId": "tenant-1",
                "hindsightApiUrl": "http://127.0.0.1:8888",
            }
        )

        with patch.object(workflow, "httpx") as mock_httpx:
            mock_httpx.Client.side_effect = lambda **kwargs: ExistingBankClient(**kwargs)

            result = workflow.assemble_course_memory_payload(step_input)

        self.assertTrue(result.success)
        self.assertTrue(result.content["foundExistingCourseBank"])
        self.assertEqual(result.content["bankExistenceCheckStatus"], 200)
        self.assertTrue(result.content["skipCourseRetention"])
        self.assertEqual(learning_urls, [])
        self.assertEqual(
            checked_bank_profile_urls,
            ["http://127.0.0.1:8888/v1/default/banks/tenant:tenant-1:course:course-1/profile"],
        )

    def test_assemble_forced_retention_continues_even_when_bank_exists(self) -> None:
        checked_bank_profile_urls: list[str] = []
        learning_urls: list[str] = []

        class ExistingBankClient(FakeHttpxClient):
            def get(self, url: str, *, headers=None, params=None):
                if url.endswith("/profile"):
                    checked_bank_profile_urls.append(url)
                    return FakeResponse(
                        200,
                        {
                            "bank_id": "tenant:tenant-1:course:course-1",
                            "name": "Tenant tenant-1 Course course-1",
                        },
                    )
                learning_urls.append(url)
                return super().get(url, headers=headers, params=params)

        step_input = _StepInput(
            input={
                "courseId": "course-1",
                "learningApiUrl": "http://learning/api/v1/courses/course-1",
                "authToken": "token",
                "tenantId": "tenant-1",
                "hindsightApiUrl": "http://127.0.0.1:8888",
                "forceRetention": True,
            }
        )

        with patch.object(workflow, "httpx") as mock_httpx:
            mock_httpx.Client.side_effect = lambda **kwargs: ExistingBankClient(**kwargs)

            result = workflow.assemble_course_memory_payload(step_input)

        self.assertTrue(result.success)
        self.assertFalse(bool(result.content.get("skipCourseRetention")))
        self.assertTrue(result.content["foundExistingCourseBank"])
        self.assertIn("http://learning/api/v1/courses/course-1/memory-curriculum", learning_urls)
        self.assertEqual(
            checked_bank_profile_urls,
            ["http://127.0.0.1:8888/v1/default/banks/tenant:tenant-1:course:course-1/profile"],
        )

    def test_delete_course_bank_targets_dedicated_tenant_course_bank(self) -> None:
        delete_calls: list[tuple[str, str]] = []
        get_calls: list[tuple[str, str]] = []

        class DeleteOnlyClient(FakeHttpxClient):
            def get(self, url: str, *, headers=None, params=None):
                get_calls.append((url, headers.get("Authorization", "")))
                return FakeResponse(
                    200,
                    {
                        "items": [
                            {"id": "course:course-42:overview"},
                            {"id": "course:course-42:lesson:lesson-1"},
                        ]
                    },
                )

            def delete(self, url: str, *, headers=None):
                delete_calls.append((url, headers.get("Authorization", "")))
                return FakeResponse(200, {"success": True})

        payload = workflow.CourseMemoryDeleteInput(
            courseId="course-42",
            tenantId="tenant-9",
            hindsightApiUrl="http://127.0.0.1:8888",
            hindsightApiKey="secret",
        )

        with patch.object(workflow, "httpx") as mock_httpx:
            mock_httpx.Client.side_effect = lambda **kwargs: DeleteOnlyClient(**kwargs)

            result = workflow.delete_course_bank_in_hindsight(payload)

        self.assertTrue(result["success"])
        self.assertEqual(result["bankId"], "tenant:tenant-9:course:course-42")
        self.assertEqual(
            result["deletedDocumentIds"],
            [
                "tenant:tenant-9:course:course-42:course:course-42:overview",
                "tenant:tenant-9:course:course-42:course:course-42:lesson:lesson-1",
            ],
        )
        self.assertEqual(
            get_calls,
            [("http://127.0.0.1:8888/v1/default/banks/tenant:tenant-9:course:course-42/documents", "Bearer secret")],
        )
        self.assertEqual(
            delete_calls,
            [
                (
                    "http://127.0.0.1:8888/v1/default/banks/tenant:tenant-9:course:course-42/documents/course:course-42:overview",
                    "Bearer secret",
                ),
                (
                    "http://127.0.0.1:8888/v1/default/banks/tenant:tenant-9:course:course-42/documents/course:course-42:lesson:lesson-1",
                    "Bearer secret",
                ),
                ("http://127.0.0.1:8888/v1/default/banks/tenant:tenant-9:course:course-42", "Bearer secret"),
            ],
        )

    def test_delete_course_bank_also_targets_user_scoped_bank(self) -> None:
        delete_calls: list[str] = []

        class DeleteUserScopedBankClient(FakeHttpxClient):
            def get(self, url: str, *, headers=None, params=None):
                return FakeResponse(200, {"items": []})

            def delete(self, url: str, *, headers=None):
                delete_calls.append(url)
                return FakeResponse(200, {"success": True})

        payload = workflow.CourseMemoryDeleteInput(
            courseId="course-42",
            tenantId="tenant-9",
            requesterUserId="user-7",
            hindsightApiUrl="http://127.0.0.1:8888",
        )

        with patch.object(workflow, "httpx") as mock_httpx:
            mock_httpx.Client.side_effect = lambda **kwargs: DeleteUserScopedBankClient(**kwargs)

            result = workflow.delete_course_bank_in_hindsight(payload)

        self.assertTrue(result["success"])
        self.assertEqual(
            result["deletedBankIds"],
            [
                "tenant:tenant-9:course:course-42",
                "tenant:tenant-9:user:user-7:course:course-42",
            ],
        )
        self.assertEqual(
            delete_calls,
            [
                "http://127.0.0.1:8888/v1/default/banks/tenant:tenant-9:course:course-42",
                "http://127.0.0.1:8888/v1/default/banks/tenant:tenant-9:user:user-7:course:course-42",
            ],
        )


    def test_retain_documents_sends_replace_mode_documents_to_hindsight(self) -> None:
        captured_retain_bodies: list[dict[str, object]] = []

        class RetainClient(FakeHttpxClient):
            def put(self, url: str, *, json=None, headers=None):
                return FakeResponse(200, {"success": True})

            def post(self, url: str, *, json=None, headers=None):
                captured_retain_bodies.append(json or {})
                operation_number = len(captured_retain_bodies)
                return FakeResponse(
                    200,
                    {
                        "async": True,
                        "operation_id": f"op-{operation_number}",
                        "operation_ids": [f"op-{operation_number}"],
                    },
                )

        step_input = _StepInput(
            previous_step_content={
                "cleanedPayload": {
                    "courseId": "course-1",
                    "tenantId": "tenant-1",
                },
                "retentionDocuments": [
                    {
                        "document_id": "course:course-1:overview",
                        "content": "Course Title: AI Spec",
                        "context": "published course overview",
                        "update_mode": "replace",
                    },
                    {
                        "document_id": "course:course-1:lesson:lesson-1",
                        "content": "Lesson Title: Lesson 1",
                        "context": "published course lesson knowledge",
                        "update_mode": "replace",
                    },
                    {
                        "document_id": "course:course-1:lesson:lesson-2",
                        "content": "Lesson Title: Lesson 2",
                        "context": "published course lesson knowledge",
                        "update_mode": "replace",
                    }
                ],
                "hindsightApiUrl": "http://127.0.0.1:8888",
                "hindsightApiKey": "secret",
                "overviewPreviewText": "Course Overview",
            }
        )

        with patch.object(workflow, "httpx") as mock_httpx:
            mock_httpx.Client.side_effect = lambda **kwargs: RetainClient(**kwargs)

            result = workflow.retain_documents_in_hindsight(step_input)

        self.assertTrue(result.success)
        self.assertEqual(len(captured_retain_bodies), 3)
        self.assertEqual(captured_retain_bodies[0]["async"], True)
        self.assertEqual(captured_retain_bodies[0]["items"][0]["document_id"], "course:course-1:overview")
        self.assertEqual(captured_retain_bodies[1]["items"][0]["document_id"], "course:course-1:lesson:lesson-1")
        self.assertEqual(captured_retain_bodies[2]["items"][0]["document_id"], "course:course-1:lesson:lesson-2")
        self.assertEqual(captured_retain_bodies[1]["items"][0]["update_mode"], "replace")
        self.assertEqual(result.content["operationIds"], ["op-1", "op-2", "op-3"])


if __name__ == "__main__":
    unittest.main()
