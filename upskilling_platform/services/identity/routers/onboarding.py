"""Onboarding router for user onboarding wizard flow."""

from datetime import date
from typing import Optional

from common.database import get_db
from common.enums import UserStatus
from common.messaging import RabbitMQClient
from common.models import User, UserGoal
from common.schemas import UserResponse
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from services.identity.middleware.rbac import require_min_role
from services.identity.schemas.onboarding import (
    OnboardingComplete,
    OnboardingGoalsStep,
    OnboardingProfileStep,
    OnboardingProgress,
    OnboardingRecommendationStep,
    OnboardingSkillsStep,
)

router = APIRouter(prefix="/onboarding", tags=["onboarding"])


def get_onboarding_progress(user: User) -> OnboardingProgress:
    """Get current onboarding progress from user record.

    Stores progress in user.skills JSON field with keys:
    - onboarding_step: current step (1-4)
    - profile_completed: step 1 done
    - skills_completed: step 2 done
    - goals_completed: step 3 done
    - recommendation_completed: step 4 done
    """
    skills_data = user.skills or {}
    if isinstance(skills_data, str):
        import json

        skills_data = json.loads(skills_data) if skills_data else {}

    return OnboardingProgress(
        current_step=skills_data.get("onboarding_step", 1),
        completed_steps=skills_data.get("completed_steps", []),
        profile_completed=skills_data.get("profile_completed", False),
        skills_completed=skills_data.get("skills_completed", False),
        goals_completed=skills_data.get("goals_completed", False),
        recommendation_completed=skills_data.get("recommendation_completed", False),
    )


def save_onboarding_progress(user: User, db: Session, step: int, step_key: str) -> None:
    """Save onboarding progress to user.skills JSON field."""
    import json

    skills_data = user.skills or {}
    if isinstance(skills_data, str):
        skills_data = json.loads(skills_data) if skills_data else {}

    # Update current step
    skills_data["onboarding_step"] = step + 1
    skills_data[step_key] = True

    # Track completed steps
    completed = skills_data.get("completed_steps", [])
    if step not in completed:
        completed.append(step)
        skills_data["completed_steps"] = completed

    user.skills = skills_data
    db.commit()
    db.refresh(user)


