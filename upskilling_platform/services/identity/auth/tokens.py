"""Token utilities for the Identity Service."""

import secrets
from datetime import datetime, timedelta
from typing import Optional


def generate_secure_token(length: int = 32) -> str:
    """Generate a secure one-time token.
    
    Args:
        length: Length of the token.
        
    Returns:
        Secure URL-safe token.
    """
    return secrets.token_urlsafe(length)


def get_token_expiry(hours: int = 168) -> datetime:
    """Get expiry time for a token (default 7 days).
    
    Args:
        hours: Hours until token expires.
        
    Returns:
        Datetime object for token expiry.
    """
    return datetime.utcnow() + timedelta(hours=hours)


def is_token_expired(expiry: Optional[datetime]) -> bool:
    """Check if a token is expired.
    
    Args:
        expiry: The expiry datetime to check.
        
    Returns:
        True if expired, False otherwise.
    """
    if not expiry:
        return True
    return datetime.utcnow() > expiry
