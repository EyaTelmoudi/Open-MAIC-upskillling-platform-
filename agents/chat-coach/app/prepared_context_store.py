from __future__ import annotations

import asyncio
import json
import os
import socket
import sys
import threading
import time
from datetime import datetime, timezone
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

from hindsight_client import Hindsight

DEFAULT_HINDSIGHT_URL = os.getenv("HINDSIGHT_API_URL", "http://127.0.0.1:8888")
DEFAULT_HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY") or None
PREPARED_CONTEXT_REDIS_HOST = os.getenv("PREPARED_CONTEXT_REDIS_HOST", "127.0.0.1")
PREPARED_CONTEXT_REDIS_PORT = int(os.getenv("PREPARED_CONTEXT_REDIS_PORT", "6379"))
PREPARED_CONTEXT_REDIS_DB = int(os.getenv("PREPARED_CONTEXT_REDIS_DB", "0"))
PREPARED_CONTEXT_TTL_SECONDS = int(os.getenv("PREPARED_CONTEXT_TTL_SECONDS", "900"))
PREPARED_CONTEXT_WAIT_SECONDS = float(os.getenv("PREPARED_CONTEXT_WAIT_SECONDS", "4"))
PREPARED_CONTEXT_RECALL_TIMEOUT_SECONDS = float(
    os.getenv("PREPARED_CONTEXT_RECALL_TIMEOUT_SECONDS", "45")
)
PREPARED_CONTEXT_LOG_PREFIX = "\U0001F5C3\uFE0FPC [Prepared Coaching Context]"

_active_collections: set[str] = set()
_active_collections_lock = threading.Lock()


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _log_prepared_context(message: str, log: Callable[[str], None]) -> None:
    if message.startswith("[Agno Chat Coach Agent]"):
        message = message.replace("[Agno Chat Coach Agent]", PREPARED_CONTEXT_LOG_PREFIX, 1)
    log(message)


def _normalize_memory_text(value: object) -> str:
    return _clean_text(value).replace("\r", " ").strip()


def _slugify_value(value: str) -> str:
    cleaned = _clean_text(value).casefold()
    chars: list[str] = []
    last_sep = False
    for character in cleaned:
        if character.isalnum():
            chars.append(character)
            last_sep = False
        elif not last_sep:
            chars.append("_")
            last_sep = True
    return "".join(chars).strip("_") or "fact"


def _parse_structured_memory_line(line: str) -> dict[str, Any] | None:
    text = _clean_text(line)
    if not text.startswith("{"):
        return None
    try:
        parsed = json.loads(text)
    except Exception:
        return None
    if not isinstance(parsed, dict):
        return None
    memory_type = _clean_text(parsed.get("memory_type"))
    if memory_type not in {"learner_profile_fact", "learner_course_fact"}:
        return None
    return parsed


def _fallback_category_for_raw_line(line: str, *, course_scoped: bool) -> tuple[str, str]:
    lowered = _clean_text(line).casefold()
    if "prefers" in lowered or "likes" in lowered or "learns better when" in lowered:
        if "english is not" in lowered or "simple" in lowered or "direct" in lowered:
            return "communication_preference", _slugify_value(line)
        return "style_preference", _slugify_value(line)
    if "does not understand" in lowered or "confused" in lowered or "unclear" in lowered:
        return ("confusion_topic" if course_scoped else "difficulty_area"), _slugify_value(line)
    if "knows" in lowered or "understands" in lowered:
        return "known_topic", _slugify_value(line)
    if "experience" in lowered or "worked as" in lowered or "has been a" in lowered or "has led" in lowered:
        return "background", _slugify_value(line)
    return ("course_relevant_fact" if course_scoped else "learner_profile_fact"), _slugify_value(line)


