#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


DEFAULT_BASE_URL = os.getenv("HINDSIGHT_URL", os.getenv("HINDSIGHT_API_URL", "http://127.0.0.1:8888"))
DEFAULT_API_KEY = os.getenv("HINDSIGHT_API_KEY", "")

TERMINAL_OPERATION_STATUSES = {"completed", "failed", "cancelled"}


def _json_dumps(value: Any) -> str:
    return json.dumps(value, indent=2, ensure_ascii=False, default=str)


def _print_section(title: str, payload: Any | None = None) -> None:
    print(f"\n=== {title} ===")
    if payload is not None:
        if isinstance(payload, str):
            print(payload)
        else:
            print(_json_dumps(payload))


def _http_json(
    method: str,
    url: str,
    *,
    body: dict[str, Any] | None = None,
    api_key: str = "",
) -> tuple[int, dict[str, Any], str]:
    data = None
    headers = {"Content-Type": "application/json"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
    if body is not None:
        data = json.dumps(body).encode("utf-8")

    request = Request(url, data=data, headers=headers, method=method)
    try:
        with urlopen(request, timeout=120) as response:
            raw = response.read().decode("utf-8")
            parsed = json.loads(raw) if raw else {}
            return response.status, parsed, raw
    except HTTPError as error:
        raw = error.read().decode("utf-8")
        parsed = json.loads(raw) if raw else {}
        return error.code, parsed, raw
    except URLError as error:
        raise RuntimeError(f"Network error while calling {url}: {error}") from error


def _build_retain_payload(args: argparse.Namespace) -> dict[str, Any]:
    item: dict[str, Any] = {
        "content": args.content,
        "context": args.context,
        "timestamp": args.timestamp or datetime.now(timezone.utc).isoformat(),
        "metadata": {
            "source": "test_hindsight_retain.py",
            "label": args.label,
        },
    }
    if args.document_id:
        item["document_id"] = args.document_id
    if args.tags:
        item["tags"] = args.tags
    return {
        "items": [item],
        "async": args.async_mode,
    }


def _poll_operation(
    base_url: str,
    bank_id: str,
    operation_id: str,
    api_key: str,
    timeout_seconds: int,
    poll_interval: float,
) -> dict[str, Any]:
    operation_url = f"{base_url}/v1/default/banks/{quote(bank_id, safe='')}/operations/{operation_id}"
    deadline = time.time() + timeout_seconds

    while True:
        status_code, payload, raw = _http_json("GET", operation_url, api_key=api_key)
        _print_section(f"Operation Poll HTTP {status_code}", payload or raw)
        if status_code >= 400:
            raise RuntimeError(f"Operation polling failed with status {status_code}: {raw}")

        status = str(payload.get("status") or "").lower()
        if status in TERMINAL_OPERATION_STATUSES:
            return payload

        if time.time() >= deadline:
            raise TimeoutError(
                f"Operation {operation_id} did not reach a terminal status within {timeout_seconds} seconds."
            )

        time.sleep(poll_interval)


def _run_recall(base_url: str, bank_id: str, query: str, api_key: str) -> dict[str, Any]:
    recall_url = f"{base_url}/v1/default/banks/{quote(bank_id, safe='')}/memories/recall"
    recall_payload = {
        "query": query,
        "budget": "mid",
        "max_tokens": 800,
        "include": {"facts": {}},
    }
    _print_section("Recall Request", {"url": recall_url, "payload": recall_payload})
    status_code, payload, raw = _http_json("POST", recall_url, body=recall_payload, api_key=api_key)
    _print_section(f"Recall Response HTTP {status_code}", payload or raw)
    if status_code >= 400:
        raise RuntimeError(f"Recall failed with status {status_code}: {raw}")
    return payload


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Test Hindsight retain end-to-end: send retain, inspect response, optionally poll async operation, then verify with recall.",
    )
    parser.add_argument("--bank-id", required=True, help="Target Hindsight bank id.")
    parser.add_argument("--content", required=True, help="Content to retain.")
    parser.add_argument("--context", default="retain debug test", help="Context field for the retained item.")
    parser.add_argument("--timestamp", default=None, help="ISO timestamp. Defaults to current UTC time.")
    parser.add_argument("--document-id", default=None, help="Optional document_id for idempotent retain.")
    parser.add_argument("--tag", dest="tags", action="append", default=[], help="Optional tag. Repeatable.")
    parser.add_argument("--label", default="manual-debug", help="Metadata label to help identify this test.")
    parser.add_argument("--base-url", default=DEFAULT_BASE_URL, help=f"Hindsight base URL. Default: {DEFAULT_BASE_URL}")
    parser.add_argument("--api-key", default=DEFAULT_API_KEY, help="Optional Hindsight API key.")
    parser.add_argument("--async", dest="async_mode", action="store_true", help="Use async retain mode.")
    parser.add_argument("--sync", dest="async_mode", action="store_false", help="Use sync retain mode.")
    parser.set_defaults(async_mode=True)
    parser.add_argument("--poll-timeout", type=int, default=180, help="Seconds to poll async operation.")
    parser.add_argument("--poll-interval", type=float, default=3.0, help="Seconds between poll attempts.")
    parser.add_argument(
        "--recall-query",
        default=None,
        help="Optional recall query to verify the retained information. Defaults to the retained content.",
    )
    parser.add_argument("--no-recall", action="store_true", help="Skip recall verification.")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    base_url = args.base_url.rstrip("/")
    retain_url = f"{base_url}/v1/default/banks/{quote(args.bank_id, safe='')}/memories"
    retain_payload = _build_retain_payload(args)

    _print_section("Retain Request", {"url": retain_url, "payload": retain_payload})
    status_code, payload, raw = _http_json("POST", retain_url, body=retain_payload, api_key=args.api_key)
    _print_section(f"Retain Response HTTP {status_code}", payload or raw)

    if status_code >= 400:
        print("\nRetain request failed before ingestion started.", file=sys.stderr)
        return 1

    if args.async_mode:
        operation_id = str(payload.get("operation_id") or "").strip()
        if not operation_id:
            print("\nAsync retain did not return an operation_id.", file=sys.stderr)
            return 1
        try:
            final_operation = _poll_operation(
                base_url,
                args.bank_id,
                operation_id,
                args.api_key,
                args.poll_timeout,
                args.poll_interval,
            )
        except Exception as error:
            print(f"\nAsync operation polling failed: {error}", file=sys.stderr)
            return 1

        final_status = str(final_operation.get("status") or "").lower()
        if final_status != "completed":
            print(f"\nRetain operation ended with non-success status: {final_status}", file=sys.stderr)
            return 1

    if not args.no_recall:
        recall_query = args.recall_query or args.content
        try:
            _run_recall(base_url, args.bank_id, recall_query, args.api_key)
        except Exception as error:
            print(f"\nRecall verification failed: {error}", file=sys.stderr)
            return 1

    print("\nRetain test completed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
