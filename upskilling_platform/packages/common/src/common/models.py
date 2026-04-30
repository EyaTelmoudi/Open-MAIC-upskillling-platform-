"""Shared SQLAlchemy database models for the Upskilling Platform."""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    Column,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSON, JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, relationship


class Base(DeclarativeBase):
    """Base class for all models."""

    pass


class User(Base):
    """User model."""

    __tablename__ = "users"
    __table_args__ = (
        Index(
            "ix_users_email_mismatch_lookup",
            "tenant_id",
            "entra_oid",
            "entra_mail",
            postgresql_where=(Column("entra_oid").isnot(None)),
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=True)
    auth_provider = Column(String, nullable=False)
    first_name = Column(String, nullable=False)
    last_name = Column(String, nullable=False)
    avatar = Column(String, nullable=True)
    role = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")
    onboarded = Column(Boolean, nullable=False, default=False)
    department = Column(String, nullable=True)
    bio = Column(Text, nullable=True)
    skills = Column(JSON, default=list)
    timezone = Column(String(100), nullable=False, default="Africa/Tunis")
    last_login = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    entra_oid = Column(String(100), nullable=True)
    entra_upn = Column(String(255), nullable=True)
    entra_mail = Column(String(255), nullable=True)
    entra_given_name = Column(String(100), nullable=True)
    entra_surname = Column(String(100), nullable=True)
    entra_display_name = Column(String(255), nullable=True)
    entra_job_title = Column(String(255), nullable=True)
    entra_department = Column(String(255), nullable=True)
    entra_company_name = Column(String(255), nullable=True)
    entra_location = Column(String(255), nullable=True)
    last_entra_sync = Column(DateTime, nullable=True)
    invitation_token = Column(String(64), nullable=True, index=True)
    invitation_expires_at = Column(DateTime, nullable=True)

    tenant_id = Column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=True, index=True
    )
    tenant = relationship("Tenant", back_populates="users", foreign_keys=[tenant_id])
    enrollments = relationship("Enrollment", back_populates="user")
    certificates = relationship("Certificate", back_populates="user")
    progress = relationship("UserProgress", back_populates="user")
    xp_transactions = relationship("XPTransaction", back_populates="user")
    team_memberships = relationship("TeamMembership", back_populates="user")
    goals = relationship("UserGoal", back_populates="user")
    reviews = relationship("CourseReview", back_populates="user")
    bookmarks = relationship("Bookmark", back_populates="user")


