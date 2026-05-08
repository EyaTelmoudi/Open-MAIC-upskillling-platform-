"""MinIO S3-compatible storage client for the Upskilling Platform."""

import os
from datetime import timedelta
from io import BytesIO
from typing import Optional

from minio import Minio
from minio.error import S3Error

MINIO_ENDPOINT = os.getenv("MINIO_ENDPOINT", "localhost:9000")
MINIO_ACCESS_KEY = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
MINIO_SECRET_KEY = os.getenv("MINIO_SECRET_KEY", "minioadmin123")
MINIO_SECURE = os.getenv("MINIO_SECURE", "false").lower() == "true"

DEFAULT_BUCKETS = [
    "course-videos",
    "course-pdfs",
    "course-slides",
    "course-images",
    "course-files",
    "quiz-media",
    "user-avatars",
]


def get_minio_client() -> Minio:
    """Create and return a MinIO client instance.

    Returns:
        Minio: Configured MinIO client.
    """
    return Minio(
        endpoint=MINIO_ENDPOINT,
        access_key=MINIO_ACCESS_KEY,
        secret_key=MINIO_SECRET_KEY,
        secure=MINIO_SECURE,
    )


def ensure_buckets(
    client: Optional[Minio] = None,
    buckets: Optional[list[str]] = None,
) -> list[str]:
    """Create default buckets if they don't exist.

    Args:
        client: MinIO client instance. Creates one if None.
        buckets: List of bucket names. Uses DEFAULT_BUCKETS if None.

    Returns:
        List of bucket names that were created (not already existing).
    """
    if client is None:
        client = get_minio_client()
    if buckets is None:
        buckets = DEFAULT_BUCKETS

    created = []
    for bucket_name in buckets:
        if not client.bucket_exists(bucket_name):
            client.make_bucket(bucket_name)
            created.append(bucket_name)
    return created


def build_tenant_path(tenant_id: str, *parts: str) -> str:
    """Build a tenant-prefixed object path.

    Args:
        tenant_id: Tenant UUID
        parts: Path components after tenant prefix

    Returns:
        Path like "tenantId/courses/courseId/..."
    """
    return "/".join([tenant_id] + list(parts))


def validate_tenant_path(object_name: str, tenant_id: str) -> bool:
    """Validate that an object path belongs to a tenant.

    Args:
        object_name: Full object path
        tenant_id: Tenant UUID to validate against

    Returns:
        True if path starts with tenant_id prefix
    """
    return object_name.startswith(f"{tenant_id}/") or object_name.startswith(f"{tenant_id}/")


def upload_file(
    bucket_name: str,
    object_name: str,
    file_data: bytes,
    content_type: str = "application/octet-stream",
    client: Optional[Minio] = None,
) -> str:
    """Upload a file to MinIO.

    Args:
        bucket_name: Target bucket name.
        object_name: Object key (path) in the bucket.
        file_data: File content as bytes.
        content_type: MIME type of the file.
        client: MinIO client instance. Creates one if None.

    Returns:
        The object name (key) of the uploaded file.
    """
    if client is None:
        client = get_minio_client()

    if not client.bucket_exists(bucket_name):
        client.make_bucket(bucket_name)

    client.put_object(
        bucket_name=bucket_name,
        object_name=object_name,
        data=BytesIO(file_data),
        length=len(file_data),
        content_type=content_type,
    )
    return object_name


def upload_file_tenant(
    bucket_name: str,
    tenant_id: str,
    *path_parts: str,
    file_data: bytes,
    content_type: str = "application/octet-stream",
    client: Optional[Minio] = None,
) -> str:
    """Upload a file to MinIO with tenant-prefixed path.

    Args:
        bucket_name: Target bucket name.
        tenant_id: Tenant UUID for path prefix.
        path_parts: Path components after tenant prefix (e.g., "courses", "courseId").
        file_data: File content as bytes.
        content_type: MIME type of the file.
        client: MinIO client instance. Creates one if None.

    Returns:
        The object name (key) of the uploaded file with tenant prefix.
    """
    object_name = build_tenant_path(tenant_id, *path_parts)
    return upload_file(bucket_name, object_name, file_data, content_type, client)


