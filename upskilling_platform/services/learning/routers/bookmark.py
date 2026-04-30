"""Bookmark router for course and lesson bookmarking."""

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from common.database import get_db
from common.auth import decode_token
from common.models import Bookmark, Course, Lesson

from services.learning.schemas.bookmark import BookmarkCreate, BookmarkResponse

router = APIRouter(prefix="/bookmarks", tags=["bookmarks"])

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


@router.post("", response_model=BookmarkResponse, status_code=status.HTTP_201_CREATED)
def create_bookmark(
    bookmark_data: BookmarkCreate,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Create a bookmark for a course or lesson."""
    user_id = current_user.get("sub") or current_user.get("id")

    if not bookmark_data.course_id and not bookmark_data.lesson_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Either course_id or lesson_id must be provided",
        )

    if bookmark_data.course_id:
        course = db.query(Course).filter(Course.id == bookmark_data.course_id).first()
        if not course:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Course not found",
            )

    if bookmark_data.lesson_id:
        lesson = db.query(Lesson).filter(Lesson.id == bookmark_data.lesson_id).first()
        if not lesson:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lesson not found",
            )

    existing = (
        db.query(Bookmark)
        .filter(
            Bookmark.user_id == user_id,
            Bookmark.course_id == bookmark_data.course_id,
            Bookmark.lesson_id == bookmark_data.lesson_id,
        )
        .first()
    )

    if existing:
        return BookmarkResponse(
            id=existing.id,
            user_id=existing.user_id,
            course_id=existing.course_id,
            lesson_id=existing.lesson_id,
            created_at=existing.created_at,
        )

    bookmark = Bookmark(
        user_id=user_id,
        course_id=bookmark_data.course_id,
        lesson_id=bookmark_data.lesson_id,
    )
    db.add(bookmark)
    db.commit()
    db.refresh(bookmark)

    return BookmarkResponse(
        id=bookmark.id,
        user_id=bookmark.user_id,
        course_id=bookmark.course_id,
        lesson_id=bookmark.lesson_id,
        created_at=bookmark.created_at,
    )


@router.get("", response_model=list[BookmarkResponse])
def get_bookmarks(
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Get all bookmarks for the current user."""
    user_id = current_user.get("sub") or current_user.get("id")

    bookmarks = db.query(Bookmark).filter(Bookmark.user_id == user_id).all()

    return [
        BookmarkResponse(
            id=b.id,
            user_id=b.user_id,
            course_id=b.course_id,
            lesson_id=b.lesson_id,
            created_at=b.created_at,
        )
        for b in bookmarks
    ]


@router.get("/courses", response_model=list[BookmarkResponse])
def get_course_bookmarks(
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Get bookmarked courses for the current user."""
    user_id = current_user.get("sub") or current_user.get("id")

    bookmarks = (
        db.query(Bookmark)
        .filter(
            Bookmark.user_id == user_id,
            Bookmark.course_id.isnot(None),
        )
        .all()
    )

    return [
        BookmarkResponse(
            id=b.id,
            user_id=b.user_id,
            course_id=b.course_id,
            lesson_id=b.lesson_id,
            created_at=b.created_at,
        )
        for b in bookmarks
    ]


@router.get("/lessons", response_model=list[BookmarkResponse])
def get_lesson_bookmarks(
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Get bookmarked lessons for the current user."""
    user_id = current_user.get("sub") or current_user.get("id")

    bookmarks = (
        db.query(Bookmark)
        .filter(
            Bookmark.user_id == user_id,
            Bookmark.lesson_id.isnot(None),
        )
        .all()
    )

    return [
        BookmarkResponse(
            id=b.id,
            user_id=b.user_id,
            course_id=b.course_id,
            lesson_id=b.lesson_id,
            created_at=b.created_at,
        )
        for b in bookmarks
    ]


@router.delete("/{bookmark_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bookmark(
    bookmark_id: UUID,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Delete a bookmark."""
    user_id = current_user.get("sub") or current_user.get("id")

    bookmark = (
        db.query(Bookmark)
        .filter(
            Bookmark.id == bookmark_id,
            Bookmark.user_id == user_id,
        )
        .first()
    )

    if not bookmark:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Bookmark not found",
        )

    db.delete(bookmark)
    db.commit()

    return None


@router.get("/check/course/{course_id}", response_model=bool)
def check_course_bookmarked(
    course_id: UUID,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Check if a course is bookmarked."""
    user_id = current_user.get("sub") or current_user.get("id")

    bookmark = (
        db.query(Bookmark)
        .filter(
            Bookmark.user_id == user_id,
            Bookmark.course_id == course_id,
        )
        .first()
    )

    return bookmark is not None


@router.get("/check/lesson/{lesson_id}", response_model=bool)
def check_lesson_bookmarked(
    lesson_id: UUID,
    current_user: dict = Depends(get_current_user_from_token),
    db: Session = Depends(get_db),
):
    """Check if a lesson is bookmarked."""
    user_id = current_user.get("sub") or current_user.get("id")

    bookmark = (
        db.query(Bookmark)
        .filter(
            Bookmark.user_id == user_id,
            Bookmark.lesson_id == lesson_id,
        )
        .first()
    )

    return bookmark is not None
