-- ============================================================
-- Upskilling Platform — Initial Schema
-- Generated from SQLAlchemy models in packages/common/src/common/models.py
-- ============================================================

-- Tenants (Multi-tenancy)
CREATE TABLE IF NOT EXISTS tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    email_domain VARCHAR(255),
    logo_url VARCHAR(512),
    primary_color VARCHAR(20),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    entra_client_id VARCHAR(255),
    entra_tenant_id VARCHAR(255),
    entra_redirect_uris JSONB DEFAULT '[]'::jsonb,
    seat_limit INTEGER,
    created_by_id UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_tenants_slug ON tenants (slug);
CREATE INDEX IF NOT EXISTS ix_tenants_email_domain ON tenants (email_domain);
CREATE INDEX IF NOT EXISTS ix_tenants_status ON tenants (status);

-- Users (updated with tenant_id)
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR UNIQUE NOT NULL,
    password_hash VARCHAR,
    auth_provider VARCHAR NOT NULL,
    first_name VARCHAR NOT NULL,
    last_name VARCHAR NOT NULL,
    avatar VARCHAR,
    role VARCHAR NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'pending',
    department VARCHAR,
    bio TEXT,
    skills JSONB DEFAULT '[]'::jsonb,
    tenant_id UUID REFERENCES tenants(id),
    invitation_token VARCHAR(64),
    invitation_expires_at TIMESTAMP,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_users_email ON users (email);
CREATE INDEX IF NOT EXISTS ix_users_tenant_id ON users (tenant_id);
CREATE INDEX IF NOT EXISTS ix_users_invitation_token ON users (invitation_token);

-- Courses (updated with tenant_id)
CREATE TABLE IF NOT EXISTS courses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR NOT NULL,
    description TEXT,
    thumbnail VARCHAR,
    category VARCHAR NOT NULL,
    difficulty VARCHAR NOT NULL,
    duration INTEGER NOT NULL,
    xp_reward INTEGER NOT NULL DEFAULT 100,
    rating FLOAT,
    is_published BOOLEAN DEFAULT FALSE,
    author_id UUID REFERENCES users(id),
    tenant_id UUID REFERENCES tenants(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_courses_category ON courses (category);
CREATE INDEX IF NOT EXISTS ix_courses_difficulty ON courses (difficulty);
CREATE INDEX IF NOT EXISTS ix_courses_is_published ON courses (is_published);
CREATE INDEX IF NOT EXISTS ix_courses_tenant_id ON courses (tenant_id);

-- Modules
CREATE TABLE IF NOT EXISTS modules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    title VARCHAR NOT NULL,
    description TEXT,
    "order" INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_modules_course_id ON modules (course_id);

-- Lessons
CREATE TABLE IF NOT EXISTS lessons (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    title VARCHAR NOT NULL,
    content TEXT NOT NULL,
    content_type VARCHAR NOT NULL,
    duration INTEGER NOT NULL,
    "order" INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_lessons_module_id ON lessons (module_id);

-- Assessments
CREATE TABLE IF NOT EXISTS assessments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
    title VARCHAR NOT NULL,
    passing_score INTEGER NOT NULL,
    time_limit INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Questions
CREATE TABLE IF NOT EXISTS questions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    assessment_id UUID NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    type VARCHAR NOT NULL,
    options JSONB NOT NULL,
    correct_answer VARCHAR NOT NULL,
    points INTEGER NOT NULL,
    "order" INTEGER NOT NULL
);

-- Enrollments
CREATE TABLE IF NOT EXISTS enrollments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMP NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMP,
    status VARCHAR NOT NULL DEFAULT 'in_progress',
    UNIQUE(user_id, course_id)
);
CREATE INDEX IF NOT EXISTS ix_enrollments_user_id ON enrollments (user_id);
CREATE INDEX IF NOT EXISTS ix_enrollments_course_id ON enrollments (course_id);

-- User Progress
CREATE TABLE IF NOT EXISTS user_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id UUID NOT NULL REFERENCES lessons(id) ON DELETE CASCADE,
    status VARCHAR NOT NULL DEFAULT 'not_started',
    completed_at TIMESTAMP,
    time_spent INTEGER DEFAULT 0,
    UNIQUE(user_id, lesson_id)
);
CREATE INDEX IF NOT EXISTS ix_user_progress_user_id ON user_progress (user_id);
CREATE INDEX IF NOT EXISTS ix_user_progress_lesson_id ON user_progress (lesson_id);

-- XP Transactions
CREATE TABLE IF NOT EXISTS xp_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    amount INTEGER NOT NULL,
    reason VARCHAR NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- User Levels
