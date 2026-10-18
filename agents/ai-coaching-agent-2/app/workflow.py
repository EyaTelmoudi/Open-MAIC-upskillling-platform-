from __future__ import annotations

import importlib.util
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any
from urllib.parse import quote

import httpx
from pydantic import BaseModel, Field


def _repo_root() -> Path:
    return Path(__file__).resolve().parents[3]


def _chat_coach_site_packages() -> Path:
    return _repo_root() / "agents" / "chat-coach" / ".venv" / "Lib" / "site-packages"


def _ensure_chat_coach_site_packages() -> None:
    site_packages = _chat_coach_site_packages()
    site_packages_str = str(site_packages)
    if site_packages.exists() and site_packages_str not in sys.path:
        sys.path.append(site_packages_str)


_ensure_chat_coach_site_packages()

from agno.workflow import Step, StepInput, StepOutput, Workflow

DEFAULT_HINDSIGHT_URL = os.getenv("HINDSIGHT_URL", os.getenv("HINDSIGHT_API_URL", "http://127.0.0.1:8888"))
DEFAULT_HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY", "")
AGENT_PREFIX = "[AI Coaching Agent 2]"


def _log(message: str) -> None:
    print(f"{AGENT_PREFIX} {message}", file=sys.stderr, flush=True)


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _as_dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _hindsight_client(timeout: float) -> httpx.Client:
    return httpx.Client(timeout=timeout, trust_env=False)


def _build_fallback_coaching_answer(question: str, error: str) -> str:
    cleaned_question = _clean_text(question)
    if cleaned_question:
        return (
            "I could not reach the course memory service for a fully grounded answer right now. "
            "Please review the current lesson section related to your question, then retry once the memory service is available. "
            f"Question received: {cleaned_question}"
        )
    return (
        "I could not reach the course memory service for a fully grounded answer right now. "
        "Please retry once the memory service is available."
    )


def _parse_embedded_answer_json(text: str) -> dict[str, Any] | None:
    cleaned = _clean_text(text)
    if not cleaned:
        return None

    candidates = [cleaned]
    if "{" in cleaned:
        candidates.append(cleaned[cleaned.find("{") :])

    decoder = json.JSONDecoder()
    for candidate in candidates:
        try:
            parsed, _ = decoder.raw_decode(candidate)
        except json.JSONDecodeError:
            continue
        if isinstance(parsed, dict):
            return parsed
    return None


def _build_course_bank_id(tenant_id: str, course_id: str) -> str:
    return f"tenant:{tenant_id}:course:{course_id}"


def _build_user_course_bank_id(tenant_id: str, user_id: str, course_id: str) -> str:
    return f"tenant:{tenant_id}:user:{user_id}:course:{course_id}"


class AICoachingAgent2AskInput(BaseModel):
    tenantId: str
    courseId: str
    userId: str
    question: str
    lessonId: str | None = None
    pagePath: str | None = None
    sessionId: str | None = None
    hindsightApiUrl: str | None = None
    hindsightApiKey: str | None = None


class AICoachingAgent2Reply(BaseModel):
    answer: str = Field(description="Learner-facing coaching answer produced by reflect after course recall enrichment.")
    bankId: str = Field(description="The Hindsight bank used for the final reflect step.")
    basedOn: dict[str, Any] = Field(default_factory=dict, description="Grounding payload returned by Hindsight.")
    supportingMemories: list[dict[str, Any]] = Field(
        default_factory=list,
        description="Short list of supporting memory snippets extracted from the Hindsight response.",
    )


