import {
  buildLearningApiPath,
  buildLearningServiceUrl,
  getLearningServiceAuthHeaders,
} from "@/app/lib/learning-service-proxy";

const DEFAULT_COURSE_ID = "30e2a552-f281-496e-99b8-cbab2fbff07b";

type CoursePayload = {
  id?: string;
  title?: string;
  description?: string | null;
  memory_retention_status?: string | null;
  modules?: Array<{
    title?: string | null;
    lessons?: Array<{
      id?: string;
      title?: string | null;
      order?: number | null;
    }>;
  }>;
};

type LearnerContextPayload = {
  currentLesson?: {
    lessonId?: string | null;
    title?: string | null;
  } | null;
  lastOpenedLesson?: {
    lessonId?: string | null;
    title?: string | null;
  } | null;
  failedQuizzes?: Array<{
    lessonTitle?: string | null;
  }>;
  failedQuizCount?: number | null;
  progressSummary?: {
    totalLessons?: number | null;
    completedLessons?: number | null;
    progressPercent?: number | null;
  } | null;
};

type ProgressRecord = {
  lesson_id?: string;
  status?: string;
  completed_at?: string | null;
  last_activity_at?: string | null;
};

function decodeJwtClaims(token: string | null): { tenantId?: string | null; sub?: string | null } | null {
  if (!token) {
    return null;
  }

  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as { tenantId?: string | null; sub?: string | null };
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

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function uniqueSuggestions(values: string[]) {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((value) => {
      const key = value.toLowerCase();
      if (seen.has(key)) {
        return false;
      }
      seen.add(key);
      return true;
    })
    .slice(0, 4);
}

async function fetchLearningJson<T>(request: Request, path: string): Promise<T> {
  const response = await fetch(buildLearningServiceUrl(buildLearningApiPath(path)), {
    cache: "no-store",
    headers: getLearningServiceAuthHeaders(request),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Learning service request failed for ${path}.`);
  }
  return payload as T;
}

function flattenLessons(course: CoursePayload) {
  return (course.modules || [])
    .flatMap((module) =>
      (module.lessons || []).map((lesson) => ({
        id: cleanText(lesson.id),
        title: cleanText(lesson.title),
        moduleTitle: cleanText(module.title),
        order: Number.isFinite(Number(lesson.order)) ? Number(lesson.order) : 0,
      })),
    )
    .filter((lesson) => lesson.id || lesson.title)
    .sort((left, right) => left.order - right.order);
}

function latestProgressRecord(progress: ProgressRecord[]) {
  return [...progress]
    .filter((record) => record.last_activity_at || record.completed_at)
    .sort((left, right) => {
      const leftTime = new Date(left.last_activity_at || left.completed_at || 0).getTime();
      const rightTime = new Date(right.last_activity_at || right.completed_at || 0).getTime();
      return rightTime - leftTime;
    })[0] || null;
}

function buildSuggestions(input: {
  course: CoursePayload | null;
  learnerContext: LearnerContextPayload | null;
  progress: ProgressRecord[];
}) {
  const courseTitle = cleanText(input.course?.title) || "this course";
  const lessons = input.course ? flattenLessons(input.course) : [];
  const firstLessonTitle = lessons[0]?.title || null;
  const currentLessonTitle = cleanText(input.learnerContext?.currentLesson?.title);
  const lastOpenedLessonTitle = cleanText(input.learnerContext?.lastOpenedLesson?.title);
  const failedQuizTitle = cleanText(input.learnerContext?.failedQuizzes?.[0]?.lessonTitle);
  const progressSummary = input.learnerContext?.progressSummary || null;
  const completedLessons = Number(progressSummary?.completedLessons || 0);
  const totalLessons = Number(progressSummary?.totalLessons || lessons.length || 0);
  const progressPercent = Number(progressSummary?.progressPercent || 0);
  const hasProgress = input.progress.length > 0 || completedLessons > 0 || progressPercent > 0;
  const latestProgress = latestProgressRecord(input.progress);
  const latestLesson =
    lessons.find((lesson) => lesson.id && lesson.id === cleanText(latestProgress?.lesson_id)) || null;
  const memoryReady = cleanText(input.course?.memory_retention_status).toLowerCase() === "completed";

  const candidates: string[] = [];

  if (memoryReady) {
    candidates.push(`What does the retained course memory say are the most important ideas in ${courseTitle}?`);
  } else {
    candidates.push(`What should I understand first before studying ${courseTitle}?`);
  }

  if (failedQuizTitle) {
    candidates.push(`Help me review the weak points from the quiz in "${failedQuizTitle}".`);
  }

  if (currentLessonTitle) {
    candidates.push(`What should I focus on before continuing "${currentLessonTitle}"?`);
  } else if (lastOpenedLessonTitle) {
    candidates.push(`Summarize what I should remember from "${lastOpenedLessonTitle}".`);
  } else if (latestLesson?.title) {
    candidates.push(`What should I review from "${latestLesson.title}" before moving forward?`);
  } else if (firstLessonTitle) {
    candidates.push(`How should I approach the first lesson, "${firstLessonTitle}"?`);
  }

  if (hasProgress && totalLessons > 0) {
    candidates.push(
      `Based on my progress (${completedLessons}/${totalLessons} lessons), what is the best next learning step?`,
    );
  } else {
    candidates.push(`Give me a focused study plan for starting ${courseTitle}.`);
  }

  candidates.push(`Explain the hardest concept in ${courseTitle} in simple terms.`);
  candidates.push(`Which topic in ${courseTitle} should I ask you about next?`);

  return uniqueSuggestions(candidates);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      courseId?: string | null;
      userId?: string | null;
    };

    const token = getTokenFromRequest(request);
    const claims = decodeJwtClaims(token);
    const userId = cleanText(body.userId) || cleanText(claims?.sub);
    const courseId = cleanText(body.courseId) || DEFAULT_COURSE_ID;

    if (!userId) {
      return Response.json({ success: false, error: "userId is required" }, { status: 400 });
    }

    const [course, learnerContext, progress] = await Promise.all([
      fetchLearningJson<CoursePayload>(request, `/courses/${encodeURIComponent(courseId)}`).catch(() => null),
      fetchLearningJson<LearnerContextPayload>(
        request,
        `/courses/${encodeURIComponent(courseId)}/learner-context/${encodeURIComponent(userId)}`,
      ).catch(() => null),
      fetchLearningJson<ProgressRecord[]>(
        request,
        `/progress/?user_id=${encodeURIComponent(userId)}&course_id=${encodeURIComponent(courseId)}`,
      ).catch(() => []),
    ]);

    const suggestions = buildSuggestions({
      course,
      learnerContext,
      progress: Array.isArray(progress) ? progress : [],
    });

    return Response.json(
      {
        success: true,
        suggestions,
        signals: {
          courseTitle: cleanText(course?.title) || null,
          memoryReady: cleanText(course?.memory_retention_status).toLowerCase() === "completed",
          hasLearnerContext: Boolean(learnerContext),
          progressRecords: Array.isArray(progress) ? progress.length : 0,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to build Hindsight coach suggestions.",
      },
      { status: 500 },
    );
  }
}
