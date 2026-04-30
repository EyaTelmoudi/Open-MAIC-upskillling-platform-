-- Migration: Add certificates table
-- Add certificates table for course completion certificates

CREATE TABLE IF NOT EXISTS certificates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    certificate_number VARCHAR(50) NOT NULL UNIQUE,
    user_id UUID NOT NULL REFERENCES users(id),
    course_id UUID NOT NULL REFERENCES courses(id),
    enrollment_id UUID NOT NULL REFERENCES enrollments(id),
    learner_name VARCHAR(255) NOT NULL,
    course_title VARCHAR(500) NOT NULL,
    course_version VARCHAR(100),
    issuing_org VARCHAR(255),
    issued_at TIMESTAMP NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMP,
    content_hash VARCHAR(255) NOT NULL,
    signature VARCHAR(255) NOT NULL,
    pdf_url TEXT,
    is_revoked BOOLEAN DEFAULT FALSE,
    revoked_at TIMESTAMP,
    revoked_reason TEXT,
    created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_certificates_user_id ON certificates(user_id);
CREATE INDEX IF NOT EXISTS ix_certificates_course_id ON certificates(course_id);
CREATE INDEX IF NOT EXISTS ix_certificates_certificate_number ON certificates(certificate_number);
