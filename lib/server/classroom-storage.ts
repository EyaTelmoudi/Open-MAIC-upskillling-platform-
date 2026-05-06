import { promises as fs } from 'fs';
import path from 'path';
import type { NextRequest } from 'next/server';
import type { Scene, Stage } from '@/lib/types/stage';
import { ensureOpenMAICTables, getOpenMAICPool } from './openmaic-db';

export const CLASSROOMS_DIR = path.join(process.cwd(), 'data', 'classrooms');
export const CLASSROOM_JOBS_DIR = path.join(process.cwd(), 'data', 'classroom-jobs');

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}

export async function ensureClassroomsDir() {
  await ensureDir(CLASSROOMS_DIR);
}

export async function ensureClassroomJobsDir() {
  await ensureDir(CLASSROOM_JOBS_DIR);
}

export async function writeJsonFileAtomic(filePath: string, data: unknown) {
  const dir = path.dirname(filePath);
  await ensureDir(dir);

  const tempFilePath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  const content = JSON.stringify(data, null, 2);
  await fs.writeFile(tempFilePath, content, 'utf-8');
  await fs.rename(tempFilePath, filePath);
}

export function buildRequestOrigin(req: NextRequest): string {
  return req.headers.get('x-forwarded-host')
    ? `${req.headers.get('x-forwarded-proto') || 'http'}://${req.headers.get('x-forwarded-host')}`
    : req.nextUrl.origin;
}

export interface PersistedClassroomData {
  id: string;
  stage: Stage;
  scenes: Scene[];
  createdAt: string;
}

export function isValidClassroomId(id: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(id);
}

export async function readClassroom(id: string): Promise<PersistedClassroomData | null> {
  await ensureOpenMAICTables();
  const result = await getOpenMAICPool().query<{
    id: string;
    stage_data: Stage;
    scenes_data: Scene[];
    created_at: Date | string;
  }>(`SELECT * FROM openmaic_classrooms WHERE id = $1 LIMIT 1`, [id]);

  if (!result.rows[0]) {
    return null;
  }

  const row = result.rows[0];
  return {
    id: row.id,
    stage: row.stage_data,
    scenes: row.scenes_data,
    createdAt:
      row.created_at instanceof Date ? row.created_at.toISOString() : new Date(row.created_at).toISOString(),
  };
}

export async function persistClassroom(
  data: {
    id: string;
    stage: Stage;
    scenes: Scene[];
  },
  baseUrl: string,
): Promise<PersistedClassroomData & { url: string }> {
  const classroomData: PersistedClassroomData = {
    id: data.id,
    stage: data.stage,
    scenes: data.scenes,
    createdAt: new Date().toISOString(),
  };

  await ensureOpenMAICTables();
  await getOpenMAICPool().query(
    `
      INSERT INTO openmaic_classrooms (id, stage_data, scenes_data, created_at, updated_at)
      VALUES ($1, $2::jsonb, $3::jsonb, $4, NOW())
      ON CONFLICT (id)
      DO UPDATE SET
        stage_data = EXCLUDED.stage_data,
        scenes_data = EXCLUDED.scenes_data,
        updated_at = NOW()
    `,
    [data.id, JSON.stringify(data.stage), JSON.stringify(data.scenes), classroomData.createdAt],
  );

  return {
    ...classroomData,
    url: `${baseUrl}/classroom/${data.id}`,
  };
}
