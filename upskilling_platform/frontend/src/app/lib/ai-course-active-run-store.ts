import { promises as fs } from "fs";
import { randomUUID } from "crypto";
import path from "path";

export type ActiveGenerationRunRecord = {
  runId: string;
  active: boolean;
  status: "running" | "completed" | "failed" | "cancelled";
  sourcePdfName: string;
  promptPreview: string;
  startedAt: string;
  updatedAt: string;
  progress: {
    step: string;
    progress: number;
    message: string;
    scenesGenerated?: number;
    totalScenes?: number;
    draftId?: string;
    classroomId?: string;
  } | null;
  result?: {
    draftId: string;
    draftStatus: string;
    submissionId: string;
    outputDir: string;
    outputDirRelative: string;
    classroomId: string;
    classroomUrl: string;
    scenesCount: number;
    stage: {
      name?: string;
      languageDirective?: string;
    };
    scenes: Array<{
      id: string;
      title: string;
      type: string;
      order: number;
    }>;
  } | null;
  error?: string | null;
};

const STORE_DIR = path.join(process.cwd(), ".ai-course-studio");
const STORE_FILE = path.join(STORE_DIR, "active-generation.json");
let writeQueue: Promise<void> = Promise.resolve();
async function ensureStore() {
  await fs.mkdir(STORE_DIR, { recursive: true });
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function replaceStoreFile(tempFile: string, serialized: string) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      await fs.copyFile(tempFile, STORE_FILE);
      await fs.rm(tempFile, { force: true }).catch(() => undefined);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== "EPERM" && code !== "ENOENT") {
        throw error;
      }
      await sleep(25 * (attempt + 1));
    }
  }

  await fs.writeFile(STORE_FILE, serialized, "utf8");
  await fs.rm(tempFile, { force: true }).catch(() => undefined);
}

export async function getActiveGenerationRun(): Promise<ActiveGenerationRunRecord | null> {
  await ensureStore();
  try {
    const content = await fs.readFile(STORE_FILE, "utf8");
    return JSON.parse(content) as ActiveGenerationRunRecord;
  } catch (error) {
    if (error instanceof SyntaxError) {
      await fs.rm(STORE_FILE, { force: true }).catch(() => undefined);
      return null;
    }
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function setActiveGenerationRun(record: ActiveGenerationRunRecord) {
  writeQueue = writeQueue
    .catch(() => undefined)
    .then(async () => {
      await ensureStore();
      const serialized = JSON.stringify(record, null, 2);
      const tempFile = path.join(STORE_DIR, `active-generation.${randomUUID()}.tmp`);
      await fs.writeFile(tempFile, serialized, "utf8");
      await replaceStoreFile(tempFile, serialized);
    });
  return writeQueue;
}

export async function clearActiveGenerationRun() {
  await ensureStore();
  await fs.rm(STORE_FILE, { force: true });
}
