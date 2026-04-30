"""Pydantic schemas for course preview mode."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class PreviewTokenCreate(BaseModel):
    """Schema for creating a preview token."""

    pass


class PreviewTokenResponse(BaseModel):
    """Schema for preview token response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    course_id: UUID
    token: str
    created_by_id: UUID
    expires_at: datetime
    is_active: bool
    created_at: datetime


class PreviewTokenGenerated(BaseModel):
    """Schema for generated preview token response."""

    token: str
    expires_at: datetime
    preview_url: str


class PreviewAccessResponse(BaseModel):
    """Schema for preview access validation."""

    valid: bool
    course_id: Optional[UUID] = None
    course_title: Optional[str] = None
    expires_at: Optional[datetime] = None
    message: Optional[str] = None
