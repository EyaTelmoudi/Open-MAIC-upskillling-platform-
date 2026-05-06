import 'server-only';

import type { Scene, Stage } from '@/lib/types/stage';
import type { DraftSummary, FinalizedCoursePackage, LearningExpertDraft } from '@/lib/learing-expert-agent/types';
import { ensureOpenMAICTables, getOpenMAICPool } from './openmaic-db';
import { removePrefix } from './object-storage';

type DraftRow = {
  draft_id: string;
  submission_id: string;
  classroom_id: string;
  status: LearningExpertDraft['status'];
  storage_location: string | null;
  stage_data: Stage;
  source_scenes: Scene[];
  editable_scenes: LearningExpertDraft['editableScenes'];
  final_course: FinalizedCoursePackage | null;
  created_at: Date | string;
  updated_at: Date | string;
};

type SubmissionRow = {
  submission_id: string;
  requirement: string;
  options: Record<string, unknown>;
  source_pdf_file_name: string | null;
  source_pdf_size: string | number | null;
  source_pdf_type: string | null;
  source_pdf_object_key: string | null;
  parsed_pdf: Record<string, unknown> | null;
  openmaic_response: Record<string, unknown> | null;
  classroom_id: string | null;
  draft_id: string | null;
  storage_location: string | null;
  created_at: Date | string;
  updated_at: Date | string;
};

