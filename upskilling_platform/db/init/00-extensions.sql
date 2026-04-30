-- Enable required PostgreSQL extensions
-- pgvector: Vector similarity search for AI/agent memory (Hindsight)
CREATE EXTENSION IF NOT EXISTS vector;

-- uuid-ossp: UUID generation functions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
