-- System configuration table for platform first-run setup
-- GT-1.0.1: Platform First-Run Setup

CREATE TABLE IF NOT EXISTS system_config (
    id INTEGER PRIMARY KEY DEFAULT 1,
    setup_completed BOOLEAN NOT NULL DEFAULT FALSE,
    setup_completed_at TIMESTAMP WITH TIME ZONE,
    platform_name VARCHAR(255) NOT NULL DEFAULT 'SkillForge',
    platform_logo_url VARCHAR(512),
    default_timezone VARCHAR(100) NOT NULL DEFAULT 'Africa/Tunis',
    support_email VARCHAR(255),
    setup_ip_address VARCHAR(45),
    group_name VARCHAR(255),
    group_website VARCHAR(512),
    group_primary_color VARCHAR(7),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Insert initial row (will fail if exists, which is fine)
INSERT INTO system_config (id, setup_completed, platform_name, default_timezone)
VALUES (1, FALSE, 'SkillForge', 'Africa/Tunis')
ON CONFLICT (id) DO NOTHING;

COMMENT ON TABLE system_config IS 'Platform configuration for first-run setup wizard';
COMMENT ON COLUMN system_config.setup_completed IS 'Whether platform setup wizard has been completed';
COMMENT ON COLUMN system_config.setup_completed_at IS 'Timestamp when setup was completed';
COMMENT ON COLUMN system_config.platform_name IS 'Name of the platform shown to users';
COMMENT ON COLUMN system_config.platform_logo_url IS 'URL to the platform logo';
COMMENT ON COLUMN system_config.default_timezone IS 'Default timezone for new users';
COMMENT ON COLUMN system_config.support_email IS 'Support email address';
COMMENT ON COLUMN system_config.setup_ip_address IS 'IP address authorized to complete setup (NULL = any)';
COMMENT ON COLUMN system_config.group_name IS 'Parent organization/group name (e.g., 3S Group)';
COMMENT ON COLUMN system_config.group_website IS 'Parent organization website URL';
COMMENT ON COLUMN system_config.group_primary_color IS 'Parent organization primary color (hex)';