CREATE TABLE IF NOT EXISTS user_levels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    level INTEGER NOT NULL DEFAULT 1,
    total_xp INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- User Streaks
CREATE TABLE IF NOT EXISTS user_streaks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    current_streak INTEGER NOT NULL DEFAULT 0,
    longest_streak INTEGER NOT NULL DEFAULT 0,
    last_activity_date DATE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- User Badges
CREATE TABLE IF NOT EXISTS user_badges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id VARCHAR NOT NULL,
    earned_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, badge_id)
);

-- Leaderboard Entries
CREATE TABLE IF NOT EXISTS leaderboard_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    total_xp INTEGER NOT NULL DEFAULT 0,
    period VARCHAR NOT NULL DEFAULT 'all_time',
    rank INTEGER,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, period)
);

-- Teams (updated with tenant_id)
CREATE TABLE IF NOT EXISTS teams (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR NOT NULL,
    description TEXT,
    manager_id UUID REFERENCES users(id),
    tenant_id UUID REFERENCES tenants(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Team Memberships
CREATE TABLE IF NOT EXISTS team_memberships (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    role VARCHAR NOT NULL DEFAULT 'member',
    joined_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- User Goals
CREATE TABLE IF NOT EXISTS user_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR NOT NULL,
    description TEXT,
    target_date DATE,
    progress INTEGER DEFAULT 0,
    status VARCHAR NOT NULL DEFAULT 'active',
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Team Goals
CREATE TABLE IF NOT EXISTS team_goals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    title VARCHAR NOT NULL,
    description TEXT,
    target_date DATE,
    progress INTEGER DEFAULT 0,
    status VARCHAR NOT NULL DEFAULT 'active',
    created_by_id UUID REFERENCES users(id),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR NOT NULL,
    title VARCHAR NOT NULL,
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Skill Graph (pg0 relational tables with recursive CTE support)
-- Used by Skill Gap Analyzer AI for path finding
-- ============================================================

-- Skills
CREATE TABLE IF NOT EXISTS skills (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR UNIQUE NOT NULL,
    description TEXT,
    category VARCHAR NOT NULL,
    esco_code VARCHAR,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Skill Edges (graph relationships between skills)
CREATE TABLE IF NOT EXISTS skill_edges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    from_skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    to_skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    edge_type VARCHAR NOT NULL,
    weight FLOAT DEFAULT 1.0,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_skill_edges_from ON skill_edges (from_skill_id);
CREATE INDEX IF NOT EXISTS ix_skill_edges_to ON skill_edges (to_skill_id);

-- User Skill Progress
CREATE TABLE IF NOT EXISTS user_skill_progress (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_name VARCHAR NOT NULL,
    proficiency_level FLOAT NOT NULL,
    evidence_type VARCHAR NOT NULL,
    confidence_interval JSONB,
    last_assessed TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Skill Gaps
CREATE TABLE IF NOT EXISTS skill_gaps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    severity_score FLOAT NOT NULL,
    blocking_power FLOAT NOT NULL,
    estimated_hours_to_close FLOAT NOT NULL,
    status VARCHAR NOT NULL DEFAULT 'active',
    shap_explanation JSONB,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMP
);

-- Assessment Items (CAT Question Bank)
CREATE TABLE IF NOT EXISTS assessment_items (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    type VARCHAR NOT NULL,
    options JSONB NOT NULL,
    correct_answer VARCHAR NOT NULL,
    irt_difficulty FLOAT NOT NULL,
    irt_discrimination FLOAT NOT NULL,
    irt_guessing FLOAT NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Assessment Attempts (CAT)
CREATE TABLE IF NOT EXISTS assessment_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    skill_id UUID NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
    theta_estimate FLOAT NOT NULL,
    standard_error FLOAT NOT NULL,
    questions_used INTEGER NOT NULL,
    completed_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ============================================================
-- Hindsight Memory Tables (pgvector-backed)
-- Used by AGNO agents for long-term memory (retain, recall, reflect)
-- ============================================================

-- Agent Memories (vector embeddings for Hindsight)
CREATE TABLE IF NOT EXISTS agent_memories (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID,
    agent_type VARCHAR NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS ix_agent_memories_user ON agent_memories (user_id);
CREATE INDEX IF NOT EXISTS ix_agent_memories_agent ON agent_memories (agent_type);

-- Content Chunks (vector embeddings for content search)
CREATE TABLE IF NOT EXISTS content_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    source_id UUID NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    embedding vector(1536),
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);
