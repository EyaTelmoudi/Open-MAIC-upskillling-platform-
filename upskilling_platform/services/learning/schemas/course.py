"""Pydantic schemas for the Learning Platform service."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


# --- Course Schemas ---


class CourseCreate(BaseModel):
    """Schema for creating a course."""

    title: str
    description: Optional[str] = None
    thumbnail: Optional[str] = None
    category: str
    difficulty: str
    duration: int
    xp_reward: int = 100
    is_published: bool = False


class CourseUpdate(BaseModel):
    """Schema for updating a course."""

    title: Optional[str] = None
    description: Optional[str] = None
    thumbnail: Optional[str] = None
    category: Optional[str] = None
    difficulty: Optional[str] = None
    duration: Optional[int] = None
    xp_reward: Optional[int] = None
    is_published: Optional[bool] = None


class CourseResponse(BaseModel):
    """Schema for course response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    title: str
    description: Optional[str] = None
    thumbnail: Optional[str] = None
    category: str
    difficulty: str
    duration: int
    xp_reward: int
    rating: Optional[float] = None
    is_published: bool
    memory_retention_status: str = "pending"
    memory_retention_error: Optional[str] = None
    memory_retention_updated_at: Optional[datetime] = None
    author_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime


class CourseListResponse(BaseModel):
    """Paginated course list."""

    items: list[CourseResponse]
    total: int
    page: int
    page_size: int


# --- Module Schemas ---


class ModuleCreate(BaseModel):
    """Schema for creating a module."""

    title: str
    description: Optional[str] = None
    order: int


class ModuleUpdate(BaseModel):
    """Schema for updating a module."""

    title: Optional[str] = None
    description: Optional[str] = None
    order: Optional[int] = None


class ModuleResponse(BaseModel):
    """Schema for module response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    course_id: UUID
    title: str
    description: Optional[str] = None
    order: int
    created_at: datetime


# --- Lesson Schemas ---


class LessonCreate(BaseModel):
    """Schema for creating a lesson."""

    title: str
    content: str
    content_type: str
    duration: int
    order: int


class LessonUpdate(BaseModel):
    """Schema for updating a lesson."""

    title: Optional[str] = None
    content: Optional[str] = None
    content_type: Optional[str] = None
    duration: Optional[int] = None
    order: Optional[int] = None


class LessonResponse(BaseModel):
    """Schema for lesson response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    module_id: UUID
    title: str
    content: str
    content_type: str
    duration: int
    order: int
    created_at: datetime


# --- Enrollment Schemas ---


class EnrollmentCreate(BaseModel):
    """Schema for enrolling in a course."""

    course_id: UUID


class EnrollmentResponse(BaseModel):
    """Schema for enrollment response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    course_id: UUID
    enrolled_at: datetime
    completed_at: Optional[datetime] = None
    status: str


# --- Progress Schemas ---


class ProgressUpdate(BaseModel):
    """Schema for updating lesson progress."""

    status: str
    time_spent: int = 0


class ProgressResponse(BaseModel):
    """Schema for progress response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    lesson_id: UUID
    status: str
    completed_at: Optional[datetime] = None
    time_spent: int


class LessonCompleteResponse(BaseModel):
    """Schema for lesson completion response."""

    message: str
    lesson_id: UUID
    status: str
    xp_earned: int


# --- Review Schemas ---


class ReviewCreate(BaseModel):
    """Schema for creating a review."""

    rating: int = Field(..., ge=1, le=5, description="Rating from 1 to 5")
    review_text: Optional[str] = None


class ReviewUpdate(BaseModel):
    """Schema for updating a review."""

    rating: Optional[int] = Field(None, ge=1, le=5)
    review_text: Optional[str] = None


class ReviewResponse(BaseModel):
    """Schema for review response."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    course_id: UUID
    user_id: UUID
    user_name: Optional[str] = None
    user_avatar: Optional[str] = None
    rating: int
    review_text: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class CourseReviewStats(BaseModel):
    """Schema for course review statistics."""

    average_rating: float
    total_reviews: int
    rating_distribution: dict[int, int] = {}