def download_file(
    bucket_name: str,
    object_name: str,
    client: Optional[Minio] = None,
) -> bytes:
    """Download a file from MinIO.

    Args:
        bucket_name: Source bucket name.
        object_name: Object key (path) in the bucket.
        client: MinIO client instance. Creates one if None.

    Returns:
        File content as bytes.
    """
    if client is None:
        client = get_minio_client()

    response = client.get_object(bucket_name, object_name)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def delete_file(
    bucket_name: str,
    object_name: str,
    client: Optional[Minio] = None,
) -> None:
    """Delete a file from MinIO.

    Args:
        bucket_name: Source bucket name.
        object_name: Object key (path) in the bucket.
        client: MinIO client instance. Creates one if None.
    """
    if client is None:
        client = get_minio_client()

    client.remove_object(bucket_name, object_name)


def delete_prefix(
    bucket_name: str,
    prefix: str,
    client: Optional[Minio] = None,
) -> int:
    """Delete all objects in a bucket matching a prefix.

    Args:
        bucket_name: Source bucket name.
        prefix: Object prefix to delete recursively.
        client: MinIO client instance. Creates one if None.

    Returns:
        Number of deleted objects.
    """
    if client is None:
        client = get_minio_client()

    deleted = 0
    for object_name in list_files(bucket_name, prefix, client):
        client.remove_object(bucket_name, object_name)
        deleted += 1
    return deleted


def list_files(
    bucket_name: str,
    prefix: str = "",
    client: Optional[Minio] = None,
) -> list[str]:
    """List files in a bucket with optional prefix filter.

    Args:
        bucket_name: Bucket to list.
        prefix: Object name prefix filter.
        client: MinIO client instance. Creates one if None.

    Returns:
        List of object names.
    """
    if client is None:
        client = get_minio_client()

    objects = client.list_objects(bucket_name, prefix=prefix, recursive=True)
    return [obj.object_name for obj in objects]


def list_files_tenant(
    bucket_name: str,
    tenant_id: str,
    *path_parts: str,
    client: Optional[Minio] = None,
) -> list[str]:
    """List files in a bucket with tenant-prefixed path.

    Args:
        bucket_name: Bucket to list.
        tenant_id: Tenant UUID for path prefix.
        path_parts: Path components to filter (e.g., "courses").
        client: MinIO client instance. Creates one if None.

    Returns:
        List of object names with tenant prefix.
    """
    prefix = build_tenant_path(tenant_id, *path_parts)
    return list_files(bucket_name, prefix, client)


def get_presigned_url(
    bucket_name: str,
    object_name: str,
    expires: int = 3600,
    client: Optional[Minio] = None,
) -> str:
    """Generate a presigned URL for temporary file access.

    Args:
        bucket_name: Bucket containing the object.
        object_name: Object key (path) in the bucket.
        expires: URL expiration time in seconds (default 1 hour).
        client: MinIO client instance. Creates one if None.

    Returns:
        Presigned URL string.
    """
    if client is None:
        client = get_minio_client()

    return client.presigned_get_object(
        bucket_name=bucket_name,
        object_name=object_name,
        expires=timedelta(seconds=expires),
    )


def file_exists(
    bucket_name: str,
    object_name: str,
    client: Optional[Minio] = None,
) -> bool:
    """Check if a file exists in MinIO.

    Args:
        bucket_name: Bucket to check.
        object_name: Object key (path) in the bucket.
        client: MinIO client instance. Creates one if None.

    Returns:
        True if the file exists, False otherwise.
    """
    if client is None:
        client = get_minio_client()

    try:
        client.stat_object(bucket_name, object_name)
        return True
    except S3Error:
        return False
