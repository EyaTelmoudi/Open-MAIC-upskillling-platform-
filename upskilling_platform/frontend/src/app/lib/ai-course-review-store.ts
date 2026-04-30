import { promises as fs } from "fs";
import path from "path";

export type CourseReviewStatus = "pending_review" | "draft_saved";

export type CourseReviewRecord = {
  draftId: string;
  status: CourseReviewStatus;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type ReviewStore = Record<string, CourseReviewRecord>;

const STORE_DIR = path.join(process.cwd(), ".ai-course-studio");
const STORE_FILE = path.join(STORE_DIR, "review-status.json");

async function ensureStore() {
  await fs.mkdir(STORE_DIR, { recursive: true });
}

async function readStore(): Promise<ReviewStore> {
  await ensureStore();
  try {
    const content = await fs.readFile(STORE_FILE, "utf8");
    return JSON.parse(content) as ReviewStore;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return {};
    }
    throw error;
  }
}

async function writeStore(store: ReviewStore) {
  await ensureStore();
  await fs.writeFile(STORE_FILE, JSON.stringify(store, null, 2), "utf8");
}

export async function getCourseReviewRecord(draftId: string): Promise<CourseReviewRecord> {
  const store = await readStore();
  const existing = store[draftId];
  if (existing) {
    return existing;
  }

  const now = new Date().toISOString();
  const created: CourseReviewRecord = {
    draftId,
    status: "pending_review",
    createdAt: now,
    updatedAt: now,
  };
  store[draftId] = created;
  await writeStore(store);
  return created;
}

export async function markCourseReviewAsDraftSaved(
  draftId: string,
  approvedBy: string,
): Promise<CourseReviewRecord> {
  const store = await readStore();
  const current = store[draftId];
  const now = new Date().toISOString();
  const next: CourseReviewRecord = {
    draftId,
    status: "draft_saved",
    createdAt: current?.createdAt || now,
    updatedAt: now,
    approvedAt: now,
    approvedBy,
  };
  store[draftId] = next;
  await writeStore(store);
  return next;
}
