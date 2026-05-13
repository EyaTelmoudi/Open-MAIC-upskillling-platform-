from __future__ import annotations

import asyncio
import concurrent.futures
import os
import sys
import threading
from pathlib import Path
from typing import Any, Callable

import httpx

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

from agno.workflow import StepInput, StepOutput
DEFAULT_HINDSIGHT_URL = os.getenv("HINDSIGHT_API_URL", "http://127.0.0.1:8888")
DEFAULT_HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY") or None
USER_INFO_BRANCH_TIMEOUT_SECONDS = float(os.getenv("CHAT_COACH_USER_INFO_BRANCH_TIMEOUT_SECONDS", "25"))
MEMORY_HTTP_TIMEOUT_SECONDS = float(os.getenv("CHAT_COACH_HINDSIGHT_RETAIN_HTTP_TIMEOUT_SECONDS", "20"))

def _one_line_preview(value: Any, *, limit: int = 240) -> str:
    text = str(value or "").replace("\r", " ").replace("\n", " ").strip()
    if len(text) <= limit:
        return text
    return text[: limit - 3] + "..."


def _normalize_memory_text(value: str) -> str:
    return " ".join(str(value or "").lower().replace("|", " ").split())


def _extract_candidate_memory_facts(question: str) -> list[str]:
    normalized_question = _normalize_memory_text(question)
    candidates: list[str] = []

    if "prefer short answers" in normalized_question or "prefer short answer" in normalized_question:
        candidates.append("[style] Learner prefers short answers.")
    if "short explanations" in normalized_question or "short explanation" in normalized_question:
        candidates.append("[style] Learner prefers short explanations.")
    if "real examples" in normalized_question or "real example" in normalized_question:
        candidates.append("[style] Learner prefers real examples.")
    if "already know scrum" in normalized_question or "already knows scrum" in normalized_question:
        candidates.append("[mastered] Learner already knows Scrum.")
    if "i am confused" in normalized_question or "im confused" in normalized_question or "i'm confused" in normalized_question:
        candidates.append("[struggle] Learner is confused about the course idea.")

    # Preserve order while deduplicating.
    seen: set[str] = set()
    ordered: list[str] = []
    for candidate in candidates:
        if candidate not in seen:
            seen.add(candidate)
            ordered.append(candidate)
    return ordered


def _all_candidate_facts_already_known(candidates: list[str], recalled_preview: str) -> bool:
    if not candidates:
        return False

    normalized_preview = _normalize_memory_text(recalled_preview)
    if not normalized_preview:
        return False

    return all(_normalize_memory_text(candidate) in normalized_preview for candidate in candidates)


def _run_async_in_isolated_loop(
    async_factory: Callable[[], Any],
    *,
    timeout_seconds: float,
) -> Any:
    result_holder: dict[str, Any] = {}
    error_holder: dict[str, BaseException] = {}

    def _runner() -> None:
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            result_holder["value"] = loop.run_until_complete(async_factory())
        except BaseException as error:  # noqa: BLE001
            error_holder["error"] = error
        finally:
            try:
                pending = [task for task in asyncio.all_tasks(loop) if not task.done()]
                for task in pending:
                    task.cancel()
                if pending:
                    loop.run_until_complete(asyncio.gather(*pending, return_exceptions=True))
            except Exception:
                pass
            asyncio.set_event_loop(None)
            loop.close()

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
    thread.join(timeout_seconds)

    if thread.is_alive():
        raise concurrent.futures.TimeoutError(
            f"Async Hindsight call exceeded {timeout_seconds} seconds."
        )
    if "error" in error_holder:
        raise error_holder["error"]
    return result_holder.get("value")

async def _aretain_fact_http(
    *,
    bank_id: str,
    fact: str,
    session_id: str | None,
) -> dict[str, Any]:
    headers = {"Content-Type": "application/json"}
    if DEFAULT_HINDSIGHT_API_KEY:
        headers["Authorization"] = f"Bearer {DEFAULT_HINDSIGHT_API_KEY}"

    payload = {
        "items": [
            {
                "content": fact,
                "metadata": {"session_id": session_id or ""},
                "tags": ["scope:learner", "type:user_fact"],
            }
        ],
        "async": True,
    }
    timeout = httpx.Timeout(MEMORY_HTTP_TIMEOUT_SECONDS)
    async with httpx.AsyncClient(timeout=timeout) as client:
        response = await client.post(
            f"{DEFAULT_HINDSIGHT_URL.rstrip('/')}/v1/default/banks/{bank_id}/memories",
            json=payload,
            headers=headers,
        )

    if response.status_code >= 400:
        return {
            "success": False,
            "statusCode": response.status_code,
            "responseText": response.text,
        }

    response_data = response.json()
    operation_id = str(response_data.get("operation_id") or "").strip() or None
    return {
        "success": True,
        "async": bool(response_data.get("async")),
        "operationId": operation_id,
    }


