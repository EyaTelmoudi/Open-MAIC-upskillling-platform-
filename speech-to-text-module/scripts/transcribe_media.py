from __future__ import annotations

import argparse
import json
import mimetypes
import os
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from uuid import uuid4


def load_env(module_root: Path) -> dict[str, str]:
    env = {}
    env_path = module_root / ".env"
    if not env_path.exists():
        env_path = module_root / ".env.example"
    if env_path.exists():
        for raw_line in env_path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            env[key.strip()] = value.strip()
    return env


def build_multipart(fields: dict[str, str], file_field: str, file_path: Path) -> tuple[bytes, str]:
    boundary = f"----openmaic-stt-{uuid4().hex}"
    parts: list[bytes] = []

    for key, value in fields.items():
        parts.extend(
            [
                f"--{boundary}\r\n".encode("utf-8"),
                f'Content-Disposition: form-data; name="{key}"\r\n\r\n'.encode("utf-8"),
                value.encode("utf-8"),
                b"\r\n",
            ]
        )

    mime_type = mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
    parts.extend(
        [
            f"--{boundary}\r\n".encode("utf-8"),
            (
                f'Content-Disposition: form-data; name="{file_field}"; filename="{file_path.name}"\r\n'
            ).encode("utf-8"),
            f"Content-Type: {mime_type}\r\n\r\n".encode("utf-8"),
            file_path.read_bytes(),
            b"\r\n",
            f"--{boundary}--\r\n".encode("utf-8"),
        ]
    )
    return b"".join(parts), boundary


def stream_container_logs(container_name: str, stop_event: threading.Event) -> None:
    seen_lines: set[str] = set()
    while not stop_event.is_set():
        try:
            result = subprocess.run(
                ["docker", "logs", container_name, "--tail", "40"],
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                check=False,
            )
        except Exception:
            time.sleep(3)
            continue

        combined = "\n".join(part for part in [result.stdout, result.stderr] if part)
        for line in combined.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if stripped in seen_lines:
                continue
            if (
                "Model " in stripped and " loaded in " in stripped
                or "Processing audio with duration" in stripped
                or "Detected language" in stripped
                or '"POST /' in stripped
                or "Application startup complete" in stripped
            ):
                print(f"[server] {stripped}")
                seen_lines.add(stripped)

        time.sleep(3)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Send a local media file to faster-whisper-server and save the transcript."
    )
    parser.add_argument("media_path", help="Path to a local video or audio file")
    parser.add_argument("--model", default=None, help="Model name sent to the API")
    parser.add_argument("--base-url", default=None, help="Server base URL, e.g. http://127.0.0.1:8001")
    parser.add_argument(
        "--response-format",
        default="verbose_json",
        choices=["json", "text", "srt", "verbose_json", "vtt"],
        help="Desired response format",
    )
    parser.add_argument("--language", default=None, help="Optional language hint, e.g. fr or ar")
    parser.add_argument(
        "--container-name",
        default="openmaic-stt-gpu",
        help="Docker container name used for log progress tracking",
    )
    args = parser.parse_args()

    script_path = Path(__file__).resolve()
    module_root = script_path.parents[1]
    env = load_env(module_root)
    base_url = args.base_url or env.get("STT_BASE_URL", "http://127.0.0.1:8001")
    model = args.model or env.get("STT_MODEL", "Systran/faster-whisper-small")

    media_path = Path(args.media_path).expanduser().resolve()
    if not media_path.exists():
        print(f"Media file not found: {media_path}", file=sys.stderr)
        return 1

    media_size_mb = media_path.stat().st_size / (1024 * 1024)
    print(f"[1/4] Media found: {media_path}")
    print(f"      Size: {media_size_mb:.2f} MB")
    print(f"      Server: {base_url}")
    print(f"      Model: {model}")

    outputs_dir = module_root / "outputs"
    outputs_dir.mkdir(parents=True, exist_ok=True)

    fields = {
        "model": model,
        "response_format": args.response_format,
    }
    if args.language:
        fields["language"] = args.language

    body, boundary = build_multipart(fields, "file", media_path)
    endpoint = f"{base_url.rstrip('/')}/v1/audio/transcriptions"

    request = urllib.request.Request(
        endpoint,
        data=body,
        method="POST",
        headers={
            "Content-Type": f"multipart/form-data; boundary={boundary}",
            "Accept": "application/json, text/plain;q=0.9, */*;q=0.8",
        },
    )

    print("[2/4] Uploading media to the STT service...")
    started_at = time.time()
    stop_logs = threading.Event()
    log_thread = threading.Thread(
        target=stream_container_logs,
        args=(args.container_name, stop_logs),
        daemon=True,
    )
    log_thread.start()

    try:
        with urllib.request.urlopen(request, timeout=3600) as response:
            raw = response.read()
            content_type = response.headers.get("Content-Type", "")
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="replace")
        print(f"HTTP {error.code} from STT service:\n{detail}", file=sys.stderr)
        return 2
    except urllib.error.URLError as error:
        print(f"Failed to contact STT service at {endpoint}: {error}", file=sys.stderr)
        return 3
    finally:
        stop_logs.set()
        log_thread.join(timeout=5)

    elapsed = time.time() - started_at
    print(f"[3/4] Server response received after {elapsed:.1f}s")

    base_name = media_path.stem
    json_output = outputs_dir / f"{base_name}.json"
    txt_output = outputs_dir / f"{base_name}.txt"

    if "application/json" in content_type or args.response_format in {"json", "verbose_json"}:
        parsed = json.loads(raw.decode("utf-8"))
        json_output.write_text(json.dumps(parsed, ensure_ascii=False, indent=2), encoding="utf-8")
        text_value = parsed.get("text", "")
        txt_output.write_text(text_value, encoding="utf-8")
        print("[4/4] Transcription saved successfully.")
        print(f"Saved transcript text to: {txt_output}")
        print(f"Saved transcript JSON to: {json_output}")
        return 0

    text = raw.decode("utf-8", errors="replace")
    txt_output.write_text(text, encoding="utf-8")
    print("[4/4] Transcription saved successfully.")
    print(f"Saved transcript text to: {txt_output}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
