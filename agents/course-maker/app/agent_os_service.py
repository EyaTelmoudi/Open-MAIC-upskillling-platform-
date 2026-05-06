from __future__ import annotations

import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, AsyncIterator

import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse, StreamingResponse

from agno.os import AgentOS

from .refinement_workflow import (
    CourseRefinementInput,
    course_refinement_workflow,
)
from .workflow import (
    CourseMakerForwardInput,
    course_maker_openmaic_handoff_workflow,
)

_RUN_STORE: dict[str, str] = {}


def _log(message: str) -> None:
    print(message, file=sys.stderr)


def _json_line(event: dict[str, Any]) -> bytes:
    return f"{json.dumps(event)}\n".encode("utf-8")


def _mark_running(run_id: str) -> None:
    _RUN_STORE[run_id] = "running"


def _mark_cancelled(run_id: str) -> None:
    _RUN_STORE[run_id] = "cancelled"


def _is_cancelled(run_id: str) -> bool:
    return _RUN_STORE.get(run_id) == "cancelled"


def _finish_run(run_id: str) -> None:
    _RUN_STORE.pop(run_id, None)


base_app = FastAPI(title="Course Maker AgentOS Service")


@base_app.get("/health")
async def health() -> JSONResponse:
    _log("[Agno AgentOS] Health check received.")
    return JSONResponse({"success": True, "service": "course-maker-agentos"}, status_code=200)


@base_app.post("/v1/course-maker/runs/{run_id}/cancel")
async def cancel_run(run_id: str) -> JSONResponse:
    _mark_cancelled(run_id)
    _log(f"[Agno Course Maker AgentOS] Marked run as cancelled: {run_id}")
    return JSONResponse({"success": True, "runId": run_id}, status_code=200)


@base_app.post("/v1/course-maker/refinement")
async def refinement(payload: CourseRefinementInput) -> JSONResponse:
    _log(
        f"[Agno Course Refinement Agent] Starting action '{payload.action}' for draft {payload.draftId}."
    )
    result = course_refinement_workflow.run(input=payload.model_dump())
    content = result.content if isinstance(result.content, dict) else {"success": False}
    _log(
        f"[Agno Course Refinement Agent] Finished action '{payload.action}' for draft {payload.draftId}."
    )
    return JSONResponse(content, status_code=200 if bool(content.get("success")) else 500)


@base_app.post("/v1/course-maker/generate")
async def generate(payload: CourseMakerForwardInput) -> StreamingResponse:
    _mark_running(payload.runId)
    _log(
        f"[Agno Course Maker Agent] Starting generation run {payload.runId} for '{payload.pdfName if payload.pdfPath else 'prompt-only request'}'."
    )

    async def stream() -> AsyncIterator[bytes]:
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

        try:
            data = {
                "runId": payload.runId,
                "requirement": payload.requirement,
                "enableWebSearch": str(payload.enableWebSearch).lower(),
                "enableImageGeneration": str(payload.enableImageGeneration).lower(),
                "enableVideoGeneration": str(payload.enableVideoGeneration).lower(),
                "enableTTS": str(payload.enableTTS).lower(),
                "agentMode": payload.agentMode,
            }

            async with httpx.AsyncClient(timeout=None) as client:
                if payload.pdfPath:
                    with open(payload.pdfPath, "rb") as pdf_file:
                        files = {"pdf": (payload.pdfName, pdf_file, "application/pdf")}
                        async with client.stream(
                            "POST",
                            payload.openmaicUrl,
                            data=data,
                            files=files,
                        ) as response:
                            _log("[Agno Course Maker Workflow] OpenMAIC accepted the request.")
                            _log(f"- OpenMAIC URL: {payload.openmaicUrl}")
                            _log(f"- OpenMAIC status: {response.status_code}")

                            streamed_lines: list[str] = []
                            async for line in response.aiter_lines():
                                if _is_cancelled(payload.runId):
                                    yield _json_line(
                                        {
                                            "type": "error",
                                            "error": "Generation was cancelled by the learning expert.",
                                        }
                                    )
                                    return

                                if not line:
                                    continue

                                streamed_lines.append(line)
                                yield f"{line}\n".encode("utf-8")
                else:
                    async with client.stream(
                        "POST",
                        payload.openmaicUrl,
                        data=data,
                    ) as response:
                        _log("[Agno Course Maker Workflow] OpenMAIC accepted the request.")
                        _log(f"- OpenMAIC URL: {payload.openmaicUrl}")
                        _log(f"- OpenMAIC status: {response.status_code}")

                        streamed_lines = []
                        async for line in response.aiter_lines():
                            if _is_cancelled(payload.runId):
                                yield _json_line(
                                    {
                                        "type": "error",
                                        "error": "Generation was cancelled by the learning expert.",
                                    }
                                )
                                return

                            if not line:
                                continue

                            streamed_lines.append(line)
                            yield f"{line}\n".encode("utf-8")

                line_count = len(streamed_lines)
                last_event_type = "unknown"
                done_seen = False

                for line in streamed_lines:
                    try:
                        event = json.loads(line)
                    except json.JSONDecodeError:
                        continue
                    event_type = event.get("type")
                    if isinstance(event_type, str):
                        last_event_type = event_type
                    if event_type == "done":
                        done_seen = True

                _log(
                    "[Agno Course Maker Workflow] OpenMAIC handoff completed successfully."
                    if response.is_success
                    else "[Agno Course Maker Workflow] OpenMAIC handoff returned an error response."
                )
                _log("============================================================")
                _log("")
                _log("[Agno Course Maker Workflow] OpenMAIC finished and returned generated content.")
                _log(f"- Received stream lines: {line_count}")
                _log(f"- Last event type: {last_event_type}")
                _log(f"- Final done event received: {done_seen}")
                _log(
                    "[Agno Course Maker Workflow] Generated content was received successfully by the Course Maker workflow."
                    if response.is_success
                    else "[Agno Course Maker Workflow] Generated content receipt completed with upstream issues."
                )
                _log(
                    f"[Agno Course Maker Agent] Generation run {payload.runId} finished streaming."
                )

                if not done_seen and not _is_cancelled(payload.runId):
                    yield _json_line(
                        {
                            "type": "error",
                            "error": "OpenMAIC stopped before returning a completion event.",
                        }
                    )
        except FileNotFoundError:
            _log(
                f"[Agno Course Maker Agent] Generation run {payload.runId} failed because the PDF file was not found."
            )
            yield _json_line(
                {
                    "type": "error",
                    "error": f"The Course Maker service could not find the PDF at {payload.pdfPath}.",
                }
            )
        except Exception as error:
            _log(
                f"[Agno Course Maker Agent] Generation run {payload.runId} failed: {error}"
            )
            yield _json_line(
                {
                    "type": "error",
                    "error": str(error) or "Course Maker AgentOS service failed.",
                }
            )
        finally:
            _log(f"[Agno Course Maker Agent] Closing generation run {payload.runId}.")
            _finish_run(payload.runId)

    return StreamingResponse(stream(), media_type="application/x-ndjson; charset=utf-8")


agent_os = AgentOS(
    name="Course Maker AgentOS",
    description="AgentOS runtime for the Course Maker and Course Refinement workflows.",
    workflows=[course_maker_openmaic_handoff_workflow, course_refinement_workflow],
    base_app=base_app,
    telemetry=False,
)

app = agent_os.get_app()