function toIsoString(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export interface LearningSubmissionRecord {
  submissionId: string;
  requirement: string;
  options: Record<string, unknown>;
  sourcePdfFileName?: string | null;
  sourcePdfSize?: number | null;
  sourcePdfType?: string | null;
  sourcePdfObjectKey?: string | null;
  parsedPdf?: Record<string, unknown> | null;
  openmaicResponse?: Record<string, unknown> | null;
  classroomId?: string | null;
  draftId?: string | null;
  storageLocation?: string | null;
  createdAt: string;
  updatedAt: string;
}

function mapSubmissionRow(row: SubmissionRow): LearningSubmissionRecord {
  return {
    submissionId: row.submission_id,
    requirement: row.requirement,
    options: row.options || {},
    sourcePdfFileName: row.source_pdf_file_name,
    sourcePdfSize:
      row.source_pdf_size == null ? null : Number.parseInt(String(row.source_pdf_size), 10),
    sourcePdfType: row.source_pdf_type,
    sourcePdfObjectKey: row.source_pdf_object_key,
    parsedPdf: row.parsed_pdf,
    openmaicResponse: row.openmaic_response,
    classroomId: row.classroom_id,
    draftId: row.draft_id,
    storageLocation: row.storage_location,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
  };
}

function mapDraftRow(row: DraftRow): LearningExpertDraft {
  return {
    draftId: row.draft_id,
    submissionId: row.submission_id,
    classroomId: row.classroom_id,
    outputDir: row.storage_location || `postgres://openmaic/drafts/${row.draft_id}`,
    outputDirRelative: row.storage_location || `postgres/drafts/${row.draft_id}`,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    status: row.status,
    stage: row.stage_data,
    sourceScenes: row.source_scenes,
    editableScenes: row.editable_scenes,
  };
}

export async function upsertLearningSubmission(params: {
  submissionId: string;
  requirement: string;
  options: Record<string, unknown>;
  sourcePdfFileName?: string | null;
  sourcePdfSize?: number | null;
  sourcePdfType?: string | null;
  sourcePdfObjectKey?: string | null;
  parsedPdf?: Record<string, unknown> | null;
  openmaicResponse?: Record<string, unknown> | null;
  classroomId?: string | null;
  draftId?: string | null;
  storageLocation?: string | null;
}): Promise<LearningSubmissionRecord> {
  await ensureOpenMAICTables();

  const result = await getOpenMAICPool().query<SubmissionRow>(
    `
      INSERT INTO openmaic_learning_submissions (
        submission_id,
        requirement,
        options,
        source_pdf_file_name,
        source_pdf_size,
        source_pdf_type,
        source_pdf_object_key,
        parsed_pdf,
        openmaic_response,
        classroom_id,
        draft_id,
        storage_location,
        created_at,
        updated_at
      )
      VALUES (
        $1,$2,$3::jsonb,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,NOW(),NOW()
      )
      ON CONFLICT (submission_id)
      DO UPDATE SET
        requirement = EXCLUDED.requirement,
        options = EXCLUDED.options,
        source_pdf_file_name = COALESCE(EXCLUDED.source_pdf_file_name, openmaic_learning_submissions.source_pdf_file_name),
        source_pdf_size = COALESCE(EXCLUDED.source_pdf_size, openmaic_learning_submissions.source_pdf_size),
        source_pdf_type = COALESCE(EXCLUDED.source_pdf_type, openmaic_learning_submissions.source_pdf_type),
        source_pdf_object_key = COALESCE(EXCLUDED.source_pdf_object_key, openmaic_learning_submissions.source_pdf_object_key),
        parsed_pdf = COALESCE(EXCLUDED.parsed_pdf, openmaic_learning_submissions.parsed_pdf),
        openmaic_response = COALESCE(EXCLUDED.openmaic_response, openmaic_learning_submissions.openmaic_response),
        classroom_id = COALESCE(EXCLUDED.classroom_id, openmaic_learning_submissions.classroom_id),
        draft_id = COALESCE(EXCLUDED.draft_id, openmaic_learning_submissions.draft_id),
        storage_location = COALESCE(EXCLUDED.storage_location, openmaic_learning_submissions.storage_location),
        updated_at = NOW()
      RETURNING *
    `,
    [
      params.submissionId,
      params.requirement,
      JSON.stringify(params.options || {}),
      params.sourcePdfFileName || null,
      params.sourcePdfSize || null,
      params.sourcePdfType || null,
      params.sourcePdfObjectKey || null,
      params.parsedPdf ? JSON.stringify(params.parsedPdf) : null,
      params.openmaicResponse ? JSON.stringify(params.openmaicResponse) : null,
      params.classroomId || null,
      params.draftId || null,
      params.storageLocation || null,
    ],
  );

  return mapSubmissionRow(result.rows[0]);
}

export async function readLearningSubmission(
  submissionId: string,
): Promise<LearningSubmissionRecord | null> {
  await ensureOpenMAICTables();
  const result = await getOpenMAICPool().query<SubmissionRow>(
    `SELECT * FROM openmaic_learning_submissions WHERE submission_id = $1 LIMIT 1`,
    [submissionId],
  );
  return result.rows[0] ? mapSubmissionRow(result.rows[0]) : null;
}

export async function deleteLearningSubmission(
  submissionId: string,
  classroomId?: string | null,
): Promise<void> {
  await ensureOpenMAICTables();
  const submission = await readLearningSubmission(submissionId);
  await getOpenMAICPool().query(
    `DELETE FROM openmaic_learning_submissions WHERE submission_id = $1`,
    [submissionId],
  );

  await removePrefix(`submissions/${submissionId}/`);
  if (classroomId || submission?.classroomId) {
    await removePrefix(`classrooms/${classroomId || submission?.classroomId}/`);
  }
}

export async function createOrUpdateLearningDraft(params: {
  draftId: string;
  submissionId: string;
  classroomId: string;
  status: LearningExpertDraft['status'];
  stage: Stage;
  sourceScenes: Scene[];
  editableScenes: LearningExpertDraft['editableScenes'];
  finalCourse?: FinalizedCoursePackage | null;
  storageLocation?: string | null;
}): Promise<LearningExpertDraft> {
  await ensureOpenMAICTables();
  const result = await getOpenMAICPool().query<DraftRow>(
    `
      INSERT INTO openmaic_learning_drafts (
        draft_id,
        submission_id,
        classroom_id,
        status,
        storage_location,
        stage_data,
        source_scenes,
        editable_scenes,
        final_course,
        created_at,
        updated_at
      )
      VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,NOW(),NOW())
      ON CONFLICT (draft_id)
      DO UPDATE SET
        submission_id = EXCLUDED.submission_id,
        classroom_id = EXCLUDED.classroom_id,
        status = EXCLUDED.status,
        storage_location = COALESCE(EXCLUDED.storage_location, openmaic_learning_drafts.storage_location),
        stage_data = EXCLUDED.stage_data,
        source_scenes = EXCLUDED.source_scenes,
        editable_scenes = EXCLUDED.editable_scenes,
        final_course = COALESCE(EXCLUDED.final_course, openmaic_learning_drafts.final_course),
        updated_at = NOW()
      RETURNING *
    `,
    [
      params.draftId,
      params.submissionId,
      params.classroomId,
      params.status,
      params.storageLocation || null,
      JSON.stringify(params.stage),
      JSON.stringify(params.sourceScenes),
      JSON.stringify(params.editableScenes),
      params.finalCourse ? JSON.stringify(params.finalCourse) : null,
    ],
  );

  return mapDraftRow(result.rows[0]);
}

export async function readLearningDraft(draftId: string): Promise<LearningExpertDraft | null> {
  await ensureOpenMAICTables();
  const result = await getOpenMAICPool().query<DraftRow>(
    `SELECT * FROM openmaic_learning_drafts WHERE draft_id = $1 LIMIT 1`,
    [draftId],
  );
  return result.rows[0] ? mapDraftRow(result.rows[0]) : null;
}

export async function readFinalizedLearningCourse(
  draftId: string,
): Promise<FinalizedCoursePackage | null> {
  await ensureOpenMAICTables();
  const result = await getOpenMAICPool().query<DraftRow>(
    `SELECT final_course FROM openmaic_learning_drafts WHERE draft_id = $1 LIMIT 1`,
    [draftId],
  );
  return result.rows[0]?.final_course || null;
}

export async function listLearningDraftSummaries(): Promise<DraftSummary[]> {
  await ensureOpenMAICTables();
  const result = await getOpenMAICPool().query<DraftRow>(
    `SELECT * FROM openmaic_learning_drafts ORDER BY updated_at DESC`,
  );

  return result.rows.map((row) => ({
    draftId: row.draft_id,
    submissionId: row.submission_id,
    classroomId: row.classroom_id,
    outputDirRelative: row.storage_location || `postgres/drafts/${row.draft_id}`,
    title: row.stage_data.name,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    status: row.status,
    scenesCount: row.editable_scenes.length,
    approvedScenesCount: row.editable_scenes.filter((scene) => scene.status === 'approved').length,
  }));
}

export async function deleteLearningDraft(draftId: string): Promise<boolean> {
  await ensureOpenMAICTables();
  const draft = await readLearningDraft(draftId);
  if (!draft) return false;

  await getOpenMAICPool().query(`DELETE FROM openmaic_learning_drafts WHERE draft_id = $1`, [
    draftId,
  ]);
  await deleteLearningSubmission(draft.submissionId, draft.classroomId);
  return true;
}