def _aggregate_structured_profile(memory_text: str, *, course_scoped: bool) -> dict[str, Any]:
    buckets: dict[str, list[str]] = {
        "style_preferences": [],
        "communication_preferences": [],
        "known_topics": [],
        "confusion_topics": [],
        "difficulty_areas": [],
        "background_facts": [],
        "course_relevant_facts": [],
    }
    fact_confidence: dict[str, str] = {}
    structured_fact_count = 0

    def _append(bucket_name: str, value: str, confidence: str) -> None:
        cleaned_value = _clean_text(value)
        if not cleaned_value:
            return
        if cleaned_value not in buckets[bucket_name]:
            buckets[bucket_name].append(cleaned_value)
        if cleaned_value not in fact_confidence:
            fact_confidence[cleaned_value] = _clean_text(confidence) or "medium"

    for raw_line in str(memory_text or "").splitlines():
        line = _clean_text(raw_line)
        if not line:
            continue
        parsed = _parse_structured_memory_line(line)
        if parsed:
            structured_fact_count += 1
            category = _clean_text(parsed.get("fact_category"))
            fact_value = _clean_text(parsed.get("fact_value"))
            confidence = _clean_text(parsed.get("fact_confidence")) or "medium"
        else:
            category, fact_value = _fallback_category_for_raw_line(line, course_scoped=course_scoped)
            confidence = "legacy"

        if category == "style_preference":
            _append("style_preferences", fact_value, confidence)
        elif category == "communication_preference":
            _append("communication_preferences", fact_value, confidence)
        elif category == "known_topic":
            _append("known_topics", fact_value, confidence)
        elif category == "confusion_topic":
            _append("confusion_topics", fact_value, confidence)
        elif category == "difficulty_area":
            _append("difficulty_areas", fact_value, confidence)
        elif category == "background":
            _append("background_facts", fact_value, confidence)
        else:
            _append("course_relevant_facts", fact_value, confidence)

    return {
        **buckets,
        "is_new_learner": all(not values for values in buckets.values()),
        "fact_confidence": fact_confidence,
        "structured_fact_count": structured_fact_count,
    }


def _build_user_bank_id(tenant_id: str, user_id: str) -> str:
    return f"tenant:{tenant_id}:user:{user_id}"


def _build_user_course_bank_id(tenant_id: str, user_id: str, course_id: str) -> str:
    return f"tenant:{tenant_id}:user:{user_id}:course:{course_id}"


def _build_course_bank_id(tenant_id: str, course_id: str) -> str:
    return f"tenant:{tenant_id}:course:{course_id}"


def _build_general_query(
    *,
    question: str,
    extracted_general_facts: list[str],
    extracted_course_facts: list[str],
) -> str:
    parts = [
        "Return learner profile facts, preferences, prior knowledge, recurring difficulties, and stable coaching-relevant context.",
        f"Learner question: {question}",
    ]
    if extracted_general_facts:
        parts.append("Extracted general facts:")
        parts.extend(f"- {fact}" for fact in extracted_general_facts)
    if extracted_course_facts:
        parts.append("Extracted course facts:")
        parts.extend(f"- {fact}" for fact in extracted_course_facts)
    return "\n".join(parts)


def _build_course_learner_query(
    *,
    question: str,
    extracted_general_facts: list[str],
    extracted_course_facts: list[str],
    course_id: str,
) -> str:
    parts = [
        "Return learner context specific to the current course, including recurring confusion, strengths, blockers, and course-scoped preferences.",
        f"Course scope: {course_id}",
        f"Learner question: {question}",
    ]
    if extracted_general_facts:
        parts.append("Extracted general facts:")
        parts.extend(f"- {fact}" for fact in extracted_general_facts)
    if extracted_course_facts:
        parts.append("Extracted course facts:")
        parts.extend(f"- {fact}" for fact in extracted_course_facts)
    return "\n".join(parts)


def _build_course_query(*, question: str, extracted_course_facts: list[str]) -> str:
    parts = [
        "Return the most relevant course facts, concepts, and supporting context for answering this learner question.",
        f"Learner question: {question}",
    ]
    if extracted_course_facts:
        parts.append("Current extracted course facts:")
        parts.extend(f"- {fact}" for fact in extracted_course_facts)
    return "\n".join(parts)


