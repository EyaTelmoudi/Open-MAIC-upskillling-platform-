"""Pydantic schemas for the Upskilling Platform."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TokenPayload(BaseModel):
    """JWT token payload."""

    sub: str = Field(..., description="User ID (UUID)")
    email: str
    role: str
    auth_provider: str
    exp: int
    iat: int


class TokenResponse(BaseModel):
    """JWT token response."""

    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int
    role: str
    email: str


class UserCreate(BaseModel):
    """Schema for creating a user."""

    email: str
    password: Optional[str] = None
    first_name: str
    last_name: str
    role: str
    department: Optional[str] = None
    bio: Optional[str] = None
    skills: list[str] = []
    timezone: str = "Africa/Tunis"
    tenant_id: Optional[UUID] = None
    entra_oid: Optional[str] = None
    entra_upn: Optional[str] = None
    entra_mail: Optional[str] = None


class UserResponse(BaseModel):
    """Schema for user response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    email: str
    first_name: str
    last_name: str
    avatar: Optional[str] = None
    role: str
    status: str
    department: Optional[str] = None
    bio: Optional[str] = None
    skills: list[str] = []
    timezone: str = "Africa/Tunis"
    last_login: Optional[datetime] = None
    tenant_id: Optional[UUID] = None
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
    last_entra_sync: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class LoginRequest(BaseModel):
    """Schema for login request."""

    email: str
    password: str


class AzureLoginRequest(BaseModel):
    """Schema for Azure Entra ID login."""

    code: str
    redirect_uri: str


class HealthResponse(BaseModel):
    """Schema for health check response."""

    status: str
    service: str
    version: str = "0.1.0"


class PaginationParams(BaseModel):
    """Pagination query parameters."""

    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)
