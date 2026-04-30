-- ============================================================
-- PostgreSQL Row-Level Security (RLS) Policies
-- Multi-tenancy tenant isolation at database level
-- ============================================================

-- Enable RLS on tenants table
ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;

-- Enable RLS on users table
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Enable RLS on courses table
ALTER TABLE courses ENABLE ROW LEVEL SECURITY;

-- Enable RLS on teams table
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;

-- Tenants: Allow tenants to read their own tenant
CREATE POLICY tenant_isolation_tenants ON tenants
    FOR ALL
    USING (
        current_setting('app.tenant_id', true) = id::text
        OR current_setting('app.tenant_id', true) = ''
    );

-- Users: Filter by tenant_id
CREATE POLICY tenant_isolation_users ON users
    FOR ALL
    USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid
        OR current_setting('app.tenant_id', true) = ''
    );

-- Courses: Filter by tenant_id
CREATE POLICY tenant_isolation_courses ON courses
    FOR ALL
    USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid
        OR current_setting('app.tenant_id', true) = ''
    );

-- Teams: Filter by tenant_id
CREATE POLICY tenant_isolation_teams ON teams
    FOR ALL
    USING (
        tenant_id = current_setting('app.tenant_id', true)::uuid
        OR current_setting('app.tenant_id', true) = ''
    );

-- ============================================================
-- Session-level function to set tenant context
-- Usage: SELECT set_config('app.tenant_id', 'tenant-uuid', true);
-- ============================================================

-- Function exists check (idempotent)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'set_tenant_context'
    ) THEN
        CREATE OR REPLACE FUNCTION set_tenant_context(tenant_uuid UUID)
        RETURNS void
        LANGUAGE plpgsql
        SECURITY DEFINER
        AS $$
        BEGIN
            PERFORM set_config('app.tenant_id', tenant_uuid::text, true);
        END;
        $$;
    END IF;
END
$$;

-- Function to get current tenant_id from session
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc WHERE proname = 'get_current_tenant_id'
    ) THEN
        CREATE OR REPLACE FUNCTION get_current_tenant_id()
        RETURNS UUID
        LANGUAGE plpgsql
        STABLE
        AS $$
        DECLARE
            tenant_id_text TEXT;
        BEGIN
            tenant_id_text := current_setting('app.tenant_id', true);
            IF tenant_id_text IS NULL OR tenant_id_text = '' THEN
                RETURN NULL;
            END IF;
            RETURN tenant_id_text::UUID;
        END;
        $$;
    END IF;
END
$$;