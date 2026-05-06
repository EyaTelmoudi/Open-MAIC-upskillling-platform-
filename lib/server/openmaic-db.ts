import 'server-only';

import { Pool } from 'pg';
import { getEnvValue } from './shared-env';

let pool: Pool | null = null;
let tablesReady = false;

function normalizePgUrl(raw: string): string {
  return raw.replace('postgresql+pg8000://', 'postgresql://');
}

export function getOpenMAICDatabaseUrl(): string {
  const value =
    getEnvValue('OPENMAIC_DATABASE_URL') ||
    getEnvValue('DATABASE_URL_LOCAL') ||
    getEnvValue('DATABASE_URL');

  if (!value) {
    throw new Error(
      'OPENMAIC_DATABASE_URL is required for persistent OpenMAIC storage. ' +
        'Set it to a PostgreSQL connection string.',
    );
  }

  return normalizePgUrl(value);
}

export function getOpenMAICPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getOpenMAICDatabaseUrl(),
    });
  }

  return pool;
}

export async function ensureOpenMAICTables(): Promise<void> {
  if (tablesReady) return;

  const client = await getOpenMAICPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS openmaic_classrooms (
        id VARCHAR(100) PRIMARY KEY,
        stage_data JSONB NOT NULL,
        scenes_data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS openmaic_learning_submissions (
        submission_id VARCHAR(255) PRIMARY KEY,
        requirement TEXT NOT NULL,
        options JSONB NOT NULL DEFAULT '{}'::jsonb,
        source_pdf_file_name VARCHAR(255),
        source_pdf_size BIGINT,
        source_pdf_type VARCHAR(100),
        source_pdf_object_key TEXT,
        parsed_pdf JSONB,
        openmaic_response JSONB,
        classroom_id VARCHAR(100),
        draft_id VARCHAR(100),
        storage_location TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS openmaic_learning_drafts (
        draft_id VARCHAR(100) PRIMARY KEY,
        submission_id VARCHAR(255) NOT NULL,
        classroom_id VARCHAR(100) NOT NULL,
        status VARCHAR(30) NOT NULL,
        storage_location TEXT,
        stage_data JSONB NOT NULL,
        source_scenes JSONB NOT NULL,
        editable_scenes JSONB NOT NULL,
        final_course JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    tablesReady = true;
  } finally {
    client.release();
  }
}
