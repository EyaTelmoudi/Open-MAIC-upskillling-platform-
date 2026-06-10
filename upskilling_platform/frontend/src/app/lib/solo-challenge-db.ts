import "server-only";

import { randomUUID } from "crypto";
import { Pool } from "pg";
import type { Pool as PgPool } from "pg";

type SoloChallengeOption = {
  id: string;
  value: string;
  label: string;
};

type StoredSoloChallengeQuestion = {
  questionId: string;
  text: string;
  questionType: string;
  displayOrder: number;
  generationMode?: string;
  correctOptionId?: string | null;
  explanation?: string | null;
  options: SoloChallengeOption[];
};

type StoredSoloChallengeQuiz = {
  courseId?: string | null;
  courseTitle?: string | null;
  lessonId?: string | null;
  lessonTitle?: string | null;
  assessmentId?: string | null;
  source?: string;
  focusMode?: string;
  questionCount?: number;
  questions?: StoredSoloChallengeQuestion[];
};

export type PublicSoloChallengeQuestion = Omit<StoredSoloChallengeQuestion, "correctOptionId">;
export type PublicSoloChallengeQuiz = Omit<StoredSoloChallengeQuiz, "questions"> & {
  questions?: PublicSoloChallengeQuestion[];
};

export type StoredSoloChallengeRecord = {
  id: string;
  tenantId: string;
  userId: string;
  courseId: string;
  lessonId: string | null;
  quiz: StoredSoloChallengeQuiz;
  createdAt: string;
  answeredAt: string | null;
  selectedOptionId: string | null;
  isCorrect: boolean | null;
};

let pool: PgPool | null = null;
let tablesReady = false;

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

function toIsoString(value: Date | string | null | undefined) {
  if (!value) {
    return null;
  }
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

async function ensureTables() {
  if (tablesReady) {
    return;
  }

  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS solo_challenge_attempts (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        user_id UUID NOT NULL,
        course_id UUID NOT NULL,
        lesson_id UUID NULL,
        quiz_payload JSONB NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
        expires_at TIMESTAMP NULL,
        answered_at TIMESTAMP NULL,
        selected_option_id TEXT NULL,
        is_correct BOOLEAN NULL
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_solo_challenge_attempts_user_course
      ON solo_challenge_attempts (user_id, course_id, created_at DESC)
    `);
  } finally {
    client.release();
  }

  tablesReady = true;
}

export function sanitizeSoloChallengeQuiz(quiz: StoredSoloChallengeQuiz | null | undefined): PublicSoloChallengeQuiz | null {
  if (!quiz) {
    return null;
  }

  return {
    ...quiz,
    questions: Array.isArray(quiz.questions)
      ? quiz.questions.map(({ correctOptionId: _ignored, ...question }) => question)
      : [],
  };
}

export async function createSoloChallengeAttempt(input: {
  tenantId: string;
  userId: string;
  courseId: string;
  lessonId?: string | null;
  quiz: StoredSoloChallengeQuiz;
  expiresAt?: string | null;
}) {
  await ensureTables();

  const id = randomUUID();
  const client = await getPool().connect();
  try {
    await client.query(
      `
        INSERT INTO solo_challenge_attempts (
          id, tenant_id, user_id, course_id, lesson_id, quiz_payload, expires_at
        ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)
      `,
      [
        id,
        input.tenantId,
        input.userId,
        input.courseId,
        input.lessonId || null,
        JSON.stringify(input.quiz),
        input.expiresAt || null,
      ],
    );
  } finally {
    client.release();
  }

  return id;
}

export async function getSoloChallengeAttempt(id: string, userId: string): Promise<StoredSoloChallengeRecord | null> {
  await ensureTables();

  const result = await getPool().query(
    `
      SELECT
        id,
        tenant_id,
        user_id,
        course_id,
        lesson_id,
        quiz_payload,
        created_at,
        answered_at,
        selected_option_id,
        is_correct
      FROM solo_challenge_attempts
      WHERE id = $1 AND user_id = $2
      LIMIT 1
    `,
    [id, userId],
  );

  const row = result.rows[0];
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    courseId: row.course_id,
    lessonId: row.lesson_id,
    quiz: row.quiz_payload as StoredSoloChallengeQuiz,
    createdAt: toIsoString(row.created_at) || new Date().toISOString(),
    answeredAt: toIsoString(row.answered_at),
    selectedOptionId: row.selected_option_id,
    isCorrect: typeof row.is_correct === "boolean" ? row.is_correct : null,
  };
}

export async function completeSoloChallengeAttempt(input: {
  id: string;
  userId: string;
  selectedOptionId: string;
  isCorrect: boolean;
}) {
  await ensureTables();

  await getPool().query(
    `
      UPDATE solo_challenge_attempts
      SET
        answered_at = (NOW() AT TIME ZONE 'UTC'),
        selected_option_id = $3,
        is_correct = $4
      WHERE id = $1 AND user_id = $2
    `,
    [input.id, input.userId, input.selectedOptionId, input.isCorrect],
  );
}
