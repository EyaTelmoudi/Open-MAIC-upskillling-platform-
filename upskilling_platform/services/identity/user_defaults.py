"""Shared defaults for user creation in the identity service."""

from sqlalchemy.orm import Session

from common.models import SystemConfig

DEFAULT_USER_TIMEZONE = "Africa/Tunis"


def get_default_user_timezone(db: Session) -> str:
    """Return the platform default timezone for newly created users."""
    config = db.query(SystemConfig).filter(SystemConfig.id == 1).first()
    if config and config.default_timezone:
        return config.default_timezone
    return DEFAULT_USER_TIMEZONE