@router.get("/progress", response_model=OnboardingProgress)
def get_progress(
    current_user: dict = Depends(require_min_role("TeamIntern")),
    db: Session = Depends(get_db),
):
    """Get current onboarding progress.

    Args:
        current_user: Authenticated user from JWT.
        db: Database session.

    Returns:
        OnboardingProgress with current step and completed flags.
    """
    user = db.query(User).filter(User.id == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    return get_onboarding_progress(user)


@router.post("/step/profile", response_model=UserResponse)
def submit_profile_step(
    data: OnboardingProfileStep,
    current_user: dict = Depends(require_min_role("TeamIntern")),
    db: Session = Depends(get_db),
):
    """Step 1: Profile Setup - confirm name, department.

    Args:
        data: First name, last name, department.
        current_user: Authenticated user from JWT.
        db: Database session.

    Returns:
        Updated user response.
    """
    user = db.query(User).filter(User.id == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Update profile fields
    user.first_name = data.first_name
    user.last_name = data.last_name
    if data.department:
        user.department = data.department

    # Save progress
    save_onboarding_progress(user, db, step=1, step_key="profile_completed")

    return user


@router.post("/step/skills", response_model=UserResponse)
def submit_skills_step(
    data: OnboardingSkillsStep,
    current_user: dict = Depends(require_min_role("TeamIntern")),
    db: Session = Depends(get_db),
):
    """Step 2: Skills Selection - select skills of interest.

    Args:
        data: List of skill IDs or names.
        current_user: Authenticated user from JWT.
        db: Database session.

    Returns:
        Updated user response with skills.
    """
    user = db.query(User).filter(User.id == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Store skills
    user.skills = data.skills if isinstance(data.skills, list) else []

    # Save progress - store in skills JSON field alongside skills list
    import json

    skills_data = user.skills if isinstance(user.skills, dict) else {}
    if isinstance(skills_data, str):
        skills_data = json.loads(skills_data) if skills_data else {}

    skills_data["onboarding_step"] = 2
    skills_data["skills_completed"] = True
    completed = skills_data.get("completed_steps", [])
    if 2 not in completed:
        completed.append(2)
    skills_data["completed_steps"] = completed
    skills_data["selected_skills"] = data.skills

    user.skills = skills_data
    db.commit()
    db.refresh(user)

    return user


@router.post("/step/goals", response_model=UserResponse)
def submit_goals_step(
    data: OnboardingGoalsStep,
    current_user: dict = Depends(require_min_role("TeamIntern")),
    db: Session = Depends(get_db),
):
    """Step 3: Goal Setting - set learning goal with deadline.

    Args:
        data: Goal title, description, target date.
        current_user: Authenticated user from JWT.
        db: Database session.

    Returns:
        Updated user response.
    """
    user = db.query(User).filter(User.id == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Create user goal
    target_date_obj = None
    if data.target_date:
        try:
            target_date_obj = date.fromisoformat(data.target_date)
        except ValueError:
            pass

    goal = UserGoal(
        user_id=user.id,
        title=data.title,
        description=data.description,
        target_date=target_date_obj,
        status="active",
    )
    db.add(goal)

    # Save progress
    save_onboarding_progress(user, db, step=3, step_key="goals_completed")

    return user


@router.post("/step/recommendation", response_model=UserResponse)
def submit_recommendation_step(
    data: OnboardingRecommendationStep,
    current_user: dict = Depends(require_min_role("TeamIntern")),
    db: Session = Depends(get_db),
):
    """Step 4: First Course Recommendation - select recommended course.

    Args:
        data: Course ID to enroll in, or skip.
        current_user: Authenticated user from JWT.
        db: Database session.

    Returns:
        Updated user response.
    """
    user = db.query(User).filter(User.id == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Save progress
    save_onboarding_progress(user, db, step=4, step_key="recommendation_completed")

    # TODO: Enroll user in course if course_id provided
    # This would call the learning service to create enrollment

    return user


@router.post("/complete", response_model=OnboardingComplete)
def complete_onboarding(
    current_user: dict = Depends(require_min_role("TeamIntern")),
    db: Session = Depends(get_db),
):
    """Complete onboarding workflow.

    Marks user as onboarded=true, status=active.
    Publishes user.onboarding.completed event to RabbitMQ.

    Args:
        current_user: Authenticated user from JWT.
        db: Database session.

    Returns:
        OnboardingComplete with completion status.
    """
    user = db.query(User).filter(User.id == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Mark as onboarded and active
    user.onboarded = True
    user.status = UserStatus.active.value
    db.commit()
    db.refresh(user)

    # Publish onboarding completed event to RabbitMQ
    rabbitmq = None
    try:
        rabbitmq = RabbitMQClient()
        rabbitmq.publish(
            exchange="auth",
            routing_key="user.onboarding.completed",
            message={
                "event": "user.onboarding.completed",
                "userId": str(user.id),
                "email": user.email,
                "role": user.role,
                "department": user.department,
                "timestamp": user.updated_at.isoformat() if user.updated_at else "",
            },
        )
        rabbitmq.close()
    except Exception:
        # Log error but don't fail the request
        pass

    return OnboardingComplete(
        user_id=str(user.id),
        onboarded=True,
        status=user.status,
        message="Onboarding completed successfully",
    )


@router.get("/check", response_model=dict)
def check_onboarding_status(
    current_user: dict = Depends(require_min_role("TeamIntern")),
    db: Session = Depends(get_db),
):
    """Check if user needs to complete onboarding.

    Args:
        current_user: Authenticated user from JWT.
        db: Database session.

    Returns:
        Dict with needs_onboarding flag.
    """
    user = db.query(User).filter(User.id == current_user["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    needs_onboarding = (
        not user.onboarded or user.status == UserStatus.pending_invitation.value
    )

    return {
        "needs_onboarding": needs_onboarding,
        "onboarded": user.onboarded,
        "status": user.status,
    }
