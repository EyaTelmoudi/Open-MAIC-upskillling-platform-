"""Azure Entra ID authentication for enterprise users."""

import os
from typing import Optional

import httpx
from common.enums import AuthProvider, UserRole
from common.models import User
from common.schemas import TokenResponse
from sqlalchemy.orm import Session

from services.identity.auth.jwt import generate_token_response
from services.identity.user_defaults import get_default_user_timezone

GRAPH_API_URL = "https://graph.microsoft.com/v1.0"
COMPANY_EMAIL_DOMAIN = os.getenv("COMPANY_EMAIL_DOMAIN", "techcorp.com")

AZURE_CLIENT_ID = os.getenv("AZURE_CLIENT_ID", "")
AZURE_TENANT_ID = os.getenv("AZURE_TENANT_ID", "")
AZURE_CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET", "")
AZURE_REDIRECT_URI = os.getenv(
    "AZURE_REDIRECT_URI", "http://localhost:3000/auth/callback"
)


def get_azure_auth_url() -> str:
    """Get the Azure Entra ID authorization URL.

    Returns:
        Authorization URL for Azure Entra ID login.
    """
    return (
        f"https://login.microsoftonline.com/{AZURE_TENANT_ID}"
        f"/oauth2/v2.0/authorize"
        f"?client_id={AZURE_CLIENT_ID}"
        f"&response_type=code"
        f"&redirect_uri={AZURE_REDIRECT_URI}"
        f"&scope=openid profile email"
    )


def authenticate_azure(
    db: Session, code: str, redirect_uri: str
) -> Optional[TokenResponse]:
    """Authenticate a user via Azure Entra ID OIDC flow.

    In development/demo mode, this validates the code and either
    finds or creates the user in the database.

    Args:
        db: Database session.
        code: Authorization code from Azure.
        redirect_uri: Redirect URI used in the auth flow.

    Returns:
        TokenResponse if authentication succeeds, None otherwise.
    """
    if not AZURE_CLIENT_ID:
        # Demo mode: accept any code for testing
        return _demo_azure_auth(db, code)

    # In production, MSAL would be used here:
    # import msal
    # app = msal.ConfidentialClientApplication(
    #     AZURE_CLIENT_ID,
    #     authority=f"https://login.microsoftonline.com/{AZURE_TENANT_ID}",
    #     client_credential=AZURE_CLIENT_SECRET,
    # )
    # result = app.acquire_token_by_authorization_code(
    #     code, scopes=["openid", "profile", "email"],
    #     redirect_uri=redirect_uri,
    # )
    # if "error" in result:
    #     return None
    # user_info = result.get("id_token_claims", {})

    return _demo_azure_auth(db, code)


def _demo_azure_auth(
    db: Session, code: str, azure_roles: list = None, tenant_id: Optional[str] = None
) -> Optional[TokenResponse]:
    """Demo Azure authentication for development/testing.

    Creates or finds a demo Azure user.
    On first login, creates user with status=pending, onboarded=False.
    On subsequent logins, syncs role from Azure claims if present.

    Args:
        db: Database session.
        code: Auth code (ignored in demo mode).
        azure_roles: Role claims from Azure JWT (if any).
        tenant_id: Tenant UUID for multi-tenancy resolution.

    Returns:
        TokenResponse for the demo user.
    """
    # Parse code as email in demo mode for testing different users
    demo_email = code if "@" in code else "demo@enterprise.com"
    user = db.query(User).filter(User.email == demo_email).first()

    from common.auth import hash_password
    from common.enums import UserStatus
    import uuid

    if user is None:
        # First login: create user with pending status, onboarded=False
        user = User(
            email=demo_email,
            auth_provider=AuthProvider.azure_entra.value,
            first_name="Demo",
            last_name="User",
            role=UserRole.TeamMember.value,
            status=UserStatus.pending_invitation.value,
            onboarded=False,
            skills=[],
            password_hash=hash_password("demo_password"),
            tenant_id=uuid.UUID(tenant_id) if tenant_id else None,
            timezone=get_default_user_timezone(db),
        )
        db.add(user)
        db.commit()
        db.refresh(user)
    else:
        # Subsequent login: sync role from Azure if present
        if azure_roles and len(azure_roles) > 0:
            azure_role = azure_roles[0]
            valid_roles = {r.value for r in UserRole}
            if azure_role in valid_roles:
                user.role = azure_role
                db.commit()
                db.refresh(user)

    return generate_token_response(
        user_id=str(user.id),
        email=str(user.email),
        role=str(user.role),
        auth_provider=AuthProvider.azure_entra.value,
        status=str(user.status),
        onboarded=bool(user.onboarded),
        tenant_id=str(user.tenant_id) if user.tenant_id else None,
    )