class Course(Base):
    """Course model."""

    __tablename__ = "courses"
    __table_args__ = (
        Index("ix_courses_category", "category"),
        Index("ix_courses_difficulty", "difficulty"),
        Index("ix_courses_is_published", "is_published"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    thumbnail = Column(String, nullable=True)
    category = Column(String, nullable=False)
    difficulty = Column(String, nullable=False)
    duration = Column(Integer, nullable=False)
    xp_reward = Column(Integer, nullable=False, default=100)
    rating = Column(Float, nullable=True)
    is_published = Column(Boolean, default=False)
    author_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    modules = relationship("Module", back_populates="course", order_by="Module.order")
    enrollments = relationship("Enrollment", back_populates="course")
    reviews = relationship("CourseReview", back_populates="course")
    certificates = relationship("Certificate", back_populates="course")


class CourseReview(Base):
    """Course review model."""

    __tablename__ = "course_reviews"
    __table_args__ = (
        Index("ix_course_reviews_course_id", "course_id"),
        Index("ix_course_reviews_user_id", "user_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    rating = Column(Integer, nullable=False)
    review_text = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    course = relationship("Course", back_populates="reviews")
    user = relationship("User", back_populates="reviews")


class Bookmark(Base):
    """Bookmark model for courses and lessons."""

    __tablename__ = "bookmarks"
    __table_args__ = (
        Index("ix_bookmarks_user_id", "user_id"),
        Index("ix_bookmarks_course_id", "course_id"),
        Index("ix_bookmarks_lesson_id", "lesson_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=True)
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("lessons.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="bookmarks")


class Module(Base):
    """Module model."""

    __tablename__ = "modules"
    __table_args__ = (Index("ix_modules_course_id", "course_id"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    order = Column(Integer, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    course = relationship("Course", back_populates="modules")
    lessons = relationship("Lesson", back_populates="module", order_by="Lesson.order")
    assessments = relationship("Assessment", back_populates="module")


class Lesson(Base):
    """Lesson model."""

    __tablename__ = "lessons"
    __table_args__ = (Index("ix_lessons_module_id", "module_id"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id = Column(UUID(as_uuid=True), ForeignKey("modules.id"), nullable=False)
    title = Column(String, nullable=False)
    content = Column(Text, nullable=True)
    video_url = Column(String, nullable=True)
    content_type = Column(String, nullable=False)
    duration = Column(Integer, nullable=False)
    order = Column(Integer, nullable=False)
    assessment_id = Column(
        UUID(as_uuid=True), ForeignKey("assessments.id"), nullable=True
    )
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    module = relationship("Module", back_populates="lessons")
    progress = relationship("UserProgress", back_populates="lesson")
    assessment = relationship("Assessment")


class Assessment(Base):
    """Assessment model."""

    __tablename__ = "assessments"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    module_id = Column(UUID(as_uuid=True), ForeignKey("modules.id"), nullable=False)
    title = Column(String, nullable=False)
    passing_score = Column(Integer, nullable=False)
    time_limit = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    module = relationship("Module", back_populates="assessments")
    questions = relationship("Question", back_populates="assessment")


class Question(Base):
    """Question model."""

    __tablename__ = "questions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    assessment_id = Column(
        UUID(as_uuid=True), ForeignKey("assessments.id"), nullable=False
    )
    text = Column(Text, nullable=False)
    type = Column(String, nullable=False)
    options = Column(JSON, nullable=False)
    correct_answer = Column(String, nullable=False)
    points = Column(Integer, nullable=False)
    order = Column(Integer, nullable=False)

    assessment = relationship("Assessment", back_populates="questions")


class AssessmentAttempt(Base):
    """Assessment attempt model for storing quiz submissions."""

    __tablename__ = "quiz_attempts"
    __table_args__ = (
        Index("ix_quiz_attempts_user_id", "user_id"),
        Index("ix_quiz_attempts_assessment_id", "assessment_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    assessment_id = Column(
        UUID(as_uuid=True), ForeignKey("assessments.id"), nullable=False
    )
    answers = Column(JSON, nullable=False)
    score = Column(Float, nullable=True)
    passed = Column(Boolean, nullable=True)
    started_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)

    user = relationship("User")
    assessment = relationship("Assessment")


class Enrollment(Base):
    """Enrollment model."""

    __tablename__ = "enrollments"
    __table_args__ = (
        UniqueConstraint("user_id", "course_id", name="uq_enrollment_user_course"),
        Index("ix_enrollments_user_id", "user_id"),
        Index("ix_enrollments_course_id", "course_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False)
    enrolled_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    completed_at = Column(DateTime, nullable=True)
    status = Column(String, nullable=False, default="in_progress")

    user = relationship("User", back_populates="enrollments")
    course = relationship("Course", back_populates="enrollments")


class CourseAssignment(Base):
    """Course assignment model for mandatory courses with deadlines."""

    __tablename__ = "course_assignments"
    __table_args__ = (
        Index("ix_course_assignments_user_id", "user_id"),
        Index("ix_course_assignments_course_id", "course_id"),
        Index("ix_course_assignments_deadline", "deadline"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False)
    deadline = Column(Date, nullable=True)
    is_mandatory = Column(Boolean, default=False)
    assigned_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    assigned_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class UserProgress(Base):
    """User progress model."""

    __tablename__ = "user_progress"
    __table_args__ = (
        UniqueConstraint("user_id", "lesson_id", name="uq_progress_user_lesson"),
        Index("ix_user_progress_user_id", "user_id"),
        Index("ix_user_progress_lesson_id", "lesson_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    lesson_id = Column(UUID(as_uuid=True), ForeignKey("lessons.id"), nullable=False)
    status = Column(String, nullable=False, default="not_started")
    completed_at = Column(DateTime, nullable=True)
    time_spent = Column(Integer, default=0)
    video_data = Column(JSON, nullable=True)
    text_data = Column(JSON, nullable=True)

    user = relationship("User", back_populates="progress")
    lesson = relationship("Lesson", back_populates="progress")


class XPTransaction(Base):
    """XP transaction model."""

    __tablename__ = "xp_transactions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    amount = Column(Integer, nullable=False)
    reason = Column(String, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="xp_transactions")


class UserLevel(Base):
    """User level model."""

    __tablename__ = "user_levels"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False
    )
    level = Column(Integer, nullable=False, default=1)
    total_xp = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Team(Base):
    """Team model."""

    __tablename__ = "teams"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    manager_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    tenant = relationship("Tenant", back_populates="teams")
    memberships = relationship("TeamMembership", back_populates="team")
    goals = relationship("TeamGoal", back_populates="team")


class TeamMembership(Base):
    """Team membership model."""

    __tablename__ = "team_memberships"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False)
    role = Column(String, nullable=False, default="member")
    joined_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="team_memberships")
    team = relationship("Team", back_populates="memberships")


class UserGoal(Base):
    """User goal model."""

    __tablename__ = "user_goals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    target_date = Column(Date, nullable=True)
    target_count = Column(Integer, nullable=False, default=1)
    xp_reward = Column(Integer, nullable=False, default=0)
    progress = Column(Integer, default=0)
    status = Column(String, nullable=False, default="active")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    user = relationship("User", back_populates="goals")


class TeamGoal(Base):
    """Team goal model."""

    __tablename__ = "team_goals"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    team_id = Column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    target_date = Column(Date, nullable=True)
    target_count = Column(Integer, nullable=False, default=1)
    xp_reward = Column(Integer, nullable=False, default=0)
    progress = Column(Integer, default=0)
    status = Column(String, nullable=False, default="active")
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    team = relationship("Team", back_populates="goals")


class Skill(Base):
    """Skill taxonomy node used for skill-gap analysis."""

    __tablename__ = "skills"
    __table_args__ = (
        Index("ix_skills_name", "name", unique=True),
        Index("ix_skills_category", "category"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False, unique=True)
    category = Column(String(100), nullable=False)
    description = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class SkillEdge(Base):
    """Directed relationship between two skills."""

    __tablename__ = "skill_edges"
    __table_args__ = (
        Index("ix_skill_edges_from_skill_id", "from_skill_id"),
        Index("ix_skill_edges_to_skill_id", "to_skill_id"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    from_skill_id = Column(UUID(as_uuid=True), ForeignKey("skills.id"), nullable=False)
    to_skill_id = Column(UUID(as_uuid=True), ForeignKey("skills.id"), nullable=False)
    edge_type = Column(String(50), nullable=False, default="prerequisite")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class Notification(Base):
    """Notification model."""

    __tablename__ = "notifications"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    type = Column(String, nullable=False)
    title = Column(String, nullable=False)
    message = Column(Text, nullable=False)
    is_read = Column(Boolean, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class CoursePreviewToken(Base):
    """Course preview token model for author preview mode."""

    __tablename__ = "course_preview_tokens"
    __table_args__ = (Index("ix_course_preview_tokens_course_id", "course_id"),)

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False)
    token = Column(String, nullable=False, unique=True, index=True)
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    course = relationship("Course")


class Certificate(Base):
    """Certificate model."""

    __tablename__ = "certificates"
    __table_args__ = (
        Index("ix_certificates_user_id", "user_id"),
        Index("ix_certificates_course_id", "course_id"),
        Index("ix_certificates_certificate_number", "certificate_number", unique=True),
        Index("ix_certificates_status", "status"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    certificate_number = Column(String, nullable=False, unique=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    course_id = Column(UUID(as_uuid=True), ForeignKey("courses.id"), nullable=False)
    enrollment_id = Column(
        UUID(as_uuid=True), ForeignKey("enrollments.id"), nullable=False
    )
    learner_name = Column(String, nullable=False)
    course_title = Column(String, nullable=False)
    course_version = Column(String, nullable=True)
    issuing_org = Column(String, nullable=True)
    grade = Column(String, nullable=True)
    score = Column(Float, nullable=True)
    issued_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=True)
    content_hash = Column(String, nullable=False)
    signature = Column(String, nullable=False)
    signature_algorithm = Column(String, nullable=False, default="RS256")
    payload_json = Column(JSONB, nullable=True)
    pdf_url = Column(String, nullable=True)
    status = Column(String, nullable=False, default="active")
    is_revoked = Column(Boolean, default=False)
    revoked_at = Column(DateTime, nullable=True)
    revoked_reason = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User")
    course = relationship("Course")
    enrollment = relationship("Enrollment")


class CertificateVerificationAudit(Base):
    """Audit log for public certificate verification attempts."""

    __tablename__ = "certificate_verification_audits"
    __table_args__ = (
        Index(
            "ix_certificate_verification_audits_certificate_id",
            "certificate_id",
        ),
        Index("ix_certificate_verification_audits_created_at", "created_at"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    certificate_id = Column(UUID(as_uuid=True), ForeignKey("certificates.id"), nullable=True)
    certificate_id_raw = Column(String, nullable=False)
    result = Column(String(30), nullable=False)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    message = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    certificate = relationship("Certificate")


class UserBadge(Base):
    """User badge/achievement model."""

    __tablename__ = "user_badges"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    badge_id = Column(String, nullable=False)
    badge_name = Column(String, nullable=False)
    badge_tier = Column(String, nullable=False)
    badge_icon = Column(String, nullable=True)
    description = Column(Text, nullable=True)
    earned_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class UserStreak(Base):
    """User streak tracking model."""

    __tablename__ = "user_streaks"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False
    )
    current_streak = Column(Integer, nullable=False, default=0)
    longest_streak = Column(Integer, nullable=False, default=0)
    last_activity_date = Column(Date, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class SystemConfig(Base):
    """System configuration model for platform first-run setup."""

    __tablename__ = "system_config"

    id = Column(Integer, primary_key=True, default=1)
    setup_completed = Column(Boolean, nullable=False, default=False)
    setup_completed_at = Column(DateTime, nullable=True)
    superadmin_onboarded = Column(Boolean, nullable=False, default=False)
    superadmin_checklist = Column(JSONB, nullable=True)
    platform_name = Column(String(255), nullable=False, default="SkillForge")
    platform_logo_url = Column(String(512), nullable=True)
    default_timezone = Column(String(100), nullable=False, default="Africa/Tunis")
    platform_language = Column(String(20), nullable=False, default="en")
    support_email = Column(String(255), nullable=True)
    setup_ip_address = Column(String(45), nullable=True)
    jwt_expiry_minutes = Column(Integer, nullable=False, default=60)
    session_timeout_hours = Column(Integer, nullable=False, default=24)
    rate_limit_rpm = Column(Integer, nullable=False, default=60)
    groq_api_key = Column(String(512), nullable=True)
    demo_mode = Column(Boolean, nullable=False, default=True)
    group_name = Column(String(255), nullable=True)
    group_website = Column(String(512), nullable=True)
    group_primary_color = Column(String(7), nullable=True)
    agent_toggles = Column(JSONB, nullable=True)
    email_templates = Column(JSONB, nullable=True)
    smtp_config = Column(JSONB, nullable=True)
    entra_client_id = Column(String(255), nullable=True)
    entra_client_secret = Column(String(512), nullable=True)
    entra_tenant_id = Column(String(255), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class Tenant(Base):
    """Tenant model for multi-tenancy."""

    __tablename__ = "tenants"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    email_domain = Column(String(255), nullable=True, index=True)
    logo_url = Column(String(512), nullable=True)
    primary_color = Column(String(20), nullable=True)
    status = Column(String(20), nullable=False, default="pending")
    entra_client_id = Column(String(255), nullable=True)
    entra_tenant_id = Column(String(255), nullable=True)
    entra_redirect_uris = Column(JSON, default=list)
    seat_limit = Column(Integer, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    created_by_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    created_by = relationship("User", foreign_keys=[created_by_id])
    users = relationship("User", back_populates="tenant", foreign_keys="User.tenant_id")
    teams = relationship("Team", back_populates="tenant")


class RoleMappingRule(Base):
    """Role mapping rules for Azure AD to platform role mapping."""

    __tablename__ = "role_mapping_rules"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=True)
    azure_role = Column(String(255), nullable=False)
    platform_role = Column(String(50), nullable=False)
    department = Column(String(100), nullable=True)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class IdentityAuditLog(Base):
    """Identity audit log for tracking identity-related actions."""

    __tablename__ = "identity_audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id = Column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    action = Column(String(100), nullable=False)
    actor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    actor_email = Column(String(255), nullable=True)
    target_user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    target_email = Column(String(255), nullable=True)
    details = Column(Text, nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)


class SuperAdminAuditLog(Base):
    """Platform-level audit log for Super Admin actions."""

    __tablename__ = "super_admin_audit_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    action = Column(String(100), nullable=False)  # e.g. "tenant.create", "admin.invite", "settings.update"
    actor_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    actor_email = Column(String(255), nullable=True)
    target_type = Column(String(50), nullable=True)  # e.g. "tenant", "user", "settings"
    target_id = Column(String(255), nullable=True)
    details = Column(JSONB, nullable=True)
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
