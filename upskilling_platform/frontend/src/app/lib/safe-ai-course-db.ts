type AiCourseDbModule = typeof import("./ai-course-db");

async function loadAiCourseDb(): Promise<AiCourseDbModule | null> {
  try {
    return await import("./ai-course-db");
  } catch {
    return null;
  }
}

export async function safeListAiCourseDrafts(request: Request) {
  const db = await loadAiCourseDb();
  if (!db) return [];
  try {
    return await db.listAiCourseDrafts(request);
  } catch {
    return [];
  }
}

export async function safeHasAnyAiCourseDraftRecords(request?: Request) {
  const db = await loadAiCourseDb();
  if (!db || !("hasAnyAiCourseDraftRecords" in db)) return false;
  try {
    return await db.hasAnyAiCourseDraftRecords(request);
  } catch {
    return false;
  }
}

export async function safeGetAiCourseDraft(request: Request, draftId: string) {
  const db = await loadAiCourseDb();
  if (!db) return null;
  try {
    return await db.getAiCourseDraft(request, draftId);
  } catch {
    return null;
  }
}

export async function safeGetAiCourseRequestScope(request: Request) {
  const db = await loadAiCourseDb();
  if (!db || !("getAiCourseRequestScope" in db)) return null;
  try {
    return db.getAiCourseRequestScope(request);
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
  thumbnail?: string | null,
) {
  const db = await loadAiCourseDb();
  if (!db) return null;
  return db.saveAiCourseAsPlatformDraft(request, draftId, approvedBy, thumbnail);
}

export async function safeDeleteAiCourseDraft(request: Request, draftId: string) {
  const db = await loadAiCourseDb();
  if (!db) return null;
  try {
    return await db.deleteAiCourseDraft(request, draftId);
  } catch {
    return null;
  }
}

export async function safeGetAiPlatformLessonQuiz(request: Request, lessonId: string) {
  const db = await loadAiCourseDb();
  if (!db || !("getAiPlatformLessonQuiz" in db)) return null;
  try {
    return await db.getAiPlatformLessonQuiz(request, lessonId);
  } catch {
    return null;
  }
}

export async function safeGetAiPlatformLessonQuizForEditor(request: Request, lessonId: string) {
  const db = await loadAiCourseDb();
  if (!db || !("getAiPlatformLessonQuizForEditor" in db)) return null;
  try {
    return await db.getAiPlatformLessonQuizForEditor(request, lessonId);
  } catch {
    return null;
  }
}

export async function safeUpdateAiPlatformLessonQuizForEditor(
  request: Request,
  lessonId: string,
  questions: Parameters<AiCourseDbModule["updateAiPlatformLessonQuizForEditor"]>[2],
) {
  const db = await loadAiCourseDb();
  if (!db || !("updateAiPlatformLessonQuizForEditor" in db)) return false;
  try {
    return await db.updateAiPlatformLessonQuizForEditor(request, lessonId, questions);
  } catch {
    return false;
  }
}

export async function safeSubmitAiPlatformLessonQuiz(
  request: Request,
  lessonId: string,
  answers: Record<string, string | string[]>,
) {
  const db = await loadAiCourseDb();
  if (!db || !("submitAiPlatformLessonQuiz" in db)) return null;
  try {
    return await db.submitAiPlatformLessonQuiz(request, lessonId, answers);
  } catch {
    return null;
  }
}
