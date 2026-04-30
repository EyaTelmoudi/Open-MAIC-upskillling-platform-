"""Content ingestion service for processing course materials."""

import os
import json
import logging
from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID, uuid4

from pydantic import BaseModel
from sqlalchemy.orm import Session

from common.models import Course, Module, Lesson
from common.storage import (
    get_minio_client,
    upload_file,
    download_file,
    list_files,
    get_presigned_url,
    build_tenant_path,
)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class ContentType(str, Enum):
    VIDEO = "video"
    PDF = "pdf"
    TEXT = "text"
    IMAGE = "image"
    SLIDE = "slide"
    FILE = "file"


class ContentStatus(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


class ContentMetadata(BaseModel):
    content_type: ContentType
    filename: str
    file_size: int
    mime_type: str
    course_id: Optional[UUID] = None
    module_id: Optional[UUID] = None
    lesson_id: Optional[UUID] = None


class ContentIngestionService:
    """Service for ingesting and managing course content in MinIO."""

    def __init__(self, db: Session):
        self.db = db
        self.minio_client = get_minio_client()

    BUCKET_MAP = {
        ContentType.VIDEO: "course-videos",
        ContentType.PDF: "course-pdfs",
        ContentType.SLIDE: "course-slides",
        ContentType.IMAGE: "course-images",
        ContentType.FILE: "course-files",
    }

    MIME_TYPE_MAP = {
        "video/mp4": ContentType.VIDEO,
        "video/webm": ContentType.VIDEO,
        "application/pdf": ContentType.PDF,
        "text/html": ContentType.TEXT,
        "text/markdown": ContentType.TEXT,
        "image/jpeg": ContentType.IMAGE,
        "image/png": ContentType.IMAGE,
        "image/gif": ContentType.IMAGE,
        "application/vnd.ms-powerpoint": ContentType.SLIDE,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation": ContentType.SLIDE,
        "text/plain": ContentType.FILE,
        "text/csv": ContentType.FILE,
        "application/msword": ContentType.FILE,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ContentType.FILE,
        "application/vnd.ms-excel": ContentType.FILE,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": ContentType.FILE,
        "application/zip": ContentType.FILE,
        "application/x-zip-compressed": ContentType.FILE,
    }

    def get_content_type(self, mime_type: str) -> ContentType:
        """Map MIME type to ContentType."""
        return self.MIME_TYPE_MAP.get(mime_type, ContentType.FILE)

    def process_upload(
        self,
        file_data: bytes,
        filename: str,
        mime_type: str,
        course_id: Optional[str] = None,
        module_id: Optional[str] = None,
        tenant_id: Optional[str] = None,
    ) -> dict:
        """Process uploaded content and store in MinIO with tenant-prefixed path.

        Args:
            file_data: File content as bytes
            filename: Original filename
            mime_type: MIME type of the file
            course_id: Optional course ID to associate with
            module_id: Optional module ID to associate with
            tenant_id: Optional tenant UUID for path prefix

        Returns:
            Dictionary with upload result metadata
        """
        content_type = self.get_content_type(mime_type)
        bucket_name = self.BUCKET_MAP.get(content_type, "course-images")

        file_id = str(uuid4())
        extension = filename.rsplit(".", 1)[-1] if "." in filename else ""

        if tenant_id:
            path_parts = ["courses"]
            if course_id:
                path_parts.append(course_id)
            path_parts.append(file_id)
            path_parts.append(filename)
            object_name = build_tenant_path(tenant_id, *path_parts)
        else:
            object_name = f"{file_id}/{filename}" if extension else f"{file_id}/{filename}"

        object_name = upload_file(
            bucket_name=bucket_name,
            object_name=object_name,
            file_data=file_data,
            content_type=mime_type,
            client=self.minio_client,
        )

        presigned_url = get_presigned_url(
            bucket_name=bucket_name,
            object_name=object_name,
            expires=3600 * 24 * 7,
            client=self.minio_client,
        )

        result = {
            "id": file_id,
            "object_name": object_name,
            "bucket": bucket_name,
            "content_type": content_type.value,
            "filename": filename,
            "file_size": len(file_data),
            "mime_type": mime_type,
            "url": presigned_url,
            "course_id": course_id,
            "module_id": module_id,
            "tenant_id": tenant_id,
            "status": "completed",
            "created_at": datetime.utcnow().isoformat(),
        }

        logger.info(f"Content uploaded: {object_name} to {bucket_name}")
        return result

    def list_content(self, bucket_name: str, prefix: str = "") -> list[dict]:
        """List content in a bucket.

        Args:
            bucket_name: Name of the bucket to list
            prefix: Optional prefix filter

        Returns:
            List of content metadata dictionaries
        """
        files = list_files(bucket_name, prefix, self.minio_client)
        result = []

        for object_name in files:
            try:
                stat = self.minio_client.stat_object(bucket_name, object_name)
                result.append(
                    {
                        "object_name": object_name,
                        "bucket": bucket_name,
                        "size": stat.size,
                        "content_type": stat.content_type,
                        "last_modified": stat.last_modified.isoformat()
                        if stat.last_modified
                        else None,
                    }
                )
            except Exception as e:
                logger.warning(f"Could not stat {object_name}: {e}")

        return result

    def delete_content(self, bucket_name: str, object_name: str) -> bool:
        """Delete content from MinIO.

        Args:
            bucket_name: Bucket containing the object
            object_name: Object key to delete

        Returns:
            True if successful
        """
        from common.storage import delete_file

        delete_file(bucket_name, object_name, self.minio_client)
        logger.info(f"Content deleted: {object_name}")
        return True

    def get_content_url(self, bucket_name: str, object_name: str) -> str:
        """Get a presigned URL for content.

        Args:
            bucket_name: Bucket containing the object
            object_name: Object key

        Returns:
            Presigned URL
        """
        return get_presigned_url(
            bucket_name,
            object_name,
            client=self.minio_client,
        )

    def get_bucket_stats(self) -> dict:
        """Get statistics for all content buckets.

        Returns:
            Dictionary with bucket statistics
        """
        stats = {}
        for content_type, bucket_name in self.BUCKET_MAP.items():
            try:
                files = list_files(bucket_name, "", self.minio_client)
                total_size = 0
                for obj in files:
                    try:
                        stat = self.minio_client.stat_object(bucket_name, obj)
                        total_size += stat.size
                    except:
                        pass
                stats[content_type.value] = {
                    "bucket": bucket_name,
                    "file_count": len(files),
                    "total_size_bytes": total_size,
                }
            except Exception as e:
                logger.warning(f"Could not get stats for {bucket_name}: {e}")
                stats[content_type.value] = {
                    "bucket": bucket_name,
                    "file_count": 0,
                    "total_size_bytes": 0,
                    "error": str(e),
                }
        return stats
