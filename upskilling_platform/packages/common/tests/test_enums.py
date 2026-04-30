"""Tests for common.enums module."""

from common.enums import (
    AgentType,
    AuthProvider,
    ContentType,
    CourseDifficulty,
    EnrollmentStatus,
    GoalStatus,
    LeaderboardType,
    LessonStatus,
    MemoryType,
    NotificationType,
    QuestionType,
    SkillEdgeType,
    SkillGapStatus,
    TeamMemberRole,
    UserRole,
    UserStatus,
    WorkflowStatus,
)


class TestUserRole:
    def test_all_roles_exist(self):
        expected = {
            "Admin",
            "Manager",
            "LearningExpert",
            "TeamManager",
            "TeamMember",
            "TeamIntern",
        }
        actual = {r.value for r in UserRole}
        assert actual == expected

    def test_role_is_string_enum(self):
        assert UserRole.Admin == "Admin"
        assert str(UserRole.Admin) == "UserRole.Admin"


class TestUserStatus:
    def test_all_statuses(self):
        expected = {"pending", "active", "suspended", "inactive"}
        assert {s.value for s in UserStatus} == expected


class TestAuthProvider:
    def test_providers(self):
        assert AuthProvider.azure_entra.value == "azure_entra"
        assert AuthProvider.local.value == "local"


class TestCourseDifficulty:
    def test_levels(self):
        assert {d.value for d in CourseDifficulty} == {
            "beginner",
            "intermediate",
            "advanced",
        }


class TestContentType:
    def test_types(self):
        assert {t.value for t in ContentType} == {"text", "video", "quiz"}


class TestLessonStatus:
    def test_statuses(self):
        assert {s.value for s in LessonStatus} == {
            "not_started",
            "in_progress",
            "completed",
        }


class TestEnrollmentStatus:
    def test_statuses(self):
        assert {s.value for s in EnrollmentStatus} == {
            "in_progress",
            "completed",
            "dropped",
        }


class TestQuestionType:
    def test_types(self):
        assert {t.value for t in QuestionType} == {"multiple_choice", "true_false"}


class TestGoalStatus:
    def test_statuses(self):
        assert {s.value for s in GoalStatus} == {"active", "completed", "cancelled"}


class TestNotificationType:
    def test_types(self):
        expected = {
            "goal_achieved",
            "badge_earned",
            "course_completed",
            "streak_milestone",
            "team_update",
        }
        assert {t.value for t in NotificationType} == expected


class TestAgentType:
    def test_all_agents(self):
        expected = {
            "coaching",
            "recommendation",
            "gamification",
            "coursemaker",
            "librarian",
            "skillgap",
        }
        assert {a.value for a in AgentType} == expected


class TestMemoryType:
    def test_types(self):
        assert {t.value for t in MemoryType} == {
            "interaction",
            "preference",
            "progress",
            "struggle",
        }


class TestLeaderboardType:
    def test_types(self):
        assert {t.value for t in LeaderboardType} == {"global", "team", "weekly"}


class TestTeamMemberRole:
    def test_roles(self):
        assert {r.value for r in TeamMemberRole} == {"manager", "member"}


class TestWorkflowStatus:
    def test_statuses(self):
        assert {s.value for s in WorkflowStatus} == {"running", "completed", "failed"}


class TestSkillEdgeType:
    def test_types(self):
        assert {t.value for t in SkillEdgeType} == {
            "prerequisite",
            "complementary",
            "leads_to_role",
        }


class TestSkillGapStatus:
    def test_statuses(self):
        assert {s.value for s in SkillGapStatus} == {"active", "resolved", "ignored"}
