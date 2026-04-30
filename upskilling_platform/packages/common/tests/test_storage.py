"""Tests for common.storage (MinIO S3-compatible storage)."""

import os

import pytest

# Skip all tests if MinIO is not available
_minio_available = False
try:
    from minio import Minio

    _client = Minio(
        endpoint=os.getenv("MINIO_ENDPOINT", "localhost:9000"),
        access_key=os.getenv("MINIO_ACCESS_KEY", "minioadmin"),
        secret_key=os.getenv("MINIO_SECRET_KEY", "minioadmin123"),
        secure=False,
    )
    _client.list_buckets()
    _minio_available = True
except Exception:
    pass

pytestmark = pytest.mark.skipif(not _minio_available, reason="MinIO not available")


class TestStorageImports:
    """Test that storage module imports correctly."""

    def test_get_minio_client(self):
        from common.storage import get_minio_client

        client = get_minio_client()
        assert client is not None

    def test_default_buckets_defined(self):
        from common.storage import DEFAULT_BUCKETS

        assert len(DEFAULT_BUCKETS) == 6
        assert "course-videos" in DEFAULT_BUCKETS
        assert "course-pdfs" in DEFAULT_BUCKETS
        assert "course-images" in DEFAULT_BUCKETS
        assert "user-avatars" in DEFAULT_BUCKETS


class TestBucketOperations:
    """Test bucket creation and listing."""

    def test_ensure_buckets(self):
        from common.storage import ensure_buckets

        # Running again should not fail (idempotent)
        created = ensure_buckets()
        assert isinstance(created, list)
        # All buckets should already exist from previous run
        assert len(created) == 0


class TestFileOperations:
    """Test file upload, download, list, exists, delete."""

    TEST_BUCKET = "course-images"
    TEST_PREFIX = "test_storage/"
    TEST_CONTENT = b"test file content for MinIO"
    TEST_CONTENT_TYPE = "text/plain"

    def test_upload_and_download(self):
        from common.storage import download_file, upload_file

        upload_file(
            self.TEST_BUCKET,
            f"{self.TEST_PREFIX}upload_test.txt",
            self.TEST_CONTENT,
            self.TEST_CONTENT_TYPE,
        )
        content = download_file(self.TEST_BUCKET, f"{self.TEST_PREFIX}upload_test.txt")
        assert content == self.TEST_CONTENT

    def test_file_exists(self):
        from common.storage import file_exists, upload_file

        upload_file(
            self.TEST_BUCKET,
            f"{self.TEST_PREFIX}exists_test.txt",
            self.TEST_CONTENT,
        )
        assert file_exists(self.TEST_BUCKET, f"{self.TEST_PREFIX}exists_test.txt")
        assert not file_exists(self.TEST_BUCKET, f"{self.TEST_PREFIX}nonexistent.txt")

    def test_list_files(self):
        from common.storage import list_files, upload_file

        upload_file(
            self.TEST_BUCKET,
            f"{self.TEST_PREFIX}list_a.txt",
            b"a",
        )
        upload_file(
            self.TEST_BUCKET,
            f"{self.TEST_PREFIX}list_b.txt",
            b"b",
        )
        files = list_files(self.TEST_BUCKET, self.TEST_PREFIX)
        assert any("list_a.txt" in f for f in files)
        assert any("list_b.txt" in f for f in files)

    def test_delete_file(self):
        from common.storage import delete_file, file_exists, upload_file

        upload_file(
            self.TEST_BUCKET,
            f"{self.TEST_PREFIX}delete_test.txt",
            self.TEST_CONTENT,
        )
        assert file_exists(self.TEST_BUCKET, f"{self.TEST_PREFIX}delete_test.txt")
        delete_file(self.TEST_BUCKET, f"{self.TEST_PREFIX}delete_test.txt")
        assert not file_exists(self.TEST_BUCKET, f"{self.TEST_PREFIX}delete_test.txt")

    def test_presigned_url(self):
        from common.storage import get_presigned_url, upload_file

        upload_file(
            self.TEST_BUCKET,
            f"{self.TEST_PREFIX}presigned_test.txt",
            self.TEST_CONTENT,
        )
        url = get_presigned_url(
            self.TEST_BUCKET, f"{self.TEST_PREFIX}presigned_test.txt"
        )
        assert url.startswith("http")
        assert self.TEST_BUCKET in url
        assert "presigned_test.txt" in url
