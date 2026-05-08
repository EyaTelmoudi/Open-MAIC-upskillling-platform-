from __future__ import annotations

import importlib.util
import json
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
    def __init__(self, content=None, success=False) -> None:
        self.content = content
        self.success = success


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

SPEC = importlib.util.spec_from_file_location("chat_coach_workflow", WORKFLOW_PATH)
if SPEC is None or SPEC.loader is None:
    raise RuntimeError(f"Unable to load workflow module from {WORKFLOW_PATH}")
workflow = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(workflow)
REAL_HTTPX = workflow.httpx


class FakeHttpxResponse:
    def __init__(self, payload: dict, status_code: int = 200) -> None:
        self._payload = payload
        self.status_code = status_code

    def json(self) -> dict:
        return self._payload


class FakeHttpxClient:
    def __init__(self, *, response_payload: dict, status_code: int = 200, capture: dict | None = None, **kwargs) -> None:
        self._response_payload = response_payload
        self._status_code = status_code
        self._capture = capture if capture is not None else {}
        self._kwargs = kwargs

    def __enter__(self) -> "FakeHttpxClient":
        return self

    def __exit__(self, exc_type, exc, tb) -> None:
        return None

    def post(self, url: str, *, headers: dict | None = None, json: dict | None = None):
        self._capture["url"] = url
        self._capture["headers"] = headers or {}
        self._capture["json"] = json or {}
        self._capture["timeout"] = self._kwargs.get("timeout")
        return FakeHttpxResponse(self._response_payload, status_code=self._status_code)


class ChatCoachWorkflowTests(unittest.TestCase):
    def test_extract_answer_text_prefers_answer_field_from_json(self) -> None:
        raw_answer = json.dumps(
            {
                "answer": "Enterprise software development is not just coding at speed but disciplined delivery.",
                "memory_ids": ["memory-1"],
            }
        )

        answer = workflow._extract_answer_text(raw_answer)

        self.assertEqual(
            answer,
            "Answer:\nEnterprise software development is not just coding at speed but disciplined delivery.",
        )

    def test_extract_answer_text_handles_answer_prefix_with_embedded_json(self) -> None:
        raw_answer = """Answer:
{
  "answer": "The lesson says the main risks are duplicate modules, technical debt, and unmaintainable code.",
  "memory_ids": ["memory-1", "memory-2"],
  "observation_ids": []
}

Why this matters:
This matters because building the right mental model early makes the rest of the course easier to follow.

Next step:
Review the lesson section most related to this question before moving on."""

        answer = workflow._extract_answer_text(raw_answer)

        self.assertEqual(
            answer,
            "Answer:\nThe lesson says the main risks are duplicate modules, technical debt, and unmaintainable code.",
        )

    def test_extract_answer_text_formats_structured_sections(self) -> None:
        raw_answer = json.dumps(
            {
                "answer": "Relying on vibe coding can create duplicate modules, technical debt, and brittle code.",
                "why_this_matters": "Enterprise systems need maintainable code and consistent engineering standards.",
                "next_step": "Write a short spec before asking AI to generate implementation code.",
            }
        )

        answer = workflow._extract_answer_text(raw_answer)

        self.assertEqual(
            answer,
            (
                "Answer:\nRelying on vibe coding can create duplicate modules, technical debt, and brittle code.\n\n"
                "Why this matters:\nEnterprise systems need maintainable code and consistent engineering standards.\n\n"
                "Next step:\nWrite a short spec before asking AI to generate implementation code."
            ),
        )

    def test_hindsight_request_uses_raw_question_as_query(self) -> None:
        capture: dict = {}
        response_payload = {
            "text": "The lesson says enterprise software development includes specification, testing, and maintenance.",
            "based_on": {
                "memories": [
                    {
                        "id": "memory-1",
                        "text": "Enterprise software development is not just coding at speed; it includes specification, testing, and maintenance.",
                        "type": "world",
                    }
                ]
            },
        }
        step_input = _StepInput(
            input={
                "tenantId": "tenant-1",
                "courseId": "course-1",
                "userId": "user-1",
                "question": "Enterprise software development is not just coding at speed but what?",
            }
        )

        with patch.object(workflow, "httpx") as mock_httpx:
            mock_httpx.Client.side_effect = lambda **kwargs: FakeHttpxClient(
                response_payload=response_payload,
                capture=capture,
                **kwargs,
            )

            result = workflow.ask_hindsight_course_question(step_input)

        self.assertTrue(result.success)
        self.assertEqual(
            capture["json"]["query"],
            "Enterprise software development is not just coding at speed but what?",
        )
        self.assertEqual(
            capture["url"],
            "http://127.0.0.1:8888/v1/default/banks/tenant:tenant-1:course:course-1/reflect",
        )
        self.assertEqual(
            result.content["answer"],
            "The lesson says enterprise software development includes specification, testing, and maintenance.",
        )

    def test_hindsight_failure_is_returned_cleanly(self) -> None:
        capture: dict = {}
        step_input = _StepInput(
            input={
                "tenantId": "tenant-1",
                "courseId": "course-1",
                "userId": "user-1",
                "question": "What does the lesson say?",
            }
        )

        with patch.object(workflow, "httpx") as mock_httpx:
            mock_httpx.Client.side_effect = lambda **kwargs: FakeHttpxClient(
                response_payload={"error": "unavailable"},
                status_code=503,
                capture=capture,
                **kwargs,
            )

            result = workflow.ask_hindsight_course_question(step_input)

        self.assertFalse(result.success)
        self.assertEqual(
            result.content["error"],
            "Hindsight reflect returned status 503",
        )


if __name__ == "__main__":
    unittest.main()