def _encode_resp(parts: list[bytes]) -> bytes:
    payload = [f"*{len(parts)}\r\n".encode("utf-8")]
    for part in parts:
        payload.append(f"${len(part)}\r\n".encode("utf-8"))
        payload.append(part + b"\r\n")
    return b"".join(payload)


def _read_line(sock: socket.socket) -> bytes:
    chunks = bytearray()
    while True:
        chunk = sock.recv(1)
        if not chunk:
            raise ConnectionError("Redis connection closed unexpectedly.")
        chunks.extend(chunk)
        if chunks.endswith(b"\r\n"):
            return bytes(chunks[:-2])


def _read_exact(sock: socket.socket, size: int) -> bytes:
    chunks = bytearray()
    while len(chunks) < size:
        chunk = sock.recv(size - len(chunks))
        if not chunk:
            raise ConnectionError("Redis connection closed unexpectedly.")
        chunks.extend(chunk)
    return bytes(chunks)


def _parse_resp(sock: socket.socket) -> Any:
    prefix = _read_exact(sock, 1)
    if prefix == b"+":
        return _read_line(sock).decode("utf-8", errors="replace")
    if prefix == b"-":
        raise RuntimeError(_read_line(sock).decode("utf-8", errors="replace"))
    if prefix == b":":
        return int(_read_line(sock))
    if prefix == b"$":
        length = int(_read_line(sock))
        if length < 0:
            return None
        data = _read_exact(sock, length)
        _read_exact(sock, 2)
        return data.decode("utf-8", errors="replace")
    if prefix == b"*":
        count = int(_read_line(sock))
        if count < 0:
            return None
        return [_parse_resp(sock) for _ in range(count)]
    raise RuntimeError(f"Unsupported Redis RESP prefix: {prefix!r}")


def _run_redis_command(*parts: object) -> Any:
    encoded_parts = [str(part).encode("utf-8") for part in parts]
    with socket.create_connection(
        (PREPARED_CONTEXT_REDIS_HOST, PREPARED_CONTEXT_REDIS_PORT),
        timeout=2.5,
    ) as sock:
        sock.settimeout(2.5)
        if PREPARED_CONTEXT_REDIS_DB:
            sock.sendall(_encode_resp([b"SELECT", str(PREPARED_CONTEXT_REDIS_DB).encode("utf-8")]))
            _parse_resp(sock)
        sock.sendall(_encode_resp(encoded_parts))
        return _parse_resp(sock)


def store_prepared_context(
    *,
    prepared_context_id: str,
    payload: dict[str, Any],
    log: Callable[[str], None] | None = None,
) -> bool:
    try:
        _run_redis_command(
            "SET",
            f"prepared_coaching_context:{prepared_context_id}",
            json.dumps(payload, ensure_ascii=False),
            "EX",
            PREPARED_CONTEXT_TTL_SECONDS,
        )
        if log:
            _log_prepared_context(
                "[Agno Chat Coach Agent] Prepared coaching context stored in Redis. "
                f"preparedContextId={prepared_context_id} ttlSeconds={PREPARED_CONTEXT_TTL_SECONDS}",
                log,
            )
        return True
    except Exception as error:
        if log:
            _log_prepared_context(
                "[Agno Chat Coach Agent] Prepared coaching context Redis write failed: "
                f"{type(error).__name__}: {error}",
                log,
            )
        return False


