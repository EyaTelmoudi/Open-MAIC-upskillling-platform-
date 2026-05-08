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


if __name__ == "__main__":
    unittest.main()
