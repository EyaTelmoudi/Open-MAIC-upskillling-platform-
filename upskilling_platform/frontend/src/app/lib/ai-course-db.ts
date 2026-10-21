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
    id?: string;
    title?: string;
    type?: string;
    order?: number;
    actions?: Array<{ type?: string; text?: string }>;
    content?: {
      type?: string;
      questions?: Array<{
        id?: string;
        question?: string;
        text?: string;
        options?: Array<{ value?: string; label?: string } | string>;
        answer?: string[] | string;
        correctAnswer?: string[] | string;
        analysis?: string;
        explanation?: string;
      }>;
    };
  }>;
};

type AiPlatformQuizSummary = {
  lessonId: string;
  courseId: string;
  title: string;
  passingScore: number;
};

type AiPlatformQuizQuestion = {
  id: string;
  lessonId: string;
  text: string;
  type: string;
  options: Array<{ value: string; label: string }>;
  allowMultiple: boolean;
  explanation?: string | null;
  correctAnswers: string[];
  order: number;
};

type AiPlatformQuizAttemptResult = {
  attemptId: string;
  passed: boolean;
  score: number;
  totalQuestions: number;
  correctCount: number;
  questions: Array<{
    id: string;
    text: string;
    options: Array<{ value: string; label: string }>;
    userAnswers: string[];
    correctAnswers: string[];
    isCorrect: boolean;
    explanation?: string | null;
    allowMultiple: boolean;
  }>;
};

type MaterializedAiQuizSummary = {
  lessonId: string;
  courseId: string;
  title: string;
  passingScore: number;
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
  approved_at: Date | string | null;
  created_at: Date | string;
  updated_at: Date | string;
  author_id: string | null;
  tenant_id: string | null;
};

function resolveAiCourseXpReward(record: DraftDbRow, totalDuration: number) {
  const candidate =
    Number(
      (record.stage_data as { xp_reward?: unknown } | null)?.xp_reward ??
        (record.draft_payload as { xp_reward?: unknown } | null)?.xp_reward ??
        (record.final_course_payload as { stage?: { xp_reward?: unknown } } | null)?.stage?.xp_reward
    ) || 0;

  if (candidate > 0) {
    return candidate;
  }

  return Math.max(100, Math.round(totalDuration * 10));
}

