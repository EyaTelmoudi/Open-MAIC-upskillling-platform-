import "server-only";

import { randomUUID } from "crypto";
import { Pool } from "pg";
import type { Pool as PgPool } from "pg";

let pool: PgPool | null = null;
let tablesReady = false;

export type LearnerProfileType = "skill_gap_radar" | "recommendation_feed";

function normalizePgUrl(raw: string) {
  return raw.replace("postgresql+pg8000://", "postgresql://");
}

function getDatabaseUrl() {
  return normalizePgUrl(
    process.env.AI_COURSE_DATABASE_URL ||
      process.env.DATABASE_URL_LOCAL ||
      "postgresql://upskilling:upskilling_dev_2026@localhost:5433/upskilling_platform",
  );
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
    });
  }
  return pool;
}

async function ensureTables() {
  if (tablesReady) {
    return;
  }

  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS learner_skill_profiles (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        user_id UUID NOT NULL,
        profile_type VARCHAR(50) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'pending',
        bank_id TEXT NOT NULL,
        source VARCHAR(100) NULL,
        profile_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
        updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
        UNIQUE (tenant_id, user_id, profile_type)
      )
    `);
  } finally {
    client.release();
  }

  tablesReady = true;
}

export async function upsertLearnerSkillProfile(input: {
  tenantId: string;
  userId: string;
  profileType: LearnerProfileType;
  status: string;
  bankId: string;
  source?: string | null;
  payload: Record<string, unknown>;
}) {
  await ensureTables();

  const result = await getPool().query<{
    id: string;
    tenant_id: string;
    user_id: string;
    profile_type: string;
    status: string;
    bank_id: string;
    source: string | null;
    profile_payload: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }>(
    `
      INSERT INTO learner_skill_profiles (
        id,
        tenant_id,
        user_id,
        profile_type,
        status,
        bank_id,
        source,
        profile_payload,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2::uuid,
        $3::uuid,
        $4,
        $5,
        $6,
        $7,
        $8::jsonb,
        (NOW() AT TIME ZONE 'UTC'),
        (NOW() AT TIME ZONE 'UTC')
      )
      ON CONFLICT (tenant_id, user_id, profile_type)
      DO UPDATE SET
        status = EXCLUDED.status,
        bank_id = EXCLUDED.bank_id,
        source = EXCLUDED.source,
        profile_payload = EXCLUDED.profile_payload,
        updated_at = (NOW() AT TIME ZONE 'UTC')
      RETURNING *
    `,
    [
      randomUUID(),
      input.tenantId,
      input.userId,
      input.profileType,
      input.status,
      input.bankId,
      input.source || null,
      JSON.stringify(input.payload || {}),
    ],
  );

  return result.rows[0] || null;
}

export async function getLearnerSkillProfile(input: {
  tenantId: string;
  userId: string;
  profileType: LearnerProfileType;
}) {
  await ensureTables();

  const result = await getPool().query<{
    id: string;
    tenant_id: string;
    user_id: string;
    profile_type: string;
    status: string;
    bank_id: string;
    source: string | null;
    profile_payload: Record<string, unknown>;
    created_at: string;
    updated_at: string;
  }>(
    `
      SELECT *
      FROM learner_skill_profiles
      WHERE tenant_id = $1::uuid
        AND user_id = $2::uuid
        AND profile_type = $3
      LIMIT 1
    `,
    [input.tenantId, input.userId, input.profileType],
  );

  return result.rows[0] || null;
}