def upsert_prepared_context_facts(
    *,
    prepared_context_id: str,
    general_facts: list[str],
    course_facts: list[str],
    extraction_reasoning: str | None,
    log: Callable[[str], None] | None = None,
) -> bool:
    key = f"prepared_coaching_context:{prepared_context_id}"
    try:
        raw = _run_redis_command("GET", key)
        payload: dict[str, Any]
        if isinstance(raw, str) and raw.strip():
            parsed = json.loads(raw)
            payload = parsed if isinstance(parsed, dict) else {}
        else:
            payload = {"prepared_context_id": prepared_context_id}

        payload["general_facts"] = [_clean_text(item) for item in general_facts if _clean_text(item)]
        payload["course_facts"] = [_clean_text(item) for item in course_facts if _clean_text(item)]
        payload["extraction_reasoning"] = _clean_text(extraction_reasoning) or None
        payload["facts_updated_at"] = datetime.now(timezone.utc).isoformat()

        _run_redis_command(
            "SET",
            key,
            json.dumps(payload, ensure_ascii=False),
            "EX",
            PREPARED_CONTEXT_TTL_SECONDS,
        )
        if log:
            _log_prepared_context(
                "[Agno Chat Coach Agent] Extracted learner discussion facts were upserted into Redis. "
                f"preparedContextId={prepared_context_id} generalFacts={payload['general_facts']} "
                f"courseFacts={payload['course_facts']}",
                log,
            )
        return True
    except Exception as error:
        if log:
            _log_prepared_context(
                "[Agno Chat Coach Agent] Prepared coaching context facts upsert failed: "
                f"{type(error).__name__}: {error}",
                log,
            )
        return False


def load_prepared_context(
    prepared_context_id: str,
    *,
    wait_seconds: float = 0.0,
    poll_interval_seconds: float = 0.25,
    log: Callable[[str], None] | None = None,
) -> dict[str, Any] | None:
    if log:
        _log_prepared_context(
            "[Agno Chat Coach Agent] Starting prepared coaching context Redis read. "
            f"preparedContextId={prepared_context_id} waitSeconds={wait_seconds}",
            log,
        )
    deadline = time.time() + max(0.0, wait_seconds)
    while True:
        try:
            raw = _run_redis_command("GET", f"prepared_coaching_context:{prepared_context_id}")
            if isinstance(raw, str) and raw.strip():
                payload = json.loads(raw)
                if isinstance(payload, dict):
                    if log:
                        _log_prepared_context(
                            "[Agno Chat Coach Agent] Prepared coaching context loaded from Redis. "
                            f"preparedContextId={prepared_context_id} "
                            f"generalFacts={len(payload.get('general_facts') or [])} "
                            f"courseFacts={len(payload.get('course_facts') or [])}",
                            log,
                        )
                    return payload
        except Exception as error:
            if log:
                _log_prepared_context(
                    "[Agno Chat Coach Agent] Prepared coaching context Redis read failed: "
                    f"{type(error).__name__}: {error}",
                    log,
                )
            return None

        if time.time() >= deadline:
            if log:
                _log_prepared_context(
                    "[Agno Chat Coach Agent] Prepared coaching context Redis read finished without a cached entry. "
                    f"preparedContextId={prepared_context_id}",
                    log,
                )
            return None
        time.sleep(poll_interval_seconds)


async def _arecall_bank(*, bank_id: str, query: str) -> str:
    client = Hindsight(
        base_url=DEFAULT_HINDSIGHT_URL,
        api_key=DEFAULT_HINDSIGHT_API_KEY or None,
        timeout=PREPARED_CONTEXT_RECALL_TIMEOUT_SECONDS,
    )
    try:
        result = await client.arecall(
            bank_id=bank_id,
            query=query,
            budget="low",
            max_tokens=900,
        )
        return "\n".join(
            _clean_text(getattr(item, "content", "") or getattr(item, "text", ""))
            for item in getattr(result, "results", [])
            if _clean_text(getattr(item, "content", "") or getattr(item, "text", ""))
        ).strip()
    finally:
        try:
            await client.aclose()
        except Exception:
            pass


def _extract_reflect_supporting_memories(reflect_result: dict[str, Any], *, limit: int = 8) -> list[dict[str, Any]]:
    based_on = reflect_result.get("based_on")
    if not isinstance(based_on, dict):
        return []
    if isinstance(based_on.get("memories"), list):
        return [item for item in based_on["memories"][:limit] if isinstance(item, dict)]

    flattened: list[dict[str, Any]] = []
    for value in based_on.values():
        if not isinstance(value, list):
            continue
        for item in value:
            if isinstance(item, dict):
                flattened.append(item)
            if len(flattened) >= limit:
                return flattened
    return flattened[:limit]


