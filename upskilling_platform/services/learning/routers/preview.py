"""Preview router for course preview mode."""

import secrets
from datetime import datetime, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from common.database import get_db
from common.auth import decode_token
from common.models import Course, CoursePreviewToken, User

from services.learning.schemas.preview import (
    PreviewTokenGenerated,
    PreviewAccessResponse,
)

router = APIRouter(prefix="/courses", tags=["preview"])

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
    "/{course_id}/preview-token",
    response_model=PreviewTokenGenerated,
    status_code=status.HTTP_201_CREATED,
)
def generate_preview_token(
    course_id: UUID,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Generate a preview token for a course (any authenticated user)."""
    course = get_course_or_404(db, course_id)

    existing_token = (
        db.query(CoursePreviewToken)
        .filter(
            CoursePreviewToken.course_id == course_id,
            CoursePreviewToken.is_active == True,
            CoursePreviewToken.expires_at > datetime.utcnow(),
        )
        .first()
    )

    if existing_token:
        return PreviewTokenGenerated(
            token=existing_token.token,
            expires_at=existing_token.expires_at,
            preview_url=f"/courses/{course_id}?token={existing_token.token}",
        )

    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + timedelta(hours=24)

    preview_token = CoursePreviewToken(
        course_id=course_id,
        token=token,
        created_by_id=current_user.get("sub") or current_user.get("id"),
        expires_at=expires_at,
        is_active=True,
    )
    db.add(preview_token)
    db.commit()
    db.refresh(preview_token)

    return PreviewTokenGenerated(
        token=preview_token.token,
        expires_at=preview_token.expires_at,
        preview_url=f"/courses/{course_id}?token={preview_token.token}",
    )


@router.get(
    "/{course_id}/preview",
    response_model=PreviewAccessResponse,
)
def validate_preview_token(
    course_id: UUID,
    token: str = Query(..., description="Preview token"),
    db: Session = Depends(get_db),
):
    """Validate a preview token and allow access to the course."""
    course = get_course_or_404(db, course_id)

    preview_token = (
        db.query(CoursePreviewToken)
        .filter(
            CoursePreviewToken.course_id == course_id,
            CoursePreviewToken.token == token,
            CoursePreviewToken.is_active == True,
        )
        .first()
    )

    if not preview_token:
        return PreviewAccessResponse(
            valid=False,
            message="Invalid preview token",
        )

    if preview_token.expires_at < datetime.utcnow():
        return PreviewAccessResponse(
            valid=False,
            message="Preview token has expired",
        )

    return PreviewAccessResponse(
        valid=True,
        course_id=course_id,
        course_title=course.title,
        expires_at=preview_token.expires_at,
    )


@router.delete(
    "/{course_id}/preview-token",
    status_code=status.HTTP_204_NO_CONTENT,
)
def revoke_preview_token(
    course_id: UUID,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Revoke all preview tokens for a course (any user who created a token)."""
    course = get_course_or_404(db, course_id)

    db.query(CoursePreviewToken).filter(
        CoursePreviewToken.course_id == course_id,
        CoursePreviewToken.is_active == True,
    ).update({"is_active": False})
    db.commit()

    return None
