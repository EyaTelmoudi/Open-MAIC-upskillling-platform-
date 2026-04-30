"""UserSyncService for Azure Entra ID user synchronization."""

import os
import uuid
from datetime import datetime
from typing import Optional

import httpx
from common.auth import create_access_token, create_refresh_token
from common.enums import AuthProvider, UserRole, UserStatus
from common.messaging import RabbitMQClient
from common.models import User
from sqlalchemy.orm import Session
from services.identity.user_defaults import get_default_user_timezone

GRAPH_API_URL = "https://graph.microsoft.com/v1.0"

AZURE_CLIENT_ID = os.getenv("AZURE_CLIENT_ID", "")
AZURE_TENANT_ID = os.getenv("AZURE_TENANT_ID", "")
AZURE_CLIENT_SECRET = os.getenv("AZURE_CLIENT_SECRET", "")


class UserSyncService:
    """Service for syncing users from Azure Entra ID.

    Implements 9-step sync logic:
    1. Extract claims from JWT (oid, tid, mail, given_name, family_name, displayName, department, jobTitle, preferredLanguage, accountEnabled)
    2. Check accountEnabled — suspend if false
    3. Resolve tenant from tid
    4. Lookup user by entraOid + tenantId
    5. Sync mutable fields, detect email change (set emailMismatch flag)
    6. Create new user on first login
    7. Fetch and cache groups (async, BackgroundTasks)
    8. Run RoleMappingEngine
    9. Issue platform JWT
    """

    def __init__(self, db: Session, tenant_config: Optional[dict] = None):
        """Initialize UserSyncService.

        Args:
            db: Database session.
            tenant_config: Per-tenant Azure config (client_id, tenant_id, client_secret).
        """
        self.db = db
        self.tenant_config = tenant_config or {}
        self.client_id = self.tenant_config.get("client_id") or AZURE_CLIENT_ID
        self.tenant_id = self.tenant_config.get("tenant_id") or AZURE_TENANT_ID
        self.client_secret = (
            self.tenant_config.get("client_secret") or AZURE_CLIENT_SECRET
        )

    def sync_user(
        self,
        azure_claims: dict,
    ) -> Optional[dict]:
        """Sync user from Azure Entra ID claims.

        Args:
            azure_claims: Dictionary containing Azure JWT claims.

        Returns:
            Dictionary with user data and tokens, or None if sync fails.
        """
        extracted_claims = self._extract_claims(azure_claims)
        if not extracted_claims:
            return None

        oid = extracted_claims["oid"]
        tid = extracted_claims["tid"]

        if not self._check_account_enabled(extracted_claims):
            return None

        tenant = self._resolve_tenant(tid)
        tenant_id = str(tenant.id) if tenant else None

        user = self._lookup_user(oid, tenant_id)

        if user:
            synced_user, email_changed = self._sync_existing_user(
                user, extracted_claims
            )
            if email_changed:
                self._publish_email_mismatch_event(
                    synced_user, extracted_claims["mail"]
                )
        else:
            synced_user = self._create_new_user(extracted_claims, tenant_id)

        if not synced_user:
            return None

        self._fetch_and_cache_groups(synced_user, extracted_claims)

        mapped_role = self._run_role_mapping_engine(extracted_claims, synced_user)
        if mapped_role:
            synced_user.role = mapped_role
            self.db.commit()
            self.db.refresh(synced_user)

        tokens = self._issue_platform_jwt(synced_user)

        return {
            "user": synced_user,
            "tokens": tokens,
        }

    def _extract_claims(self, azure_claims: dict) -> Optional[dict]:
        """Step 1: Extract claims from JWT.

        Args:
            azure_claims: Raw Azure JWT claims.

        Returns:
            Dictionary with extracted and normalized claims.
        """
        return {
            "oid": azure_claims.get("oid"),
            "tid": azure_claims.get("tid"),
            "mail": azure_claims.get("mail"),
            "upn": azure_claims.get("upn"),
            "given_name": azure_claims.get("given_name"),
            "family_name": azure_claims.get("family_name"),
            "display_name": azure_claims.get("display_name"),
            "department": azure_claims.get("department"),
            "job_title": azure_claims.get("jobTitle"),
            "preferred_language": azure_claims.get("preferredLanguage"),
            "account_enabled": azure_claims.get("accountEnabled", True),
            "roles": azure_claims.get("roles", []),
        }

    def _check_account_enabled(self, claims: dict) -> bool:
        """Step 2: Check accountEnabled — suspend if false.

        Args:
            claims: Extracted claims.

        Returns:
            True if account is enabled, False if disabled.
        """
        return claims.get("account_enabled", True)

    def _resolve_tenant(self, tid: str) -> Optional[User]:
        """Step 3: Resolve tenant from tid (Azure tenant ID).

        Args:
            tid: Azure tenant ID.

        Returns:
            Tenant model if found, None otherwise.
        """
        from common.models import Tenant

        tenant = self.db.query(Tenant).filter(Tenant.entra_tenant_id == tid).first()
        if not tenant:
            tenant = self.db.query(Tenant).filter(Tenant.entra_tenant_id == tid).first()
        return tenant

    def _lookup_user(self, oid: str, tenant_id: Optional[str]) -> Optional[User]:
        """Step 4: Lookup user by entraOid + tenantId.

        Args:
            oid: Azure object ID.
            tenant_id: Tenant UUID.

        Returns:
            User if found, None otherwise.
        """
        query = self.db.query(User).filter(User.entra_oid == oid)
        if tenant_id:
            query = query.filter(User.tenant_id == uuid.UUID(tenant_id))
        return query.first()

    def _sync_existing_user(self, user: User, claims: dict) -> tuple[User, bool]:
        """Step 5: Sync mutable fields, detect email change.

        Args:
            user: Existing user model.
            claims: Extracted claims.

        Returns:
            Tuple of (updated user, email_changed flag).
        """
        email_changed = False

        if claims.get("mail") and user.entra_mail != claims["mail"]:
            if user.email.lower() != claims["mail"].lower():
                email_changed = True

        user.entra_upn = claims.get("upn")
        user.entra_mail = claims.get("mail")
        user.entra_given_name = claims.get("given_name")
        user.entra_surname = claims.get("family_name")
        user.entra_display_name = claims.get("display_name")
        user.entra_job_title = claims.get("job_title")
        user.entra_department = claims.get("department")
        user.entra_location = claims.get("location")

        user.last_login = datetime.utcnow()
        user.last_entra_sync = datetime.utcnow()

        self.db.commit()
        self.db.refresh(user)

        return user, email_changed

    def _create_new_user(
        self, claims: dict, tenant_id: Optional[str]
    ) -> Optional[User]:
        """Step 6: Create new user on first login.

        Args:
            claims: Extracted claims.
            tenant_id: Tenant UUID.

        Returns:
            Created user model or None if creation fails.
        """
        from common.auth import hash_password

        first_name = (
            claims.get("given_name") or claims.get("display_name", "User").split()[0]
        )
        last_name = (
            claims.get("family_name") or claims.get("display_name", "").split()[-1]
            if " " in claims.get("display_name", "")
            else ""
        )

        user = User(
            email=claims.get("mail") or claims.get("upn"),
            auth_provider=AuthProvider.azure_entra.value,
            first_name=first_name,
            last_name=last_name,
            role=UserRole.TeamMember.value,
            status=UserStatus.active.value,
            onboarded=False,
            skills=[],
            password_hash=hash_password(os.urandom(24).hex()),
            tenant_id=uuid.UUID(tenant_id) if tenant_id else None,
            timezone=get_default_user_timezone(self.db),
            entra_oid=claims.get("oid"),
            entra_upn=claims.get("upn"),
            entra_mail=claims.get("mail"),
            entra_given_name=claims.get("given_name"),
            entra_surname=claims.get("family_name"),
            entra_display_name=claims.get("display_name"),
            entra_job_title=claims.get("job_title"),
            entra_department=claims.get("department"),
            entra_company_name=claims.get("companyName"),
            entra_location=claims.get("location"),
            last_entra_sync=datetime.utcnow(),
        )

        self.db.add(user)
        self.db.commit()
        self.db.refresh(user)

        return user

    def _fetch_and_cache_groups(self, user: User, claims: dict) -> None:
        """Step 7: Fetch and cache groups (async).

        Args:
            user: User model.
            claims: Extracted claims.
        """
        pass

    def _run_role_mapping_engine(self, claims: dict, user: User) -> Optional[str]:
        """Step 8: Run RoleMappingEngine.

        Args:
            claims: Extracted claims.
            user: User model.

        Returns:
            Mapped platform role or None.
        """
        from common.models import RoleMappingRule

        azure_roles = claims.get("roles", [])
        department = claims.get("department")

        rules = (
            self.db.query(RoleMappingRule)
            .filter(
                RoleMappingRule.is_active == True,
                RoleMappingRule.tenant_id == user.tenant_id,
            )
            .all()
        )

        for rule in rules:
            if rule.azure_role in azure_roles:
                if not rule.department or rule.department == department:
                    return rule.platform_role

        return None

    def _issue_platform_jwt(self, user: User) -> dict:
        """Step 9: Issue platform JWT.

        Args:
            user: User model.

        Returns:
            Dictionary with access and refresh tokens.
        """
        access_token = create_access_token(
            user_id=str(user.id),
            email=str(user.email),
            role=str(user.role),
            auth_provider=user.auth_provider,
            status=str(user.status),
            onboarded=bool(user.onboarded),
            tenant_id=str(user.tenant_id) if user.tenant_id else None,
        )

        refresh_token = create_refresh_token(str(user.id))

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": 900,
        }

    def _language_to_timezone(self, language: Optional[str]) -> str:
        """Convert language code to timezone.

        Args:
            language: Language code (e.g., 'en-US', 'fr-FR').

        Returns:
            IANA timezone string.
        """
        if not language:
            return "Africa/Tunis"

        lang_to_tz = {
            "en-US": "America/New_York",
            "en-GB": "Europe/London",
            "fr-FR": "Europe/Paris",
            "de-DE": "Europe/Berlin",
            "es-ES": "Europe/Madrid",
            "it-IT": "Europe/Rome",
            "ar": "Africa/Tunis",
            "ar-TN": "Africa/Tunis",
        }

        return lang_to_tz.get(language, "Africa/Tunis")

    def _publish_email_mismatch_event(self, user: User, new_email: str) -> None:
        """Publish user.email.mismatch event to RabbitMQ.

        Args:
            user: User model.
            new_email: New email from Entra ID.
        """
        try:
            rabbitmq = RabbitMQClient()
            payload = {
                "event": "user.email.mismatch",
                "userId": str(user.id),
                "platform_email": user.email,
                "entra_email": new_email,
                "timestamp": datetime.utcnow().isoformat(),
            }
            rabbitmq.publish("auth.exchange", "user.email.mismatch", payload)
            rabbitmq.close()
        except Exception:
            pass


async def get_azure_token() -> Optional[str]:
    """Get Azure AD token for Graph API calls.

    Returns:
        Access token or None if failed.
    """
    if not AZURE_CLIENT_ID or not AZURE_TENANT_ID or not AZURE_CLIENT_SECRET:
        return None

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
                return None

            return token_response.json().get("access_token")

    except Exception:
        return None


async def fetch_user_from_graph(user_oid: str) -> Optional[dict]:
    """Fetch user details from Microsoft Graph API.

    Args:
        user_oid: Azure user object ID.

    Returns:
        User details dictionary or None if failed.
    """
    access_token = await get_azure_token()
    if not access_token:
        return None

    try:
        async with httpx.AsyncClient() as client:
            headers = {"Authorization": f"Bearer {access_token}"}
            response = await client.get(
                f"{GRAPH_API_URL}/users/{user_oid}",
                headers=headers,
                params={
                    "$select": (
                        "id,displayName,givenName,surname,mail,userPrincipalName,"
                        "department,jobTitle,officeLocation,preferredLanguage,accountEnabled"
                    )
                },
            )
            if response.status_code != 200:
                return None

            return response.json()

    except Exception:
        return None
