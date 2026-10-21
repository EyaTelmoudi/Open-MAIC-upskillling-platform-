from __future__ import annotations

import json
import os
import re
import sys
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any
from urllib.parse import quote

import httpx
from pydantic import BaseModel

from agno.workflow import Step, StepInput, StepOutput, Workflow

DEFAULT_HINDSIGHT_URL = os.getenv("HINDSIGHT_URL", os.getenv("HINDSIGHT_API_URL", "http://127.0.0.1:8888"))
DEFAULT_HINDSIGHT_API_KEY = os.getenv("HINDSIGHT_API_KEY", "")
AGENT_PREFIX = "[Agno Recommendation Agent]"


def _log(message: str) -> None:
    print(f"{AGENT_PREFIX} {message}", file=sys.stderr, flush=True)


def _clean_text(value: object) -> str:
    return str(value or "").strip()


def _build_skill_profile_bank_id(tenant_id: str, user_id: str) -> str:
    return f"tenant:{tenant_id}:user:{user_id}:skill-profile"


def _build_user_course_bank_prefix(tenant_id: str, user_id: str) -> str:
    return f"tenant:{tenant_id}:user:{user_id}:course:"


def _build_course_bank_id(tenant_id: str, course_id: str) -> str:
    return f"tenant:{tenant_id}:course:{course_id}"


def _hindsight_headers() -> dict[str, str]:
    headers = {"Content-Type": "application/json"}
    if DEFAULT_HINDSIGHT_API_KEY:
        headers["Authorization"] = f"Bearer {DEFAULT_HINDSIGHT_API_KEY}"
    return headers


def _hindsight_client(timeout: float) -> httpx.Client:
    return httpx.Client(timeout=timeout, trust_env=False)


def _parse_json_object_from_text(text: str) -> dict[str, Any] | None:
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


def _call_hindsight_reflect(*, bank_id: str, query: str, max_tokens: int) -> dict[str, Any]:
    hindsight_url = DEFAULT_HINDSIGHT_URL.rstrip("/")
    with _hindsight_client(timeout=180.0) as client:
        response = client.post(
            f"{hindsight_url}/v1/default/banks/{quote(bank_id, safe='')}/reflect",
            headers=_hindsight_headers(),
            json={
                "query": query,
                "max_tokens": max_tokens,
            },
        )

    response_body = response.json() if response.content else {}
    if not response.is_success:
        detail = (
            _clean_text(response_body.get("error")) if isinstance(response_body, dict) else ""
        ) or (
            _clean_text(response_body.get("detail")) if isinstance(response_body, dict) else ""
        ) or f"Hindsight reflect failed with status {response.status_code}."
        raise RuntimeError(detail)

    answer_text = ""
    if isinstance(response_body, dict):
        answer_text = _clean_text(response_body.get("answer") or response_body.get("text"))
    if not answer_text:
        answer_text = _clean_text(response.text)

    return {
        "bankId": bank_id,
        "answer": answer_text,
        "parsedAnswer": _parse_json_object_from_text(answer_text),
        "rawResponse": response_body if isinstance(response_body, dict) else {},
    }


def _extract_course_title_from_text(text: str) -> str:
    cleaned = _clean_text(text)
    if not cleaned:
        return ""

    patterns = [
        r'course\s+"([^"]+)"',
        r"course\s+'([^']+)'",
        r"Course Title:\s*(.+?)(?:\r?\n|$)",
        r"course_title=([^\n;|]+)",
    ]
    for pattern in patterns:
        match = re.search(pattern, cleaned, flags=re.IGNORECASE)
        if match:
            return _clean_text(match.group(1))
    return ""


def _list_learner_course_banks(tenant_id: str, user_id: str) -> list[dict[str, str]]:
    hindsight_url = DEFAULT_HINDSIGHT_URL.rstrip("/")
    prefix = _build_user_course_bank_prefix(tenant_id, user_id)

    _log(
        "Calling Hindsight bank listing to discover learner-course banks "
        f"for tenant={tenant_id} user={user_id}"
    )
    with _hindsight_client(timeout=60.0) as client:
        response = client.get(
            f"{hindsight_url}/v1/default/banks",
            headers=_hindsight_headers(),
        )

    response_body = response.json() if response.content else {}
    if not response.is_success:
        detail = (
            _clean_text(response_body.get("error"))  # type: ignore[arg-type]
            or _clean_text(response_body.get("detail"))  # type: ignore[arg-type]
            or "Failed to list Hindsight banks."
        )
        raise RuntimeError(detail)

    banks = response_body.get("banks") if isinstance(response_body, dict) else []
    discovered: list[dict[str, str]] = []
    for bank in banks if isinstance(banks, list) else []:
        if not isinstance(bank, dict):
            continue
        bank_id = _clean_text(bank.get("bank_id"))
        if not bank_id.startswith(prefix):
            continue
        course_id = bank_id.removeprefix(prefix)
        if not course_id:
            continue
        discovered.append(
            {
                "bankId": bank_id,
                "courseId": course_id,
                "bankName": _clean_text(bank.get("name")),
            }
        )

    return discovered


def _resolve_course_title_from_bank(bank_id: str, course_id: str) -> str:
    hindsight_url = DEFAULT_HINDSIGHT_URL.rstrip("/")
    with _hindsight_client(timeout=60.0) as client:
        response = client.get(
            f"{hindsight_url}/v1/default/banks/{quote(bank_id, safe='')}/memories/list?limit=12&offset=0",
            headers=_hindsight_headers(),
        )

    response_body = response.json() if response.content else {}
    if not response.is_success:
        return course_id

    items = response_body.get("items") if isinstance(response_body, dict) else []
    for item in items if isinstance(items, list) else []:
        if not isinstance(item, dict):
            continue
        title = _extract_course_title_from_text(
            _clean_text(item.get("text")) or _clean_text(item.get("context"))
        )
        if title:
            return title

    return course_id


