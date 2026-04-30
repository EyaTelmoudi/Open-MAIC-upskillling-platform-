"""Shared enums for the Upskilling Platform."""

from enum import Enum


class UserRole(str, Enum):
    """User roles for RBAC."""

    SuperAdmin = "SuperAdmin"
    Admin = "Admin"
    Manager = "Manager"
    LearningExpert = "LearningExpert"
    TeamManager = "TeamManager"
    TeamMember = "TeamMember"
    TeamIntern = "TeamIntern"


class UserStatus(str, Enum):
    """User account status."""

    provisioned = (
        "provisioned"  # Email exists in Azure Entra ID, waiting for first Azure login
    )
    pending_invitation = "pending_invitation"  # Not in Azure, invite email sent
    active = "active"
    suspended = "suspended"
    deleted = "deleted"


class TenantStatus(str, Enum):
    """Tenant status."""

    pending = "pending"
    active = "active"
    suspended = "suspended"


class AuthProvider(str, Enum):
    """Authentication provider."""

    azure_entra = "azure_entra"
    local = "local"


class CourseDifficulty(str, Enum):
    """Course difficulty levels."""

    beginner = "beginner"
    intermediate = "intermediate"
    advanced = "advanced"


class ContentType(str, Enum):
    """Lesson content types."""

    text = "text"
    video = "video"
    quiz = "quiz"


class LessonStatus(str, Enum):
    """Lesson progress status."""

    not_started = "not_started"
    in_progress = "in_progress"
    completed = "completed"


class EnrollmentStatus(str, Enum):
    """Enrollment status."""

    in_progress = "in_progress"
    completed = "completed"
    dropped = "dropped"


class QuestionType(str, Enum):
    """Assessment question types."""

    multiple_choice = "multiple_choice"
    true_false = "true_false"


class GoalStatus(str, Enum):
    """Goal status."""

    active = "active"
    completed = "completed"
    cancelled = "cancelled"


class NotificationType(str, Enum):
    """Notification types."""

    goal_achieved = "goal_achieved"
    badge_earned = "badge_earned"
    course_completed = "course_completed"
    streak_milestone = "streak_milestone"
    team_update = "team_update"


class AgentType(str, Enum):
    """AI Agent types."""

    coaching = "coaching"
    recommendation = "recommendation"
    gamification = "gamification"
    coursemaker = "coursemaker"
    librarian = "librarian"
    skillgap = "skillgap"


class MemoryType(str, Enum):
    """Hindsight memory types."""

    interaction = "interaction"
    preference = "preference"
    progress = "progress"
    struggle = "struggle"


class ContentSourceType(str, Enum):
    """Content source file types."""

    pdf = "pdf"
    docx = "docx"
    text = "text"
    audio = "audio"
    video = "video"
    image = "image"
    slide = "slide"
    url = "url"


class ContentSourceStatus(str, Enum):
    """Content source processing status."""

    pending = "pending"
    processing = "processing"
    indexed = "indexed"
    failed = "failed"


class EvidenceType(str, Enum):
    """Skill evidence types."""

    quiz = "quiz"
    behavior = "behavior"
    cv = "cv"
    selfassess = "selfassess"


class SkillEdgeType(str, Enum):
    """Skill graph edge types."""

    prerequisite = "prerequisite"
    complementary = "complementary"
    leads_to_role = "leads_to_role"


class SkillGapStatus(str, Enum):
    """Skill gap status."""

    active = "active"
    resolved = "resolved"
    ignored = "ignored"


class LeaderboardType(str, Enum):
    """Leaderboard types."""

    global_ = "global"
    team = "team"
    weekly = "weekly"


class TeamMemberRole(str, Enum):
    """Team membership roles."""

    manager = "manager"
    member = "member"


class WorkflowStatus(str, Enum):
    """AGNO workflow status."""

    running = "running"
    completed = "completed"
    failed = "failed"
