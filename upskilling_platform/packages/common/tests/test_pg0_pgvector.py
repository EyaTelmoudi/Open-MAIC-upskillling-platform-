"""Tests for pg0 + pgvector database setup (DT-1.1.3).

These tests verify the PostgreSQL + pgvector setup works correctly.
- If pg0-embedded is available (Linux/CI), it uses pg0 for isolated testing.
- If Docker PostgreSQL is available, it falls back to the Docker instance.
- If neither is available, tests are skipped.
"""

import os

import pytest
from sqlalchemy import create_engine, text


def _get_pg0():
    """Try to import pg0 and start an instance. Returns (uri, pg0_instance) or (None, None)."""
    try:
        from pg0 import Pg0

        pg = Pg0()
        pg.start()
        return pg.uri, pg
    except Exception:
        return None, None


def _get_docker_pg_uri():
    """Return the Docker PostgreSQL URI from environment or default."""
    return os.getenv(
        "DATABASE_URL",
        "postgresql+pg8000://upskilling:upskilling_dev_2026@localhost:5433/upskilling_platform",
    )


def _can_connect(uri):
    """Check if we can connect to the given PostgreSQL URI."""
    try:
        eng = create_engine(uri, pool_pre_ping=True)
        with eng.connect() as conn:
            conn.execute(text("SELECT 1"))
        eng.dispose()
        return True
    except Exception:
        return False


# Determine available PostgreSQL backend
_PG0_URI, _PG0_INSTANCE = _get_pg0()
_DOCKER_URI = _get_docker_pg_uri()
_DOCKER_AVAILABLE = _PG0_URI is None and _can_connect(_DOCKER_URI)


@pytest.fixture(scope="module")
def pg_uri():
    """Provide a PostgreSQL URI from pg0 or Docker."""
    if _PG0_URI:
        yield _PG0_URI
    elif _DOCKER_AVAILABLE:
        yield _DOCKER_URI
    else:
        pytest.skip("No PostgreSQL backend available (pg0 or Docker)")


@pytest.fixture(scope="module")
def db_engine(pg_uri):
    """Create a SQLAlchemy engine connected to the test database."""
    engine = create_engine(pg_uri, pool_pre_ping=True)
    yield engine
    engine.dispose()


@pytest.fixture(scope="module")
def initialized_engine(db_engine):
    """Enable pgvector and uuid-ossp extensions."""
    with db_engine.connect() as conn:
        conn.execute(text("CREATE EXTENSION IF NOT EXISTS vector"))
        conn.execute(text('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"'))
        conn.commit()
    yield db_engine


class TestPgvectorExtension:
    """Test pgvector extension is available and functional."""

    def test_pgvector_extension_creates(self, initialized_engine):
        with initialized_engine.connect() as conn:
            result = conn.execute(
                text("SELECT extname FROM pg_extension WHERE extname = 'vector'")
            )
            assert result.fetchone() is not None

    def test_uuid_ossp_extension_creates(self, initialized_engine):
        with initialized_engine.connect() as conn:
            result = conn.execute(
                text("SELECT extname FROM pg_extension WHERE extname = 'uuid-ossp'")
            )
            assert result.fetchone() is not None

    def test_vector_column_works(self, initialized_engine):
        with initialized_engine.connect() as conn:
            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS test_vectors "
                    "(id serial PRIMARY KEY, embedding vector(3))"
                )
            )
            conn.execute(
                text("INSERT INTO test_vectors (embedding) VALUES ('[1,2,3]')")
            )
            result = conn.execute(
                text("SELECT embedding FROM test_vectors WHERE id = 1")
            )
            row = result.fetchone()
            assert row is not None
            conn.execute(text("DROP TABLE test_vectors"))
            conn.commit()

    def test_vector_similarity_search(self, initialized_engine):
        with initialized_engine.connect() as conn:
            conn.execute(
                text(
                    "CREATE TABLE IF NOT EXISTS test_similarity "
                    "(id serial PRIMARY KEY, embedding vector(3))"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO test_similarity (embedding) VALUES "
                    "('[1,0,0]'), ('[0,1,0]'), ('[0,0,1]')"
                )
            )
            result = conn.execute(
                text(
                    "SELECT id FROM test_similarity "
                    "ORDER BY embedding <-> '[1,0,0]' LIMIT 1"
                )
            )
            row = result.fetchone()
            assert row is not None
            assert row[0] == 1
            conn.execute(text("DROP TABLE test_similarity"))
            conn.commit()


