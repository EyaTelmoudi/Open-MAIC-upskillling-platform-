"""Content upload and management API endpoints."""

import logging
from io import BytesIO
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile, status
from fastapi.responses import JSONResponse, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from common.database import get_db
from common.auth import decode_token
from common.storage import download_file, get_minio_client

from ..services.content.ingestion import ContentIngestionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/content", tags=["content"])
security = HTTPBearer()


ALLOWED_VIDEO_TYPES = {"video/mp4", "video/webm", "video/ogg"}
ALLOWED_DOCUMENT_TYPES = {"application/pdf"}
ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/gif", "image/webp"}
ALLOWED_SLIDE_TYPES = {
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}
ALLOWED_FILE_TYPES = {
    "text/plain",
    "text/csv",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/zip",
    "application/x-zip-compressed",
}

ALLOWED_TYPES = (
    ALLOWED_VIDEO_TYPES
    | ALLOWED_DOCUMENT_TYPES
    | ALLOWED_IMAGE_TYPES
    | ALLOWED_SLIDE_TYPES
    | ALLOWED_FILE_TYPES
)

MAX_FILE_SIZE = 500 * 1024 * 1024  # 500MB


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
) -> dict:
    """Extract and validate the current user from JWT token."""
    token = credentials.credentials
    payload = decode_token(token)
    if payload is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return payload


def _get_user_from_payload(payload: dict, db: Session):
    """Get User object from JWT payload."""
    from common.models import User

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing user ID")

    user = db.query(User).filter(User.id == UUID(user_id)).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/upload")
async def upload_content(
    file: UploadFile = File(...),
    course_id: Optional[str] = Form(None),
    module_id: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Upload content file to MinIO storage with tenant-prefixed path.

    Args:
        file: The file to upload
        course_id: Optional course ID to associate with the file
        module_id: Optional module ID to associate with the file

    Returns:
        JSON with upload result including MinIO URL
    """
    user = _get_user_from_payload(current_user, db)
    tenant_id = str(user.tenant_id) if user.tenant_id else None

    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File type {file.content_type} not allowed. Allowed: {ALLOWED_TYPES}",
        )

    contents = await file.read()

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File too large. Max size: {MAX_FILE_SIZE / (1024 * 1024)}MB",
        )

    if len(contents) == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty file",
        )

    try:
        service = ContentIngestionService(db)

        result = service.process_upload(
            file_data=contents,
            filename=file.filename,
            mime_type=file.content_type,
            course_id=course_id,
            module_id=module_id,
            tenant_id=tenant_id,
        )

        return JSONResponse(
            status_code=status.HTTP_201_CREATED,
            content=result,
        )
    except Exception as e:
        logger.error(f"Upload failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Upload failed: {str(e)}",
        )


@router.get("/buckets/stats")
async def get_bucket_stats(
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Get statistics for all content buckets.

    Returns:
        JSON with bucket statistics
    """
    try:
        service = ContentIngestionService(db)
        stats = service.get_bucket_stats()
        return JSONResponse(content=stats)
    except Exception as e:
        logger.error(f"Failed to get bucket stats: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get stats: {str(e)}",
        )


@router.get("/list/{bucket_name}")
async def list_bucket_content(
    bucket_name: str,
    prefix: str = "",
    db: Session = Depends(get_db),
) -> JSONResponse:
    """List content in a specific bucket.

    Args:
        bucket_name: Name of the bucket to list
        prefix: Optional prefix filter

    Returns:
        JSON with list of content
    """
    valid_buckets = [
        "course-videos",
        "course-pdfs",
        "course-slides",
        "course-images",
        "course-files",
        "quiz-media",
    ]

    if bucket_name not in valid_buckets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid bucket. Valid: {valid_buckets}",
        )

    try:
        service = ContentIngestionService(db)
        content = service.list_content(bucket_name, prefix)
        return JSONResponse(content={"bucket": bucket_name, "items": content})
    except Exception as e:
        logger.error(f"Failed to list content: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list content: {str(e)}",
        )


@router.get("/url/{bucket_name}/{object_name:path}")
async def get_content_url(
    bucket_name: str,
    object_name: str,
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Get presigned URL for content.

    Args:
        bucket_name: Bucket containing the object
        object_name: Object key

    Returns:
        JSON with presigned URL
    """
    valid_buckets = [
        "course-videos",
        "course-pdfs",
        "course-slides",
        "course-images",
        "course-files",
        "quiz-media",
    ]

    if bucket_name not in valid_buckets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid bucket. Valid: {valid_buckets}",
        )

    try:
        service = ContentIngestionService(db)
        url = service.get_content_url(bucket_name, object_name)
        return JSONResponse(content={"url": url})
    except Exception as e:
        logger.error(f"Failed to get URL: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get URL: {str(e)}",
        )


@router.get("/media/{bucket_name}/{object_name:path}")
async def proxy_content_media(
    request: Request,
    bucket_name: str,
    object_name: str,
) -> Response:
    """Serve media files from MinIO through the learning service.

    Browsers cannot attach bearer tokens to `<video src>` requests from local
    storage auth, so this stable proxy keeps course videos playable.
    """
    valid_buckets = [
        "course-videos",
        "course-pdfs",
        "course-slides",
        "course-images",
        "course-files",
        "quiz-media",
    ]

    if bucket_name not in valid_buckets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid bucket. Valid: {valid_buckets}",
        )

    try:
        client = get_minio_client()
        stat = client.stat_object(bucket_name, object_name)
        file_data = download_file(bucket_name, object_name, client)
        media_type = stat.content_type or "application/octet-stream"
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Length": str(len(file_data)),
        }

        range_header = request.headers.get("range")
        if not range_header:
            return Response(content=file_data, media_type=media_type, headers=headers)

        units, _, range_value = range_header.partition("=")
        if units != "bytes" or not range_value:
            raise HTTPException(status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE)

        start_text, _, end_text = range_value.partition("-")
        file_size = len(file_data)

        if start_text == "":
            suffix_length = int(end_text)
            start = max(file_size - suffix_length, 0)
            end = file_size - 1
        else:
            start = int(start_text)
            end = int(end_text) if end_text else file_size - 1

        if start < 0 or end >= file_size or start > end:
            raise HTTPException(status_code=status.HTTP_416_REQUESTED_RANGE_NOT_SATISFIABLE)

        chunk = file_data[start : end + 1]
        headers.update(
            {
                "Content-Range": f"bytes {start}-{end}/{file_size}",
                "Content-Length": str(len(chunk)),
            }
        )
        return Response(
            content=chunk,
            media_type=media_type,
            status_code=status.HTTP_206_PARTIAL_CONTENT,
            headers=headers,
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to proxy media {bucket_name}/{object_name}: {e}")
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Media file not found",
        )


@router.delete("/{bucket_name}/{object_name:path}")
async def delete_content(
    bucket_name: str,
    object_name: str,
    db: Session = Depends(get_db),
) -> JSONResponse:
    """Delete content from MinIO.

    Args:
        bucket_name: Bucket containing the object
        object_name: Object key to delete

    Returns:
        JSON with deletion result
    """
    valid_buckets = [
        "course-videos",
        "course-pdfs",
        "course-slides",
        "course-images",
        "course-files",
        "quiz-media",
    ]

    if bucket_name not in valid_buckets:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid bucket. Valid: {valid_buckets}",
        )

    try:
        service = ContentIngestionService(db)
        service.delete_content(bucket_name, object_name)
        return JSONResponse(
            content={"message": "Content deleted", "object_name": object_name}
        )
    except Exception as e:
        logger.error(f"Failed to delete content: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete content: {str(e)}",
        )
