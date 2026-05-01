import "server-only";

import { randomUUID } from "crypto";
import { Pool } from "pg";

type DraftStatus = "draft" | "approved" | "finalized";
type ReviewStatus = "pending_review" | "draft_saved";

type StoredDraftPayload = {
  draftId: string;
  submissionId?: string;
  classroomId?: string;
  outputDir?: string;
  outputDirRelative?: string;
  createdAt?: string;
  updatedAt?: string;
  status?: DraftStatus;
  stage?: { name?: string };
  editableScenes?: Array<{ status?: string }>;
};

type FinalCoursePayload = {
  stage?: { name?: string };
  scenes?: Array<{
    title?: string;
    type?: string;
    order?: number;
    actions?: Array<{ type?: string; text?: string }>;
  }>;
};

type DraftDbRow = {
  id: string;
  external_draft_id: string;
  submission_id: string | null;
  classroom_id: string | null;
  title: string;
  status: DraftStatus;
  review_status: ReviewStatus;
  prompt: string | null;
  source_pdf_name: string | null;
  output_dir: string | null;
  output_dir_relative: string | null;
  stage_data: Record<string, unknown> | null;
  draft_payload: StoredDraftPayload;
  final_course_payload: FinalCoursePayload | null;
  final_course_path: string | null;
  platform_course_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  updated_at: string;
  author_id: string | null;
  tenant_id: string | null;
};

