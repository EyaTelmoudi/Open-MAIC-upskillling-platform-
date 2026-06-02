"""Shared Azure Entra ID configuration helpers."""

import os
from typing import Iterable, Optional


def get_platform_entra_redirect_uri() -> str:
    """Return the platform-level Entra callback URI configured by the backend."""
    explicit_uri = (
        os.getenv("AZURE_REDIRECT_URI")
        or os.getenv("ENTRA_REDIRECT_URI")
        or ""
    ).strip()
    if explicit_uri:
        return explicit_uri

    frontend_url = (os.getenv("FRONTEND_URL") or "").strip().rstrip("/")
    if frontend_url:
        return f"{frontend_url}/auth/callback"

    return "http://localhost:3001/auth/callback"


def get_platform_entra_redirect_uris() -> list[str]:
    """Return the default redirect URI list stored for tenant Entra settings."""
    return [get_platform_entra_redirect_uri()]


def pick_entra_redirect_uri(tenant_redirect_uris: Optional[Iterable[str]] = None) -> str:
    """Pick the tenant callback URI, falling back to the platform default."""
    for value in tenant_redirect_uris or []:
        redirect_uri = str(value or "").strip()
        if redirect_uri:
            return redirect_uri

    return get_platform_entra_redirect_uri()
