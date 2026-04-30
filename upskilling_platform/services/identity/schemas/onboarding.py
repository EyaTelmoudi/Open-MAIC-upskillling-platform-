"""Onboarding schemas for user onboarding flow."""

from typing import Optional

from pydantic import BaseModel


class OnboardingProfileStep(BaseModel):
    """Step 1: Profile Setup - confirm name, department."""

    first_name: str
    last_name: str
    department: Optional[str] = None


class OnboardingSkillsStep(BaseModel):
    """Step 2: Skills Selection - select skills of interest."""

    skills: list[str] = []


class OnboardingGoalsStep(BaseModel):
    """Step 3: Goal Setting - set learning goal with deadline."""

    title: str
    description: Optional[str] = None
    target_date: Optional[str] = None  # ISO date string


class OnboardingRecommendationStep(BaseModel):
    """Step 4: First Course Recommendation - select recommended course."""

    course_id: Optional[str] = None
    skip: bool = False  # If true, skip course selection


class OnboardingProgress(BaseModel):
    """Response for onboarding progress."""

    current_step: int  # 1-4
    completed_steps: list[int]
    profile_completed: bool
    skills_completed: bool
    goals_completed: bool
    recommendation_completed: bool


class OnboardingComplete(BaseModel):
    """Response when onboarding is completed."""

    user_id: str
    onboarded: bool
    status: str
    message: str