def _learner_memory_workflow_module() -> Any:
    workflow_path = _repo_root() / "agents" / "learner-memory" / "app" / "workflow.py"
    module_name = f"openmaic_learner_memory_workflow_{int(time.time() * 1000)}"
    spec = importlib.util.spec_from_file_location(module_name, workflow_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load learner-memory workflow from {workflow_path}")

    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    if hasattr(module, "LessonReference"):
        module.LessonReference.model_rebuild(_types_namespace=module.__dict__)
    if hasattr(module, "LearnerLessonMemoryInput"):
        module.LearnerLessonMemoryInput.model_rebuild(_types_namespace=module.__dict__)
    return module


def _retain_user_question_via_learner_memory_agent(payload: AICoachingAgent2AskInput) -> dict[str, Any]:
    learner_memory_module = _learner_memory_workflow_module()
    learner_memory_payload = {
        "tenantId": payload.tenantId,
        "userId": payload.userId,
        "courseId": payload.courseId,
        "lessonId": _clean_text(payload.lessonId) or "coach-hindsight",
        "lessonTitle": "Coaching discussion",
        "eventType": "coaching_discussion_message",
        "discussionMessage": payload.question,
        "sessionId": _clean_text(payload.sessionId) or None,
        "source": "ai-coaching-agent-2-raw-retain",
        "hindsightApiUrl": _clean_text(payload.hindsightApiUrl) or DEFAULT_HINDSIGHT_URL,
        "hindsightApiKey": _clean_text(payload.hindsightApiKey) or DEFAULT_HINDSIGHT_API_KEY,
    }

    _log(
        "Launching learner-memory subagent retention for "
        f"user={payload.userId} course={payload.courseId} session={_clean_text(payload.sessionId) or 'none'}"
    )
    result = _as_dict(learner_memory_module.retain_learner_memory_payload(learner_memory_payload))
    if bool(result.get("success")):
        _log(
            "Learner-memory subagent accepted retention for bank "
            f"{_clean_text(result.get('bankId')) or 'unknown'} "
            f"operationId={_clean_text(result.get('operationId')) or 'n/a'}"
        )
    else:
        raise RuntimeError(_clean_text(result.get("error")) or "Learner-memory subagent retention failed.")
    return result


def _recall_course_memory_raw(
    tenant_id: str,
    course_id: str,
    question: str,
    hindsight_api_url: str | None = None,
    hindsight_api_key: str | None = None,
) -> dict[str, Any]:
    bank_id = _build_course_bank_id(tenant_id, course_id)
    hindsight_url = (_clean_text(hindsight_api_url) or DEFAULT_HINDSIGHT_URL).rstrip("/")
    api_key = _clean_text(hindsight_api_key) or DEFAULT_HINDSIGHT_API_KEY

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "query": question,
        "budget": "mid",
        "max_tokens": 1200,
        "include": {
            "facts": {},
        },
    }

    _log(f"Calling Hindsight recall for bank {bank_id}")

    with _hindsight_client(timeout=120.0) as client:
        response = client.post(
            f"{hindsight_url}/v1/default/banks/{quote(bank_id, safe='')}/memories/recall",
            headers=headers,
            json=payload,
        )

    response_body = response.json() if response.content else {}
    if not response.is_success:
        detail = (
            _clean_text(_as_dict(response_body).get("error"))
            or _clean_text(_as_dict(response_body).get("detail"))
            or f"Hindsight recall failed with status {response.status_code}."
        )
        raise RuntimeError(detail)

    results = [item for item in _as_list(_as_dict(response_body).get("results")) if isinstance(item, dict)]
    supporting_memories = [
        {
            "text": _clean_text(item.get("text") or item.get("content")),
            "type": _clean_text(item.get("type")) or "memory",
        }
        for item in results
        if _clean_text(item.get("text") or item.get("content"))
    ][:6]

    if supporting_memories:
        lines = [
            "Relevant course memories for this question:",
            "",
        ]
        lines.extend(
            f"{index}. {memory['text']}"
            for index, memory in enumerate(supporting_memories[:5], start=1)
        )
        answer = "\n".join(lines)
    else:
        answer = "No relevant course memories were found for this question."

    return {
        "answer": answer,
        "bankId": bank_id,
        "basedOn": {"results": results},
        "supportingMemories": supporting_memories,
    }


