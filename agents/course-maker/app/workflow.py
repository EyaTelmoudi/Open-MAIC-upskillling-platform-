from __future__ import annotations

import base64
import json
import sys
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from typing import Any

import httpx
from pydantic import BaseModel

from agno.workflow import Step, StepInput, StepOutput, Workflow


class CourseMakerForwardInput(BaseModel):
    runId: str
    pdfPath: str | None = None
    pdfName: str
    requirement: str
    openmaicUrl: str
    agentMode: str
    enableWebSearch: bool
    enableImageGeneration: bool
    enableVideoGeneration: bool
    enableTTS: bool
    promptPreview: str


@dataclass
class OpenMAICHandoffResult:
    success: bool
    workflowName: str
    stage: str
    status: int
    contentType: str
    bodyBase64: str
    generatedDraftData: dict[str, Any] | None = None


def _log(message: str) -> None:
    print(message, file=sys.stderr)


def _emit_stream_line(line: str) -> None:
    print(f"STREAM::{line}", file=sys.stdout, flush=True)


def forward_generation_request(step_input: StepInput) -> StepOutput:
    payload = CourseMakerForwardInput.model_validate(step_input.input)

    _log("")
    _log("============================================================")
    _log("[Agno Course Maker Workflow] Request received")
    _log(f"- Workflow: course-maker-openmaic-handoff")
    _log(f"- Run ID: {payload.runId}")
    _log(f"- Time: {datetime.now(timezone.utc).isoformat()}")
    _log(f"- PDF: {payload.pdfName if payload.pdfPath else 'No PDF attached'}")
    _log(f"- Agent mode: {payload.agentMode}")
    _log(
        "- Options: "
        f"webSearch={payload.enableWebSearch}, "
        f"images={payload.enableImageGeneration}, "
        f"videos={payload.enableVideoGeneration}, "
        f"tts={payload.enableTTS}"
    )
    _log(f"- Prompt preview: {payload.promptPreview or '(empty prompt)'}")
    _log("[Agno Course Maker Workflow] Sending source inputs to OpenMAIC...")

    data = {
        "runId": payload.runId,
        "requirement": payload.requirement,
        "enableWebSearch": str(payload.enableWebSearch).lower(),
        "enableImageGeneration": str(payload.enableImageGeneration).lower(),
        "enableVideoGeneration": str(payload.enableVideoGeneration).lower(),
        "enableTTS": str(payload.enableTTS).lower(),
        "agentMode": payload.agentMode,
    }

    with httpx.Client(timeout=None) as client:
        if payload.pdfPath:
            with open(payload.pdfPath, "rb") as pdf_file:
                files = {"pdf": (payload.pdfName, pdf_file, "application/pdf")}
                with client.stream("POST", payload.openmaicUrl, data=data, files=files) as response:
                    _log("[Agno Course Maker Workflow] OpenMAIC accepted the request.")
                    _log(f"- OpenMAIC URL: {payload.openmaicUrl}")
                    _log(f"- OpenMAIC status: {response.status_code}")
                    streamed_lines: list[str] = []
                    for line in response.iter_lines():
                        if not line:
                            continue
                        streamed_lines.append(line)
                        _emit_stream_line(line)

                    response_body = (
                        ("\n".join(streamed_lines) + ("\n" if streamed_lines else "")).encode("utf-8")
                    )
        else:
            with client.stream("POST", payload.openmaicUrl, data=data) as response:
                _log("[Agno Course Maker Workflow] OpenMAIC accepted the request.")
                _log(f"- OpenMAIC URL: {payload.openmaicUrl}")
                _log(f"- OpenMAIC status: {response.status_code}")
                streamed_lines = []
                for line in response.iter_lines():
                    if not line:
                        continue
                    streamed_lines.append(line)
                    _emit_stream_line(line)

                response_body = (
                    ("\n".join(streamed_lines) + ("\n" if streamed_lines else "")).encode("utf-8")
                )

    _log(
        "[Agno Course Maker Workflow] OpenMAIC handoff completed successfully."
        if response.is_success
        else "[Agno Course Maker Workflow] OpenMAIC handoff returned an error response."
    )
    _log("============================================================")
    _log("")

    result = OpenMAICHandoffResult(
        success=response.is_success,
        workflowName="course-maker-openmaic-handoff",
        stage="forwarded_to_openmaic" if response.is_success else "forward_failed",
        status=response.status_code,
        contentType=response.headers.get("content-type", "application/json; charset=utf-8"),
        bodyBase64=base64.b64encode(response_body).decode("utf-8"),
    )

    return StepOutput(
        content=asdict(result),
        success=response.is_success,
        error=None if response.is_success else f"OpenMAIC returned status {response.status_code}",
    )


def confirm_generated_content_received(step_input: StepInput) -> StepOutput:
    previous_content = step_input.previous_step_content
    if not isinstance(previous_content, dict):
        return StepOutput(
            content={"success": False, "stage": "receipt_confirmation_failed"},
            success=False,
            error="Previous OpenMAIC handoff result is missing.",
        )

    body_base64 = previous_content.get("bodyBase64")
    decoded_body = ""
    if isinstance(body_base64, str) and body_base64:
        decoded_body = base64.b64decode(body_base64).decode("utf-8", errors="replace")

    line_count = 0
    last_event_type = "unknown"
    done_seen = False
    done_payload: dict[str, Any] | None = None

    if decoded_body:
        lines = [line.strip() for line in decoded_body.splitlines() if line.strip()]
        line_count = len(lines)
        for line in lines:
            try:
                event = json.loads(line)
            except json.JSONDecodeError:
                continue
            event_type = event.get("type")
            if isinstance(event_type, str):
                last_event_type = event_type
            if event_type == "done":
                done_seen = True
                data = event.get("data")
                if isinstance(data, dict):
                    done_payload = data

    _log("[Agno Course Maker Workflow] OpenMAIC finished and returned generated content.")
    _log(f"- Received stream lines: {line_count}")
    _log(f"- Last event type: {last_event_type}")
    _log(f"- Final done event received: {done_seen}")
    _log(
        "[Agno Course Maker Workflow] Generated content was received successfully by the Course Maker workflow."
        if previous_content.get("success")
        else "[Agno Course Maker Workflow] Generated content receipt completed with upstream issues."
    )

    updated_content = {
        **previous_content,
        "stage": "generated_content_received",
        "generatedContentReceived": done_seen,
        "streamLineCount": line_count,
        "lastEventType": last_event_type,
        "doneEventReceived": done_seen,
        "generatedDraftData": done_payload,
    }

    return StepOutput(
        content=updated_content,
        success=bool(previous_content.get("success")),
        error=None if previous_content.get("success") else "OpenMAIC handoff was not successful.",
    )


course_maker_openmaic_handoff_workflow = Workflow(
    name="course-maker-openmaic-handoff",
    description="Phase 1 workflow that sends the draft-generation request from the Course Maker workflow to OpenMAIC and confirms generated content receipt.",
    input_schema=CourseMakerForwardInput,
    telemetry=False,
    steps=[
        Step(
            name="forward-generation-request",
            description="Forward the generation request to OpenMAIC and log the handoff.",
            executor=forward_generation_request,
        ),
        Step(
            name="confirm-generated-content-received",
            description="Confirm that OpenMAIC completed generation and that the Course Maker workflow received the returned content.",
            executor=confirm_generated_content_received,
        ),
    ],
)
