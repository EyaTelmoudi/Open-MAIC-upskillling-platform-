from sqlalchemy import create_engine, text
import os

DATABASE_URL = "postgresql+pg8000://upskilling:upskilling_dev_2026@localhost:5433/upskilling_platform"
engine = create_engine(DATABASE_URL)

columns_to_add = [
    ("superadmin_onboarded", "BOOLEAN NOT NULL DEFAULT FALSE"),
    ("superadmin_checklist", "JSONB"),
    ("platform_language", "VARCHAR(20) NOT NULL DEFAULT 'en'"),
    ("jwt_expiry_minutes", "INTEGER NOT NULL DEFAULT 60"),
    ("session_timeout_hours", "INTEGER NOT NULL DEFAULT 24"),
    ("rate_limit_rpm", "INTEGER NOT NULL DEFAULT 60"),
    ("groq_api_key", "VARCHAR(512)"),
    ("demo_mode", "BOOLEAN NOT NULL DEFAULT TRUE"),
    ("agent_toggles", "JSONB"),
    ("email_templates", "JSONB"),
    ("smtp_config", "JSONB"),
    ("entra_client_id", "VARCHAR(255)"),
    ("entra_client_secret", "VARCHAR(512)"),
    ("entra_tenant_id", "VARCHAR(255)"),
]

with engine.connect() as conn:
    # Add columns to system_config
    for col_name, col_type in columns_to_add:
        try:
            conn.execute(text(f"ALTER TABLE system_config ADD COLUMN {col_name} {col_type}"))
            conn.commit()
            print(f"Added column to system_config: {col_name}")
        except Exception as e:
            conn.rollback()
            if "already exists" in str(e):
                print(f"Column already exists in system_config: {col_name}")
            else:
                print(f"Error adding {col_name} to system_config: {e}")

    # Add columns to users
    users_columns = [
        ("invitation_token", "VARCHAR(64)"),
        ("invitation_expires_at", "TIMESTAMP"),
    ]
    for col_name, col_type in users_columns:
        try:
            conn.execute(text(f"ALTER TABLE users ADD COLUMN {col_name} {col_type}"))
            conn.commit()
            print(f"Added column to users: {col_name}")
        except Exception as e:
            conn.rollback()
            if "already exists" in str(e):
                print(f"Column already exists in users: {col_name}")
            else:
                print(f"Error adding {col_name} to users: {e}")

    # Add columns to tenants
    tenant_columns = [
        ("email_domain", "VARCHAR(255)"),
        ("entra_client_id", "VARCHAR(255)"),
        ("entra_tenant_id", "VARCHAR(255)"),
        ("entra_redirect_uris", "JSON"),
        ("seat_limit", "INTEGER"),
    ]
    for col_name, col_type in tenant_columns:
        try:
            conn.execute(text(f"ALTER TABLE tenants ADD COLUMN {col_name} {col_type}"))
            conn.commit()
            print(f"Added column to tenants: {col_name}")
        except Exception as e:
            conn.rollback()
            if "already exists" in str(e):
                print(f"Column already exists in tenants: {col_name}")
            else:
                print(f"Error adding {col_name} to tenants: {e}")

print("Migration complete!")
