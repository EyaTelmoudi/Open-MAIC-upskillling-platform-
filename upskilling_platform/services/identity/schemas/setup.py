"""Setup wizard schemas."""

from datetime import datetime
from zoneinfo import ZoneInfo

from pydantic import BaseModel, EmailStr, Field, field_validator


class SetupStatusResponse(BaseModel):
    """Response for setup status endpoint."""

    setup_completed: bool
    setup_completed_at: datetime | None = None
    platform_name: str | None = None


class AdminCreateRequest(BaseModel):
    """Request to create SuperAdmin account."""

    email: EmailStr
    password: str = Field(..., min_length=8)
    first_name: str = Field(..., min_length=1)
    last_name: str = Field(..., min_length=1)


class PlatformConfigRequest(BaseModel):
    """Request to configure platform settings."""

    platform_name: str = Field(..., min_length=1, max_length=255)
    platform_logo_url: str | None = None
    default_timezone: str = Field(..., min_length=1, max_length=100)
    support_email: EmailStr | None = None

    @field_validator("default_timezone")
    @classmethod
    def validate_timezone(cls, v: str) -> str:
        """Validate that timezone is a valid IANA timezone string."""
        try:
            ZoneInfo(v)
        except Exception:
            raise ValueError(f"Invalid timezone: {v}")
        return v


class TenantCreateRequest(BaseModel):
    """Request to create first tenant."""

    name: str = Field(..., min_length=1, max_length=255)
    slug: str = Field(..., min_length=1, max_length=50, pattern=r"^[a-z0-9-]+$")
    email_domain: str | None = Field(
        None, description="Company email domain for auto-detection"
    )


class GroupConfigRequest(BaseModel):
    """Request to configure organization group (parent company)."""

    group_name: str = Field(..., min_length=1, max_length=255)
    group_website: str | None = None
    group_primary_color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


class SetupCompleteRequest(BaseModel):
    """Request to complete setup wizard."""

    confirm: bool = Field(..., description="Must be true to confirm setup")


class SetupCompleteResponse(BaseModel):
    """Response after setup completion."""

    setup_completed: bool
    redirect_to: str
    message: str
    platform_name: str
    admin_email: str