def _reflect_result_to_memory_text(reflect_result: dict[str, Any]) -> str:
    supporting_memories = _extract_reflect_supporting_memories(reflect_result)
    lines: list[str] = []
    for item in supporting_memories:
        text = _clean_text(item.get("text") or item.get("content") or item.get("memory"))
        if text and text not in lines:
            lines.append(text)

    answer_text = _clean_text(reflect_result.get("text"))
    if answer_text and answer_text not in lines:
        lines.append(answer_text)
    return "\n".join(lines).strip()


async def _areflect_bank(
    *,
    bank_id: str,
    query: str,
    budget: str = "low",
    max_tokens: int = 700,
) -> dict[str, Any]:
    headers = {"Content-Type": "application/json"}
    if DEFAULT_HINDSIGHT_API_KEY:
        headers["Authorization"] = f"Bearer {DEFAULT_HINDSIGHT_API_KEY}"

    payload = {
        "query": query,
        "budget": budget,
        "max_tokens": max_tokens,
        "include": {"facts": {}},
    }
    timeout = httpx.Timeout(
        connect=10.0,
        read=PREPARED_CONTEXT_RECALL_TIMEOUT_SECONDS,
        write=30.0,
        pool=30.0,
    )
    async with httpx.AsyncClient(trust_env=False) as client:
        response = await client.post(
            f"{DEFAULT_HINDSIGHT_URL.rstrip('/')}/v1/default/banks/{bank_id}/reflect",
            headers=headers,
            json=payload,
            timeout=timeout,
        )
    response.raise_for_status()
    parsed = response.json()
    return parsed if isinstance(parsed, dict) else {}


