"""Tenant schemas for the Identity Service."""

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, field_validator


class TenantCreate(BaseModel):
    """Schema for creating a tenant."""

    name: str
    slug: str
    email_domain: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    entra_client_id: Optional[str] = None
    entra_tenant_id: Optional[str] = None
    entra_redirect_uris: list[str] = []
    seat_limit: Optional[int] = None

    @field_validator("slug")
    @classmethod
    def validate_slug(cls, v: str) -> str:
        v = v.lower().strip()
        if not v:
            raise ValueError("Slug cannot be empty")
        if not v.replace("-", "").replace("_", "").isalnum():
            raise ValueError(
                "Slug can only contain letters, numbers, hyphens, and underscores"
            )
        return v


class TenantUpdate(BaseModel):
    """Schema for updating a tenant."""

    name: Optional[str] = None
    email_domain: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    entra_client_id: Optional[str] = None
    entra_tenant_id: Optional[str] = None
    entra_redirect_uris: Optional[list[str]] = None
    seat_limit: Optional[int] = None


class TenantStatusUpdate(BaseModel):
    """Schema for updating tenant status."""

    status: str

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        valid_statuses = ["pending", "active", "suspended"]
        if v not in valid_statuses:
            raise ValueError(
                f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
            )
        return v


class TenantResponse(BaseModel):
    """Schema for tenant response."""

    id: str
    name: str
    slug: str
    email_domain: Optional[str] = None
    logo_url: Optional[str] = None
    primary_color: Optional[str] = None
    status: str
    entra_client_id: Optional[str] = None
    entra_tenant_id: Optional[str] = None
    entra_redirect_uris: list[str] = []
    seat_limit: Optional[int] = None
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by_id: Optional[str] = None
    user_count: Optional[int] = 0
    admin_assigned: Optional[bool] = False
    entra_id_config: Optional[bool] = False

    class Config:
        from_attributes = True


class TenantListResponse(BaseModel):
    """Schema for tenant list response."""

    tenants: list[TenantResponse]
    total: int
    page: int
    page_size: int


class TenantAdminResponse(BaseModel):
    """Schema for tenant admin response."""

    id: str
    email: str
    first_name: str
    last_name: str
    role: str
    status: str
    tenant_id: Optional[str] = None
    tenant_name: Optional[str] = None
    department: Optional[str] = None
    created_at: Optional[datetime] = None
    last_login: Optional[datetime] = None


class TenantAdminListResponse(BaseModel):
    """Schema for tenant admin list response."""

    admins: list[TenantAdminResponse]
    total: int
    page: int
    page_size: int


class AssignTenantAdminRequest(BaseModel):
    """Schema for assigning a tenant admin."""

    user_id: str
    tenant_id: str


class UnassignTenantAdminRequest(BaseModel):
    """Schema for unassigning a tenant admin."""

    reason: Optional[str] = None


class SuspendTenantAdminRequest(BaseModel):
    """Schema for suspending a tenant admin."""

    reason: Optional[str] = None


class AdminStatusUpdate(BaseModel):
    """Schema for updating admin status."""

    status: str
    reason: Optional[str] = None

    @field_validator("status")
    @classmethod
    def validate_status(cls, v: str) -> str:
        from common.enums import UserStatus

        valid_statuses = {s.value for s in UserStatus}
        if v not in valid_statuses:
            raise ValueError(
                f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
            )
        return v


class TenantSetupProgressStep(BaseModel):
    """Schema for a single setup progress step."""

    key: str
    label: str
    status: str  # "completed", "pending", "not_configured"
    value: Optional[str] = None


class TenantSetupProgress(BaseModel):
    """Schema for tenant setup progress response."""

    tenant_id: str
    completion_percentage: int
    steps: list[TenantSetupProgressStep]


class InviteTenantAdminRequest(BaseModel):
    """Schema for inviting a new tenant admin."""

    first_name: str
    last_name: str
    email: str
    tenant_id: str

    @field_validator("email")
    @classmethod
    def validate_email(cls, v: str) -> str:
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email format")
        return v.lower().strip()


class InviteTenantAdminResponse(BaseModel):
    """Response for admin invitation."""

    success: bool
    message: str
    admin_id: str


class AcceptInvitationRequest(BaseModel):
    """Schema for accepting admin invitation."""

    token: str
    password: str
    password_confirm: str

    @field_validator("password_confirm")
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("Passwords do not match")
        return v


class TestEntraResponse(BaseModel):
    """Response for testing Entra ID connection."""

    success: bool
    message: str


class PlatformRoleMappingCreate(BaseModel):
    """Schema for creating a platform-level role mapping."""

    azure_role: str
    platform_role: str
    department: Optional[str] = None


class PlatformRoleMappingUpdate(BaseModel):
    """Schema for updating a platform-level role mapping."""

    azure_role: Optional[str] = None
    platform_role: Optional[str] = None
    department: Optional[str] = None
    is_active: Optional[bool] = None


class PlatformRoleMappingResponse(BaseModel):
    """Schema for platform-level role mapping response."""

    id: str
    azure_role: str
    platform_role: str
    department: Optional[str] = None
    is_active: bool
    scope: str = "platform"

    class Config:
        from_attributes = True
