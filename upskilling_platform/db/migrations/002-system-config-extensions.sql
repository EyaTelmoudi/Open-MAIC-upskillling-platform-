-- System configuration extensions for Super Admin features
-- GT-1.18.1: Superadmin fields migration

ALTER TABLE system_config ADD COLUMN IF NOT EXISTS superadmin_onboarded BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS superadmin_checklist JSONB;
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS platform_language VARCHAR(20) NOT NULL DEFAULT 'en';
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS jwt_expiry_minutes INTEGER NOT NULL DEFAULT 60;
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS session_timeout_hours INTEGER NOT NULL DEFAULT 24;
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS rate_limit_rpm INTEGER NOT NULL DEFAULT 60;
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS groq_api_key VARCHAR(512);
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS demo_mode BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS agent_toggles JSONB;
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS email_templates JSONB;
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS smtp_config JSONB;
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS entra_client_id VARCHAR(255);
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS entra_client_secret VARCHAR(512);
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS entra_tenant_id VARCHAR(255);
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS group_name VARCHAR(255);
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS group_website VARCHAR(512);
ALTER TABLE system_config ADD COLUMN IF NOT EXISTS group_primary_color VARCHAR(7);

COMMENT ON COLUMN system_config.superadmin_onboarded IS 'Whether Super Admin has completed first-login onboarding';
COMMENT ON COLUMN system_config.superadmin_checklist IS 'JSONB storing Super Admin checklist state';
COMMENT ON COLUMN system_config.platform_language IS 'Default platform language (en, fr, ar)';
COMMENT ON COLUMN system_config.jwt_expiry_minutes IS 'JWT access token expiry in minutes';
COMMENT ON COLUMN system_config.session_timeout_hours IS 'Session timeout in hours';
COMMENT ON COLUMN system_config.rate_limit_rpm IS 'API rate limit requests per minute';
COMMENT ON COLUMN system_config.groq_api_key IS 'GROQ API key for AI features';
COMMENT ON COLUMN system_config.demo_mode IS 'Enable demo mode for AI features';
COMMENT ON COLUMN system_config.agent_toggles IS 'JSONB toggles for individual AI agents';
COMMENT ON COLUMN system_config.email_templates IS 'JSONB email templates configuration';
COMMENT ON COLUMN system_config.smtp_config IS 'JSONB SMTP server configuration';
COMMENT ON COLUMN system_config.entra_client_id IS 'Azure Entra ID client ID for platform';
COMMENT ON COLUMN system_config.entra_client_secret IS 'Azure Entra ID client secret';
COMMENT ON COLUMN system_config.entra_tenant_id IS 'Azure Entra ID tenant ID';
COMMENT ON COLUMN system_config.group_name IS 'Parent organization/group name (e.g., 3S Group)';
COMMENT ON COLUMN system_config.group_website IS 'Parent organization website URL';
COMMENT ON COLUMN system_config.group_primary_color IS 'Parent organization primary color (hex)';