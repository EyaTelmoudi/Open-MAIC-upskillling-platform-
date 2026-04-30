from typing import Optional
from pydantic import BaseModel, field_validator


class SetPasswordRequest(BaseModel):
    """Schema for setting initial password via token."""

    token: str
    password: str
    password_confirm: str

    @field_validator("password_confirm")
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if "password" in info.data and v != info.data["password"]:
            raise ValueError("Passwords do not match")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class SuperAdminAuditLogResponse(BaseModel):
    """Schema for audit log response."""

    id: str
    action: str
    actor_id: Optional[str] = None
    actor_email: Optional[str] = None
    target_type: Optional[str] = None
    target_id: Optional[str] = None
    details: Optional[dict] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    created_at: str

    class Config:
        from_attributes = True


class SuperAdminAuditLogListResponse(BaseModel):
    """Schema for audit log list response."""

    items: list[SuperAdminAuditLogResponse]
    total: int
    page: int
    page_size: int


class SuperAdminAuditLogFilterOptionsResponse(BaseModel):
    """Available audit log filter values."""

    actions: list[str]
    target_types: list[str]


class AdminCreateRequest(BaseModel):
    """Schema for direct admin creation request."""

    first_name: str
    last_name: str
    email: str
    password: str
    tenant_id: str
    department: Optional[str] = None

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class AdminCreateResponse(BaseModel):
    """Schema for admin creation response."""

    success: bool
    message: str
    admin_id: str
    login_credentials: dict

    class Config:
        from_attributes = True


class AdminInviteRequest(BaseModel):
    """Schema for admin invitation request."""

    first_name: str
    last_name: str
    email: str
    tenant_id: str


class AdminInviteResponse(BaseModel):
    """Schema for admin invitation response."""

    success: bool
    message: str
    admin_id: str

    class Config:
        from_attributes = True
