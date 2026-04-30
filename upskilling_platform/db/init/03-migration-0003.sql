-- Migration 0003: Course reviews table
-- Adds course_reviews table for ratings and reviews

-- Create course_reviews table
CREATE TABLE IF NOT EXISTS course_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
    review_text TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add indexes
CREATE INDEX IF NOT EXISTS ix_course_reviews_course_id ON course_reviews (course_id);
CREATE INDEX IF NOT EXISTS ix_course_reviews_user_id ON course_reviews (user_id);

-- Add unique constraint - one review per user per course
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_review_user_course'
    ) THEN
        ALTER TABLE course_reviews ADD CONSTRAINT uq_review_user_course UNIQUE (user_id, course_id);
    END IF;
END $$;

-- Record migration
INSERT INTO schema_migrations (version, name)
VALUES ('0003', 'course-reviews')
ON CONFLICT (version) DO NOTHING;
