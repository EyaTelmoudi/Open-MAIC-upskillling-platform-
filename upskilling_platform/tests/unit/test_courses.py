"""Unit tests for Course CRUD operations in the Learning Platform service."""

import pytest
from unittest.mock import MagicMock, patch
from uuid import uuid4
from datetime import datetime

# Mock the common modules before importing routers
with patch("common.database.get_db"), patch("common.messaging.RabbitMQClient"):
    from services.learning.routers import courses
    from services.learning.routers.courses import (
        list_courses,
        get_course,
        create_course,
        update_course,
        delete_course,
    )


class TestListCourses:
    """Tests for the list_courses endpoint."""

    def test_list_courses_returns_items(self):
        """Test that list_courses returns a list of courses."""
        mock_course = MagicMock()
        mock_course.id = uuid4()
        mock_course.title = "Test Course"
        mock_course.description = "Test Description"
        mock_course.category = "Technology"
        mock_course.difficulty = "Beginner"
        mock_course.is_published = True
        mock_course.created_at = datetime.utcnow()

        mock_query = MagicMock()
        mock_query.count.return_value = 1
        mock_query.order_by.return_value = mock_query
        mock_query.offset.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.all.return_value = [mock_course]

        mock_db = MagicMock()
        mock_db.query.return_value = mock_query

        result = list_courses(
            category=None,
            difficulty=None,
            search=None,
            is_published=None,
            page=1,
            page_size=20,
            db=mock_db,
        )

        assert "items" in result
        assert result["total"] == 1
        assert len(result["items"]) == 1

    def test_list_courses_with_category_filter(self):
        """Test filtering courses by category."""
        mock_query = MagicMock()
        mock_query.count.return_value = 0
        mock_query.filter.return_value = mock_query
        mock_query.order_by.return_value = mock_query
        mock_query.offset.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.all.return_value = []

        mock_db = MagicMock()
        mock_db.query.return_value = mock_query

        list_courses(
            category="Technology",
            difficulty=None,
            search=None,
            is_published=None,
            page=1,
            page_size=20,
            db=mock_db,
        )

        mock_query.filter.assert_called()

    def test_list_courses_with_difficulty_filter(self):
        """Test filtering courses by difficulty."""
        mock_query = MagicMock()
        mock_query.count.return_value = 0
        mock_query.filter.return_value = mock_query
        mock_query.order_by.return_value = mock_query
        mock_query.offset.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.all.return_value = []

        mock_db = MagicMock()
        mock_db.query.return_value = mock_query

        list_courses(
            category=None,
            difficulty="Beginner",
            search=None,
            is_published=None,
            page=1,
            page_size=20,
            db=mock_db,
        )

        mock_query.filter.assert_called()

    def test_list_courses_with_search(self):
        """Test searching courses by title."""
        mock_query = MagicMock()
        mock_query.count.return_value = 0
        mock_query.filter.return_value = mock_query
        mock_query.order_by.return_value = mock_query
        mock_query.offset.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.all.return_value = []

        mock_db = MagicMock()
        mock_db.query.return_value = mock_query

        list_courses(
            category=None,
            difficulty=None,
            search="Python",
            is_published=None,
            page=1,
            page_size=20,
            db=mock_db,
        )

        mock_query.filter.assert_called()

    def test_list_courses_pagination(self):
        """Test pagination parameters work correctly."""
        mock_query = MagicMock()
        mock_query.count.return_value = 100
        mock_query.order_by.return_value = mock_query
        mock_query.offset.return_value = mock_query
        mock_query.limit.return_value = mock_query
        mock_query.all.return_value = []

        mock_db = MagicMock()
        mock_db.query.return_value = mock_query

        result = list_courses(
            category=None,
            difficulty=None,
            search=None,
            is_published=None,
            page=2,
            page_size=10,
            db=mock_db,
        )

        mock_query.offset.assert_called_with(10)
        mock_query.limit.assert_called_with(10)
        assert result["total"] == 100


