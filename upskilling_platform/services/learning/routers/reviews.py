"""Review router for course ratings and reviews."""

from datetime import datetime
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session

from common.database import get_db
from common.auth import decode_token
from common.models import Course, CourseReview, User

from services.learning.schemas.course import (
    ReviewCreate,
    ReviewUpdate,
    ReviewResponse,
    CourseReviewStats,
)

router = APIRouter(prefix="/courses", tags=["reviews"])

security = HTTPBearer()


def get_current_user_from_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Extract and validate the current user from JWT token."""
    token = credentials.credentials
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def _get_user_from_payload(payload: dict, db: Session) -> User:
    """Get User object from JWT payload."""
    from uuid import UUID
    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing user ID")
    user = db.query(User).filter(User.id == UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


def get_course_or_404(db: Session, course_id: UUID) -> Course:
    """Get course or raise 404."""
    course = db.query(Course).filter(Course.id == course_id).first()
    if not course:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Course not found",
        )
    return course


@router.post(
    "/{course_id}/reviews",
    response_model=ReviewResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_review(
    course_id: UUID,
    review_data: ReviewCreate,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Create a review for a course. Tenant-scoped."""
    user_info = _get_user_from_payload(current_user, db)
    course = get_course_or_404(db, course_id)

    if user_info.role != "SuperAdmin" and course.tenant_id != user_info.tenant_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: course belongs to another tenant"
        )

    user_id = current_user.get("sub") or current_user.get("id")

    existing_review = (
        db.query(CourseReview)
        .filter(
            CourseReview.course_id == course_id,
            CourseReview.user_id == user_id,
        )
        .first()
    )

    if existing_review:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already reviewed this course. Use PUT to update.",
        )

    review = CourseReview(
        course_id=course_id,
        user_id=user_id,
        rating=review_data.rating,
        review_text=review_data.review_text,
    )
    db.add(review)
    db.commit()
    db.refresh(review)

    update_course_rating(db, course_id)

    user = db.query(User).filter(User.id == user_id).first()
    user_name = f"{user.first_name} {user.last_name}".strip() if user else None
    user_avatar = user.avatar if user else None
    return ReviewResponse(
        id=review.id,
        course_id=review.course_id,
        user_id=review.user_id,
        user_name=user_name,
        user_avatar=user_avatar,
        rating=review.rating,
        review_text=review.review_text,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


@router.put(
    "/{course_id}/reviews",
    response_model=ReviewResponse,
)
def update_review(
    course_id: UUID,
    review_data: ReviewUpdate,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Update user's review for a course."""
    course = get_course_or_404(db, course_id)
    user_id = current_user.get("sub") or current_user.get("id")

    review = (
        db.query(CourseReview)
        .filter(
            CourseReview.course_id == course_id,
            CourseReview.user_id == user_id,
        )
        .first()
    )

    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="You have not reviewed this course yet.",
        )

    if review_data.rating is not None:
        review.rating = review_data.rating
    if review_data.review_text is not None:
        review.review_text = review_data.review_text
    review.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(review)

    update_course_rating(db, course_id)

    user = db.query(User).filter(User.id == user_id).first()
    user_name = f"{user.first_name} {user.last_name}".strip() if user else None
    user_avatar = user.avatar if user else None
    return ReviewResponse(
        id=review.id,
        course_id=review.course_id,
        user_id=review.user_id,
        user_name=user_name,
        user_avatar=user_avatar,
        rating=review.rating,
        review_text=review.review_text,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


@router.get(
    "/{course_id}/reviews",
    response_model=list[ReviewResponse],
)
def get_course_reviews(
    course_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    db: Session = Depends(get_db),
):
    """Get all reviews for a course."""
    course = get_course_or_404(db, course_id)

    offset = (page - 1) * page_size
    reviews = (
        db.query(CourseReview)
        .filter(CourseReview.course_id == course_id)
        .order_by(CourseReview.created_at.desc())
        .offset(offset)
        .limit(page_size)
        .all()
    )

    result = []
    for review in reviews:
        user = db.query(User).filter(User.id == review.user_id).first()
        user_name = f"{user.first_name} {user.last_name}".strip() if user else None
        result.append(
            ReviewResponse(
                id=review.id,
                course_id=review.course_id,
                user_id=review.user_id,
                user_name=user_name,
                user_avatar=user.avatar if user else None,
                rating=review.rating,
                review_text=review.review_text,
                created_at=review.created_at,
                updated_at=review.updated_at,
            )
        )

    return result


@router.get(
    "/{course_id}/reviews/stats",
    response_model=CourseReviewStats,
)
def get_course_review_stats(
    course_id: UUID,
    db: Session = Depends(get_db),
):
    """Get review statistics for a course."""
    course = get_course_or_404(db, course_id)

    stats = (
        db.query(
            func.avg(CourseReview.rating).label("average"),
            func.count(CourseReview.id).label("total"),
        )
        .filter(CourseReview.course_id == course_id)
        .first()
    )

    if not stats or stats.total == 0:
        return CourseReviewStats(
            average_rating=0.0,
            total_reviews=0,
            rating_distribution={1: 0, 2: 0, 3: 0, 4: 0, 5: 0},
        )

    distribution = {}
    for rating in range(1, 6):
        count = (
            db.query(func.count(CourseReview.id))
            .filter(
                CourseReview.course_id == course_id,
                CourseReview.rating == rating,
            )
            .scalar()
        )
        distribution[rating] = count or 0

    return CourseReviewStats(
        average_rating=round(float(stats.average), 1) if stats.average else 0.0,
        total_reviews=stats.total or 0,
        rating_distribution=distribution,
    )


@router.get(
    "/{course_id}/my-review",
    response_model=Optional[ReviewResponse],
)
def get_my_review(
    course_id: UUID,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Get current user's review for a course."""
    course = get_course_or_404(db, course_id)
    user_id = current_user.get("sub") or current_user.get("id")

    review = (
        db.query(CourseReview)
        .filter(
            CourseReview.course_id == course_id,
            CourseReview.user_id == user_id,
        )
        .first()
    )

    if not review:
        return None

    user = db.query(User).filter(User.id == user_id).first()
    user_name = f"{user.first_name} {user.last_name}".strip() if user else None
    return ReviewResponse(
        id=review.id,
        course_id=review.course_id,
        user_id=review.user_id,
        user_name=user_name,
        user_avatar=user.avatar if user else None,
        rating=review.rating,
        review_text=review.review_text,
        created_at=review.created_at,
        updated_at=review.updated_at,
    )


def update_course_rating(db: Session, course_id: UUID):
    """Update course's average rating based on reviews."""
    stats = (
        db.query(
            func.avg(CourseReview.rating).label("average"),
        )
        .filter(CourseReview.course_id == course_id)
        .first()
    )

    course = db.query(Course).filter(Course.id == course_id).first()
    if course:
        course.rating = round(float(stats.average), 1) if stats.average else None
        db.commit()
