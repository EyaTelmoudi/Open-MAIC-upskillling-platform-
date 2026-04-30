"""Helpers for storing and serving lesson media safely."""

import os
from urllib.parse import urlparse, unquote


LEARNING_PUBLIC_URL = os.getenv(
    "LEARNING_PUBLIC_URL",
    f"http://localhost:{os.getenv('LEARNING_SERVICE_PORT', '8002')}",
)


def build_media_proxy_url(bucket_name: str, object_name: str) -> str:
    """Build a stable learning-service URL for a media object."""
    safe_object_name = "/".join(
        unquote(part) for part in str(object_name).split("/") if part
    )
    return f"{LEARNING_PUBLIC_URL}/api/v1/content/media/{bucket_name}/{safe_object_name}"


def parse_media_reference(media_ref: str | None) -> tuple[str, str] | None:
    """Parse a stored lesson media reference into bucket and object path.

    Supported formats:
    - ``minio://bucket/object/path``
    - legacy/presigned URLs like ``http://host/bucket/object?...``
    """
    if not media_ref:
        return None

    if media_ref.startswith("minio://"):
        remainder = media_ref[len("minio://") :]
        bucket_name, _, object_name = remainder.partition("/")
        if bucket_name and object_name:
            return bucket_name, object_name
        return None

    if media_ref.startswith("http://") or media_ref.startswith("https://"):
        parsed = urlparse(media_ref)
        path_parts = [unquote(part) for part in parsed.path.split("/") if part]
        media_marker = ["api", "v1", "content", "media"]
        if len(path_parts) >= 6 and path_parts[:4] == media_marker:
            return path_parts[4], "/".join(path_parts[5:])
        legacy_file_marker = ["api", "v1", "content", "file"]
        if len(path_parts) >= 6 and path_parts[:4] == legacy_file_marker:
            return path_parts[4], "/".join(path_parts[5:])
        if len(path_parts) >= 2:
            return path_parts[0], "/".join(path_parts[1:])

    return None


def normalize_media_reference(media_ref: str | None) -> str | None:
    """Convert incoming media URLs into a stable stored reference."""
    parsed = parse_media_reference(media_ref)
    if not parsed:
        return media_ref

    bucket_name, object_name = parsed
    return f"minio://{bucket_name}/{object_name}"


def resolve_media_url(media_ref: str | None) -> str | None:
    """Convert stored media references into browser-safe stable URLs."""
    parsed = parse_media_reference(media_ref)
    if not parsed:
        return media_ref

    bucket_name, object_name = parsed
    return build_media_proxy_url(bucket_name, object_name)
