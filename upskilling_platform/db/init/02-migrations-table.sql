-- Migration tracking table
CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR PRIMARY KEY,
    name VARCHAR NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Record initial schema as migration
INSERT INTO schema_migrations (version, name)
VALUES ('0001', 'initial-schema')
ON CONFLICT (version) DO NOTHING;
