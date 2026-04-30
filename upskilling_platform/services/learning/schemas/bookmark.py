"""Pydantic schemas for bookmark functionality."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class BookmarkCreate(BaseModel):
    """Schema for creating a bookmark."""

    course_id: Optional[UUID] = None
    lesson_id: Optional[UUID] = None


class BookmarkResponse(BaseModel):
    """Schema for bookmark response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    course_id: Optional[UUID] = None
    lesson_id: Optional[UUID] = None
    created_at: datetime