let pool: Pool | null = null;
let tableReady = false;

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
  if (tableReady) return;
  const client = await getPool().connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_course_drafts (
        id UUID PRIMARY KEY,
        external_draft_id VARCHAR(100) NOT NULL UNIQUE,
        submission_id VARCHAR(255),
        classroom_id VARCHAR(100),
        title VARCHAR(255) NOT NULL,
        status VARCHAR(30) NOT NULL DEFAULT 'draft',
        review_status VARCHAR(30) NOT NULL DEFAULT 'pending_review',
        prompt TEXT,
        source_pdf_name VARCHAR(255),
        output_dir TEXT,
        output_dir_relative TEXT,
        stage_data JSONB,
        draft_payload JSONB NOT NULL,
        final_course_payload JSONB,
        final_course_path TEXT,
        platform_course_id UUID,
        approved_by VARCHAR(255),
        approved_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
        author_id UUID,
        tenant_id UUID
      )
    `);
  } finally {
    client.release();
  }
  tableReady = true;
}

function decodeJwtPayload(token: string | null) {
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return payload as {
      sub?: string;
      tenantId?: string | null;
      email?: string;
      role?: string;
    };
  } catch {
    return null;
  }
}

function getTokenFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }

  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function extractTitleFromDraft(draft: StoredDraftPayload) {
  return draft.stage?.name || draft.editableScenes?.[0]?.status || "Generated course";
}

function extractPendingReviewRecord(row: DraftDbRow) {
  return {
    draftId: row.external_draft_id,
    status: row.review_status,
    approvedBy: row.approved_by || undefined,
    approvedAt: row.approved_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    platformCourseId: row.platform_course_id,
  };
}

function approvedScenesCount(draft: StoredDraftPayload) {
  return (draft.editableScenes || []).filter((scene) => scene.status === "approved").length;
}

export async function upsertAiCourseDraft(
  request: Request,
  payload: {
    draft: StoredDraftPayload;
    finalCourse?: FinalCoursePayload | null;
    finalCoursePathRelative?: string | null;
    prompt?: string | null;
    sourcePdfName?: string | null;
    reviewStatus?: ReviewStatus | null;
  },
) {
  await ensureTables();
  const jwt = decodeJwtPayload(getTokenFromRequest(request));
  const client = await getPool().connect();
  try {
    const draft = payload.draft;
    const title = draft.stage?.name || draft.draftId || "Generated course";
    const result = await client.query<DraftDbRow>(
      `
      INSERT INTO ai_course_drafts (
        id,
        external_draft_id,
        submission_id,
        classroom_id,
        title,
        status,
        review_status,
        prompt,
        source_pdf_name,
        output_dir,
        output_dir_relative,
        stage_data,
        draft_payload,
        final_course_payload,
        final_course_path,
        author_id,
        tenant_id,
        created_at,
        updated_at
      )
      VALUES (
        $1,$2,$3,$4,$5,$6,COALESCE($7,'pending_review'),$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16,$17,NOW(),NOW()
      )
      ON CONFLICT (external_draft_id)
      DO UPDATE SET
        submission_id = EXCLUDED.submission_id,
        classroom_id = EXCLUDED.classroom_id,
        title = EXCLUDED.title,
        status = EXCLUDED.status,
        review_status = COALESCE(EXCLUDED.review_status, ai_course_drafts.review_status),
        prompt = COALESCE(EXCLUDED.prompt, ai_course_drafts.prompt),
        source_pdf_name = COALESCE(EXCLUDED.source_pdf_name, ai_course_drafts.source_pdf_name),
        output_dir = EXCLUDED.output_dir,
        output_dir_relative = EXCLUDED.output_dir_relative,
        stage_data = EXCLUDED.stage_data,
        draft_payload = EXCLUDED.draft_payload,
        final_course_payload = COALESCE(EXCLUDED.final_course_payload, ai_course_drafts.final_course_payload),
        final_course_path = COALESCE(EXCLUDED.final_course_path, ai_course_drafts.final_course_path),
        author_id = COALESCE(EXCLUDED.author_id, ai_course_drafts.author_id),
        tenant_id = COALESCE(EXCLUDED.tenant_id, ai_course_drafts.tenant_id),
        updated_at = NOW()
      RETURNING *
      `,
      [
        randomUUID(),
        draft.draftId,
        draft.submissionId || null,
        draft.classroomId || null,
        title,
        draft.status || "draft",
        payload.reviewStatus || null,
        payload.prompt || null,
        payload.sourcePdfName || null,
        draft.outputDir || null,
        draft.outputDirRelative || null,
        JSON.stringify(draft.stage || {}),
        JSON.stringify(draft),
        payload.finalCourse ? JSON.stringify(payload.finalCourse) : null,
        payload.finalCoursePathRelative || null,
        jwt?.sub || null,
        jwt?.tenantId || null,
      ],
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function listAiCourseDrafts() {
  await ensureTables();
  const result = await getPool().query<DraftDbRow>(
    `SELECT * FROM ai_course_drafts ORDER BY updated_at DESC`,
  );
  return result.rows.map((row) => ({
    draftId: row.external_draft_id,
    submissionId: row.submission_id,
    classroomId: row.classroom_id,
    outputDirRelative: row.output_dir_relative,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    status: row.status,
    scenesCount: (row.draft_payload?.editableScenes || []).length,
    approvedScenesCount: approvedScenesCount(row.draft_payload),
    reviewStatus: row.review_status,
    platformCourseId: row.platform_course_id,
  }));
}

export async function getAiCourseDraft(draftId: string) {
  await ensureTables();
  const result = await getPool().query<DraftDbRow>(
    `SELECT * FROM ai_course_drafts WHERE external_draft_id = $1 LIMIT 1`,
    [draftId],
  );
  return result.rows[0] || null;
}

function sceneDuration(scene: Record<string, unknown>) {
  const actions = Array.isArray(scene.actions) ? scene.actions : [];
  const speechActions = actions.filter(
    (action) => typeof action === "object" && action && (action as { type?: string }).type === "speech",
  ) as Array<{ text?: string }>;
  if (speechActions.length === 0) return 5;
  const words = speechActions.reduce((total, action) => total + String(action.text || "").split(/\s+/).filter(Boolean).length, 0);
  return Math.max(5, Math.min(30, Math.floor(words / 40) + 1));
}

export async function saveAiCourseAsPlatformDraft(
  request: Request,
  draftId: string,
  approvedBy: string,
) {
  await ensureTables();
  const jwt = decodeJwtPayload(getTokenFromRequest(request));
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const draftResult = await client.query<DraftDbRow>(
      `SELECT * FROM ai_course_drafts WHERE external_draft_id = $1 LIMIT 1`,
      [draftId],
    );
    const record = draftResult.rows[0];
    if (!record || !record.final_course_payload) {
      throw new Error("Finalize the AI course before saving it as a platform draft");
    }

    const finalCourse = record.final_course_payload;
    const scenes = Array.isArray(finalCourse.scenes)
      ? [...finalCourse.scenes].sort((a, b) => Number(a.order || 0) - Number(b.order || 0))
      : [];
    const totalDuration =
      scenes.reduce((sum, scene) => sum + sceneDuration(scene as Record<string, unknown>), 0) ||
      Math.max(scenes.length * 5, 5);

    let courseId = record.platform_course_id;
    if (courseId) {
      await client.query(
        `DELETE FROM lessons WHERE module_id IN (SELECT id FROM modules WHERE course_id = $1)`,
        [courseId],
      );
      await client.query(`DELETE FROM modules WHERE course_id = $1`, [courseId]);
      await client.query(
        `
        UPDATE courses
        SET title = $2,
            description = $3,
            category = $4,
            difficulty = $5,
            duration = $6,
            xp_reward = 100,
            is_published = FALSE,
            author_id = COALESCE($7, author_id),
            tenant_id = COALESCE($8, tenant_id),
            updated_at = NOW()
        WHERE id = $1
        `,
        [
          courseId,
          finalCourse.stage?.name || record.title,
          "AI-generated course draft created from OpenMAIC and saved for learning-expert review.",
          "AI Generated",
          "Intermediate",
          totalDuration,
          jwt?.sub || record.author_id,
          jwt?.tenantId || record.tenant_id,
        ],
      );
    } else {
      courseId = randomUUID();
      await client.query(
        `
        INSERT INTO courses (
          id, title, description, thumbnail, category, difficulty, duration,
          xp_reward, rating, is_published, author_id, tenant_id, created_at, updated_at
        )
        VALUES ($1,$2,$3,NULL,$4,$5,$6,100,NULL,FALSE,$7,$8,NOW(),NOW())
        `,
        [
          courseId,
          finalCourse.stage?.name || record.title,
          "AI-generated course draft created from OpenMAIC and saved for learning-expert review.",
          "AI Generated",
          "Intermediate",
          totalDuration,
          jwt?.sub || record.author_id,
          jwt?.tenantId || record.tenant_id,
        ],
      );
    }

    const moduleId = randomUUID();
    await client.query(
      `
      INSERT INTO modules (id, course_id, title, description, "order", created_at)
      VALUES ($1,$2,$3,$4,$5,NOW())
      `,
      [
        moduleId,
        courseId,
        "Generated Course Content",
        "Lesson sequence generated by OpenMAIC and approved by the learning expert.",
        1,
      ],
    );

    let lessonOrder = 1;
    for (const scene of scenes) {
      await client.query(
        `
        INSERT INTO lessons (
          id, module_id, title, content, video_url, content_type, duration, "order", assessment_id, created_at
        )
        VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,NULL,NOW())
        `,
        [
          randomUUID(),
          moduleId,
          scene.title || `Scene ${lessonOrder}`,
          JSON.stringify(scene),
          scene.type || "slide",
          sceneDuration(scene as Record<string, unknown>),
          lessonOrder,
        ],
      );
      lessonOrder += 1;
    }

    const reviewResult = await client.query<DraftDbRow>(
      `
      UPDATE ai_course_drafts
      SET review_status = 'draft_saved',
          approved_by = $2,
          approved_at = NOW(),
          platform_course_id = $3,
          updated_at = NOW()
      WHERE external_draft_id = $1
      RETURNING *
      `,
      [draftId, approvedBy, courseId],
    );

    await client.query("COMMIT");
    return reviewResult.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
