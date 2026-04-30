import sys
import os
from pathlib import Path

project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))
os.chdir(str(project_root))

from dotenv import load_dotenv

load_dotenv()

os.environ["DATABASE_URL"] = (
    "postgresql+pg8000://upskilling:upskilling_dev_2026@localhost:5432/upskilling_platform"
)
os.environ["SETUP_SECRET_KEY"] = "change-this-setup-secret-key-in-production"

import uvicorn
from services.identity.main import app

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001, reload=False)
