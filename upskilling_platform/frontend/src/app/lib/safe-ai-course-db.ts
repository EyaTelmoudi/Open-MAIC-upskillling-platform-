type AiCourseDbModule = typeof import("./ai-course-db");

async function loadAiCourseDb(): Promise<AiCourseDbModule | null> {
  try {
    return await import("./ai-course-db");
  } catch {
    return null;
  }
}

export async function safeListAiCourseDrafts() {
  const db = await loadAiCourseDb();
  if (!db) return [];
  try {
    return await db.listAiCourseDrafts();
  } catch {
    return [];
  }
}

export async function safeGetAiCourseDraft(draftId: string) {
  const db = await loadAiCourseDb();
  if (!db) return null;
  try {
    return await db.getAiCourseDraft(draftId);
  } catch {
    return null;
  }
}

export async function safeGetAiCourseDraftByPlatformCourseId(
  request: Request,
  platformCourseId: string,
  title?: string | null,
) {
  const db = await loadAiCourseDb();
  if (!db) return null;
  try {
    return await db.getAiCourseDraftByPlatformCourseId(request, platformCourseId, title);
  } catch {
    return null;
  }
}

export async function safeUpsertAiCourseDraft(
  request: Request,
  payload: Parameters<AiCourseDbModule["upsertAiCourseDraft"]>[1],
) {
  const db = await loadAiCourseDb();
  if (!db) return null;
  try {
    return await db.upsertAiCourseDraft(request, payload);
  } catch {
    return null;
  }
}

export async function safeSaveAiCourseAsPlatformDraft(
  request: Request,
  draftId: string,
  approvedBy: string,
) {
  const db = await loadAiCourseDb();
  if (!db) return null;
  return db.saveAiCourseAsPlatformDraft(request, draftId, approvedBy);
}

export async function safeDeleteAiCourseDraft(draftId: string) {
  const db = await loadAiCourseDb();
  if (!db) return null;
  try {
    return await db.deleteAiCourseDraft(draftId);
  } catch {
    return null;
  }
}