def _run_memory_collection(*, question: str, user_id: str, session_id: str | None, log: Callable[[str], None]) -> dict[str, Any]:
    if not question or not user_id:
        return {"started": False, "saved": False, "reason": "missing_question_or_user"}

    log(
        "[Agno Chat Coach Agent] Parallel user information collection input: "
        f"userId={user_id} sessionId={session_id or 'none'} question=\"{_one_line_preview(question)}\""
    )

    try:
        candidate_facts = _extract_candidate_memory_facts(question)
        if not candidate_facts:
            log("[Agno Chat Coach Agent] Parallel user information collection found no memory-worthy learner facts.")
            return {
                "started": True,
                "saved": False,
                "reason": "no_memory_found",
                "toolCallCount": 0,
                "failedToolCallCount": 0,
            }
    except Exception as error:
        log(f"[Agno Chat Coach Agent] Parallel user information collection setup failed: {error}")
        return {"started": True, "saved": False, "reason": "setup_failed", "error": str(error)}

    try:
        retained_facts: list[str] = []
        operation_ids: list[str] = []
        for fact in candidate_facts:
            retain_result = _run_async_in_isolated_loop(
                lambda fact=fact: _aretain_fact_http(
                    bank_id=user_id,
                    fact=fact,
                    session_id=session_id,
                ),
                timeout_seconds=USER_INFO_BRANCH_TIMEOUT_SECONDS,
            )
            if not bool(retain_result.get("success")):
                raise RuntimeError(f"retain_memory returned non-success result: {retain_result}")
            retained_facts.append(fact)
            operation_id = str(retain_result.get("operationId") or "").strip()
            if operation_id:
                operation_ids.append(operation_id)

        log(
            "[Agno Chat Coach Agent] Parallel user information collection run completed: "
            f"status=completed_direct_hindsight model=none"
        )
        log("[Agno Chat Coach Agent] Parallel user information collection agent output: MEMORY_CAPTURE_COMPLETE")
        log(
            "[Agno Chat Coach Agent] Parallel user information collection retained learner facts: "
            f"{_one_line_preview(retained_facts)}"
        )
        if operation_ids:
            log(
                "[Agno Chat Coach Agent] Parallel user information collection Hindsight operation IDs: "
                f"{_one_line_preview(operation_ids)}"
            )

        return {
            "started": True,
            "saved": bool(retained_facts),
            "model": "none",
            "runStatus": "completed_direct_hindsight",
            "recalledPreview": "",
            "toolCallCount": len(retained_facts),
            "failedToolCallCount": 0,
            "operationIds": operation_ids,
        }
    except concurrent.futures.TimeoutError:
        log(
            "[Agno Chat Coach Agent] Parallel user information collection timed out. "
            f"timeoutSeconds={USER_INFO_BRANCH_TIMEOUT_SECONDS}"
        )
        return {
            "started": True,
            "saved": False,
            "reason": "timed_out",
            "timeoutSeconds": USER_INFO_BRANCH_TIMEOUT_SECONDS,
        }
    except Exception as error:
        log(f"[Agno Chat Coach Agent] Parallel user information collection failed: {error}")
        return {"started": True, "saved": False, "reason": "run_failed", "error": str(error)}


def collect_user_information_parallel(
    step_input: StepInput,
    *,
    ensure_validated_content: Callable[[StepInput], dict[str, Any]],
    log: Callable[[str], None],
) -> StepOutput:
    previous_content = ensure_validated_content(step_input)
    if previous_content.get("success") is False:
        return StepOutput(content=previous_content, success=False)

    log("ai coaching agnet start the section parllel of collecting informations about the user")

    validated_context = previous_content.get("validatedContext")
    validated_context = validated_context if isinstance(validated_context, dict) else {}
    question = str(previous_content.get("question") or "").strip()
    user_id = str(previous_content.get("userId") or validated_context.get("user_id") or "").strip()
    session_id = str(validated_context.get("session_id") or previous_content.get("sessionId") or "").strip() or None

    result = _run_memory_collection(
        question=question,
        user_id=user_id,
        session_id=session_id,
        log=log,
    )

    return StepOutput(
        content={
            "action": "collect_user_information_parallel",
            **result,
        },
        success=True,
    )
