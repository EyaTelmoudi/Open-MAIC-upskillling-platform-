"""Assessment and Question schemas for the Learning Service."""

from datetime import datetime
from uuid import UUID
from typing import Optional
from pydantic import BaseModel, Field


class QuestionCreate(BaseModel):
    """Schema for creating a question."""

    text: str = Field(..., min_length=1, description="Question text")
    type: str = Field(..., description="Question type: multiple_choice or true_false")
    options: list[str] = Field(..., description="Answer options")
    correct_answer: str = Field(..., description="Correct answer option")
    points: int = Field(default=1, ge=1, description="Points for this question")
    order: int = Field(..., ge=0, description="Question order within assessment")


class QuestionPublicResponse(BaseModel):
    """Schema for question response served to learners (hides correct_answer).

    Used for GET endpoints that fetch questions for students to answer.
    Does NOT expose correct_answer to prevent answer leakage.
    """

    id: UUID
    assessment_id: UUID
    text: str
    type: str
    options: list[str]
    points: int
    order: int

    class Config:
        from_attributes = True


# Deprecated: Use QuestionPublicResponse for learners, QuestionWithAnswerResponse for results
QuestionResponse = QuestionPublicResponse


class QuestionWithAnswerResponse(BaseModel):
    """Schema for question with correct answer (for assessment results/review).

    Used only in submission result payloads (POST /submit, GET /results/{attempt_id}).
    Includes correct_answer and is_correct for each question.
    """

    id: UUID
    assessment_id: UUID
    text: str
    type: str
    options: list[str]
    correct_answer: str
    points: int
    order: int
    user_answer: Optional[str] = None
    is_correct: Optional[bool] = None

    class Config:
        from_attributes = True


class QuestionAttemptReviewResponse(BaseModel):
    """Learner-safe question review payload returned after submission."""

    id: UUID
    assessment_id: UUID
    text: str
    type: str
    options: list[str]
    points: int
    order: int
    user_answer: Optional[str] = None
    is_correct: Optional[bool] = None

    class Config:
        from_attributes = True


# Legacy schema kept for backward compatibility - prefer QuestionWithAnswerResponse
class QuestionWithAnswer(BaseModel):
    """Schema for question with correct answer (for results) - LEGACY, use QuestionWithAnswerResponse."""

    id: UUID
    assessment_id: UUID
    text: str
    type: str
    options: list[str]
    correct_answer: str
    points: int
    order: int
    user_answer: Optional[str] = None
    is_correct: Optional[bool] = None

    class Config:
        from_attributes = True


class QuestionUpdate(BaseModel):
    """Schema for updating a question."""

    text: Optional[str] = Field(None, min_length=1)
    type: Optional[str] = None
    options: Optional[list[str]] = None
    correct_answer: Optional[str] = None
    points: Optional[int] = Field(None, ge=1)
    order: Optional[int] = Field(None, ge=0)


class AssessmentCreate(BaseModel):
    """Schema for creating an assessment."""

    module_id: UUID
    title: str = Field(..., min_length=1, description="Assessment title")
    passing_score: int = Field(
        ..., ge=0, le=100, description="Passing score percentage"
    )
    time_limit: Optional[int] = Field(None, ge=1, description="Time limit in minutes")


class AssessmentResponse(BaseModel):
    """Schema for assessment response."""

    id: UUID
    module_id: UUID
    title: str
    passing_score: int
    time_limit: Optional[int]
    created_at: datetime

    class Config:
        from_attributes = True


class AssessmentUpdate(BaseModel):
    """Schema for updating an assessment."""

    title: Optional[str] = Field(None, min_length=1)
    passing_score: Optional[int] = Field(None, ge=0, le=100)
    time_limit: Optional[int] = Field(None, ge=1)


class AssessmentWithQuestions(AssessmentResponse):
    """Schema for assessment with questions."""

    questions: list[QuestionPublicResponse] = []


class AnswerSubmission(BaseModel):
    """Schema for submitting answers to an assessment."""

    answers: dict[str, str] = Field(
        ..., description="Map of question_id to selected answer"
    )


class AttemptResponse(BaseModel):
    """Schema for assessment attempt response."""

    id: UUID
    user_id: UUID
    assessment_id: UUID
    answers: dict
    score: Optional[float]
    passed: Optional[bool]
    started_at: datetime
    completed_at: Optional[datetime]

    class Config:
        from_attributes = True


class AssessmentResultResponse(BaseModel):
    """Schema for assessment result with question details."""

    id: UUID
    assessment_id: UUID
    title: str
    score: Optional[float]
    passed: Optional[bool]
    total_points: int
    earned_points: float
    started_at: datetime
    completed_at: Optional[datetime]
    questions: list[QuestionAttemptReviewResponse] = []

    class Config:
        from_attributes = True
