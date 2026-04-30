"""Tests for common.database module."""

from common.database import DATABASE_URL, SessionLocal, engine, get_db


class TestDatabase:
    def test_database_url_is_string(self):
        assert isinstance(DATABASE_URL, str)
        assert "postgresql" in DATABASE_URL

    def test_engine_exists(self):
        assert engine is not None

    def test_sessionmaker_exists(self):
        assert SessionLocal is not None

    def test_get_db_is_generator(self):
        import types

        db_gen = get_db()
        assert isinstance(db_gen, types.GeneratorType)
