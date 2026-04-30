-- Migration 0002: Course enhancements + indexes + constraints
-- Adds xp_reward, rating to courses; unique constraints on enrollments and user_progress; indexes

-- Add xp_reward and rating columns to courses
ALTER TABLE courses ADD COLUMN IF NOT EXISTS xp_reward INTEGER NOT NULL DEFAULT 100;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS rating FLOAT;

-- Add indexes on courses
CREATE INDEX IF NOT EXISTS ix_courses_category ON courses (category);
CREATE INDEX IF NOT EXISTS ix_courses_difficulty ON courses (difficulty);
CREATE INDEX IF NOT EXISTS ix_courses_is_published ON courses (is_published);

-- Add index on modules.course_id
CREATE INDEX IF NOT EXISTS ix_modules_course_id ON modules (course_id);

-- Add index on lessons.module_id
CREATE INDEX IF NOT EXISTS ix_lessons_module_id ON lessons (module_id);

-- Add unique constraint on enrollments (user_id, course_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_enrollment_user_course'
    ) THEN
        ALTER TABLE enrollments ADD CONSTRAINT uq_enrollment_user_course UNIQUE (user_id, course_id);
    END IF;
END $$;

-- Add indexes on enrollments
CREATE INDEX IF NOT EXISTS ix_enrollments_user_id ON enrollments (user_id);
CREATE INDEX IF NOT EXISTS ix_enrollments_course_id ON enrollments (course_id);

-- Add unique constraint on user_progress (user_id, lesson_id)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_progress_user_lesson'
    ) THEN
        ALTER TABLE user_progress ADD CONSTRAINT uq_progress_user_lesson UNIQUE (user_id, lesson_id);
    END IF;
END $$;

-- Add indexes on user_progress
CREATE INDEX IF NOT EXISTS ix_user_progress_user_id ON user_progress (user_id);
CREATE INDEX IF NOT EXISTS ix_user_progress_lesson_id ON user_progress (lesson_id);

-- Record migration
INSERT INTO schema_migrations (version, name)
VALUES ('0002', 'course-enhancements-indexes')
ON CONFLICT (version) DO NOTHING;
