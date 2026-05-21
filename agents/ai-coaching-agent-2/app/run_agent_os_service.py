from __future__ import annotations

import os
import sys
from pathlib import Path

import uvicorn

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = WORKSPACE_ROOT.parent.parent
UPSKILLING_PLATFORM_ROOT = REPO_ROOT / "upskilling_platform"
COMMON_PACKAGE_ROOT = UPSKILLING_PLATFORM_ROOT / "packages" / "common" / "src"


def _load_env_file(env_path: Path) -> None:
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue

        key, value = line.split("=", 1)
        key = key.strip()
        if not key or key in os.environ:
            continue

        parsed_value = value.strip()
        if len(parsed_value) >= 2 and parsed_value[0] == parsed_value[-1] and parsed_value[0] in {"'", '"'}:
            parsed_value = parsed_value[1:-1]
        os.environ[key] = parsed_value


_load_env_file(REPO_ROOT / ".env")
_load_env_file(UPSKILLING_PLATFORM_ROOT / ".env")
_load_env_file(WORKSPACE_ROOT / ".env")

if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))
if str(UPSKILLING_PLATFORM_ROOT) not in sys.path:
    sys.path.insert(0, str(UPSKILLING_PLATFORM_ROOT))
if str(COMMON_PACKAGE_ROOT) not in sys.path:
    sys.path.insert(0, str(COMMON_PACKAGE_ROOT))

from app.agent_os_service import app

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8015,
        reload=False,
        log_level="warning",
    )
