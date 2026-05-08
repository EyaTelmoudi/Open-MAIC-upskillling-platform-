from __future__ import annotations

import json
import os
import re
import sys
from typing import Any

import httpx
from pydantic import BaseModel

from agno.workflow import Step, StepInput, StepOutput, Workflow


DEFAULT_HINDSIGHT_URL = os.getenv("HINDSIGHT_API_URL", "http://127.0.0.1:8888")
DEFAULT_HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY", "")
DEFAULT_QUESTION = (
    "In this HTML course, why is the alt attribute important for images, "
    "and what does the course say about the src attribute?"
)


def _build_course_bank_id(tenant_id: str, course_id: str) -> str:
    return f"tenant:{tenant_id}:course:{course_id}"


class ChatCoachQuestionInput(BaseModel):
    tenantId: str
    courseId: str
    userId: str | None = None
    question: str = DEFAULT_QUESTION
    learnerContext: dict[str, object] | None = None
    hindsightApiUrl: str | None = None
    hindsightApiKey: str | None = None


def _log(message: str) -> None:
    print(message, file=sys.stderr)


_STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "but",
    "by",
    "for",
    "from",
    "how",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "what",
    "which",
    "why",
    "with",
}


def _tokenize(text: str) -> set[str]:
    return {
        token
        for token in re.findall(r"[a-z0-9_<>/-]+", text.lower())
        if len(token) > 1 and token not in _STOP_WORDS
    }


def _select_supporting_memories(
    memories: list[dict[str, object]],
    *,
    query: str,
    answer: str,
    limit: int = 3,
) -> list[dict[str, object]]:
    query_tokens = _tokenize(query)
    answer_tokens = _tokenize(answer)

    scored: list[tuple[int, dict[str, object]]] = []
    for memory in memories:
        text = str(memory.get("text") or "")
        if not text.strip():
            continue

        memory_tokens = _tokenize(text)
        query_overlap = len(query_tokens & memory_tokens)
        answer_overlap = len(answer_tokens & memory_tokens)
        score = (query_overlap * 4) + (answer_overlap * 2)
        if score > 0:
            scored.append((score, memory))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [memory for _, memory in scored[:limit]]


def _as_dict(value: object) -> dict[str, Any]:
    return value if isinstance(value, dict) else {}


def _as_list(value: object) -> list[Any]:
    return value if isinstance(value, list) else []


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _format_structured_answer(payload: dict[str, Any]) -> str:
    answer = _clean_text(payload.get("answer"))
    why_this_matters = _clean_text(
        payload.get("why_this_matters") or payload.get("whyThisMatters")
    )
    next_step = _clean_text(payload.get("next_step") or payload.get("nextStep"))

    sections: list[str] = []
    if answer:
        sections.append(f"Answer:\n{answer}")
    if why_this_matters:
        sections.append(f"Why this matters:\n{why_this_matters}")
    if next_step:
        sections.append(f"Next step:\n{next_step}")

    return "\n\n".join(sections).strip()


def _extract_answer_text(raw_answer: str) -> str:
    text = raw_answer.strip()

    candidate_json = text
    if text.lower().startswith("answer:"):
        candidate_json = text.split(":", 1)[1].strip()

    parsed = None
    decoder = json.JSONDecoder()

    for candidate in (candidate_json, text):
        brace_index = candidate.find("{")
        if brace_index < 0:
            continue
        try:
            parsed, _ = decoder.raw_decode(candidate[brace_index:])
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            formatted = _format_structured_answer(parsed)
            if formatted:
                return formatted

    if text.startswith("{") and text.endswith("}"):
        try:
            parsed = json.loads(text)
        except json.JSONDecodeError:
            parsed = None
        if isinstance(parsed, dict):
            formatted = _format_structured_answer(parsed)
            if formatted:
                return formatted
    return text


def ask_hindsight_course_question(step_input: StepInput) -> StepOutput:
    payload = ChatCoachQuestionInput.model_validate(step_input.input)
    hindsight_url = (payload.hindsightApiUrl or DEFAULT_HINDSIGHT_URL).rstrip("/")
    hindsight_api_key = payload.hindsightApiKey or DEFAULT_HINDSIGHT_API_KEY
    bank_id = _build_course_bank_id(payload.tenantId, payload.courseId)
    reflect_payload = {
        "query": payload.question,
        "budget": "low",
        "max_tokens": 650,
        "include": {
            "facts": {},
            "tool_calls": {"output": False},
        },
        "tags": [f"course:{payload.courseId}"],
        "tags_match": "all_strict",
    }

    headers = {"Content-Type": "application/json"}
    if hindsight_api_key:
        headers["Authorization"] = f"Bearer {hindsight_api_key}"

    _log("[Agno Chat Coach Agent] Hindsight request prepared.")
    _log(
        json.dumps(
            {
                "tenantId": payload.tenantId,
                "userId": payload.userId,
                "courseId": payload.courseId,
                "bankId": bank_id,
                "question": payload.question,
                "reflectPayload": reflect_payload,
            },
            indent=2,
            ensure_ascii=False,
        )
    )

    with httpx.Client(timeout=90.0) as client:
        response = client.post(
            f"{hindsight_url}/v1/default/banks/{bank_id}/reflect",
            headers=headers,
            json=reflect_payload,
        )

    if response.status_code >= 400:
        return StepOutput(
            content={
                "success": False,
                "workflowName": "chat-coach-agent",
                "action": "ask_hindsight_course_question",
                "tenantId": payload.tenantId,
                "courseId": payload.courseId,
                "userId": payload.userId,
                "bankId": bank_id,
                "question": payload.question,
                "error": f"Hindsight reflect returned status {response.status_code}",
            },
            success=False,
        )

    result = response.json()
    based_on = _as_dict(result.get("based_on"))
    memories = [memory for memory in _as_list(based_on.get("memories")) if isinstance(memory, dict)]
    raw_answer = str(result.get("text") or "")
    answer = _extract_answer_text(raw_answer) or "I could not find a grounded answer in the course memory."
    supporting_memories = _select_supporting_memories(
        memories,
        query=payload.question,
        answer=answer,
    )

    _log("[Agno Chat Coach Agent] Hindsight answer:")
    _log(answer)
    _log("[Agno Chat Coach Agent] Supporting memories selected:")
    _log(json.dumps(supporting_memories or memories, indent=2, ensure_ascii=False))

    return StepOutput(
        content={
            "success": True,
            "workflowName": "chat-coach-agent",
            "action": "ask_hindsight_course_question",
            "tenantId": payload.tenantId,
            "courseId": payload.courseId,
            "userId": payload.userId,
            "bankId": bank_id,
            "question": payload.question,
            "answer": answer,
            "basedOn": based_on,
            "supportingMemories": supporting_memories,
            "trace": result.get("trace"),
            "usage": result.get("usage"),
        },
        success=True,
    )


chat_coach_workflow = Workflow(
    name="chat-coach-agent",
    description=(
        "Separate AgentOS workflow that sends the learner question to Hindsight, retrieves the most relevant "
        "course memories for the tenant-course bank, and returns a grounded answer."
    ),
    steps=[
        Step(
            name="ask-hindsight-course-question",
            executor=ask_hindsight_course_question,
        ),
    ],
)