let pool: InstanceType<typeof Pool> | null = null;
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
        created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
        updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
        author_id UUID,
        tenant_id UUID
      )
    `);
    await client.query(`
      ALTER TABLE ai_course_drafts
      ALTER COLUMN created_at SET DEFAULT (NOW() AT TIME ZONE 'UTC'),
      ALTER COLUMN updated_at SET DEFAULT (NOW() AT TIME ZONE 'UTC')
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_platform_lesson_quizzes (
        lesson_id UUID PRIMARY KEY REFERENCES lessons(id) ON DELETE CASCADE,
        course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        module_id UUID NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
        title VARCHAR(255) NOT NULL,
        passing_score INTEGER NOT NULL DEFAULT 70,
        created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_platform_lesson_quiz_questions (
        id UUID PRIMARY KEY,
        lesson_id UUID NOT NULL REFERENCES ai_platform_lesson_quizzes(lesson_id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        question_type VARCHAR(30) NOT NULL DEFAULT 'multiple_choice',
        options JSONB NOT NULL,
        correct_answers JSONB NOT NULL,
        explanation TEXT,
        display_order INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ai_platform_lesson_quiz_attempts (
        id UUID PRIMARY KEY,
        lesson_id UUID NOT NULL REFERENCES ai_platform_lesson_quizzes(lesson_id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        answers JSONB NOT NULL,
        score DOUBLE PRECISION NOT NULL DEFAULT 0,
        passed BOOLEAN NOT NULL DEFAULT FALSE,
        wrong_answers JSONB,
        created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
        completed_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC')
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS learner_course_contexts (
        id UUID PRIMARY KEY,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
        current_lesson_id UUID NULL REFERENCES lessons(id) ON DELETE SET NULL,
        last_opened_lesson_id UUID NULL REFERENCES lessons(id) ON DELETE SET NULL,
        last_completed_lesson_id UUID NULL REFERENCES lessons(id) ON DELETE SET NULL,
        latest_quiz_score DOUBLE PRECISION,
        latest_quiz_passed BOOLEAN,
        latest_failed_quiz_lesson_id UUID NULL REFERENCES lessons(id) ON DELETE SET NULL,
        failed_quiz_count INTEGER NOT NULL DEFAULT 0,
        last_quiz_attempted_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
        updated_at TIMESTAMP NOT NULL DEFAULT (NOW() AT TIME ZONE 'UTC'),
        CONSTRAINT uq_learner_context_user_course UNIQUE (user_id, course_id)
      )
    `);
  } finally {
    client.release();
  }
  tableReady = true;
}

function normalizeQuizOptions(
  options: Array<{ value?: string; label?: string } | string> | undefined,
) {
  return (options || []).map((option, index) => {
    if (typeof option === "string") {
      const letter = String.fromCharCode(65 + index);
      return { value: letter, label: option };
    }
    return {
      value: String(option.value || String.fromCharCode(65 + index)),
      label: String(option.label || option.value || ""),
    };
  });
}

function normalizeCorrectAnswers(value: string[] | string | undefined | null) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function isUuidLike(value: string | undefined | null) {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim(),
  );
}

function normalizeImportedUuid(value: string | undefined | null) {
  return isUuidLike(value) ? value!.trim() : randomUUID();
}

function inferAllowMultiple(questionType: string | undefined | null, text: string | undefined | null) {
  if (String(questionType || "").toLowerCase() === "multiple_select") {
    return true;
  }

  const prompt = String(text || "").toLowerCase();
  return (
    prompt.includes("select all") ||
    prompt.includes("choose all") ||
    prompt.includes("multiple answers") ||
    prompt.includes("all that apply")
  );
}

function sanitizeAiQuizLessonContent(scene: NonNullable<FinalCoursePayload["scenes"]>[number]) {
  return JSON.stringify({
    id: scene.id,
    type: "quiz",
    order: scene.order,
    title: scene.title,
    content: {
      type: "quiz",
    },
  });
}

async function ensureAiPlatformQuizMaterialized(
  client: Awaited<ReturnType<ReturnType<typeof getPool>["connect"]>>,
  lessonId: string,
  userId: string,
): Promise<MaterializedAiQuizSummary | null> {
  const directQuizResult = await client.query<{
    lesson_id: string;
    course_id: string;
    title: string;
    passing_score: number;
  }>(
    `
    SELECT q.lesson_id, q.course_id, q.title, q.passing_score
    FROM ai_platform_lesson_quizzes q
    JOIN enrollments e ON e.course_id = q.course_id
    WHERE q.lesson_id = $1
      AND e.user_id = $2::uuid
    LIMIT 1
    `,
    [lessonId, userId],
  );

  const directQuiz = directQuizResult.rows[0];
  if (directQuiz) {
    return {
      lessonId: directQuiz.lesson_id,
      courseId: directQuiz.course_id,
      title: directQuiz.title,
      passingScore: directQuiz.passing_score,
    };
  }

  const lessonResult = await client.query<{
    lesson_id: string;
    lesson_title: string;
    lesson_order: number;
    course_id: string;
    module_id: string;
  }>(
    `
    SELECT l.id AS lesson_id, l.title AS lesson_title, l."order" AS lesson_order, m.course_id, m.id AS module_id
    FROM lessons l
    JOIN modules m ON m.id = l.module_id
    JOIN enrollments e ON e.course_id = m.course_id
    WHERE l.id = $1
      AND e.user_id = $2::uuid
    LIMIT 1
    `,
    [lessonId, userId],
  );

  const lesson = lessonResult.rows[0];
  if (!lesson) {
    return null;
  }

  const draftResult = await client.query<{
    final_course_payload: FinalCoursePayload | null;
  }>(
    `
    SELECT final_course_payload
    FROM ai_course_drafts
    WHERE platform_course_id = $1::uuid
      AND final_course_payload IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 1
    `,
    [lesson.course_id],
  );

  const finalCourse = draftResult.rows[0]?.final_course_payload;
  const scenes = Array.isArray(finalCourse?.scenes) ? finalCourse!.scenes : [];
  const matchingScene = scenes.find((scene) => {
    const sameOrder = Number(scene?.order || 0) === Number(lesson.lesson_order || 0);
    const sameTitle = String(scene?.title || "").trim() === String(lesson.lesson_title || "").trim();
    return scene?.type === "quiz" && (sameOrder || sameTitle);
  });

  if (!matchingScene || !Array.isArray(matchingScene.content?.questions) || matchingScene.content.questions.length === 0) {
    return null;
  }

  const questions = matchingScene.content.questions.map((question, questionIndex) => {
    const options = normalizeQuizOptions(question.options);
    const correctAnswers = normalizeCorrectAnswers(
      question.answer ?? question.correctAnswer,
    );
    return {
      id: normalizeImportedUuid(question.id),
      text: String(question.question || question.text || `Question ${questionIndex + 1}`),
      options,
      correctAnswers,
      allowMultiple: correctAnswers.length > 1,
      explanation: question.analysis || question.explanation || null,
      order: questionIndex + 1,
    };
  });

  await client.query(
    `
    INSERT INTO ai_platform_lesson_quizzes (lesson_id, course_id, module_id, title, passing_score, created_at)
    VALUES ($1,$2::uuid,$3::uuid,$4,$5,(NOW() AT TIME ZONE 'UTC'))
    ON CONFLICT (lesson_id)
    DO UPDATE SET
      title = EXCLUDED.title,
      passing_score = EXCLUDED.passing_score
    `,
    [
      lesson.lesson_id,
      lesson.course_id,
      lesson.module_id,
      matchingScene.title || lesson.lesson_title || "Quiz",
      70,
    ],
  );

  await client.query(`DELETE FROM ai_platform_lesson_quiz_questions WHERE lesson_id = $1`, [lesson.lesson_id]);

  for (const question of questions) {
    await client.query(
      `
      INSERT INTO ai_platform_lesson_quiz_questions (
        id, lesson_id, text, question_type, options, correct_answers, explanation, display_order, created_at
      )
      VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,(NOW() AT TIME ZONE 'UTC'))
      `,
      [
        question.id,
        lesson.lesson_id,
        question.text,
        question.allowMultiple ? "multiple_select" : "multiple_choice",
        JSON.stringify(question.options),
        JSON.stringify(question.correctAnswers),
        question.explanation,
        question.order,
      ],
    );
  }

  return {
    lessonId: lesson.lesson_id,
    courseId: lesson.course_id,
    title: matchingScene.title || lesson.lesson_title || "Quiz",
    passingScore: 70,
  };
}

export function toUtcIsoString(value: Date | string | null | undefined) {
  if (!value) return undefined;

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "string") {
    const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`;
    const parsed = new Date(normalized);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed.toISOString();
    }
  }

  return String(value);
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

function getRequestScope(request: Request) {
  const jwt = decodeJwtPayload(getTokenFromRequest(request));
  return {
    userId: jwt?.sub || null,
    tenantId: jwt?.tenantId || null,
    role: jwt?.role || null,
    isSuperAdmin: jwt?.role === "SuperAdmin",
  };
}

export function getAiCourseRequestScope(request: Request) {
  return getRequestScope(request);
}

function extractTitleFromDraft(draft: StoredDraftPayload) {
  return draft.stage?.name || draft.editableScenes?.[0]?.status || "Generated course";
}

function extractPendingReviewRecord(row: DraftDbRow) {
  return {
    draftId: row.external_draft_id,
    status: row.review_status,
    approvedBy: row.approved_by || undefined,
    approvedAt: toUtcIsoString(row.approved_at),
    createdAt: toUtcIsoString(row.created_at),
    updatedAt: toUtcIsoString(row.updated_at),
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
    tenantId?: string | null;
  },
) {
  await ensureTables();
  const scope = getRequestScope(request);
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
        $1,$2,$3,$4,$5,$6,COALESCE($7,'pending_review'),$8,$9,$10,$11,$12::jsonb,$13::jsonb,$14::jsonb,$15,$16,$17,(NOW() AT TIME ZONE 'UTC'),(NOW() AT TIME ZONE 'UTC')
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
        updated_at = (NOW() AT TIME ZONE 'UTC')
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
        scope.userId,
        payload.tenantId || scope.tenantId,
      ],
    );
    return result.rows[0];
  } finally {
    client.release();
  }
}

