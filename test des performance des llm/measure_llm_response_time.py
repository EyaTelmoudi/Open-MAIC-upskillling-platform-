from __future__ import annotations

import argparse
import json
import sys
import time
from urllib import error, request


def build_payload(model: str, prompt: str) -> bytes:
    body = {
        "model": model,
        "messages": [
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.2,
    }
    return json.dumps(body).encode("utf-8")


def main() -> int:
    parser = argparse.ArgumentParser(description="Measure end-to-end LLM response time.")
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--api-key", required=True)
    parser.add_argument(
        "--prompt",
        default="Explique brièvement ce qu'est le machine learning en 3 phrases.",
    )
    parser.add_argument(
        "--interactive",
        action="store_true",
        help="Prompt for the message in the terminal before sending the request.",
    )
    args = parser.parse_args()

    prompt = args.prompt
    if args.interactive:
        try:
            entered_prompt = input("Enter your prompt: ").strip()
        except EOFError:
            entered_prompt = ""
        if entered_prompt:
            prompt = entered_prompt

    url = args.base_url.rstrip("/") + "/v1/chat/completions"
    payload = build_payload(args.model, prompt)
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {args.api_key}",
    }

    req = request.Request(url, data=payload, headers=headers, method="POST")
    start = time.perf_counter()
    try:
        with request.urlopen(req, timeout=300) as response:
            raw = response.read()
            elapsed = time.perf_counter() - start
    except error.HTTPError as exc:
        body = exc.read().decode("utf-8", errors="replace")
        print(json.dumps({"ok": False, "status": exc.code, "body": body}, ensure_ascii=False, indent=2))
        return 1
    except Exception as exc:  # noqa: BLE001
        elapsed = time.perf_counter() - start
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(exc),
                    "elapsed_seconds": round(elapsed, 3),
                },
                ensure_ascii=False,
                indent=2,
            )
        )
        return 1

    text = raw.decode("utf-8", errors="replace")
    parsed = json.loads(text)
    content = ""
    choices = parsed.get("choices") or []
    if choices and isinstance(choices[0], dict):
        message = choices[0].get("message") or {}
        if isinstance(message, dict):
            content = str(message.get("content") or "")

    result = {
        "ok": True,
        "url": url,
        "model": args.model,
        "prompt": prompt,
        "elapsed_seconds": round(elapsed, 3),
        "response_text": content.strip(),
        "usage": parsed.get("usage"),
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