def _reflect_user_course_with_course_recall(payload: AICoachingAgent2AskInput) -> dict[str, Any]:
    retain_result: dict[str, Any] | None = None
    retain_error: str | None = None

    executor = ThreadPoolExecutor(max_workers=2)
    try:
        retain_future = executor.submit(
            _retain_user_question_via_learner_memory_agent,
            payload,
        )
        recall_future = executor.submit(
            _recall_course_memory_raw,
            payload.tenantId,
            payload.courseId,
            payload.question,
            payload.hindsightApiUrl,
            payload.hindsightApiKey,
        )

        recall_result = recall_future.result()

        if retain_future.done():
            try:
                retain_result = _as_dict(retain_future.result())
            except Exception as error:
                retain_error = f"{type(error).__name__}: {error}"
        else:
            _log("Recall finished before retain submission returned. Reflect will continue without waiting.")
    finally:
        executor.shutdown(wait=False, cancel_futures=False)

    user_course_bank_id = _build_user_course_bank_id(payload.tenantId, payload.userId, payload.courseId)
    hindsight_url = (_clean_text(payload.hindsightApiUrl) or DEFAULT_HINDSIGHT_URL).rstrip("/")
    api_key = _clean_text(payload.hindsightApiKey) or DEFAULT_HINDSIGHT_API_KEY

    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    recall_memories = recall_result.get("supportingMemories")
    recall_lines = [
        f"{index}. {_clean_text(memory.get('text'))}"
        for index, memory in enumerate(recall_memories if isinstance(recall_memories, list) else [], start=1)
        if _clean_text(_as_dict(memory).get("text"))
    ]

    additional_context = (
        "Relevant course memories retrieved from the course bank:\n"
        + ("\n".join(recall_lines) if recall_lines else "No relevant course memories found.")
    )
    enriched_query = (
        f"Learner question:\n{payload.question}\n\n"
        f"{additional_context}\n\n"
        "Use the learner's personal course memory to adapt the answer. "
        "Base the course facts on the recalled course memories above. "
        "Give a concise coaching answer."
    )

    reflect_payload = {
        "query": enriched_query,
        "budget": "mid",
        "max_tokens": 900,
        "include": {
            "facts": {},
        },
    }

    _log(
        f"Calling Hindsight reflect for bank {user_course_bank_id} "
        f"using {len(recall_lines)} recalled course memories as additional context"
    )

    with _hindsight_client(timeout=150.0) as client:
        response = client.post(
            f"{hindsight_url}/v1/default/banks/{quote(user_course_bank_id, safe='')}/reflect",
            headers=headers,
            json=reflect_payload,
        )

    response_body = response.json() if response.content else {}
    if not response.is_success:
        detail = (
            _clean_text(_as_dict(response_body).get("error"))
            or _clean_text(_as_dict(response_body).get("detail"))
            or f"Hindsight reflect failed with status {response.status_code}."
        )
        raise RuntimeError(detail)

    based_on = _as_dict(_as_dict(response_body).get("based_on"))
    reflect_supporting_memories = [
        {
            "text": _clean_text(item.get("text")),
            "type": _clean_text(item.get("type")) or "memory",
        }
        for item in _as_list(based_on.get("memories"))
        if isinstance(item, dict) and _clean_text(item.get("text"))
    ]

    combined_supporting_memories = []
    seen_texts: set[str] = set()
    for memory in [
        *(_as_list(recall_result.get("supportingMemories"))),
        *reflect_supporting_memories,
    ]:
        memory_dict = _as_dict(memory)
        text = _clean_text(memory_dict.get("text"))
        if not text:
            continue
        key = text.casefold()
        if key in seen_texts:
            continue
        seen_texts.add(key)
        combined_supporting_memories.append(
            {
                "text": text,
                "type": _clean_text(memory_dict.get("type")) or "memory",
            }
        )

    raw_answer = _clean_text(_as_dict(response_body).get("text"))
    parsed_answer = _parse_embedded_answer_json(raw_answer)
    answer = _clean_text(_as_dict(parsed_answer).get("answer")) or raw_answer or (
        "I could not produce a grounded coaching answer from the recalled course and learner memory."
    )

    if retain_future.done() and retain_result is None and not retain_error:
        try:
            retain_result = _as_dict(retain_future.result())
        except Exception as error:
            retain_error = f"{type(error).__name__}: {error}"

    return {
        "answer": answer,
        "bankId": user_course_bank_id,
        "basedOn": {
            "courseRecall": _as_dict(recall_result.get("basedOn")),
            "userCourseReflect": based_on,
            "learnerMemoryRetention": {
                "workflowName": _clean_text(_as_dict(retain_result).get("workflowName")) or "learner-memory-agent",
                "bankId": _clean_text(_as_dict(retain_result).get("bankId")) or None,
                "operationId": _clean_text(_as_dict(retain_result).get("operationId")) or None,
                "action": _clean_text(_as_dict(retain_result).get("action")) or None,
            },
            "retainError": retain_error,
        },
        "supportingMemories": combined_supporting_memories[:8],
    }


def ask_with_ai_coaching_agent_2(step_input: StepInput) -> StepOutput:
    payload = AICoachingAgent2AskInput.model_validate(step_input.input)

    def _success_content(structured: dict[str, Any]) -> dict[str, Any]:
        return {
            "success": True,
            "workflowName": "ai-coaching-agent-2",
            "action": "course_recall_then_user_course_reflect",
            "tenantId": payload.tenantId,
            "courseId": payload.courseId,
            "userId": payload.userId,
            "question": payload.question,
            **structured,
        }

    try:
        structured = _reflect_user_course_with_course_recall(payload)
        _log(f"Recall + reflect completed successfully for bank {structured.get('bankId')}")
        return StepOutput(content=_success_content(structured), success=True)
    except Exception as error:
        _log(f"Course recall + user-course reflect failed: {type(error).__name__}: {error}")
        fallback_answer = _build_fallback_coaching_answer(payload.question, str(error))
        return StepOutput(
            content={
                "success": True,
                "workflowName": "ai-coaching-agent-2",
                "action": "course_recall_then_user_course_reflect",
                "tenantId": payload.tenantId,
                "courseId": payload.courseId,
                "userId": payload.userId,
                "question": payload.question,
                "answer": fallback_answer,
                "bankId": _build_user_course_bank_id(payload.tenantId, payload.userId, payload.courseId),
                "basedOn": {
                    "fallback": True,
                    "error": f"{type(error).__name__}: {error}",
                },
                "supportingMemories": [],
                "error": f"{type(error).__name__}: {error}",
            },
            success=True,
        )


ai_coaching_agent_2_workflow = Workflow(
    name="ai-coaching-agent-2",
    description="AgentOS workflow that recalls course memories first, then reflects on the learner-course bank using that recalled context.",
    input_schema=AICoachingAgent2AskInput,
    telemetry=False,
    steps=[
        Step(
            name="ask-with-ai-coaching-agent-2",
            executor=ask_with_ai_coaching_agent_2,
        )
    ],
)
