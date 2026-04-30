"""Tests for common.models module."""

import uuid

from sqlalchemy import inspect

from common.models import (
    Assessment,
    Base,
    Course,
    Enrollment,
    Lesson,
    Module,
    Notification,
    Question,
    Team,
    TeamGoal,
    TeamMembership,
    User,
    UserGoal,
    UserLevel,
    UserProgress,
    XPTransaction,
)


class TestUserModel:
    def test_tablename(self):
        assert User.__tablename__ == "users"

    def test_columns(self):
        columns = {c.name for c in inspect(User).columns}
        expected = {
            "id",
            "email",
            "password_hash",
            "auth_provider",
            "first_name",
            "last_name",
            "avatar",
            "role",
            "status",
            "department",
            "bio",
            "skills",
            "created_at",
            "updated_at",
        }
        assert expected.issubset(columns)


class TestCourseModel:
    def test_tablename(self):
        assert Course.__tablename__ == "courses"

    def test_columns(self):
        columns = {c.name for c in inspect(Course).columns}
        expected = {
            "id",
            "title",
            "description",
            "thumbnail",
            "category",
            "difficulty",
            "duration",
            "is_published",
            "author_id",
            "created_at",
            "updated_at",
        }
        assert expected.issubset(columns)


class TestModuleModel:
    def test_tablename(self):
        assert Module.__tablename__ == "modules"


class TestLessonModel:
    def test_tablename(self):
        assert Lesson.__tablename__ == "lessons"


class TestAssessmentModel:
    def test_tablename(self):
        assert Assessment.__tablename__ == "assessments"


class TestQuestionModel:
    def test_tablename(self):
        assert Question.__tablename__ == "questions"


class TestEnrollmentModel:
    def test_tablename(self):
        assert Enrollment.__tablename__ == "enrollments"


class TestUserProgressModel:
    def test_tablename(self):
        assert UserProgress.__tablename__ == "user_progress"


class TestXPTransactionModel:
    def test_tablename(self):
        assert XPTransaction.__tablename__ == "xp_transactions"


class TestUserLevelModel:
    def test_tablename(self):
        assert UserLevel.__tablename__ == "user_levels"


class TestTeamModel:
    def test_tablename(self):
        assert Team.__tablename__ == "teams"


class TestTeamMembershipModel:
    def test_tablename(self):
        assert TeamMembership.__tablename__ == "team_memberships"


class TestUserGoalModel:
    def test_tablename(self):
        assert UserGoal.__tablename__ == "user_goals"


class TestTeamGoalModel:
    def test_tablename(self):
        assert TeamGoal.__tablename__ == "team_goals"


class TestNotificationModel:
    def test_tablename(self):
        assert Notification.__tablename__ == "notifications"


class TestModelRelationships:
    def test_user_has_enrollments_relationship(self):
        assert hasattr(User, "enrollments")

    def test_course_has_modules_relationship(self):
        assert hasattr(Course, "modules")

    def test_team_has_memberships_relationship(self):
        assert hasattr(Team, "memberships")