def authenticate_azure_with_roles(
    db: Session,
    code: str,
    redirect_uri: str,
    azure_roles: list = None,
    tenant_id: Optional[str] = None,
    tenant_config: Optional[dict] = None,
) -> Optional[TokenResponse]:
    """Authenticate via Azure Entra ID with role sync and tenant support.

    Args:
        db: Database session.
        code: Authorization code from Azure.
        redirect_uri: Redirect URI used in the auth flow.
        azure_roles: Role claims from incoming Azure JWT.
        tenant_id: Tenant UUID for multi-tenancy resolution.
        tenant_config: Per-tenant Azure config (client_id, tenant_id).

    Returns:
        TokenResponse if authentication succeeds, None otherwise.
    """
    client_id = tenant_config.get("client_id") if tenant_config else AZURE_CLIENT_ID
    entra_tid = tenant_config.get("tenant_id") if tenant_config else AZURE_TENANT_ID

    if not client_id:
        # Demo mode: accept any code for testing
        return _demo_azure_auth(db, code, azure_roles, tenant_id)

    # In production, MSAL would be used here with per-tenant config:
    # import msal
    # app = msal.ConfidentialClientApplication(
    #     client_id,
    #     authority=f"https://login.microsoftonline.com/{entra_tid}",
    #     client_credential=AZURE_CLIENT_SECRET,
    # )
    # result = app.acquire_token_by_authorization_code(
    #     code, scopes=["openid", "profile", "email"],
    #     redirect_uri=redirect_uri,
    # )
    # if "error" in result:
    #     return None
    # user_info = result.get("id_token_claims", {})
    # azure_roles = user_info.get("roles", [])

    return _demo_azure_auth(db, code, azure_roles, tenant_id)


async def check_azure_user_exists(email: str) -> bool:
    """Check if a user exists in Azure Entra ID via Microsoft Graph API.

    Uses the client credentials flow to get an app-only token and then
    queries the /users endpoint to check if the user exists.

    Args:
        email: The email address to check in Azure.

    Returns:
        True if user exists in Azure, False otherwise.
    """
    if not AZURE_CLIENT_ID or not AZURE_TENANT_ID or not AZURE_CLIENT_SECRET:
        return False

    try:
        async with httpx.AsyncClient() as client:
            token_url = (
                f"https://login.microsoftonline.com/{AZURE_TENANT_ID}/oauth2/v2.0/token"
            )
            token_data = {
                "client_id": AZURE_CLIENT_ID,
                "client_secret": AZURE_CLIENT_SECRET,
                "scope": "https://graph.microsoft.com/.default",
                "grant_type": "client_credentials",
            }
            token_response = await client.post(token_url, data=token_data)
            if token_response.status_code != 200:
                return False

            access_token = token_response.json().get("access_token")
            if not access_token:
                return False

            headers = {"Authorization": f"Bearer {access_token}"}
            user_response = await client.get(
                f"{GRAPH_API_URL}/users/{email}",
                headers=headers,
            )
            return user_response.status_code == 200

    except Exception:
        return False


async def send_invite_email(email: str, invited_by: str) -> bool:
    """Send an invitation email via Microsoft Graph API.

    Args:
        email: The email address to invite.
        invited_by: Email of the admin sending the invite.

    Returns:
        True if email sent successfully, False otherwise.
    """
    if not AZURE_CLIENT_ID or not AZURE_TENANT_ID or not AZURE_CLIENT_SECRET:
        return False

    try:
        async with httpx.AsyncClient() as client:
            token_url = (
                f"https://login.microsoftonline.com/{AZURE_TENANT_ID}/oauth2/v2.0/token"
            )
            token_data = {
                "client_id": AZURE_CLIENT_ID,
                "client_secret": AZURE_CLIENT_SECRET,
                "scope": "https://graph.microsoft.com/.default",
                "grant_type": "client_credentials",
            }
            token_response = await client.post(token_url, data=token_data)
            if token_response.status_code != 200:
                return False

            access_token = token_response.json().get("access_token")
            if not access_token:
                return False

            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            }
            invite_payload = {
                "invitedUserEmailAddress": email,
                "inviteRedirectUrl": AZURE_REDIRECT_URI,
                "sendInvitationMessage": True,
                "customizedMessageBody": (
                    f"You have been invited to the SkillForge platform "
                    f"by {invited_by}. Click the link to get started."
                ),
            }
            response = await client.post(
                f"{GRAPH_API_URL}/invitations",
                headers=headers,
                json=invite_payload,
            )
            return response.status_code in (200, 201)

    except Exception:
        return False


def is_company_email(email: str) -> bool:
    """Check if email belongs to company domain.

    Simple domain check as fallback when Azure Graph API is unavailable.
    Configure COMPANY_EMAIL_DOMAIN in environment variables.

    Args:
        email: The email address to check.

    Returns:
        True if email domain matches company domain.
    """
    if not COMPANY_EMAIL_DOMAIN:
        return False
    return email.lower().endswith(f"@{COMPANY_EMAIL_DOMAIN.lower()}")
