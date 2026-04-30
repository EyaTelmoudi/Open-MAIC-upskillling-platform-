from sqlalchemy import create_engine, text

engine = create_engine(
    "postgresql+pg8000://upskilling:upskilling_dev_2026@localhost:5433/upskilling_platform"
)

with engine.connect() as conn:
    # Drop and recreate system_config with full schema
    conn.execute(text("DROP TABLE IF EXISTS system_config"))
    conn.commit()

    conn.execute(
        text("""
        CREATE TABLE system_config (
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
            superadmin_onboarded BOOLEAN NOT NULL DEFAULT FALSE,
            superadmin_checklist JSONB,
            platform_language VARCHAR(20) NOT NULL DEFAULT 'en',
            jwt_expiry_minutes INTEGER NOT NULL DEFAULT 60,
            session_timeout_hours INTEGER NOT NULL DEFAULT 24,
            rate_limit_rpm INTEGER NOT NULL DEFAULT 60,
            groq_api_key VARCHAR(512),
            demo_mode BOOLEAN NOT NULL DEFAULT TRUE,
            agent_toggles JSONB,
            email_templates JSONB,
            smtp_config JSONB,
            entra_client_id VARCHAR(255),
            entra_client_secret VARCHAR(512),
            entra_tenant_id VARCHAR(255),
            created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
        )
    """)
    )
    conn.commit()

    conn.execute(
        text("""
        INSERT INTO system_config (id, setup_completed, platform_name, default_timezone)
        VALUES (1, FALSE, 'SkillForge', 'Africa/Tunis')
    """)
    )
    conn.commit()
    print("Recreated system_config table")

print("Done - restart the identity service")