class TestSchemaCreation:
    """Test that the initial schema can be created."""

    SCHEMA_SQL = """
    CREATE TABLE IF NOT EXISTS test_schema_users (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        email VARCHAR UNIQUE NOT NULL,
        password_hash VARCHAR,
        auth_provider VARCHAR NOT NULL,
        first_name VARCHAR NOT NULL,
        last_name VARCHAR NOT NULL,
        role VARCHAR NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'pending',
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS test_schema_skills (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        name VARCHAR UNIQUE NOT NULL,
        category VARCHAR NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS test_schema_skill_edges (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        from_skill_id UUID NOT NULL REFERENCES test_schema_skills(id) ON DELETE CASCADE,
        to_skill_id UUID NOT NULL REFERENCES test_schema_skills(id) ON DELETE CASCADE,
        edge_type VARCHAR NOT NULL,
        weight FLOAT DEFAULT 1.0,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS test_schema_agent_memories (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID,
        agent_type VARCHAR NOT NULL,
        content TEXT NOT NULL,
        embedding vector(1536),
        metadata JSONB DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    """

    DROP_SQL = """
    DROP TABLE IF EXISTS test_schema_agent_memories;
    DROP TABLE IF EXISTS test_schema_skill_edges;
    DROP TABLE IF EXISTS test_schema_skills;
    DROP TABLE IF EXISTS test_schema_users;
    """

    @pytest.fixture(autouse=True)
    def cleanup_tables(self, initialized_engine):
        """Clean up test tables before and after each test."""
        with initialized_engine.connect() as conn:
            conn.execute(text(self.DROP_SQL))
            conn.commit()
        yield
        with initialized_engine.connect() as conn:
            conn.execute(text(self.DROP_SQL))
            conn.commit()

    def test_schema_creates_without_error(self, initialized_engine):
        with initialized_engine.connect() as conn:
            conn.execute(text(self.SCHEMA_SQL))
            conn.commit()

    def test_users_table_exists(self, initialized_engine):
        with initialized_engine.connect() as conn:
            conn.execute(text(self.SCHEMA_SQL))
            conn.commit()
            result = conn.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_name = 'test_schema_users' AND table_schema = 'public'"
                )
            )
            assert result.fetchone() is not None

    def test_skills_table_exists(self, initialized_engine):
        with initialized_engine.connect() as conn:
            conn.execute(text(self.SCHEMA_SQL))
            conn.commit()
            result = conn.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_name = 'test_schema_skills' AND table_schema = 'public'"
                )
            )
            assert result.fetchone() is not None

    def test_skill_edges_table_exists(self, initialized_engine):
        with initialized_engine.connect() as conn:
            conn.execute(text(self.SCHEMA_SQL))
            conn.commit()
            result = conn.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_name = 'test_schema_skill_edges' AND table_schema = 'public'"
                )
            )
            assert result.fetchone() is not None

    def test_agent_memories_table_exists(self, initialized_engine):
        with initialized_engine.connect() as conn:
            conn.execute(text(self.SCHEMA_SQL))
            conn.commit()
            result = conn.execute(
                text(
                    "SELECT table_name FROM information_schema.tables "
                    "WHERE table_name = 'test_schema_agent_memories' AND table_schema = 'public'"
                )
            )
            assert result.fetchone() is not None

    def test_insert_user(self, initialized_engine):
        with initialized_engine.connect() as conn:
            conn.execute(text(self.SCHEMA_SQL))
            conn.execute(
                text(
                    "INSERT INTO test_schema_users (email, auth_provider, first_name, last_name, role, status) "
                    "VALUES ('test@example.com', 'local', 'Test', 'User', 'TeamMember', 'active')"
                )
            )
            conn.commit()
            result = conn.execute(
                text(
                    "SELECT email, first_name FROM test_schema_users WHERE email = 'test@example.com'"
                )
            )
            row = result.fetchone()
            assert row is not None
            assert row[0] == "test@example.com"
            assert row[1] == "Test"

    def test_insert_skill_with_edge(self, initialized_engine):
        with initialized_engine.connect() as conn:
            conn.execute(text(self.SCHEMA_SQL))
            conn.execute(
                text(
                    "INSERT INTO test_schema_skills (name, category) VALUES ('Python', 'programming')"
                )
            )
            conn.execute(
                text(
                    "INSERT INTO test_schema_skills (name, category) VALUES ('FastAPI', 'frameworks')"
                )
            )
            conn.commit()

            result = conn.execute(
                text("SELECT id FROM test_schema_skills WHERE name = 'Python'")
            )
            python_id = result.fetchone()[0]
            result = conn.execute(
                text("SELECT id FROM test_schema_skills WHERE name = 'FastAPI'")
            )
            fastapi_id = result.fetchone()[0]

            conn.execute(
                text(
                    "INSERT INTO test_schema_skill_edges (from_skill_id, to_skill_id, edge_type) "
                    "VALUES (:from_id, :to_id, 'prerequisite')"
                ),
                {"from_id": str(python_id), "to_id": str(fastapi_id)},
            )
            conn.commit()

            result = conn.execute(text("SELECT COUNT(*) FROM test_schema_skill_edges"))
            assert result.scalar() >= 1

    def test_insert_agent_memory_with_vector(self, initialized_engine):
        with initialized_engine.connect() as conn:
            conn.execute(text(self.SCHEMA_SQL))
            # Build a 1536-dim vector matching agent_memories.embedding
            vec = "[" + ",".join(["0.1"] * 1536) + "]"
            conn.execute(
                text(
                    "INSERT INTO test_schema_agent_memories "
                    "(agent_type, content, embedding) VALUES "
                    f"('chat_coach', 'User struggled with async/await', '{vec}'::vector)"
                )
            )
            conn.commit()
            result = conn.execute(
                text(
                    "SELECT content FROM test_schema_agent_memories "
                    "WHERE agent_type = 'chat_coach'"
                )
            )
            row = result.fetchone()
            assert row is not None
            assert "async/await" in row[0]


class TestDatabaseModuleHelpers:
    """Test the helper functions in common.database."""

    def test_create_test_engine(self, pg_uri):
        from common.database import create_test_engine

        if _PG0_INSTANCE:
            engine, session_factory = create_test_engine(_PG0_INSTANCE)
            assert engine is not None
            assert session_factory is not None
            with engine.connect() as conn:
                result = conn.execute(text("SELECT 1"))
                assert result.scalar() == 1
            engine.dispose()
        else:
            pytest.skip("pg0 not available for create_test_engine test")

    def test_init_pgvector(self, db_engine):
        from common.database import init_pgvector

        init_pgvector(db_engine)
        with db_engine.connect() as conn:
            result = conn.execute(
                text("SELECT extname FROM pg_extension WHERE extname = 'vector'")
            )
            assert result.fetchone() is not None
