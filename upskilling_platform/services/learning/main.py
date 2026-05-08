"""Learning Platform Service — Course management, enrollment, progress tracking."""

import os
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text

from common.database import engine
from common.database import SessionLocal
from common.models import (
    AICourseDraft,
    Base,
    CertificateVerificationAudit,
    LearnerCourseContext,
    Skill,
    SkillEdge,
)
from common.storage import ensure_buckets

from services.learning.routers import (
    courses,
    ai_course_drafts,
    enrollment,
    lessons,
    modules,
    progress,
    assignments,
    assessments,
    preview,
    reviews,
    skill_gap,
    bookmark,
    upload,
    certificates,
    gamification,
    goals,
    teams,
)

SERVICE_PORT = os.getenv("LEARNING_SERVICE_PORT", "8002")

app = FastAPI(title="Learning Platform Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:3001",
        "http://127.0.0.1:3001",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(courses.router, prefix="/api/v1")
app.include_router(ai_course_drafts.router, prefix="/api/v1")
app.include_router(modules.router, prefix="/api/v1")
app.include_router(lessons.router, prefix="/api/v1")
app.include_router(enrollment.router, prefix="/api/v1")
app.include_router(progress.router, prefix="/api/v1")
app.include_router(assignments.router, prefix="/api/v1")
app.include_router(assessments.router, prefix="/api/v1")
app.include_router(preview.router, prefix="/api/v1")
app.include_router(reviews.router, prefix="/api/v1")
app.include_router(skill_gap.router, prefix="/api/v1")
app.include_router(bookmark.router, prefix="/api/v1")
app.include_router(upload.router, prefix="/api/v1")
app.include_router(certificates.router, prefix="/api/v1")
app.include_router(certificates.public_router, prefix="/api/v1")
app.include_router(certificates.admin_router, prefix="/api/v1")
app.include_router(gamification.router, prefix="/api/v1")
app.include_router(goals.router, prefix="/api/v1")
app.include_router(teams.router, prefix="/api/v1")


@app.on_event("startup")
async def initialize_storage() -> None:
    ensure_buckets()
    Base.metadata.create_all(
        bind=engine,
        tables=[
            AICourseDraft.__table__,
            LearnerCourseContext.__table__,
            Skill.__table__,
            SkillEdge.__table__,
            CertificateVerificationAudit.__table__,
        ],
    )
    with engine.begin() as connection:
        connection.execute(
            text("ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS target_count INTEGER NOT NULL DEFAULT 1")
        )
        connection.execute(
            text("ALTER TABLE user_goals ADD COLUMN IF NOT EXISTS xp_reward INTEGER NOT NULL DEFAULT 0")
        )
        connection.execute(
            text("ALTER TABLE team_goals ADD COLUMN IF NOT EXISTS target_count INTEGER NOT NULL DEFAULT 1")
        )
        connection.execute(
            text("ALTER TABLE team_goals ADD COLUMN IF NOT EXISTS xp_reward INTEGER NOT NULL DEFAULT 0")
        )
        connection.execute(
            text("ALTER TABLE certificates ADD COLUMN IF NOT EXISTS grade VARCHAR")
        )
        connection.execute(
            text("ALTER TABLE certificates ADD COLUMN IF NOT EXISTS score DOUBLE PRECISION")
        )
        connection.execute(
            text(
                "ALTER TABLE certificates ADD COLUMN IF NOT EXISTS signature_algorithm VARCHAR NOT NULL DEFAULT 'RS256'"
            )
        )
        connection.execute(
            text("ALTER TABLE certificates ADD COLUMN IF NOT EXISTS payload_json JSONB")
        )
        connection.execute(
            text(
                "ALTER TABLE certificates ADD COLUMN IF NOT EXISTS status VARCHAR NOT NULL DEFAULT 'active'"
            )
        )
        connection.execute(
            text("ALTER TABLE quiz_attempts ADD COLUMN IF NOT EXISTS wrong_answers JSONB")
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS learner_course_contexts (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    user_id UUID NOT NULL REFERENCES users(id),
                    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
                    current_lesson_id UUID NULL REFERENCES lessons(id) ON DELETE SET NULL,
                    last_opened_lesson_id UUID NULL REFERENCES lessons(id) ON DELETE SET NULL,
                    last_completed_lesson_id UUID NULL REFERENCES lessons(id) ON DELETE SET NULL,
                    latest_quiz_score DOUBLE PRECISION NULL,
                    latest_quiz_passed BOOLEAN NULL,
                    latest_failed_quiz_lesson_id UUID NULL REFERENCES lessons(id) ON DELETE SET NULL,
                    failed_quiz_count INTEGER NOT NULL DEFAULT 0,
                    last_quiz_attempted_at TIMESTAMP NULL,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
                    CONSTRAINT uq_learner_context_user_course UNIQUE (user_id, course_id)
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_learner_course_contexts_user_id
                ON learner_course_contexts (user_id)
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_learner_course_contexts_course_id
                ON learner_course_contexts (course_id)
                """
            )
        )
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.table_constraints
                        WHERE constraint_name = 'learner_course_contexts_course_id_fkey'
                          AND table_name = 'learner_course_contexts'
                    ) THEN
                        ALTER TABLE learner_course_contexts
                        DROP CONSTRAINT learner_course_contexts_course_id_fkey;
                    END IF;
                EXCEPTION
                    WHEN undefined_object THEN NULL;
                END $$;
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE learner_course_contexts
                ADD CONSTRAINT learner_course_contexts_course_id_fkey
                FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
                """
            ).execution_options(autocommit=True)
        )
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.table_constraints
                        WHERE constraint_name = 'learner_course_contexts_current_lesson_id_fkey'
                          AND table_name = 'learner_course_contexts'
                    ) THEN
                        ALTER TABLE learner_course_contexts
                        DROP CONSTRAINT learner_course_contexts_current_lesson_id_fkey;
                    END IF;
                EXCEPTION
                    WHEN undefined_object THEN NULL;
                END $$;
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE learner_course_contexts
                ADD CONSTRAINT learner_course_contexts_current_lesson_id_fkey
                FOREIGN KEY (current_lesson_id) REFERENCES lessons(id) ON DELETE SET NULL
                """
            ).execution_options(autocommit=True)
        )
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.table_constraints
                        WHERE constraint_name = 'learner_course_contexts_last_opened_lesson_id_fkey'
                          AND table_name = 'learner_course_contexts'
                    ) THEN
                        ALTER TABLE learner_course_contexts
                        DROP CONSTRAINT learner_course_contexts_last_opened_lesson_id_fkey;
                    END IF;
                EXCEPTION
                    WHEN undefined_object THEN NULL;
                END $$;
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE learner_course_contexts
                ADD CONSTRAINT learner_course_contexts_last_opened_lesson_id_fkey
                FOREIGN KEY (last_opened_lesson_id) REFERENCES lessons(id) ON DELETE SET NULL
                """
            ).execution_options(autocommit=True)
        )
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.table_constraints
                        WHERE constraint_name = 'learner_course_contexts_last_completed_lesson_id_fkey'
                          AND table_name = 'learner_course_contexts'
                    ) THEN
                        ALTER TABLE learner_course_contexts
                        DROP CONSTRAINT learner_course_contexts_last_completed_lesson_id_fkey;
                    END IF;
                EXCEPTION
                    WHEN undefined_object THEN NULL;
                END $$;
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE learner_course_contexts
                ADD CONSTRAINT learner_course_contexts_last_completed_lesson_id_fkey
                FOREIGN KEY (last_completed_lesson_id) REFERENCES lessons(id) ON DELETE SET NULL
                """
            ).execution_options(autocommit=True)
        )
        connection.execute(
            text(
                """
                DO $$
                BEGIN
                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.table_constraints
                        WHERE constraint_name = 'learner_course_contexts_latest_failed_quiz_lesson_id_fkey'
                          AND table_name = 'learner_course_contexts'
                    ) THEN
                        ALTER TABLE learner_course_contexts
                        DROP CONSTRAINT learner_course_contexts_latest_failed_quiz_lesson_id_fkey;
                    END IF;
                EXCEPTION
                    WHEN undefined_object THEN NULL;
                END $$;
                """
            )
        )
        connection.execute(
            text(
                """
                ALTER TABLE learner_course_contexts
                ADD CONSTRAINT learner_course_contexts_latest_failed_quiz_lesson_id_fkey
                FOREIGN KEY (latest_failed_quiz_lesson_id) REFERENCES lessons(id) ON DELETE SET NULL
                """
            ).execution_options(autocommit=True)
        )
        connection.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS certificate_verification_audits (
                    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
                    certificate_id UUID NULL REFERENCES certificates(id),
                    certificate_id_raw VARCHAR NOT NULL,
                    result VARCHAR(30) NOT NULL,
                    ip_address VARCHAR(45),
                    user_agent VARCHAR(500),
                    message TEXT,
                    created_at TIMESTAMP NOT NULL DEFAULT NOW()
                )
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_certificate_verification_audits_certificate_id
                ON certificate_verification_audits (certificate_id)
                """
            )
        )
        connection.execute(
            text(
                """
                CREATE INDEX IF NOT EXISTS ix_certificate_verification_audits_created_at
                ON certificate_verification_audits (created_at)
                """
            )
        )
    from services.learning.analytics.skill_gap import seed_default_skill_graph

    db = SessionLocal()
    try:
        seed_default_skill_graph(db)
    finally:
        db.close()


@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "learning", "port": SERVICE_PORT}


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(SERVICE_PORT))
