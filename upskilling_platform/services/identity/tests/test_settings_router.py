"""Tests for platform settings router."""

import asyncio
from types import SimpleNamespace

from services.identity.routers.settings import (
    DEFAULT_SECURITY_SETTINGS,
    get_all_settings,
    update_security_settings,
)
from services.identity.schemas.checklist import SecuritySettings


def test_get_all_settings_returns_default_security_policy(mock_db):
    """Security settings should expose safe defaults when unset."""
    config = SimpleNamespace(
        id=1,
        group_name="3S Group",
        platform_name="SkillForge",
        group_website="https://www.3s.com.tn/",
        platform_logo_url=None,
        platform_language="en",
        default_timezone="Africa/Tunis",
        support_email=None,
        smtp_config={},
        email_templates={},
        groq_api_key=None,
        demo_mode=True,
        agent_toggles={},
        superadmin_onboarded=False,
        setup_completed=True,
    )
    mock_db.first.return_value = config

    result = asyncio.run(
        get_all_settings(
            db=mock_db,
            current_user={"sub": "super-admin", "role": "SuperAdmin"},
        )
    )

    assert result["security"] == DEFAULT_SECURITY_SETTINGS


def test_update_security_settings_persists_policy_under_smtp_config(mock_db):
    """Security policy should be stored without overwriting SMTP settings."""
    config = SimpleNamespace(
        id=1,
        smtp_config={"host": "smtp.example.com", "port": 587},
    )
    mock_db.first.return_value = config

    result = asyncio.run(
        update_security_settings(
            request=None,
            settings=SecuritySettings(
                mfa_required_for_superadmin=True,
                mfa_required_for_tenant_admins=False,
                security_alerts={
                    "failed_login_spikes": True,
                    "admin_account_changes": True,
                    "password_reset_events": False,
                    "tenant_status_changes": True,
                },
            ),
            db=mock_db,
            current_user={"sub": "super-admin", "email": "platform.admin@test.com"},
        )
    )

    assert config.smtp_config["host"] == "smtp.example.com"
    assert config.smtp_config["security"]["mfa_required_for_superadmin"] is True
    assert config.smtp_config["security"]["mfa_required_for_tenant_admins"] is False
    assert (
        config.smtp_config["security"]["security_alerts"]["password_reset_events"]
        is False
    )
    assert result["security"]["mfa_required_for_tenant_admins"] is False
    mock_db.commit.assert_called()
