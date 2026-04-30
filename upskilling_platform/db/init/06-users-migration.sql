-- Migration: Add missing columns to users table
-- Added: onboarded, timezone, last_login, entra_* fields

ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarded BOOLEAN DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS timezone VARCHAR(100) DEFAULT 'Africa/Tunis';
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login TIMESTAMP;

-- Azure Entra ID fields
ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_oid VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_upn VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_mail VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_given_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_surname VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_display_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_job_title VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_department VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_company_name VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS entra_location VARCHAR(255);
ALTER TABLE users ADD COLUMN IF NOT EXISTS last_entra_sync TIMESTAMP;

CREATE INDEX IF NOT EXISTS ix_users_onboarded ON users (onboarded);
CREATE INDEX IF NOT EXISTS ix_users_last_login ON users (last_login);