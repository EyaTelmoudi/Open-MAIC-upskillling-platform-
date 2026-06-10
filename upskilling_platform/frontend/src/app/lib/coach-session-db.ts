import "server-only";

import { randomUUID } from "crypto";
import { Pool, type Pool as PgPool, type PoolClient, types } from "pg";

export type CoachSessionSource =
  | "coach-page"
  | "course-page"
  | "course-lesson-coach"
  | "hindsight-coach-page";

export type CoachSessionScope = {
  tenantId: string;
  userId: string;
  courseId: string;
  lessonId?: string | null;
  source: CoachSessionSource;
  pagePath?: string | null;
};

export type CoachSessionListItem = {
  id: string;
  tenantId: string;
  userId: string;
  courseId: string;
  lessonId: string | null;
  source: CoachSessionSource;
  title: string;
  status: "active" | "inactive";
  preview: string;
  turnCount: number;
  lastActivityAt: string;
  startedAt: string;
};

export type CoachSessionTurnRecord = {
  id: string;
  sessionId: string;
  userMessage: string;
  agentAnswer: string;
  intent: string | null;
  topic: string | null;
  isRepeat: boolean;
  classificationMode: string | null;
  createdAt: string;
  agentAnsweredAt: string;
  supportingMemories: Array<Record<string, unknown>>;
};

export type CoachSessionDetail = CoachSessionListItem & {
  pagePath: string | null;
  turns: CoachSessionTurnRecord[];
};

type SessionRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  course_id: string;
  lesson_id: string | null;
  source: CoachSessionSource;
  title: string;
  status: "active" | "inactive";
  page_path: string | null;
  turn_count: number;
  started_at: Date | string;
  last_activity_at: Date | string;
  last_user_message: string | null;
  last_agent_answer: string | null;
};

type SessionTurnRow = {
  id: string;
  session_id: string;
  user_message: string;
  agent_answer: string;
  intent: string | null;
  topic: string | null;
  is_repeat: boolean;
  classification_mode: string | null;
  created_at: Date | string;
  agent_answered_at: Date | string | null;
  supporting_memories: Array<Record<string, unknown>> | null;
};

let pool: PgPool | null = null;
let tablesReady = false;

const POSTGRES_TIMESTAMP_WITHOUT_TIMEZONE_OID = 1114;

types.setTypeParser(POSTGRES_TIMESTAMP_WITHOUT_TIMEZONE_OID, (value: string) => value);

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

function toIsoString(value: Date | string) {
  if (value instanceof Date) {
    return new Date(
      Date.UTC(
        value.getFullYear(),
        value.getMonth(),
        value.getDate(),
        value.getHours(),
        value.getMinutes(),
        value.getSeconds(),
        value.getMilliseconds(),
      ),
    ).toISOString();
  }

  const normalized = value.trim().replace(" ", "T");
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized);
  return new Date(hasTimezone ? normalized : `${normalized}Z`).toISOString();
}

function toDatabaseUtcTimestamp(value?: string | null) {
  const date = value ? new Date(value) : new Date();
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;

  return safeDate.toISOString().replace("T", " ").replace("Z", "");
}