def _scan_learner_course_titles_from_hindsight(tenant_id: str, user_id: str) -> list[dict[str, str]]:
    discovered_banks = _list_learner_course_banks(tenant_id, user_id)
    if not discovered_banks:
        _log("No learner-course banks were found in Hindsight for this learner.")
        return []

    _log("Learner-course banks discovered from Hindsight:")
    for item in discovered_banks:
        _log(
            f"bankId={item['bankId']} courseId={item['courseId']}"
        )

    resolved_courses: list[dict[str, str]] = []
    for item in discovered_banks:
        course_title = _resolve_course_title_from_bank(item["bankId"], item["courseId"])
        resolved_courses.append(
            {
                "bankId": item["bankId"],
                "courseId": item["courseId"],
                "courseTitle": course_title,
            }
        )

    _log("Learner course titles collected from Hindsight:")
    for index, course in enumerate(resolved_courses, start=1):
        _log(f"{index}. {course['courseTitle']}")

    return resolved_courses


def _classify_recalled_text(text: str) -> tuple[str, str]:
    cleaned = _clean_text(text)
    lowered = cleaned.lower()
    if not cleaned:
        return "ignore", "Empty memory text."

    if (
        "will not select the same failed concept again" in lowered
        or "unless a new failure appears" in lowered
        or "already remediated" in lowered
        or "resolved concept signal" in lowered
        or "confirming mastery" in lowered
        or ("answered the reinforcement challenge correctly" in lowered)
        or ("answered correctly" in lowered and "should not be selected again" in lowered)
        or ("answered correctly" in lowered and "solo challenge" in lowered)
    ):
        return "remediated_concept", "Recall says the learner already remediated or mastered the concept."

    if (
        "resolved concept signal" in lowered
        or ("correctly answered" in lowered and "solo challenge" in lowered)
        or ('result: correct' in lowered and "solo challenge" in lowered)
        or ("answered the solo challenge" in lowered and "correctly" in lowered)
    ):
        return "remediated_concept", "Recall says the learner answered correctly or confirmed mastery."

    if "solo challenge" in lowered and (
        "result false" in lowered
        or "incorrectly" in lowered
        or "score of 0.0" in lowered
        or "received a false result" in lowered
    ):
        return "solo_challenge_outcome", "Recall describes an incorrect solo challenge outcome."

    if (
        ("quiz" in lowered and "failed" in lowered)
        or "wrong answer" in lowered
        or ("correct answer" in lowered and "user answered" in lowered)
    ):
        return "wrong_quiz_answer", "Recall describes a failed quiz or an explicitly wrong answer."

    if "coaching message" in lowered or "[coaching_discussion]" in lowered:
        return "coaching_discussion_theme", "Recall points to a coaching discussion event."

    if "confused" in lowered or "confusion" in lowered:
        return "repeated_confusion", "Recall explicitly mentions confusion."

    if (
        "did not understand" in lowered
        or "didn't understand" in lowered
        or "does not understand" in lowered
        or "showed difficulty" in lowered
        or "reported difficulty" in lowered
        or "having problems understanding" in lowered
        or "demande de l'aide" in lowered
        or "ne pas avoir compris" in lowered
    ):
        return "learner_difficulty", "Recall explicitly says the learner reported difficulty."

    if (
        "not yet remediated" in lowered
        or ("failed" in lowered and "quiz" not in lowered and "solo challenge" not in lowered)
        or "still weak" in lowered
        or "still unresolved" in lowered
    ):
        return "unresolved_concept", "Recall indicates a concept remains unresolved."

    if (
        "completed the course" in lowered
        or "completed enrollment" in lowered
        or "opened lesson" in lowered
        or "watched " in lowered
        or "progress signal" in lowered
    ):
        return "ignore", "Recall is generic progress or completion noise."

    return "other_signal", "Recall is informative but does not match a core skill-gap category."


def _recall_skill_signal_candidates_for_course(
    tenant_id: str,
    user_id: str,
    course_id: str,
    course_title: str,
) -> dict[str, Any]:
    bank_id = f"tenant:{tenant_id}:user:{user_id}:course:{course_id}"
    hindsight_url = DEFAULT_HINDSIGHT_URL.rstrip("/")
    payload = {
        "query": (
            "What are this learner's difficulties, wrong quiz answers, repeated confusion, "
            "unresolved concepts, remediated concepts, solo challenge outcomes, and coaching "
            "discussion themes in this course?"
        ),
        "budget": "mid",
        "max_tokens": 1600,
        "include": {
            "facts": {},
        },
    }

    with _hindsight_client(timeout=120.0) as client:
        response = client.post(
            f"{hindsight_url}/v1/default/banks/{quote(bank_id, safe='')}/memories/recall",
            headers=_hindsight_headers(),
            json=payload,
        )

    response_body = response.json() if response.content else {}
    if not response.is_success:
        return {
            "bankId": bank_id,
            "courseId": course_id,
            "courseTitle": course_title,
            "signals": [],
            "error": (
                _clean_text(response_body.get("error"))  # type: ignore[arg-type]
                or _clean_text(response_body.get("detail"))  # type: ignore[arg-type]
                or f"Hindsight recall failed with status {response.status_code}."
            ),
        }

    results = response_body.get("results") if isinstance(response_body, dict) else []
    recalled_texts: list[str] = []
    for item in results if isinstance(results, list) else []:
        if not isinstance(item, dict):
            continue
        text = _clean_text(item.get("text") or item.get("content"))
        if not text:
            continue
        recalled_texts.append(text)

    signals: list[dict[str, str]] = []
    for text in recalled_texts:
        category, reason = _classify_recalled_text(text)
        if category == "ignore":
            continue
        signals.append(
            {
                "category": category,
                "type": "recall_signal",
                "text": text,
                "reason": reason,
            }
        )

    return {
        "bankId": bank_id,
        "courseId": course_id,
        "courseTitle": course_title,
        "signals": signals[:10],
        "rawRecalledTexts": recalled_texts[:10],
    }