def start_prepared_context_collection(
    *,
    prepared_context_id: str,
    tenant_id: str,
    user_id: str,
    course_id: str,
    session_id: str | None,
    question: str,
    extracted_general_facts: list[str],
    extracted_course_facts: list[str],
    extraction_reasoning: str | None,
    log: Callable[[str], None],
) -> None:
    if not prepared_context_id or not tenant_id or not user_id or not course_id or not question:
        return

    with _active_collections_lock:
        if prepared_context_id in _active_collections:
            _log_prepared_context(
                "[Agno Chat Coach Agent] Prepared coaching context collection is already running. "
                f"preparedContextId={prepared_context_id}",
                log,
            )
            return
        _active_collections.add(prepared_context_id)

    def _runner() -> None:
        try:
            _log_prepared_context(
                "[Agno Chat Coach Agent] Prepared coaching context collection started in parallel. "
                f"preparedContextId={prepared_context_id}",
                log,
            )
            tenant_user_bank = _build_user_bank_id(tenant_id, user_id)
            tenant_user_course_bank = _build_user_course_bank_id(tenant_id, user_id, course_id)
            tenant_course_bank = _build_course_bank_id(tenant_id, course_id)

            general_query = _build_general_query(
                question=question,
                extracted_general_facts=extracted_general_facts,
                extracted_course_facts=extracted_course_facts,
            )
            course_learner_query = _build_course_learner_query(
                question=question,
                extracted_general_facts=extracted_general_facts,
                extracted_course_facts=extracted_course_facts,
                course_id=course_id,
            )
            course_query = _build_course_query(
                question=question,
                extracted_course_facts=extracted_course_facts,
            )

            async def _collect_all() -> tuple[str, str, dict[str, Any]]:
                _log_prepared_context(
                    "[Agno Chat Coach Agent] Prepared context parallel recall started for bank="
                    f"{tenant_user_bank}",
                    log,
                )
                _log_prepared_context(
                    "[Agno Chat Coach Agent] Prepared context recall query prepared for bank="
                    f"{tenant_user_bank} queryPreview={_clean_text(general_query)[:180]}",
                    log,
                )
                _log_prepared_context(
                    "[Agno Chat Coach Agent] Prepared context parallel recall started for bank="
                    f"{tenant_user_course_bank}",
                    log,
                )
                _log_prepared_context(
                    "[Agno Chat Coach Agent] Prepared context recall query prepared for bank="
                    f"{tenant_user_course_bank} queryPreview={_clean_text(course_learner_query)[:180]}",
                    log,
                )
                _log_prepared_context(
                    "[Agno Chat Coach Agent] Prepared context parallel reflect started for bank="
                    f"{tenant_course_bank}",
                    log,
                )
                _log_prepared_context(
                    "[Agno Chat Coach Agent] Prepared context reflect query prepared for bank="
                    f"{tenant_course_bank} queryPreview={_clean_text(course_query)[:180]}",
                    log,
                )
                return await asyncio.gather(
                    _arecall_bank(bank_id=tenant_user_bank, query=general_query),
                    _arecall_bank(bank_id=tenant_user_course_bank, query=course_learner_query),
                    _areflect_bank(bank_id=tenant_course_bank, query=course_query),
                )

            (
                tenant_user_memories,
                tenant_user_course_memories,
                tenant_course_reflect,
            ) = asyncio.run(
                _collect_all()
            )
            tenant_course_memories = _reflect_result_to_memory_text(tenant_course_reflect)

            _log_prepared_context(
                "[Agno Chat Coach Agent] Prepared context recall completed for bank="
                f"{tenant_user_bank} chars={len(tenant_user_memories)}",
                log,
            )
            _log_prepared_context(
                "[Agno Chat Coach Agent] Prepared context recall completed for bank="
                f"{tenant_user_course_bank} chars={len(tenant_user_course_memories)}",
                log,
            )
            _log_prepared_context(
                "[Agno Chat Coach Agent] Prepared context reflect completed for bank="
                f"{tenant_course_bank} chars={len(tenant_course_memories)} "
                f"supportingMemories={len(_extract_reflect_supporting_memories(tenant_course_reflect))}",
                log,
            )
            _log_prepared_context(
                "[Agno Chat Coach Agent] Prepared context mixed recall/reflect finished for all 3 banks. "
                f"preparedContextId={prepared_context_id}",
                log,
            )

            prepared_payload = {
                "prepared_context_id": prepared_context_id,
                "tenant_id": tenant_id,
                "user_id": user_id,
                "course_id": course_id,
                "session_id": session_id,
                "question": question,
                "tenant_user_bank_id": tenant_user_bank,
                "tenant_user_course_bank_id": tenant_user_course_bank,
                "tenant_course_bank_id": tenant_course_bank,
                "tenant_user_memories": _normalize_memory_text(tenant_user_memories),
                "tenant_user_course_memories": _normalize_memory_text(tenant_user_course_memories),
                "tenant_course_memories": _normalize_memory_text(tenant_course_memories),
                "tenant_course_reflect_result": tenant_course_reflect,
                "tenant_user_structured_profile": _aggregate_structured_profile(
                    tenant_user_memories,
                    course_scoped=False,
                ),
                "tenant_user_course_structured_profile": _aggregate_structured_profile(
                    tenant_user_course_memories,
                    course_scoped=True,
                ),
                "general_facts": extracted_general_facts,
                "course_facts": extracted_course_facts,
                "extraction_reasoning": _clean_text(extraction_reasoning) or None,
                "prepared_at": datetime.now(timezone.utc).isoformat(),
            }
            store_prepared_context(
                prepared_context_id=prepared_context_id,
                payload=prepared_payload,
                log=log,
            )
            _log_prepared_context(
                "[Agno Chat Coach Agent] Prepared coaching context collection finished successfully. "
                f"preparedContextId={prepared_context_id}",
                log,
            )
        except Exception as error:
            _log_prepared_context(
                "[Agno Chat Coach Agent] Prepared coaching context collection failed: "
                f"{type(error).__name__}: {error}",
                log,
            )
        finally:
            with _active_collections_lock:
                _active_collections.discard(prepared_context_id)

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