function truncateText(value: string | null | undefined, maxLength: number) {
  const text = (value || "").trim();
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength - 1).trimEnd()}…`;
}

function normalizeSource(value: string | null | undefined): CoachSessionSource {
  if (value === "course-lesson-coach" || value === "course-page" || value === "hindsight-coach-page") {
    return value;
  }
  return "coach-page";
}

function mapSessionRow(row: SessionRow): CoachSessionListItem {
  const previewSource = row.last_user_message || row.last_agent_answer || "";

  return {
    id: row.id,
    tenantId: row.tenant_id,
    userId: row.user_id,
    courseId: row.course_id,
    lessonId: row.lesson_id,
    source: normalizeSource(row.source),
    title: row.title,
    status: row.status,
    preview: truncateText(previewSource, 120) || "New discussion",
    turnCount: Number(row.turn_count || 0),
    lastActivityAt: toIsoString(row.last_activity_at),
    startedAt: toIsoString(row.started_at),
  };
}

function mapTurnRow(row: SessionTurnRow): CoachSessionTurnRecord {
  return {
    id: row.id,
    sessionId: row.session_id,
    userMessage: row.user_message,
    agentAnswer: row.agent_answer,
    intent: row.intent,
    topic: row.topic,
    isRepeat: Boolean(row.is_repeat),
    classificationMode: row.classification_mode,
    createdAt: toIsoString(row.created_at),
    agentAnsweredAt: toIsoString(row.agent_answered_at || row.created_at),
    supportingMemories: Array.isArray(row.supporting_memories) ? row.supporting_memories : [],
  };
}

async function ensureTables() {
  if (tablesReady) {
    return;
  }

  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS coach_sessions (
        id UUID PRIMARY KEY,
        tenant_id UUID NOT NULL,
        user_id UUID NOT NULL,
        course_id UUID NOT NULL,
        lesson_id UUID NULL,
        source VARCHAR(50) NOT NULL,
        title VARCHAR(255) NOT NULL DEFAULT 'New discussion',
        status VARCHAR(20) NOT NULL DEFAULT 'active',
        page_path TEXT NULL,
        turn_count INTEGER NOT NULL DEFAULT 0,
        started_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
        last_activity_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
        ended_at TIMESTAMP NULL
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_coach_sessions_scope
      ON coach_sessions (user_id, course_id, source, last_activity_at DESC)
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_coach_sessions_lesson_scope
      ON coach_sessions (user_id, course_id, lesson_id, source, last_activity_at DESC)
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS coach_session_turns (
        id UUID PRIMARY KEY,
        session_id UUID NOT NULL REFERENCES coach_sessions(id) ON DELETE CASCADE,
        user_message TEXT NOT NULL,
        agent_answer TEXT NOT NULL,
        intent VARCHAR(50) NULL,
        topic TEXT NULL,
        is_repeat BOOLEAN NOT NULL DEFAULT FALSE,
        classification_mode VARCHAR(50) NULL,
        supporting_memories JSONB NOT NULL DEFAULT '[]'::jsonb,
        agent_answered_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
      )
    `);
    await client.query(`
      ALTER TABLE coach_session_turns
      ADD COLUMN IF NOT EXISTS agent_answered_at TIMESTAMP NULL
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_coach_session_turns_session_time
      ON coach_session_turns (session_id, created_at ASC)
    `);
  } finally {
    client.release();
  }

  tablesReady = true;
}

async function findSessionById(client: PoolClient, sessionId: string, userId: string) {
  const result = (await client.query(
    `
      SELECT
        s.*,
        last_turn.user_message AS last_user_message,
        last_turn.agent_answer AS last_agent_answer
      FROM coach_sessions s
      LEFT JOIN LATERAL (
        SELECT user_message, agent_answer
        FROM coach_session_turns
        WHERE session_id = s.id
        ORDER BY created_at DESC
        LIMIT 1
      ) AS last_turn ON TRUE
      WHERE s.id = $1 AND s.user_id = $2
      LIMIT 1
    `,
    [sessionId, userId],
  )) as { rows: SessionRow[] };

  return result.rows[0] || null;
}

async function deactivateScopeSessions(
  client: PoolClient,
  scope: CoachSessionScope,
  excludeSessionId?: string,
) {
  const params: Array<string | null> = [
    scope.userId,
    scope.courseId,
    scope.lessonId || null,
    scope.source,
  ];

  let query = `
    UPDATE coach_sessions
    SET status = 'inactive', ended_at = (NOW() AT TIME ZONE 'UTC')
    WHERE user_id = $1
      AND course_id = $2
      AND lesson_id IS NOT DISTINCT FROM $3
      AND source = $4
      AND status = 'active'
  `;

  if (excludeSessionId) {
    params.push(excludeSessionId);
    query += ` AND id <> $5`;
  }

  query += ` RETURNING id`;

  const result = (await client.query(query, params)) as { rows: Array<{ id: string }> };
  return result.rows.map((row: { id: string }) => row.id);
}