def _recall_skill_signals_in_parallel(
    tenant_id: str,
    user_id: str,
    courses: list[dict[str, str]],
) -> list[dict[str, Any]]:
    if not courses:
        _log("No learner-course banks are available for oriented recall.")
        return []

    _log(
        "Launching parallel oriented Hindsight recalls on learner-course banks "
        "to extract raw skill signals."
    )

    recalled_results: list[dict[str, Any]] = []
    max_workers = max(1, min(6, len(courses)))
    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_map = {
            executor.submit(
                _recall_skill_signal_candidates_for_course,
                tenant_id,
                user_id,
                course["courseId"],
                course["courseTitle"],
            ): course
            for course in courses
        }

        for future in as_completed(future_map):
            recalled_results.append(future.result())

    recalled_results.sort(key=lambda item: _clean_text(item.get("courseTitle")).lower())

    _log("Parallel learner-course recalls completed. Recall-based skill signals collected:")
    for course_result in recalled_results:
        course_title = _clean_text(course_result.get("courseTitle")) or _clean_text(course_result.get("courseId"))
        _log(f"Course: {course_title}")
        error = _clean_text(course_result.get("error"))
        if error:
            _log(f"  recall_error: {error}")
            continue
        signals = course_result.get("signals")
        if not isinstance(signals, list) or not signals:
            _log("  no_skill_signals_found")
            continue
        for signal in signals:
            if not isinstance(signal, dict):
                continue
            category = _clean_text(signal.get("category")) or "other_signal"
            text = _clean_text(signal.get("text"))
            reason = _clean_text(signal.get("reason"))
            if not text:
                continue
            if reason:
                _log(f"  [{category}] {text}")
                _log(f"    reason: {reason}")
            else:
                _log(f"  [{category}] {text}")

    return recalled_results


def _is_actionable_signal(signal: dict[str, Any]) -> bool:
    category = _clean_text(signal.get("category"))
    return category in {
        "learner_difficulty",
        "wrong_quiz_answer",
        "repeated_confusion",
        "unresolved_concept",
        "remediated_concept",
        "solo_challenge_outcome",
        "coaching_discussion_theme",
    }


def _normalize_signal_text(text: str) -> str:
    lowered = _clean_text(text).lower()
    lowered = re.sub(r"\|\s*when:.*$", "", lowered)
    lowered = re.sub(r"\|\s*involving:.*$", "", lowered)
    lowered = re.sub(r"\s+", " ", lowered)
    lowered = re.sub(r"[^a-z0-9<>\s]", "", lowered)
    return lowered.strip()


def _deduplicate_signals(signals: list[dict[str, Any]]) -> list[dict[str, Any]]:
    deduped: list[dict[str, Any]] = []
    seen: set[tuple[str, str]] = set()
    for signal in signals:
        category = _clean_text(signal.get("category"))
        text = _clean_text(signal.get("text"))
        if not category or not text:
            continue
        key = (category, _normalize_signal_text(text))
        if key in seen:
            continue
        seen.add(key)
        deduped.append(signal)
    return deduped


def _is_useful_for_course_reflect(signal: dict[str, Any]) -> bool:
    category = _clean_text(signal.get("category"))
    if category in {
        "learner_difficulty",
        "wrong_quiz_answer",
        "repeated_confusion",
        "unresolved_concept",
        "remediated_concept",
        "solo_challenge_outcome",
    }:
        return True
    if category == "coaching_discussion_theme":
        text = _clean_text(signal.get("text")).lower()
        return "question" in text or "message" in text
    return False


def _normalize_domain_label(label: str) -> str:
    lowered = _clean_text(label).lower().replace("‑", "-").replace("–", "-")
    lowered = lowered.replace("/", " ").replace("&", " ")
    lowered = re.sub(r"[^a-z0-9\-\s]", " ", lowered)
    tokens = [
        token
        for token in re.split(r"[\s\-]+", lowered)
        if token and token not in {"and", "the", "of", "for", "course", "content", "principles", "process"}
    ]
    return " ".join(tokens)


