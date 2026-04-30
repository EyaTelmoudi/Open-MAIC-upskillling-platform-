"""Database configuration for the Upskilling Platform."""

import os
from contextlib import contextmanager
from typing import Generator, Optional

from sqlalchemy import create_engine, text
from sqlalchemy.orm import Session, sessionmaker

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+pg8000://upskilling:upskilling_dev_2026@localhost:5433/upskilling_platform",
)

engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=10, max_overflow=20)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """FastAPI dependency that yields a database session."""
    db = None
    try:
        db = SessionLocal()
        yield db
    except Exception:
        if db:
            db.close()
        raise
    finally:
        if db:
            db.close()


_tenant_context: Optional[str] = None


def set_tenant_context(tenant_id: Optional[str]) -> None:
    """Set the tenant context for the current request.

    Args:
        tenant_id: The tenant UUID or None for SuperAdmin (all tenants).
    """
    global _tenant_context
    _tenant_context = tenant_id


def get_tenant_context() -> Optional[str]:
    """Get the current tenant context.

    Returns:
        The tenant UUID or None for SuperAdmin.
    """
    return _tenant_context


def clear_tenant_context() -> None:
    """Clear the tenant context after request completes."""
    global _tenant_context
    _tenant_context = None


@contextmanager
def tenant_session(tenant_id: Optional[str]) -> Generator[Session, None, None]:
    """Context manager that sets tenant context for a query.

    Args:
        tenant_id: The tenant UUID or None for SuperAdmin (all tenants).

    Yields:
        Database session with tenant context set.
    """
    global _tenant_context
    previous_context = _tenant_context
    _tenant_context = tenant_id
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
        _tenant_context = previous_context


def apply_tenant_filter(db: Session, model_class, tenant_id: Optional[str]) -> None:
    """Apply tenant filter to a query based on current tenant context.

    Args:
        db: SQLAlchemy session.
        model_class: Model class to filter.
        tenant_id: Override tenant ID (uses global context if None).
    """
    tid = tenant_id or get_tenant_context()
    if tid is None:
        return

    if hasattr(model_class, "tenant_id"):
        from sqlalchemy import and_

        return and_(model_class.tenant_id == tid)


def create_test_engine(pg0_instance):
    """Create a SQLAlchemy engine backed by a pg0 embedded PostgreSQL instance.

    Args:
        pg0_instance: A started pg0.Pg0() instance.

    Returns:
        Tuple of (engine, sessionmaker) connected to the pg0 database.
    """
    test_engine = create_engine(pg0_instance.uri, pool_pre_ping=True)
    test_session = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    return test_engine, test_session


def init_pgvector(engine):
    """Enable pgvector extension on the given engine.

    Args:
        engine: SQLAlchemy engine connected to a PostgreSQL database.
    """
    with engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
        conn.commit()
