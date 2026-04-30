"""Identity & Access Service for the Upskilling Platform."""

import os
import sys

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("identity-service")

# Add parent directory to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

# Platform setup key validation (fail-fast if not set)
SETUP_SECRET_KEY = os.getenv("SETUP_SECRET_KEY")
if not SETUP_SECRET_KEY:
    print("ERROR: SETUP_SECRET_KEY environment variable is not set!")
    print("Please set SETUP_SECRET_KEY in your environment or .env file.")
    sys.exit(1)

# Include routers
from common.database import engine
from common.models import Base

app = FastAPI(title="Identity & Access Service")


@app.on_event("startup")
async def startup_event():
    """Ensure all tables are created on startup."""
    try:
        logger.info("Synchronizing database schema...")
        Base.metadata.create_all(bind=engine)
        logger.info("Database schema synchronized successfully.")
    except Exception as e:
        logger.error(f"Failed to synchronize database schema: {str(e)}")
        # In development, we might want to continue even if DB is not ready
        # as it might be starting up in another container.


SERVICE_PORT = int(os.getenv("IDENTITY_SERVICE_PORT", "8001"))


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "identity", "port": str(SERVICE_PORT)}


@app.get("/api/v1/health")
async def health_check_v1():
    return {"status": "healthy", "service": "identity", "port": str(SERVICE_PORT)}


@app.middleware("http")
async def cors_handler(request: Request, call_next):
    """Custom CORS handler to ensure headers are present even on errors."""
    if request.method == "OPTIONS":
        response = Response()
        response.status_code = 204
    else:
        try:
            response = await call_next(request)
        except Exception as e:
            error_msg = str(e)
            logger.exception(
                f"Unhandled exception during {request.method} {request.url.path}: {error_msg}"
            )

            # For database connection errors, return fallback response
            path = request.url.path
            if (
                "pg8000" in error_msg
                or "authentification" in error_msg.lower()
                or "fatal" in error_msg.lower()
            ):
                # Return fallback based on endpoint
                if path == "/setup/status":
                    response = JSONResponse(
                        status_code=200,
                        content={
                            "setup_completed": False,
                            "setup_completed_at": None,
                            "platform_name": "SkillForge",
                        },
                    )
                else:
                    response = JSONResponse(
                        status_code=503,
                        content={
                            "detail": "Service temporarily unavailable",
                            "error": "database",
                        },
                    )
            else:
                response = JSONResponse(
                    status_code=500,
                    content={
                        "detail": "Internal Server Error",
                        "error": error_msg,
                        "path": path,
                    },
                )

    # Force CORS headers on every response (including OPTIONS and Errors)
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = (
        "GET, POST, PUT, DELETE, OPTIONS, PATCH"
    )
    response.headers["Access-Control-Allow-Headers"] = (
        "Content-Type, Authorization, X-Setup-Key, X-Requested-With"
    )
    response.headers["Access-Control-Allow-Credentials"] = "false"
    response.headers["Access-Control-Max-Age"] = "86400"

    return response


# Include routers
from services.identity.routers.auth import router as auth_router
from services.identity.routers.users import router as users_router
from services.identity.routers.users import role_mapping_router
from services.identity.routers.users import identity_audit_router
from services.identity.routers.onboarding import router as onboarding_router
from services.identity.routers.setup import router as setup_router
from services.identity.routers.tenants import router as tenants_router
from services.identity.routers.tenants import admin_router
from services.identity.routers.tenants import platform_role_mapping_router
from services.identity.routers.tenants import public_router  # Public tenant endpoints
from services.identity.routers.sync import router as sync_router
from services.identity.routers.identity import router as identity_router
from services.identity.routers.checklist import router as checklist_router
from services.identity.routers.dashboard import router as dashboard_router
from services.identity.routers.settings import router as settings_router
from services.identity.routers.superadmin import router as superadmin_router

app.include_router(auth_router, prefix="/api/v1")
app.include_router(
    public_router, prefix="/api/v1"
)  # Public endpoints for /tenants/public
app.include_router(users_router, prefix="/api/v1")
app.include_router(role_mapping_router, prefix="/api/v1")
app.include_router(identity_audit_router, prefix="/api/v1")
app.include_router(onboarding_router, prefix="/api/v1")
app.include_router(setup_router)
app.include_router(tenants_router, prefix="/api/v1")
app.include_router(superadmin_router, prefix="/api/v1")
app.include_router(admin_router, prefix="/api/v1")
app.include_router(platform_role_mapping_router, prefix="/api/v1")
app.include_router(sync_router, prefix="/api/v1")
app.include_router(identity_router, prefix="/api/v1")
app.include_router(checklist_router, prefix="/api/v1")
app.include_router(dashboard_router, prefix="/api/v1")
app.include_router(settings_router, prefix="/api/v1")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=SERVICE_PORT)