export async function listAiCourseDrafts(request: Request) {
  await ensureTables();
  const scope = getRequestScope(request);
  if (!scope.isSuperAdmin && !scope.tenantId) {
    return [];
  }
  const result = await getPool().query<DraftDbRow>(
    `
    SELECT *
    FROM ai_course_drafts
    WHERE review_status <> 'draft_saved'
      AND ($1::boolean = TRUE OR tenant_id = $2::uuid)
    ORDER BY updated_at DESC
    `,
    [scope.isSuperAdmin, scope.tenantId],
  );
  return result.rows.map((row: DraftDbRow) => ({
    draftId: row.external_draft_id,
    submissionId: row.submission_id,
    classroomId: row.classroom_id,
    outputDirRelative: row.output_dir_relative,
    title: row.title,
    createdAt: toUtcIsoString(row.created_at),
    updatedAt: toUtcIsoString(row.updated_at),
    status: row.status,
    scenesCount: (row.draft_payload?.editableScenes || []).length,
    approvedScenesCount: approvedScenesCount(row.draft_payload),
    reviewStatus: row.review_status,
    platformCourseId: row.platform_course_id,
  }));
}

export async function hasAnyAiCourseDraftRecords(request?: Request) {
  await ensureTables();
  if (request) {
    const scope = getRequestScope(request);
    if (!scope.isSuperAdmin && !scope.tenantId) {
      return false;
    }
    const scopedResult = await getPool().query<{ total: string }>(
      `
      SELECT COUNT(*)::text AS total
      FROM ai_course_drafts
      WHERE ($1::boolean = TRUE OR tenant_id = $2::uuid)
      `,
      [scope.isSuperAdmin, scope.tenantId],
    );
    return Number(scopedResult.rows[0]?.total || 0) > 0;
  }

  const result = await getPool().query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM ai_course_drafts`,
  );
  return Number(result.rows[0]?.total || 0) > 0;
}

export async function getAiCourseDraft(request: Request, draftId: string) {
  await ensureTables();
  const scope = getRequestScope(request);
  if (!scope.isSuperAdmin && !scope.tenantId) {
    return null;
  }
  const result = await getPool().query<DraftDbRow>(
    `
    SELECT *
    FROM ai_course_drafts
    WHERE external_draft_id = $1
      AND ($2::boolean = TRUE OR tenant_id = $3::uuid)
    LIMIT 1
    `,
    [draftId, scope.isSuperAdmin, scope.tenantId],
  );
  return result.rows[0] || null;
}

export async function getAiCourseDraftByPlatformCourseId(
  request: Request,
  platformCourseId: string,
  title?: string | null,
) {
  await ensureTables();
  const jwt = decodeJwtPayload(getTokenFromRequest(request));
  const client = await getPool().connect();
  try {
    let result = await client.query<DraftDbRow>(
      `
      SELECT *
      FROM ai_course_drafts
      WHERE platform_course_id = $1
        AND ($2::uuid IS NULL OR tenant_id = $2::uuid)
      ORDER BY updated_at DESC
      LIMIT 1
      `,
      [platformCourseId, jwt?.tenantId || null],
    );

    let record = result.rows[0] || null;

    if (!record && title) {
      result = await client.query<DraftDbRow>(
        `
        SELECT *
        FROM ai_course_drafts
        WHERE LOWER(title) = LOWER($1)
          AND ($2::uuid IS NULL OR tenant_id = $2::uuid)
        ORDER BY updated_at DESC
        LIMIT 1
        `,
        [title, jwt?.tenantId || null],
      );

      record = result.rows[0] || null;

      if (record && !record.platform_course_id) {
        const updated = await client.query<DraftDbRow>(
          `
          UPDATE ai_course_drafts
          SET platform_course_id = $2,
              updated_at = (NOW() AT TIME ZONE 'UTC')
          WHERE id = $1
          RETURNING *
          `,
          [record.id, platformCourseId],
        );
        record = updated.rows[0] || record;
      }
    }

    return record;
  } finally {
    client.release();
  }
}

export async function deleteAiCourseDraft(request: Request, draftId: string) {
  await ensureTables();
  const scope = getRequestScope(request);
  if (!scope.isSuperAdmin && !scope.tenantId) {
    return null;
  }
  const result = await getPool().query<DraftDbRow>(
    `
    DELETE FROM ai_course_drafts
    WHERE external_draft_id = $1
      AND ($2::boolean = TRUE OR tenant_id = $3::uuid)
    RETURNING *
    `,
    [draftId, scope.isSuperAdmin, scope.tenantId],
  );
  return result.rows[0] || null;
}

export async function getAiPlatformLessonQuiz(
  request: Request,
  lessonId: string,
): Promise<(AiPlatformQuizSummary & { questions: Array<Omit<AiPlatformQuizQuestion, "correctAnswers" | "explanation">> }) | null> {
  await ensureTables();
  const jwt = decodeJwtPayload(getTokenFromRequest(request));
  if (!jwt?.sub) {
    throw new Error("Missing authenticated user");
  }

  const client = await getPool().connect();
  try {
    const quiz = await ensureAiPlatformQuizMaterialized(client, lessonId, jwt.sub);
    if (!quiz) {
      return null;
    }

    const questionsResult = await client.query<{
      id: string;
      lesson_id: string;
      text: string;
      question_type: string;
      options: Array<{ value: string; label: string }>;
      display_order: number;
    }>(
      `
      SELECT id, lesson_id, text, question_type, options, display_order
      FROM ai_platform_lesson_quiz_questions
      WHERE lesson_id = $1
      ORDER BY display_order ASC
      `,
      [lessonId],
    );

    return {
      lessonId: quiz.lessonId,
      courseId: quiz.courseId,
      title: quiz.title,
      passingScore: quiz.passingScore,
      questions: questionsResult.rows.map((row: {
        id: string;
        lesson_id: string;
        text: string;
        question_type: string;
        options: Array<{ value: string; label: string }>;
        display_order: number;
      }) => ({
        id: row.id,
        lessonId: row.lesson_id,
        text: row.text,
        type: row.question_type,
        options: row.options,
        allowMultiple: inferAllowMultiple(row.question_type, row.text),
        order: row.display_order,
      })),
    };
  } finally {
    client.release();
  }
}

export async function getAiPlatformLessonQuizForEditor(
  request: Request,
  lessonId: string,
): Promise<(AiPlatformQuizSummary & { questions: AiPlatformQuizQuestion[] }) | null> {
  await ensureTables();
  const scope = getRequestScope(request);
  if (!scope.userId || !["LearningExpert", "Manager", "Admin", "SuperAdmin"].includes(scope.role || "")) {
    throw new Error("Not authorized to edit AI platform quiz content");
  }

  const client = await getPool().connect();
  try {
    const quizResult = await client.query<{
      lesson_id: string;
      course_id: string;
      title: string;
      passing_score: number;
    }>(
      `
      SELECT q.lesson_id, q.course_id, q.title, q.passing_score
      FROM ai_platform_lesson_quizzes q
      JOIN courses c ON c.id = q.course_id
      WHERE q.lesson_id = $1
        AND ($2::boolean = TRUE OR c.tenant_id = $3::uuid)
      LIMIT 1
      `,
      [lessonId, scope.isSuperAdmin, scope.tenantId],
    );

    const quiz = quizResult.rows[0];
    if (!quiz) {
      return null;
    }

    const questionsResult = await client.query<{
      id: string;
      lesson_id: string;
      text: string;
      question_type: string;
      options: Array<{ value: string; label: string }>;
      correct_answers: string[];
      explanation: string | null;
      display_order: number;
    }>(
      `
      SELECT id, lesson_id, text, question_type, options, correct_answers, explanation, display_order
      FROM ai_platform_lesson_quiz_questions
      WHERE lesson_id = $1
      ORDER BY display_order ASC
      `,
      [lessonId],
    );

    return {
      lessonId: quiz.lesson_id,
      courseId: quiz.course_id,
      title: quiz.title,
      passingScore: quiz.passing_score,
      questions: questionsResult.rows.map((row) => ({
        id: row.id,
        lessonId: row.lesson_id,
        text: row.text,
        type: row.question_type,
        options: row.options,
        correctAnswers: normalizeCorrectAnswers(row.correct_answers),
        allowMultiple: inferAllowMultiple(row.question_type, row.text),
        explanation: row.explanation,
        order: row.display_order,
      })),
    };
  } finally {
    client.release();
  }
}

export async function updateAiPlatformLessonQuizForEditor(
  request: Request,
  lessonId: string,
  questions: Array<{
    id: string;
    text: string;
    type: string;
    options: Array<{ value: string; label: string }>;
    correctAnswers: string[];
    explanation?: string | null;
    order: number;
  }>,
): Promise<boolean> {
  await ensureTables();
  const scope = getRequestScope(request);
  if (!scope.userId || !["LearningExpert", "Manager", "Admin", "SuperAdmin"].includes(scope.role || "")) {
    throw new Error("Not authorized to edit AI platform quiz content");
  }

  const client = await getPool().connect();
  try {
    const quiz = await getAiPlatformLessonQuizForEditor(request, lessonId);
    if (!quiz) {
      return false;
    }

    for (const question of questions) {
      await client.query(
        `
        UPDATE ai_platform_lesson_quiz_questions
        SET text = $2,
            question_type = $3,
            options = $4::jsonb,
            correct_answers = $5::jsonb,
            explanation = $6,
            display_order = $7
        WHERE id = $1
          AND lesson_id = $8
        `,
        [
          question.id,
          question.text,
          question.type,
          JSON.stringify(question.options),
          JSON.stringify(question.correctAnswers),
          question.explanation || null,
          question.order,
          lessonId,
        ],
      );
    }

    return true;
  } finally {
    client.release();
  }
}

export async function submitAiPlatformLessonQuiz(
  request: Request,
  lessonId: string,
  answers: Record<string, string | string[]>,
): Promise<AiPlatformQuizAttemptResult | null> {
  await ensureTables();
  const jwt = decodeJwtPayload(getTokenFromRequest(request));
  if (!jwt?.sub) {
    throw new Error("Missing authenticated user");
  }

  const client = await getPool().connect();
  try {
    const quiz = await ensureAiPlatformQuizMaterialized(client, lessonId, jwt.sub);
    if (!quiz) {
      return null;
    }

    const questionRows = await client.query<{
      id: string;
      text: string;
      question_type: string;
      options: Array<{ value: string; label: string }>;
      correct_answers: string[];
      explanation: string | null;
      display_order: number;
    }>(
      `
      SELECT id, text, question_type, options, correct_answers, explanation, display_order
      FROM ai_platform_lesson_quiz_questions
      WHERE lesson_id = $1
      ORDER BY display_order ASC
      `,
      [lessonId],
    );

    const normalizedAnswers = Object.fromEntries(
      Object.entries(answers || {}).map(([questionId, value]) => [
        questionId,
        Array.isArray(value)
          ? value.map((item) => String(item).trim()).filter(Boolean)
          : [String(value).trim()].filter(Boolean),
      ]),
    ) as Record<string, string[]>;

    let correctCount = 0;
    const resultQuestions = questionRows.rows.map((row: {
      id: string;
      text: string;
      question_type: string;
      options: Array<{ value: string; label: string }>;
      correct_answers: string[];
      explanation: string | null;
      display_order: number;
    }) => {
      const userAnswers = normalizedAnswers[row.id] || [];
      const correctAnswers = normalizeCorrectAnswers(row.correct_answers);
      const isCorrect =
        userAnswers.length === correctAnswers.length &&
        userAnswers.every((value) => correctAnswers.includes(value));
      if (isCorrect) {
        correctCount += 1;
      }
      return {
        id: row.id,
        text: row.text,
        options: row.options,
        userAnswers,
        correctAnswers,
        isCorrect,
        explanation: row.explanation,
        allowMultiple: inferAllowMultiple(row.question_type, row.text),
      };
    });

    const totalQuestions = resultQuestions.length;
    const score = totalQuestions > 0 ? (correctCount / totalQuestions) * 100 : 0;
    const passed = score >= quiz.passingScore;
    const wrongAnswers = resultQuestions
      .filter((question: {
        id: string;
        text: string;
        userAnswers: string[];
        correctAnswers: string[];
        isCorrect: boolean;
        explanation: string | null;
      }) => !question.isCorrect)
      .map((question: {
        id: string;
        text: string;
        userAnswers: string[];
        correctAnswers: string[];
        explanation: string | null;
      }) => ({
        questionId: question.id,
        question: question.text,
        userAnswers: question.userAnswers,
        correctAnswers: question.correctAnswers,
        explanation: question.explanation,
      }));

    const attemptId = randomUUID();
    await client.query(
      `
      INSERT INTO ai_platform_lesson_quiz_attempts (
        id, lesson_id, user_id, course_id, answers, score, passed, wrong_answers, created_at, completed_at
      )
      VALUES ($1,$2,$3::uuid,$4::uuid,$5::jsonb,$6,$7,$8::jsonb,(NOW() AT TIME ZONE 'UTC'),(NOW() AT TIME ZONE 'UTC'))
      `,
      [
        attemptId,
        lessonId,
        jwt.sub,
        quiz.courseId,
        JSON.stringify(normalizedAnswers),
        score,
        passed,
        JSON.stringify(wrongAnswers),
      ],
    );

    await client.query(
      `
      INSERT INTO learner_course_contexts (
        id,
        user_id,
        course_id,
        current_lesson_id,
        last_opened_lesson_id,
        last_completed_lesson_id,
        latest_quiz_score,
        latest_quiz_passed,
        latest_failed_quiz_lesson_id,
        failed_quiz_count,
        last_quiz_attempted_at,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2::uuid,
        $3::uuid,
        $4::uuid,
        $4::uuid,
        $5::uuid,
        $6,
        $7,
        $8::uuid,
        $9,
        (NOW() AT TIME ZONE 'UTC'),
        (NOW() AT TIME ZONE 'UTC'),
        (NOW() AT TIME ZONE 'UTC')
      )
      ON CONFLICT (user_id, course_id)
      DO UPDATE SET
        current_lesson_id = EXCLUDED.current_lesson_id,
        last_opened_lesson_id = EXCLUDED.last_opened_lesson_id,
        last_completed_lesson_id = COALESCE(EXCLUDED.last_completed_lesson_id, learner_course_contexts.last_completed_lesson_id),
        latest_quiz_score = EXCLUDED.latest_quiz_score,
        latest_quiz_passed = EXCLUDED.latest_quiz_passed,
        latest_failed_quiz_lesson_id = COALESCE(EXCLUDED.latest_failed_quiz_lesson_id, learner_course_contexts.latest_failed_quiz_lesson_id),
        failed_quiz_count = CASE
          WHEN EXCLUDED.latest_quiz_passed THEN learner_course_contexts.failed_quiz_count
          ELSE learner_course_contexts.failed_quiz_count + 1
        END,
        last_quiz_attempted_at = EXCLUDED.last_quiz_attempted_at,
        updated_at = (NOW() AT TIME ZONE 'UTC')
      `,
      [
        randomUUID(),
        jwt.sub,
        quiz.courseId,
        lessonId,
        passed ? lessonId : null,
        score,
        passed,
        passed ? null : lessonId,
        passed ? 0 : 1,
      ],
    );

    return {
      attemptId,
      passed,
      score,
      totalQuestions,
      correctCount,
      questions: resultQuestions,
    };
  } finally {
    client.release();
  }
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
  thumbnail?: string | null,
) {
  await ensureTables();
  const scope = getRequestScope(request);
  if (!scope.isSuperAdmin && !scope.tenantId) {
    throw new Error("Tenant scope is required to save AI course drafts");
  }
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");

    const draftResult = await client.query<DraftDbRow>(
      `
      SELECT *
      FROM ai_course_drafts
      WHERE external_draft_id = $1
        AND ($2::boolean = TRUE OR tenant_id = $3::uuid)
      LIMIT 1
      `,
      [draftId, scope.isSuperAdmin, scope.tenantId],
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
    const xpReward = resolveAiCourseXpReward(record, totalDuration);
    const resolvedThumbnail =
      typeof thumbnail === "string" && thumbnail.trim().length > 0 ? thumbnail.trim() : null;

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
            xp_reward = $7,
            thumbnail = COALESCE($10, thumbnail),
            is_published = TRUE,
            author_id = COALESCE($8, author_id),
            tenant_id = COALESCE($9, tenant_id),
            updated_at = (NOW() AT TIME ZONE 'UTC')
        WHERE id = $1
        `,
        [
          courseId,
          finalCourse.stage?.name || record.title,
          "AI-generated course draft created from OpenMAIC and saved for learning-expert review.",
          "AI Generated",
          "Intermediate",
          totalDuration,
          xpReward,
          scope.userId || record.author_id,
          scope.tenantId || record.tenant_id,
          resolvedThumbnail,
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
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NULL,TRUE,$9,$10,(NOW() AT TIME ZONE 'UTC'),(NOW() AT TIME ZONE 'UTC'))
        `,
        [
          courseId,
          finalCourse.stage?.name || record.title,
          "AI-generated course draft created from OpenMAIC and saved for learning-expert review.",
          resolvedThumbnail,
          "AI Generated",
          "Intermediate",
          totalDuration,
          xpReward,
          scope.userId || record.author_id,
          scope.tenantId || record.tenant_id,
        ],
      );
    }

    const moduleId = randomUUID();
    await client.query(
      `
      INSERT INTO modules (id, course_id, title, description, "order", created_at)
      VALUES ($1,$2,$3,$4,$5,(NOW() AT TIME ZONE 'UTC'))
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
      const lessonId = randomUUID();
      const isAiQuizScene = scene.type === "quiz";
      await client.query(
        `
        INSERT INTO lessons (
          id, module_id, title, content, video_url, content_type, duration, "order", assessment_id, created_at
        )
        VALUES ($1,$2,$3,$4,NULL,$5,$6,$7,NULL,(NOW() AT TIME ZONE 'UTC'))
        `,
        [
          lessonId,
          moduleId,
          scene.title || `Scene ${lessonOrder}`,
          isAiQuizScene ? sanitizeAiQuizLessonContent(scene) : JSON.stringify(scene),
          scene.type || "slide",
          sceneDuration(scene as Record<string, unknown>),
          lessonOrder,
        ],
      );

      if (isAiQuizScene) {
        const questions = (scene.content?.questions || []).map((question: {
          id?: string;
          question?: string;
          text?: string;
          options?: Array<{ value?: string; label?: string } | string>;
          answer?: string[] | string;
          correctAnswer?: string[] | string;
          analysis?: string;
          explanation?: string;
        }, questionIndex: number) => {
          const options = normalizeQuizOptions(question.options);
          const correctAnswers = normalizeCorrectAnswers(
            question.answer ?? question.correctAnswer,
          );
          return {
            id: normalizeImportedUuid(question.id),
            text: String(question.question || question.text || `Question ${questionIndex + 1}`),
            options,
            correctAnswers,
            allowMultiple: correctAnswers.length > 1,
            explanation: question.analysis || question.explanation || null,
            order: questionIndex + 1,
          };
        });

        await client.query(
          `
          INSERT INTO ai_platform_lesson_quizzes (lesson_id, course_id, module_id, title, passing_score, created_at)
          VALUES ($1,$2,$3,$4,$5,(NOW() AT TIME ZONE 'UTC'))
          ON CONFLICT (lesson_id)
          DO UPDATE SET
            title = EXCLUDED.title,
            passing_score = EXCLUDED.passing_score
          `,
          [lessonId, courseId, moduleId, scene.title || `Quiz ${lessonOrder}`, 70],
        );

        await client.query(
          `DELETE FROM ai_platform_lesson_quiz_questions WHERE lesson_id = $1`,
          [lessonId],
        );

        for (const question of questions) {
          await client.query(
            `
            INSERT INTO ai_platform_lesson_quiz_questions (
              id, lesson_id, text, question_type, options, correct_answers, explanation, display_order, created_at
            )
            VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,(NOW() AT TIME ZONE 'UTC'))
            `,
            [
              question.id,
              lessonId,
              question.text,
              question.allowMultiple ? "multiple_select" : "multiple_choice",
              JSON.stringify(question.options),
              JSON.stringify(question.correctAnswers),
              question.explanation,
              question.order,
            ],
          );
        }
      }

      lessonOrder += 1;
    }

    const reviewResult = await client.query<DraftDbRow>(
      `
      UPDATE ai_course_drafts
      SET review_status = 'draft_saved',
          approved_by = $2,
          approved_at = (NOW() AT TIME ZONE 'UTC'),
          platform_course_id = $3,
          updated_at = (NOW() AT TIME ZONE 'UTC')
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
