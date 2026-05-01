from __future__ import annotations

import json
import os
import re
import sys
from datetime import datetime, timezone

import httpx
from pydantic import BaseModel

from agno.workflow import Step, StepInput, StepOutput, Workflow


DEFAULT_HINDSIGHT_URL = os.getenv("HINDSIGHT_API_URL", "http://127.0.0.1:8888")
DEFAULT_HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY", "")
DEFAULT_QUESTION = (
    "In this HTML course, why is the alt attribute important for images, "
    "and what does the course say about the src attribute?"
)


class ChatCoachQuestionInput(BaseModel):
    tenantId: str
    courseId: str
    question: str = DEFAULT_QUESTION
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

        bonus = 0
        lowered = text.lower()
        if "<nav>" in lowered:
            bonus += 5
        if "navigation" in lowered:
            bonus += 4
        if "alt attribute" in lowered or "src attribute" in lowered:
            bonus += 6
        if "correct answer" in lowered:
            bonus += 2

        score = (query_overlap * 4) + (answer_overlap * 2) + bonus
        if score > 0:
            scored.append((score, memory))

    scored.sort(key=lambda item: item[0], reverse=True)
    return [memory for _, memory in scored[:limit]]


def ask_hindsight_reflect(step_input: StepInput) -> StepOutput:
    payload = ChatCoachQuestionInput.model_validate(step_input.input)
    hindsight_url = (payload.hindsightApiUrl or DEFAULT_HINDSIGHT_URL).rstrip("/")
    hindsight_api_key = payload.hindsightApiKey or DEFAULT_HINDSIGHT_API_KEY
    bank_id = f"tenant:{payload.tenantId}:courses"
    tags = [f"course:{payload.courseId}"]

    reflect_payload = {
        "query": payload.question,
        "budget": "low",
        "max_tokens": 500,
        "include": {
            "facts": {},
            "tool_calls": {"output": False},
        },
        "tags": tags,
        "tags_match": "all_strict",
    }

    headers = {"Content-Type": "application/json"}
    if hindsight_api_key:
        headers["Authorization"] = f"Bearer {hindsight_api_key}"

    _log("")
    _log("============================================================")
    _log("[Agno Chat Coach Agent] Request received")
    _log("- Workflow: chat-coach-agent")
    _log("- Action: ask_hindsight_course_question")
    _log(f"- Time: {datetime.now(timezone.utc).isoformat()}")
    _log(f"- Tenant ID: {payload.tenantId}")
    _log(f"- Course ID: {payload.courseId}")
    _log(f"- Target bank ID: {bank_id}")
    _log("[Agno Chat Coach Agent] Reflect payload that will be sent to Hindsight:")
    _log(json.dumps(reflect_payload, indent=2, ensure_ascii=False))

    with httpx.Client(timeout=90.0) as client:
        response = client.post(
            f"{hindsight_url}/v1/default/banks/{bank_id}/reflect",
            headers=headers,
            json=reflect_payload,
        )

    if response.status_code >= 400:
        _log("[Agno Chat Coach Agent] Hindsight reflect failed.")
        _log(f"- Status: {response.status_code}")
        _log(f"- Body: {response.text}")
        _log("============================================================")
        _log("")
        return StepOutput(
            content={
                "success": False,
                "workflowName": "chat-coach-agent",
                "action": "ask_hindsight_course_question",
                "tenantId": payload.tenantId,
                "courseId": payload.courseId,
                "bankId": bank_id,
                "question": payload.question,
                "error": f"Hindsight reflect returned status {response.status_code}",
            },
            success=False,
        )

    result = response.json()
    based_on = result.get("based_on") or {}
    memories = based_on.get("memories") or []
    answer = str(result.get("text") or "")
    supporting_memories = _select_supporting_memories(
        [memory for memory in memories if isinstance(memory, dict)],
        query=payload.question,
        answer=answer,
    )

    _log("[Agno Chat Coach Agent] Hindsight answer:")
    _log(answer.strip() or "(empty)")
    _log("[Agno Chat Coach Agent] Proof from retained course memories (based_on.memories):")
    _log(json.dumps(supporting_memories or memories, indent=2, ensure_ascii=False))
    _log("[Agno Chat Coach Agent] Tool trace:")
    _log(json.dumps((result.get("trace") or {}).get("tool_calls") or [], indent=2, ensure_ascii=False))
    _log("============================================================")
    _log("")

    return StepOutput(
        content={
            "success": True,
            "workflowName": "chat-coach-agent",
            "action": "ask_hindsight_course_question",
            "tenantId": payload.tenantId,
            "courseId": payload.courseId,
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
        "Separate AgentOS workflow that asks Hindsight a course question against the tenant course bank "
        "and returns the answer plus retrieved evidence."
    ),
    steps=[
        Step(
            name="ask-hindsight-course-question",
            executor=ask_hindsight_reflect,
        )
    ],
)
