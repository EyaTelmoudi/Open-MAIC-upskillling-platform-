from __future__ import annotations

import sys
from pathlib import Path

import uvicorn

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
if str(WORKSPACE_ROOT) not in sys.path:
    sys.path.insert(0, str(WORKSPACE_ROOT))

from app.agent_os_service import app

if __name__ == "__main__":
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8012,
        reload=False,
        log_level="warning",
    )