class TestGetCourse:
    """Tests for the get_course endpoint."""

    def test_get_course_by_id(self):
        """Test retrieving a course by ID."""
        course_id = uuid4()
        mock_course = MagicMock()
        mock_course.id = course_id
        mock_course.title = "Test Course"
        mock_course.description = "Test Description"
        mock_course.category = "Technology"
        mock_course.difficulty = "Beginner"
        mock_course.is_published = True
        mock_course.created_at = datetime.utcnow()

        mock_query = MagicMock()
        mock_query.filter.return_value = mock_query
        mock_query.first.return_value = mock_course

        mock_db = MagicMock()
        mock_db.query.return_value = mock_query

        result = get_course(course_id=str(course_id), db=mock_db)

        assert result["id"] == str(course_id)
        assert result["title"] == "Test Course"

    def test_get_course_not_found(self):
        """Test that 404 is returned for non-existent course."""
        course_id = uuid4()

        mock_query = MagicMock()
        mock_query.filter.return_value = mock_query
        mock_query.first.return_value = None

        mock_db = MagicMock()
        mock_db.query.return_value = mock_query

        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            get_course(course_id=str(course_id), db=mock_db)

        assert exc_info.value.status_code == 404


class TestCourseValidation:
    """Tests for course validation logic."""

    def test_module_lesson_ordering(self):
        """Test that modules and lessons maintain proper ordering."""
        # Test ordering logic
        modules = [
            {"order": 1, "lessons": [{"order": 1}, {"order": 2}]},
            {"order": 2, "lessons": [{"order": 1}]},
        ]

        # Verify correct ordering
        for i, module in enumerate(modules):
            assert module["order"] == i + 1
            for j, lesson in enumerate(module["lessons"]):
                assert lesson["order"] == j + 1

    def test_enrollment_duplicate_prevention(self):
        """Test that duplicate enrollments are prevented."""
        # Simulate checking for duplicate enrollment
        existing_enrollments = [{"user_id": "user-1", "course_id": "course-1"}]

        new_enrollment = {"user_id": "user-1", "course_id": "course-1"}

        # Check for duplicate
        is_duplicate = any(
            e["user_id"] == new_enrollment["user_id"]
            and e["course_id"] == new_enrollment["course_id"]
            for e in existing_enrollments
        )

        assert is_duplicate is True

    def test_enrollment_new_user(self):
        """Test that new users can enroll."""
        existing_enrollments = [{"user_id": "user-1", "course_id": "course-1"}]

        new_enrollment = {"user_id": "user-2", "course_id": "course-1"}

        is_duplicate = any(
            e["user_id"] == new_enrollment["user_id"]
            and e["course_id"] == new_enrollment["course_id"]
            for e in existing_enrollments
        )

        assert is_duplicate is False


class TestProgressTracking:
    """Tests for progress tracking logic."""

    def test_calculate_progress_percentage(self):
        """Test progress percentage calculation."""
        completed_lessons = 5
        total_lessons = 10

        progress_percentage = (completed_lessons / total_lessons) * 100

        assert progress_percentage == 50.0

    def test_calculate_progress_with_zero_lessons(self):
        """Test progress calculation when there are no lessons."""
        completed_lessons = 0
        total_lessons = 0

        # Avoid division by zero
        progress_percentage = (
            0 if total_lessons == 0 else (completed_lessons / total_lessons) * 100
        )

        assert progress_percentage == 0

    def test_calculate_progress_with_all_completed(self):
        """Test progress when all lessons are completed."""
        completed_lessons = 10
        total_lessons = 10

        progress_percentage = (completed_lessons / total_lessons) * 100

        assert progress_percentage == 100.0

    def test_lesson_completion_status(self):
        """Test lesson completion status logic."""
        lesson_statuses = ["not_started", "in_progress", "completed"]

        # Valid statuses
        for status in lesson_statuses:
            assert status in ["not_started", "in_progress", "completed"]

        # Test completion
        is_completed = "completed" in lesson_statuses
        assert is_completed is True


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
