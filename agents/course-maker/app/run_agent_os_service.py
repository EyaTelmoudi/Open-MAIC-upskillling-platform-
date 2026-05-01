from __future__ import annotations

import os
import sys

import uvicorn

if __package__ in (None, ""):
    sys.path.append(os.path.dirname(os.path.dirname(__file__)))
    from app.agent_os_service import app
else:
    from .agent_os_service import app


def main() -> None:
    uvicorn.run(
        app,
        host="127.0.0.1",
        port=8010,
        reload=False,
        log_level="info",
    )


if __name__ == "__main__":
    main()
