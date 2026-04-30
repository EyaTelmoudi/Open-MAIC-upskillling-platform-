"""Pydantic schemas for course assignments."""

from datetime import date, datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class AssignmentCreate(BaseModel):
    """Schema for creating a course assignment."""

    deadline: Optional[date] = None
    is_mandatory: bool = False


class AssignmentUpdate(BaseModel):
    """Schema for updating a course assignment."""

    deadline: Optional[date] = None
    is_mandatory: Optional[bool] = None


class AssignmentResponse(BaseModel):
    """Schema for assignment response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    course_id: UUID
    deadline: Optional[date] = None
    is_mandatory: bool
    assigned_at: datetime


class DepartmentAssignmentCreate(BaseModel):
    """Schema for assigning a course to a department."""

    department_id: str
    deadline: Optional[date] = None
    is_mandatory: bool = False


class DepartmentAssignmentResponse(BaseModel):
    """Response for department assignment."""

    assigned_count: int
    skipped_count: int
    errors: list[str]