export async function createCoachSession(scope: CoachSessionScope) {
  await ensureTables();
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const deactivatedSessionIds = await deactivateScopeSessions(client, scope);
    const inserted = (await client.query(
      `
        INSERT INTO coach_sessions (
          id,
          tenant_id,
          user_id,
          course_id,
          lesson_id,
          source,
          title,
          status,
          page_path
        )
        VALUES ($1, $2, $3, $4, $5, $6, 'New discussion', 'active', $7)
        RETURNING
          *,
          NULL::text AS last_user_message,
          NULL::text AS last_agent_answer
      `,
      [
        randomUUID(),
        scope.tenantId,
        scope.userId,
        scope.courseId,
        scope.lessonId || null,
        scope.source,
        scope.pagePath || null,
      ],
    )) as { rows: SessionRow[] };
    await client.query("COMMIT");

    return {
      session: mapSessionRow(inserted.rows[0]),
      deactivatedSessionIds,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function activateCoachSession(sessionId: string, userId: string) {
  await ensureTables();
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const existing = await findSessionById(client, sessionId, userId);
    if (!existing) {
      throw new Error("Coach session not found.");
    }

    const scope: CoachSessionScope = {
      tenantId: existing.tenant_id,
      userId: existing.user_id,
      courseId: existing.course_id,
      lessonId: existing.lesson_id,
      source: normalizeSource(existing.source),
      pagePath: existing.page_path,
    };

    const deactivatedSessionIds = await deactivateScopeSessions(client, scope, sessionId);
    await client.query(
      `
        UPDATE coach_sessions
        SET status = 'active',
            ended_at = NULL,
            last_activity_at = (NOW() AT TIME ZONE 'UTC')
        WHERE id = $1
      `,
      [sessionId],
    );
    await client.query("COMMIT");

    return {
      session: mapSessionRow({
        ...existing,
        status: "active",
        last_activity_at: new Date(),
      }),
      deactivatedSessionIds,
    };
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function getOrCreateActiveCoachSession(scope: CoachSessionScope, sessionId?: string | null) {
  await ensureTables();
  const client = await getPool().connect();
  let released = false;
  try {
    if (sessionId) {
      const existing = await findSessionById(client, sessionId, scope.userId);
      if (existing) {
        client.release();
        released = true;
        return activateCoachSession(sessionId, scope.userId);
      }
    }

    const active = (await client.query(
      `
        SELECT
          s.*,
          last_turn.user_message AS last_user_message,
          last_turn.agent_answer AS last_agent_answer
        FROM coach_sessions s
        LEFT JOIN LATERAL (
          SELECT user_message, agent_answer
          FROM coach_session_turns
          WHERE session_id = s.id
          ORDER BY created_at DESC
          LIMIT 1
        ) AS last_turn ON TRUE
        WHERE s.user_id = $1
          AND s.course_id = $2
          AND s.lesson_id IS NOT DISTINCT FROM $3
          AND s.source = $4
          AND s.status = 'active'
        ORDER BY s.last_activity_at DESC
        LIMIT 1
      `,
      [scope.userId, scope.courseId, scope.lessonId || null, scope.source],
    )) as { rows: SessionRow[] };

    if (active.rows[0]) {
      return {
        session: mapSessionRow(active.rows[0]),
        deactivatedSessionIds: [] as string[],
      };
    }
  } finally {
    if (!released) {
      client.release();
    }
  }

  return createCoachSession(scope);
}

export async function listCoachSessions(
  scope: Omit<CoachSessionScope, "tenantId" | "pagePath" | "source"> & {
    source?: CoachSessionSource | null;
  },
) {
  await ensureTables();
  const params: Array<string | null> = [scope.userId, scope.courseId];
  let query = `
    SELECT
      s.*,
      last_turn.user_message AS last_user_message,
      last_turn.agent_answer AS last_agent_answer
    FROM coach_sessions s
    LEFT JOIN LATERAL (
      SELECT user_message, agent_answer
      FROM coach_session_turns
      WHERE session_id = s.id
      ORDER BY created_at DESC
      LIMIT 1
    ) AS last_turn ON TRUE
    WHERE s.user_id = $1
      AND s.course_id = $2
  `;

  if (scope.lessonId !== undefined) {
    params.push(scope.lessonId || null);
    query += ` AND s.lesson_id IS NOT DISTINCT FROM $${params.length}`;
  }

  if (scope.source) {
    params.push(scope.source);
    query += ` AND s.source = $${params.length}`;
  }

  query += `
    ORDER BY
      CASE WHEN s.status = 'active' THEN 0 ELSE 1 END,
      s.last_activity_at DESC
  `;

  const result = (await getPool().query(query, params)) as { rows: SessionRow[] };

  return result.rows.map(mapSessionRow);
}

export async function getCoachSessionDetail(sessionId: string, userId: string) {
  await ensureTables();
  const client = await getPool().connect();

  try {
    const session = await findSessionById(client, sessionId, userId);
    if (!session) {
      return null;
    }

    const turns = (await client.query(
      `
        SELECT *
        FROM coach_session_turns
        WHERE session_id = $1
        ORDER BY created_at ASC
      `,
      [sessionId],
    )) as { rows: SessionTurnRow[] };

    return {
      ...mapSessionRow(session),
      pagePath: session.page_path,
      turns: turns.rows.map(mapTurnRow),
    } satisfies CoachSessionDetail;
  } finally {
    client.release();
  }
}

export async function appendCoachTurn(input: {
  sessionId: string;
  userId: string;
  userMessage: string;
  agentAnswer: string;
  intent?: string | null;
  topic?: string | null;
  isRepeat?: boolean;
  classificationMode?: string | null;
  supportingMemories?: Array<Record<string, unknown>>;
  userMessageCreatedAt?: string | null;
  agentAnswerCreatedAt?: string | null;
}) {
  await ensureTables();
  const client = await getPool().connect();

  try {
    await client.query("BEGIN");
    const session = await findSessionById(client, input.sessionId, input.userId);
    if (!session) {
      throw new Error("Coach session not found.");
    }

    await client.query(
      `
        INSERT INTO coach_session_turns (
          id,
          session_id,
          user_message,
          agent_answer,
          intent,
          topic,
          is_repeat,
          classification_mode,
          supporting_memories,
          created_at,
          agent_answered_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::timestamp, $11::timestamp)
      `,
      [
        randomUUID(),
        input.sessionId,
        input.userMessage,
        input.agentAnswer,
        input.intent || null,
        input.topic || null,
        Boolean(input.isRepeat),
        input.classificationMode || null,
        JSON.stringify(input.supportingMemories || []),
        toDatabaseUtcTimestamp(input.userMessageCreatedAt),
        toDatabaseUtcTimestamp(input.agentAnswerCreatedAt),
      ],
    );

    const nextTitle =
      session.turn_count === 0 && session.title === "New discussion"
        ? truncateText(input.userMessage, 80) || "New discussion"
        : session.title;

    await client.query(
      `
        UPDATE coach_sessions
        SET title = $2,
            status = 'active',
            ended_at = NULL,
            turn_count = turn_count + 1,
            last_activity_at = (NOW() AT TIME ZONE 'UTC')
        WHERE id = $1
      `,
      [input.sessionId, nextTitle],
    );

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }

  return getCoachSessionDetail(input.sessionId, input.userId);
}
