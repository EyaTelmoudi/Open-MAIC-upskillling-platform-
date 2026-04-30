"""User schemas for the Identity Service."""

import csv
import io
from typing import Optional

from pydantic import BaseModel, field_validator

from common.schemas import UserResponse


class UserUpdate(BaseModel):
    """Schema for updating a user."""

    first_name: Optional[str] = None
    last_name: Optional[str] = None
    department: Optional[str] = None
    bio: Optional[str] = None
    skills: Optional[list[str]] = None
    avatar: Optional[str] = None
    role: Optional[str] = None
    status: Optional[str] = None
    timezone: Optional[str] = None
    entra_oid: Optional[str] = None
    entra_upn: Optional[str] = None
    entra_mail: Optional[str] = None
    entra_given_name: Optional[str] = None
    entra_surname: Optional[str] = None
    entra_display_name: Optional[str] = None
    entra_job_title: Optional[str] = None
    entra_department: Optional[str] = None
    entra_company_name: Optional[str] = None
    entra_location: Optional[str] = None


class SetLocalPasswordRequest(BaseModel):
    """Schema for assigning or resetting a local password."""

    password: str

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        return v


class UserListResponse(BaseModel):
    """Paginated response for user list."""

    users: list[UserResponse]
    total: int
    page: int
    page_size: int


class InviteUser(BaseModel):
    """Schema for inviting a new user."""

    email: str
    role: str
    department: Optional[str] = None
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    skills: Optional[list[str]] = None
    password: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        return v


class CreateUser(BaseModel):
    """Schema for creating a new user."""

    email: str
    first_name: str
    last_name: str
    role: str = "TeamMember"
    department: Optional[str] = None
    status: Optional[str] = "active"
    tenant_id: Optional[str] = None
    password: Optional[str] = None

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: Optional[str]) -> Optional[str]:
        if v is not None and len(v) < 8:
            raise ValueError("Password must be at least 8 characters long")
        return v


class AcceptInvite(BaseModel):
    """Schema for accepting an invitation and setting password."""

    password: str
    first_name: str
    last_name: str


class UserDeactivate(BaseModel):
    """Schema for deactivating a user."""

    reason: Optional[str] = None


class UserStatusChange(BaseModel):
    """Schema for changing user status."""

    status: str
    reason: Optional[str] = None


class UserRevoke(BaseModel):
    """Schema for revoking user access."""

    reason: Optional[str] = None
    revoke_credentials: bool = False


class RoleMappingRule(BaseModel):
    """Schema for role mapping rule."""

    id: Optional[str] = None
    azure_role: str
    platform_role: str
    department: Optional[str] = None
    is_active: bool = True


class RoleMappingRuleCreate(BaseModel):
    """Schema for creating role mapping rule."""

    azure_role: str
    platform_role: str
    department: Optional[str] = None


class RoleMappingRuleUpdate(BaseModel):
    """Schema for updating role mapping rule."""

    azure_role: Optional[str] = None
    platform_role: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None


class RoleMappingRuleResponse(BaseModel):
    """Schema for role mapping rule response."""

    id: str
    azure_role: str
    platform_role: str
    department: Optional[str]
    is_active: bool
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class RefreshTokenRequest(BaseModel):
    """Schema for refresh token request."""

    refresh_token: str


class IdentityAuditLogResponse(BaseModel):
    """Schema for identity audit log response."""

    id: str
    user_id: Optional[str] = None
    action: str
    actor_id: Optional[str] = None
    actor_email: Optional[str] = None
    target_user_id: Optional[str] = None
    target_email: Optional[str] = None
    details: Optional[str] = None
    ip_address: Optional[str] = None
    created_at: str


class IdentityAuditLogListResponse(BaseModel):
    """Schema for identity audit log list response."""

    logs: list[IdentityAuditLogResponse]
    total: int
    page: int
    page_size: int


class EmailMismatchResponse(BaseModel):
    """Schema for email mismatch response."""

    user_id: str
    platform_email: str
    azure_email: str
    mismatch_type: str


class EmailMismatchListResponse(BaseModel):
    """Schema for email mismatch list response."""

    mismatches: list[EmailMismatchResponse]
    total: int


class ConfirmEmailUpdate(BaseModel):
    """Schema for confirming email update."""

    new_email: str
    verification_code: str


class KeepEmailRequest(BaseModel):
    """Schema for keeping current email."""

    pass


class CSVUserImport(BaseModel):
    """Schema for CSV user import."""

    email: str
    first_name: str
    last_name: str
    role: str
    department: Optional[str] = None

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if not v or "@" not in v:
            raise ValueError("Invalid email address")
        return v.lower().strip()

    @field_validator("first_name", "last_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip()

    @field_validator("role")
    @classmethod
    def validate_role(cls, v: str) -> str:
        valid_roles = {
            "Admin",
            "Manager",
            "LearningExpert",
            "TeamManager",
            "TeamMember",
            "TeamIntern",
        }
        if v not in valid_roles:
            raise ValueError(f"Invalid role. Must be one of: {', '.join(valid_roles)}")
        return v


class CSVImportRequest(BaseModel):
    """Schema for CSV file upload request."""

    role_default: Optional[str] = "TeamMember"


class CSVImportResult(BaseModel):
    """Result of CSV user import."""

    provisioned_count: int = 0  # Users found in Azure, can login immediately
    pending_count: int = 0  # Users not in Azure, invite emails sent
    skipped_count: int = 0  # Duplicate emails skipped
    errors: list[dict]  # Malformed rows or missing fields
    total_rows: int


def parse_csv_users(csv_content: str) -> tuple[list[CSVUserImport], list[dict]]:
    """Parse CSV content into user objects.

    Args:
        csv_content: Raw CSV string with headers: email, first_name, last_name, role, department

    Returns:
        Tuple of (valid_users, errors)
    """
    valid_users = []
    errors = []

    reader = csv.DictReader(io.StringIO(csv_content))

    for row_num, row in enumerate(reader, start=2):
        try:
            email = row.get("email", "").strip()
            first_name = row.get("first_name", "").strip()
            last_name = row.get("last_name", "").strip()
            role = row.get("role", "TeamMember").strip()
            department = row.get("department", "").strip() or None

            user = CSVUserImport(
                email=email,
                first_name=first_name,
                last_name=last_name,
                role=role,
                department=department,
            )
            valid_users.append(user)
        except Exception as e:
            errors.append(
                {
                    "row": row_num,
                    "error": str(e),
                    "data": row,
                }
            )

    return valid_users, errors