def _merge_unique_lines(lines: list[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for line in lines:
        cleaned = _clean_text(line)
        if not cleaned:
            continue
        key = _normalize_signal_text(cleaned)
        if key in seen:
            continue
        seen.add(key)
        merged.append(cleaned)
    return merged


def _normalize_and_merge_skill_radar(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for item in items:
        label = _clean_text(item.get("skill_domain"))
        status = _clean_text(item.get("status")) or "mixed"
        evidence = item.get("evidence_summary") if isinstance(item.get("evidence_summary"), list) else []
        normalized_key = _normalize_domain_label(label)
        if not normalized_key:
            continue
        existing = grouped.get(normalized_key)
        if existing is None:
            grouped[normalized_key] = {
                "skill_domain": label,
                "status": status,
                "evidence_summary": [entry for entry in evidence if isinstance(entry, str)],
            }
            continue

        statuses = {existing["status"], status}
        if "weak_unresolved" in statuses:
            existing["status"] = "weak_unresolved"
        elif "mixed" in statuses:
            existing["status"] = "mixed"
        elif "strong" in statuses and "remediated" in statuses:
            existing["status"] = "mixed"
        elif "strong" in statuses:
            existing["status"] = "strong"
        else:
            existing["status"] = "remediated"

        combined_evidence = existing.get("evidence_summary", []) + [entry for entry in evidence if isinstance(entry, str)]
        existing["evidence_summary"] = _merge_unique_lines(combined_evidence)[:5]

        if len(label) < len(_clean_text(existing.get("skill_domain"))):
            existing["skill_domain"] = label

    return list(grouped.values())


def _normalize_and_validate_course_skill_map(mapped: object) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for item in mapped if isinstance(mapped, list) else []:
        if not isinstance(item, dict):
            continue
        skill_domain = _clean_text(item.get("skill_domain"))
        status = _clean_text(item.get("status"))
        evidence_raw = item.get("evidence") if isinstance(item.get("evidence"), list) else []
        evidence = _merge_unique_lines([entry for entry in evidence_raw if isinstance(entry, str)])
        if not skill_domain or not status or not evidence:
            continue
        normalized.append(
            {
                "skill_domain": skill_domain,
                "status": status,
                "evidence": evidence[:4],
            }
        )
    return normalized


def _map_course_signals_to_skill_domains(
    tenant_id: str,
    course_result: dict[str, Any],
) -> dict[str, Any]:
    course_id = _clean_text(course_result.get("courseId"))
    course_title = _clean_text(course_result.get("courseTitle")) or course_id
    course_bank_id = _build_course_bank_id(tenant_id, course_id)
    signals = [
        signal
        for signal in (course_result.get("signals") if isinstance(course_result.get("signals"), list) else [])
        if isinstance(signal, dict) and _is_actionable_signal(signal)
    ]
    signals = _deduplicate_signals(signals)
    useful_signals = [signal for signal in signals if _is_useful_for_course_reflect(signal)]

    if not useful_signals:
        return {
            "courseId": course_id,
            "courseTitle": course_title,
            "courseBankId": course_bank_id,
            "mappedDomains": [],
            "status": "no_actionable_signals",
        }

    signal_lines = [
        f"- [{_clean_text(signal.get('category'))}] {_clean_text(signal.get('text'))}"
        for signal in useful_signals
        if _clean_text(signal.get("text"))
    ]

    reflect_query = (
        "You are a recommendation agent mapping learner-course difficulties to skill domains.\n"
        "Use the course-bank knowledge to determine what exact skill domains and concepts these learner signals refer to.\n"
        "Read the learner signals as a grouped difficulty set for this course.\n"
        "Return valid JSON only.\n\n"
        "Tasks:\n"
        "- identify the main skill domains involved in these learner signals\n"
        "- map each signal to the most relevant domain\n"
        "- distinguish weak unresolved domains from remediated ones\n"
        "- do not return empty domains\n"
        "- merge near-duplicate course domains into one stable domain name\n"
        "- keep the result compact and grounded in the course content\n\n"
        "Return JSON with exactly this shape:\n"
        "{\n"
        '  "course_skill_map": [\n'
        "    {\n"
        '      "skill_domain": "...",\n'
        '      "status": "weak_unresolved | remediated | mixed | informational",\n'
        '      "evidence": ["...", "..."]\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        f"Course title: {course_title}\n"
        f"Course bank id: {course_bank_id}\n"
        "Learner-course grouped signals:\n"
        f"{chr(10).join(signal_lines)}\n"
    )

    _log(
        "Calling Hindsight reflect on course bank for skill-domain mapping. "
        f"courseId={course_id} courseTitle={course_title}"
    )
    try:
        reflect_result = _call_hindsight_reflect(
            bank_id=course_bank_id,
            query=reflect_query,
            max_tokens=1400,
        )
    except Exception as error:
        _log(
            "Course-domain reflect failed; falling back to recall-signal labels. "
            f"bankId={course_bank_id} error={type(error).__name__}: {error}"
        )
        fallback_domains = []
        for signal in signals:
            if not isinstance(signal, dict):
                continue
            category = _clean_text(signal.get("category")) or "learning_gap"
            text = _clean_text(signal.get("text"))
            if not text:
                continue
            fallback_domains.append(
                {
                    "skill_domain": category.replace("_", " ").title(),
                    "status": "weak_unresolved" if category != "remediated_concept" else "remediated",
                    "evidence": [text],
                }
            )
        return {
            "courseId": course_id,
            "courseTitle": course_title,
            "courseBankId": course_bank_id,
            "mappedDomains": _normalize_and_validate_course_skill_map(fallback_domains),
            "sourceSignals": useful_signals,
            "status": "mapped_with_fallback",
            "fallback": True,
            "error": f"{type(error).__name__}: {error}",
        }
    parsed = reflect_result.get("parsedAnswer") if isinstance(reflect_result, dict) else None
    mapped = parsed.get("course_skill_map") if isinstance(parsed, dict) else []
    normalized_mapped = _normalize_and_validate_course_skill_map(mapped)

    _log(f"Skill-domain mapping for course: {course_title}")
    if not normalized_mapped:
        _log("  no_domains_mapped")
    for item in normalized_mapped:
        _log(
            "  "
            f"domain={_clean_text(item.get('skill_domain'))} "
            f"status={_clean_text(item.get('status'))}"
        )

    return {
        "courseId": course_id,
        "courseTitle": course_title,
        "courseBankId": course_bank_id,
        "mappedDomains": normalized_mapped,
        "sourceSignals": useful_signals,
        "status": "mapped" if normalized_mapped else "reflect_no_mapping",
    }


def _map_all_courses_to_skill_domains(
    tenant_id: str,
    recalled_skill_signals: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    _log(
        "Starting course-bank reflect mapping for each course difficulty group "
        "to convert learner-course signals into skill domains."
    )
    mapped_results: list[dict[str, Any]] = []
    for course_result in recalled_skill_signals:
        mapped_results.append(_map_course_signals_to_skill_domains(tenant_id, course_result))
    return mapped_results


def _build_cross_course_synthesis(
    tenant_id: str,
    user_id: str,
    skill_profile_bank_id: str,
    mapped_course_domains: list[dict[str, Any]],
) -> dict[str, Any]:
    actionable_courses = [
        item for item in mapped_course_domains
        if isinstance(item, dict) and isinstance(item.get("mappedDomains"), list) and item.get("mappedDomains")
    ]
    if not actionable_courses:
        _log("No mapped course domains are available for cross-course synthesis.")
        return {
            "status": "no_cross_course_synthesis",
            "skillRadar": [],
        }

    synthesis_block = json.dumps(actionable_courses, ensure_ascii=False, indent=2)
    reflect_query = (
        "You are the Recommendation Agent building a cross-course skill-gap synthesis for one learner.\n"
        "Group the mapped course evidence into stable skill domains across courses.\n"
        "Identify strong domains, weak unresolved domains, and domains already remediated.\n"
        "Discount signals that were already remediated.\n"
        "Merge near-duplicate domains into one canonical domain name.\n"
        "Return valid JSON only.\n\n"
        "Return JSON with exactly this shape:\n"
        "{\n"
        '  "skill_radar": [\n'
        "    {\n"
        '      "skill_domain": "...",\n'
        '      "status": "strong | weak_unresolved | mixed | remediated",\n'
        '      "evidence_summary": ["...", "..."]\n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        f"Learner skill-profile bank id: {skill_profile_bank_id}\n"
        f"Tenant id: {tenant_id}\n"
        f"User id: {user_id}\n"
        "Course-level mapped domains:\n"
        f"{synthesis_block}\n"
    )

    _log("Calling Hindsight reflect for cross-course skill synthesis.")
    try:
        reflect_result = _call_hindsight_reflect(
            bank_id=skill_profile_bank_id,
            query=reflect_query,
            max_tokens=1800,
        )
    except Exception as error:
        _log(
            "Cross-course synthesis reflect failed; using mapped course domains directly. "
            f"bankId={skill_profile_bank_id} error={type(error).__name__}: {error}"
        )
        fallback_items: list[dict[str, Any]] = []
        for course in actionable_courses:
            course_title = _clean_text(course.get("courseTitle"))
            for domain in course.get("mappedDomains", []):
                if not isinstance(domain, dict):
                    continue
                evidence = domain.get("evidence") if isinstance(domain.get("evidence"), list) else []
                fallback_items.append(
                    {
                        "skill_domain": _clean_text(domain.get("skill_domain")),
                        "status": _clean_text(domain.get("status")) or "mixed",
                        "evidence_summary": [
                            f"{course_title}: {entry}" if course_title else entry
                            for entry in evidence
                            if isinstance(entry, str)
                        ],
                    }
                )
        return {
            "status": "cross_course_synthesized_with_fallback",
            "skillRadar": _normalize_and_merge_skill_radar(fallback_items),
            "error": f"{type(error).__name__}: {error}",
        }
    parsed = reflect_result.get("parsedAnswer") if isinstance(reflect_result, dict) else None
    radar = parsed.get("skill_radar") if isinstance(parsed, dict) else []
    normalized_radar = _normalize_and_merge_skill_radar(
        [
            item for item in radar
            if isinstance(item, dict)
            and _clean_text(item.get("skill_domain"))
            and _clean_text(item.get("status"))
        ]
    )

    _log("Cross-course skill radar synthesis:")
    if not normalized_radar:
        _log("  no_skill_radar_generated")
    for item in normalized_radar:
        _log(
            "  "
            f"domain={_clean_text(item.get('skill_domain'))} "
            f"status={_clean_text(item.get('status'))}"
        )

    return {
        "status": "cross_course_synthesized",
        "skillRadar": normalized_radar,
    }


def _tokenize_recommendation_text(value: str) -> set[str]:
    cleaned = _clean_text(value).lower().replace("‑", "-").replace("–", "-")
    tokens = re.split(r"[^a-z0-9]+", cleaned)
    return {
        token
        for token in tokens
        if len(token) >= 4 and token not in {"with", "this", "that", "from", "into", "your", "about"}
    }


def _build_domain_keywords(skill_item: RecommendationSkillRadarInput) -> set[str]:
    combined = " ".join([skill_item.skill_domain, *skill_item.evidence_summary])
    return _tokenize_recommendation_text(combined)


def _build_course_keywords(course: RecommendationCatalogCourseInput) -> set[str]:
    combined = " ".join(
        [
            course.title,
            course.description or "",
            course.category or "",
            course.difficulty or "",
        ]
    )
    return _tokenize_recommendation_text(combined)


def _build_recommendation_feed(payload: RecommendationFeedStartInput) -> list[dict[str, Any]]:
    enrolled_by_course = {item.courseId: item for item in payload.enrollments}
    learner_contexts_by_course = {item.courseId: item for item in payload.learnerContexts}
    recommendations: list[dict[str, Any]] = []
    seen_keys: set[str] = set()

    for skill_item in payload.skillRadar:
        domain = _clean_text(skill_item.skill_domain)
        status = _clean_text(skill_item.status) or "weak_unresolved"
        evidence_summary = [_clean_text(item) for item in skill_item.evidence_summary if _clean_text(item)]
        domain_keywords = _build_domain_keywords(skill_item)
        priority = "high" if status == "weak_unresolved" else "medium" if status == "mixed" else "low"

        best_course: RecommendationCatalogCourseInput | None = None
        best_score = -10_000
        best_overlap: set[str] = set()

        for course in payload.courses:
            if not course.isPublished:
                continue

            enrollment = enrolled_by_course.get(course.id)
            if enrollment and _clean_text(enrollment.status) == "completed" and status == "remediated":
                continue

            course_keywords = _build_course_keywords(course)
            overlap = domain_keywords & course_keywords
            score = len(overlap) * 10

            if status == "weak_unresolved":
                score += 40
            elif status == "mixed":
                score += 20
            else:
                score -= 20

            if enrollment:
                enrollment_status = _clean_text(enrollment.status)
                if enrollment_status in {"in_progress", "active", "enrolled"}:
                    score += 18
                elif enrollment_status == "completed":
                    score -= 25

            if score > best_score:
                best_score = score
                best_course = course
                best_overlap = overlap

        if best_course and best_score >= 45:
            enrollment = enrolled_by_course.get(best_course.id)
            learner_context = learner_contexts_by_course.get(best_course.id)
            if enrollment and _clean_text(enrollment.status) in {"in_progress", "active", "enrolled"}:
                lesson_id = (
                    _clean_text(learner_context.latestFailedQuizLessonId)
                    or _clean_text(learner_context.currentLessonId)
                    or _clean_text(learner_context.lastOpenedLessonId)
                )
                lesson_title = (
                    _clean_text(learner_context.latestFailedQuizLessonTitle)
                    or _clean_text(learner_context.currentLessonTitle)
                    or _clean_text(learner_context.lastOpenedLessonTitle)
                    or "Target lesson"
                )
                key = f"lesson:{best_course.id}:{lesson_id}:{domain}"
                if key not in seen_keys:
                    seen_keys.add(key)
                    recommendations.append(
                        {
                            "type": "lesson_recommendation" if lesson_id else "revision_recommendation",
                            "priority": priority,
                            "skillDomain": domain,
                            "title": lesson_title,
                            "courseId": best_course.id,
                            "courseTitle": best_course.title,
                            "lessonId": lesson_id or None,
                            "reason": (
                                f"This skill is still {status.replace('_', ' ')} and this learning path is already in progress."
                            ),
                            "whyNow": evidence_summary[:2],
                            "actionLabel": "Resume this lesson" if lesson_id else "Review this course",
                        }
                    )
                    continue

            key = f"course:{best_course.id}:{domain}"
            if key not in seen_keys:
                seen_keys.add(key)
                recommendations.append(
                    {
                        "type": "course_recommendation",
                        "priority": priority,
                        "skillDomain": domain,
                        "title": best_course.title,
                        "courseId": best_course.id,
                        "courseTitle": best_course.title,
                        "reason": (
                            f"This course matches the learner's current gap in {domain}."
                            if best_overlap
                            else f"This course is the closest published match for {domain}."
                        ),
                        "whyNow": evidence_summary[:2],
                        "actionLabel": "Start this course",
                    }
                )
                continue

        key = f"topic:{domain}"
        if key not in seen_keys:
            seen_keys.add(key)
            recommendations.append(
                {
                    "type": "topic_suggestion",
                    "priority": priority,
                    "skillDomain": domain,
                    "title": domain,
                    "reason": f"The learner would benefit from focused practice on {domain}.",
                    "whyNow": evidence_summary[:2],
                    "actionLabel": "Revise this topic",
                }
            )

    priority_order = {"high": 0, "medium": 1, "low": 2}
    recommendations.sort(key=lambda item: (priority_order.get(_clean_text(item.get("priority")), 3), _clean_text(item.get("title")).lower()))
    return recommendations[:9]


def _build_default_learner_message(item: dict[str, Any]) -> str:
    priority = _clean_text(item.get("priority")).lower()
    skill_domain = _clean_text(item.get("skillDomain")) or "this topic"

    if priority == "high":
        return f"Start with {skill_domain} now so the learner can keep momentum on the current lesson."
    if priority == "medium":
        return f"Reinforce {skill_domain} before moving on to the next topic."
    return f"Keep {skill_domain} warm with a short, low-pressure review."


def _attach_learner_messages_to_recommendations(
    payload: RecommendationFeedStartInput,
    recommendations: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    if not recommendations:
        return recommendations

    try:
        bank_context = _ensure_skill_profile_bank(payload.tenantId, payload.userId)
    except Exception as error:
        _log(
            "Skill-profile bank ensure failed; using deterministic recommendation messages. "
            f"error={type(error).__name__}: {error}"
        )
        return [
            {
                **item,
                "learnerMessage": _build_default_learner_message(item),
            }
            for item in recommendations
        ]

    skill_profile_bank_id = bank_context["bankId"]
    _log(
        "Preparing learner-facing recommendation copy from the skill profile bank. "
        f"bankId={skill_profile_bank_id}"
    )
    serialized_recommendations = json.dumps(
        [
            {
                "index": index,
                "type": _clean_text(item.get("type")),
                "priority": _clean_text(item.get("priority")),
                "skillDomain": _clean_text(item.get("skillDomain")),
                "title": _clean_text(item.get("title")),
                "courseTitle": _clean_text(item.get("courseTitle")),
                "reason": _clean_text(item.get("reason")),
                "actionLabel": _clean_text(item.get("actionLabel")),
            }
            for index, item in enumerate(recommendations)
        ],
        ensure_ascii=False,
        indent=2,
    )

    reflect_query = (
        "You are writing learner-facing copy for a recommendation feed.\n"
        "Rewrite each recommendation into one short supportive message.\n"
        "Keep the message action-oriented, encouraging, and specific.\n"
        "Do not mention mistakes, failures, blame, diagnostics, or internal agent details.\n"
        "Do not repeat the title verbatim.\n"
        "Return valid JSON only.\n\n"
        "Return JSON with exactly this shape:\n"
        "{\n"
        '  "recommendations": [\n'
        "    {\n"
        '      "index": 0,\n'
        '      "learnerMessage": "..." \n'
        "    }\n"
        "  ]\n"
        "}\n\n"
        f"Recommendations to rewrite:\n{serialized_recommendations}\n"
    )

    _log("Calling Hindsight reflect for learner-facing recommendation copy.")
    try:
        reflect_result = _call_hindsight_reflect(
            bank_id=skill_profile_bank_id,
            query=reflect_query,
            max_tokens=1200,
        )
    except Exception as error:
        _log(
            "Learner-facing copy reflect failed; using deterministic recommendation messages. "
            f"bankId={skill_profile_bank_id} error={type(error).__name__}: {error}"
        )
        return [
            {
                **item,
                "learnerMessage": _build_default_learner_message(item),
            }
            for item in recommendations
        ]
    parsed = reflect_result.get("parsedAnswer") if isinstance(reflect_result, dict) else None
    rewritten = parsed.get("recommendations") if isinstance(parsed, dict) else []

    learner_messages_by_index: dict[int, str] = {}
    for item in rewritten if isinstance(rewritten, list) else []:
        if not isinstance(item, dict):
            continue
        index = item.get("index")
        learner_message = _clean_text(item.get("learnerMessage"))
        if isinstance(index, int) and learner_message:
            learner_messages_by_index[index] = learner_message

    updated_recommendations: list[dict[str, Any]] = []
    for index, item in enumerate(recommendations):
        updated_item = dict(item)
        updated_item["learnerMessage"] = learner_messages_by_index.get(index) or _build_default_learner_message(item)
        updated_recommendations.append(updated_item)

    _log("Learner-facing recommendation copy prepared.")
    for item in updated_recommendations:
        _log(
            "  "
            f"title={_clean_text(item.get('title'))} "
            f"priority={_clean_text(item.get('priority'))} "
            f"learnerMessage={_clean_text(item.get('learnerMessage'))}"
        )

    return updated_recommendations


def kickoff_recommendation_feed(step_input: StepInput) -> StepOutput:
    payload = RecommendationFeedStartInput.model_validate(step_input.input)

    _log(
        f"Recommendation feed workflow started. userId={payload.userId} tenantId={payload.tenantId} source={payload.source}"
    )
    _log("Building recommendation actions from skill-gap radar, learner history, and published courses.")

    recommendations = _build_recommendation_feed(payload)
    recommendations = _attach_learner_messages_to_recommendations(payload, recommendations)

    result = {
        "success": True,
        "workflowName": "recommendation-agent",
        "action": "recommendation-feed",
        "tenantId": payload.tenantId,
        "userId": payload.userId,
        "source": payload.source,
        "pagePath": payload.pagePath,
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "recommendations": recommendations,
        "summary": {
            "total": len(recommendations),
            "highPriority": len([item for item in recommendations if _clean_text(item.get("priority")) == "high"]),
            "mediumPriority": len([item for item in recommendations if _clean_text(item.get("priority")) == "medium"]),
            "lowPriority": len([item for item in recommendations if _clean_text(item.get("priority")) == "low"]),
        },
    }

    _log("Recommendation feed prepared:")
    _log(json.dumps(result, indent=2))
    return StepOutput(content=result, success=True)


class RecommendationSkillGapStartInput(BaseModel):
    tenantId: str
    userId: str
    source: str | None = "recommendations-page"
    pagePath: str | None = "/recommendations/skill-gap"


class RecommendationCatalogCourseInput(BaseModel):
    id: str
    title: str
    description: str | None = None
    category: str | None = None
    difficulty: str | None = None
    isPublished: bool = True


class RecommendationEnrollmentInput(BaseModel):
    courseId: str
    status: str
    enrolledAt: str | None = None
    completedAt: str | None = None


class RecommendationLearnerContextInput(BaseModel):
    courseId: str
    courseTitle: str | None = None
    currentLessonId: str | None = None
    currentLessonTitle: str | None = None
    lastOpenedLessonId: str | None = None
    lastOpenedLessonTitle: str | None = None
    latestFailedQuizLessonId: str | None = None
    latestFailedQuizLessonTitle: str | None = None
    failedQuizCount: int = 0
    progressPercent: float | None = None


class RecommendationSkillRadarInput(BaseModel):
    skill_domain: str
    status: str
    evidence_summary: list[str] = []


class RecommendationFeedStartInput(BaseModel):
    tenantId: str
    userId: str
    source: str | None = "recommendations-page"
    pagePath: str | None = "/recommendations"
    skillRadar: list[RecommendationSkillRadarInput] = []
    courses: list[RecommendationCatalogCourseInput] = []
    enrollments: list[RecommendationEnrollmentInput] = []
    learnerContexts: list[RecommendationLearnerContextInput] = []


def _ensure_skill_profile_bank(tenant_id: str, user_id: str) -> dict[str, Any]:
    bank_id = _build_skill_profile_bank_id(tenant_id, user_id)
    hindsight_url = DEFAULT_HINDSIGHT_URL.rstrip("/")
    headers = {"Content-Type": "application/json"}
    if DEFAULT_HINDSIGHT_API_KEY:
        headers["Authorization"] = f"Bearer {DEFAULT_HINDSIGHT_API_KEY}"

    payload = {
        "name": f"Tenant {tenant_id} Learner {user_id} Skill Profile",
        "background": (
            f"Aggregated recommendation and skill-gap memory for learner {user_id} "
            f"in tenant {tenant_id}."
        ),
        "retain_mission": (
            "Store skill-gap radar snapshots, recommendation evidence, and cross-course "
            "competency synthesis for this learner."
        ),
        "reflect_mission": (
            "Reflect on the learner's aggregated skill profile to explain strengths, "
            "weaknesses, unresolved concepts, and recommendation rationale."
        ),
        "metadata": {
            "tenantId": tenant_id,
            "userId": user_id,
            "profileType": "skill-profile",
        },
    }

    _log(f"Ensuring Hindsight skill-profile bank exists: {bank_id}")
    with _hindsight_client(timeout=60.0) as client:
        response = client.put(
            f"{hindsight_url}/v1/default/banks/{quote(bank_id, safe='')}",
            headers=headers,
            json=payload,
        )

    if not response.is_success:
        detail = "Failed to ensure skill-profile bank."
        try:
            response_body = response.json()
            detail = _clean_text(response_body.get("error") or response_body.get("detail")) or detail
        except Exception:
            pass
        raise RuntimeError(detail)

    return {
        "bankId": bank_id,
        "hindsightUrl": hindsight_url,
    }


def kickoff_skill_gap_map(step_input: StepInput) -> StepOutput:
    payload = RecommendationSkillGapStartInput.model_validate(step_input.input)

    _log(
        f"Recommendation agent starts working. source={payload.source} path={payload.pagePath}"
    )
    _log(
        f"Learner recommendation mission received. userId={payload.userId} tenantId={payload.tenantId}"
    )
    _log("Workflow kickoff: preparing the learner skill-gap radar pipeline.")
    _log("Step 1 queued: load learner activity scope from the platform database.")
    _log("Step 2 queued: scan all learner-course banks for competency evidence.")
    _log("Step 3 queued: inspect course banks to map evidence to stable skill domains.")
    _log("Step 4 queued: normalize raw evidence into skill signals.")
    _log("Step 5 queued: aggregate signals across courses into a skill radar profile.")
    _log("Step 6 queued: generate structured skill-gap radar JSON.")
    _log("Step 7 queued: store the learner skill-profile in Hindsight and PostgreSQL.")

    bank_context = _ensure_skill_profile_bank(payload.tenantId, payload.userId)
    discovered_courses = _scan_learner_course_titles_from_hindsight(
        payload.tenantId,
        payload.userId,
    )
    recalled_skill_signals = _recall_skill_signals_in_parallel(
        payload.tenantId,
        payload.userId,
        discovered_courses,
    )
    mapped_course_domains = _map_all_courses_to_skill_domains(
        payload.tenantId,
        recalled_skill_signals,
    )
    cross_course_synthesis = _build_cross_course_synthesis(
        payload.tenantId,
        payload.userId,
        bank_context["bankId"],
        mapped_course_domains,
    )

    result = {
        "success": True,
        "workflowName": "recommendation-agent",
        "action": "skill-gap-kickoff",
        "tenantId": payload.tenantId,
        "userId": payload.userId,
        "source": payload.source,
        "pagePath": payload.pagePath,
        "startedAt": datetime.now(timezone.utc).isoformat(),
        "status": "started",
        "message": "Recommendation Agent started and prepared the learner skill-gap workflow.",
        "nextStep": "learner-activity-scope",
        "learnerCourseBanksDiscovered": len(discovered_courses),
        "learnerCoursesFromHindsight": discovered_courses,
        "recalledSkillSignalsByCourse": recalled_skill_signals,
        "mappedCourseDomains": mapped_course_domains,
        "crossCourseSynthesis": cross_course_synthesis,
        "skillProfileBankId": bank_context["bankId"],
        "storagePlan": {
            "hindsightBankId": bank_context["bankId"],
            "databaseRecordType": "learner_skill_profile",
            "profileKind": "skill_gap_radar",
        },
    }

    _log("Skill-gap kickoff payload prepared:")
    _log(json.dumps(result, indent=2))

    return StepOutput(content=result, success=True)


recommendation_skill_gap_workflow = Workflow(
    name="recommendation-agent",
    description="AgentOS workflow that prepares the skill-gap recommendation pipeline and skill-profile storage targets.",
    input_schema=RecommendationSkillGapStartInput,
    telemetry=False,
    steps=[
        Step(
            name="kickoff-skill-gap-map",
            executor=kickoff_skill_gap_map,
        )
    ],
)


recommendation_feed_workflow = Workflow(
    name="recommendation-feed-agent",
    description="AgentOS workflow that ranks the next best learning actions from the learner skill-gap radar and learning history.",
    input_schema=RecommendationFeedStartInput,
    telemetry=False,
    steps=[
        Step(
            name="build-recommendation-feed",
            executor=kickoff_recommendation_feed,
        )
    ],
)
