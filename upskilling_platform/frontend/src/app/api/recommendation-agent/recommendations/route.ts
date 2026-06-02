import {
  buildLearningApiPath,
  buildLearningServiceUrl,
  getLearningServiceAuthHeaders,
} from "@/app/lib/learning-service-proxy";
import { startRecommendationFeedWorkflow } from "@/app/lib/recommendation-agent";
import {
  getLearnerSkillProfile,
  upsertLearnerSkillProfile,
} from "@/app/lib/recommendation-skill-profile-db";
import { createHash } from "node:crypto";

const AGENT_PREFIX = "[Agno Recommendation Agent]";

type RecommendationResponse = {
  success: boolean;
  workflowName: string;
  action: string;
  status?: string;
  message?: string;
  generatedAt?: string;
  recommendations?: Array<Record<string, unknown>>;
  summary?: {
    total?: number;
    highPriority?: number;
    mediumPriority?: number;
    lowPriority?: number;
  };
  cached?: boolean;
  cacheStatus?: "fresh" | "stale_revalidating" | "missing_revalidating";
  databaseRecordId?: string | null;
  lastComputedAt?: string | null;
  sourceFingerprint?: string | null;
};

type LearnerActivitySnapshot = {
  enrollments: Array<{
    courseId: string;
    status: string;
    enrolledAt: string | null;
    completedAt: string | null;
  }>;
  progress: Array<{
    lessonId: string;
    status: string;
    completedAt: string | null;
    lastActivityAt: string | null;
    timeSpent: number | null;
  }>;
  learnerContexts: Array<{
    courseId: string;
    currentLessonId: string | null;
    currentLessonTitle: string | null;
    lastOpenedLessonId: string | null;
    lastOpenedLessonTitle: string | null;
    latestFailedQuizLessonId: string | null;
    latestFailedQuizLessonTitle: string | null;
    failedQuizCount: number;
    progressPercent: number | null;
  }>;
  fingerprint: string;
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

async function fetchLearningJson(request: Request, path: string) {
  const response = await fetch(buildLearningServiceUrl(buildLearningApiPath(path)), {
    cache: "no-store",
    headers: getLearningServiceAuthHeaders(request),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Learning service request failed for ${path}.`);
  }
  return payload;
}

async function resolveTenantIdForRecommendationRequest(
  request: Request,
  userId: string,
  candidateTenantId: string | null,
) {
  if (candidateTenantId?.trim()) {
    return candidateTenantId.trim();
  }

  const enrollmentsPayload = await fetchLearningJson(
    request,
    `/enrollments/?user_id=${encodeURIComponent(userId)}`,
  ).catch(() => []);
  const enrollments = normalizeEnrollments(
    enrollmentsPayload as Array<Record<string, unknown>> | undefined,
  );

  for (const enrollment of enrollments) {
    const course = await fetchLearningJson(request, `/courses/${enrollment.courseId}`).catch(
      () => null,
    );
    const courseTenantId = cleanText((course as Record<string, unknown> | null)?.tenant_id);
    if (courseTenantId) {
      return courseTenantId;
    }
  }

  const courseList = await fetchLearningJson(
    request,
    "/courses/?is_published=true&page_size=1",
  ).catch(() => null);
  const firstCourse = Array.isArray((courseList as { items?: unknown[] } | null)?.items)
    ? ((courseList as { items: Array<Record<string, unknown>> }).items[0] || null)
    : null;
  const fallbackTenantId = cleanText(firstCourse?.tenant_id);

  return fallbackTenantId || null;
}

function cleanText(value: unknown) {
  return String(value || "").trim();
}

function normalizeSkillRadar(payload: Record<string, unknown>) {
  return (
    (payload.crossCourseSynthesis as { skillRadar?: Array<Record<string, unknown>> } | undefined)
      ?.skillRadar || []
  )
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      skill_domain: cleanText(item.skill_domain),
      status: cleanText(item.status),
      evidence_summary: Array.isArray(item.evidence_summary)
        ? item.evidence_summary.map((entry) => cleanText(entry)).filter(Boolean)
        : [],
    }))
    .filter((item) => item.skill_domain && item.status);
}

function normalizeEnrollments(enrollments: Array<Record<string, unknown>> | undefined) {
  return (enrollments || [])
    .map((entry) => ({
      courseId: cleanText(entry.course_id),
      status: cleanText(entry.status),
      enrolledAt: cleanText(entry.enrolled_at) || null,
      completedAt: cleanText(entry.completed_at) || null,
    }))
    .filter((entry) => entry.courseId)
    .sort((left, right) => {
      const byCourse = left.courseId.localeCompare(right.courseId);
      if (byCourse !== 0) {
        return byCourse;
      }
      return (left.enrolledAt || "").localeCompare(right.enrolledAt || "");
    });
}

function normalizeProgress(progressRecords: Array<Record<string, unknown>> | undefined) {
  return (progressRecords || [])
    .map((entry) => ({
      lessonId: cleanText(entry.lesson_id),
      status: cleanText(entry.status),
      completedAt: cleanText(entry.completed_at) || null,
      lastActivityAt: cleanText(entry.last_activity_at) || null,
      timeSpent:
        typeof entry.time_spent === "number"
          ? entry.time_spent
          : Number.isFinite(Number(entry.time_spent))
            ? Number(entry.time_spent)
            : null,
    }))
    .filter((entry) => entry.lessonId)
    .sort((left, right) => {
      const byLesson = left.lessonId.localeCompare(right.lessonId);
      if (byLesson !== 0) {
        return byLesson;
      }
      return (left.lastActivityAt || left.completedAt || "").localeCompare(
        right.lastActivityAt || right.completedAt || "",
      );
    });
}

function buildActivityFingerprint(input: {
  enrollments: LearnerActivitySnapshot["enrollments"];
  progress: LearnerActivitySnapshot["progress"];
  learnerContexts: LearnerActivitySnapshot["learnerContexts"];
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        enrollments: input.enrollments,
        progress: input.progress,
        learnerContexts: [...input.learnerContexts].sort((left, right) =>
          left.courseId.localeCompare(right.courseId),
        ),
      }),
    )
    .digest("hex");
}

function getLatestActivityTimestamp(snapshot: Pick<LearnerActivitySnapshot, "enrollments" | "progress">) {
  const candidates = [
    ...snapshot.enrollments.flatMap((entry) => [entry.enrolledAt, entry.completedAt]),
    ...snapshot.progress.flatMap((entry) => [entry.lastActivityAt, entry.completedAt]),
  ].filter((value): value is string => Boolean(value));

  if (candidates.length === 0) {
    return null;
  }

  return candidates.reduce((latest, current) =>
    new Date(current).getTime() > new Date(latest).getTime() ? current : latest,
  );
}

async function loadLearnerActivitySnapshot(
  request: Request,
  userId: string,
): Promise<LearnerActivitySnapshot> {
  const [enrollmentsPayload, progressPayload] = await Promise.all([
    fetchLearningJson(request, `/enrollments/?user_id=${encodeURIComponent(userId)}`),
    fetchLearningJson(request, `/progress/?user_id=${encodeURIComponent(userId)}`),
  ]);

  const enrollments = normalizeEnrollments(enrollmentsPayload as Array<Record<string, unknown>> | undefined);
  const progress = normalizeProgress(progressPayload as Array<Record<string, unknown>> | undefined);

  const learnerContexts = await Promise.all(
    enrollments.map(async (entry) => {
      try {
        const payload = await fetchLearningJson(
          request,
          `/courses/${entry.courseId}/learner-context/${encodeURIComponent(userId)}`,
        );
        return {
          courseId: entry.courseId,
          currentLessonId: cleanText(payload?.currentLesson?.lessonId) || null,
          currentLessonTitle: cleanText(payload?.currentLesson?.title) || null,
          lastOpenedLessonId: cleanText(payload?.lastOpenedLesson?.lessonId) || null,
          lastOpenedLessonTitle: cleanText(payload?.lastOpenedLesson?.title) || null,
          latestFailedQuizLessonId: cleanText(payload?.latestFailedQuizLessonId) || null,
          latestFailedQuizLessonTitle: cleanText(payload?.failedQuizzes?.[0]?.lessonTitle) || null,
          failedQuizCount: Number(payload?.failedQuizCount || 0),
          progressPercent: Number.isFinite(Number(payload?.progressSummary?.progressPercent))
            ? Number(payload?.progressSummary?.progressPercent)
            : null,
        };
      } catch {
        return {
          courseId: entry.courseId,
          currentLessonId: null,
          currentLessonTitle: null,
          lastOpenedLessonId: null,
          lastOpenedLessonTitle: null,
          latestFailedQuizLessonId: null,
          latestFailedQuizLessonTitle: null,
          failedQuizCount: 0,
          progressPercent: null,
        };
      }
    }),
  );

  return {
    enrollments,
    progress,
    learnerContexts,
    fingerprint: buildActivityFingerprint({
      enrollments,
      progress,
      learnerContexts,
    }),
  };
}

function hasRecommendationPayload(profile: {
  profile_payload?: Record<string, unknown>;
} | null) {
  const payload = profile?.profile_payload || {};
  if (Object.keys(payload).length === 0) {
    return false;
  }

  return Array.isArray(payload.recommendations) ? payload.recommendations.length > 0 : true;
}

function getCachedRecommendationFingerprint(profile: {
  profile_payload?: Record<string, unknown>;
} | null) {
  const payload = profile?.profile_payload || {};
  return typeof payload.sourceFingerprint === "string" ? payload.sourceFingerprint : null;
}

function hasRecommendationLearnerMessages(profile: {
  profile_payload?: Record<string, unknown>;
} | null) {
  const payload = profile?.profile_payload || {};
  const recommendations = Array.isArray(payload.recommendations) ? payload.recommendations : [];
  if (recommendations.length === 0) {
    return false;
  }

  return recommendations.every((item) => {
    if (!item || typeof item !== "object") {
      return false;
    }
    return typeof (item as Record<string, unknown>).learnerMessage === "string";
  });
}

function buildCachedRecommendationResponse(input: {
  cachedProfile: {
    id: string;
    updated_at: string;
    profile_payload: Record<string, unknown>;
  };
  cacheStatus: "fresh" | "stale_revalidating";
}): RecommendationResponse {
  const cachedPayload = input.cachedProfile.profile_payload || {};
  return {
    success: true,
    workflowName: String(cachedPayload.workflowName || "recommendation-agent"),
    action: String(cachedPayload.action || "recommendation-feed"),
    status: String(cachedPayload.status || "ready"),
    message: String(
      cachedPayload.message ||
        (input.cacheStatus === "fresh"
          ? "Recommendations loaded from the latest saved profile."
          : "Saved recommendations loaded while a refresh runs in the background."),
    ),
    generatedAt:
      typeof cachedPayload.generatedAt === "string" ? cachedPayload.generatedAt : input.cachedProfile.updated_at,
    recommendations: Array.isArray(cachedPayload.recommendations) ? cachedPayload.recommendations : [],
    summary:
      cachedPayload.summary && typeof cachedPayload.summary === "object"
        ? (cachedPayload.summary as RecommendationResponse["summary"])
        : undefined,
    cached: true,
    cacheStatus: input.cacheStatus,
    databaseRecordId: input.cachedProfile.id,
    lastComputedAt: input.cachedProfile.updated_at,
    sourceFingerprint:
      typeof cachedPayload.sourceFingerprint === "string" ? cachedPayload.sourceFingerprint : null,
  };
}

function getRefreshState() {
  const globalScope = globalThis as typeof globalThis & {
    __recommendationFeedRefreshState?: Set<string>;
  };

  if (!globalScope.__recommendationFeedRefreshState) {
    globalScope.__recommendationFeedRefreshState = new Set<string>();
  }

  return globalScope.__recommendationFeedRefreshState;
}

async function computeAndStoreRecommendationFeed(input: {
  request: Request;
  tenantId: string;
  userId: string;
  activitySnapshot?: LearnerActivitySnapshot | null;
}) {
  const { request, tenantId, userId } = input;
  console.log(
    `${AGENT_PREFIX} feed compute started. tenantId=${tenantId} userId=${userId} activityFingerprint=${input.activitySnapshot?.fingerprint?.slice(0, 12) || "pending"}`,
  );

  const cachedSkillProfile = await getLearnerSkillProfile({
    tenantId,
    userId,
    profileType: "skill_gap_radar",
  });
  const cachedSkillPayload = (cachedSkillProfile?.profile_payload || {}) as Record<string, unknown>;
  const skillRadar = normalizeSkillRadar(cachedSkillPayload);

  if (skillRadar.length === 0) {
    console.log(
      `${AGENT_PREFIX} feed compute skipped because skill radar is empty. tenantId=${tenantId} userId=${userId}`,
    );
    return null;
  }

  const activitySnapshot = input.activitySnapshot || (await loadLearnerActivitySnapshot(request, userId));
  console.log(
    `${AGENT_PREFIX} feed compute learner snapshot loaded. tenantId=${tenantId} userId=${userId} enrollments=${activitySnapshot.enrollments.length} progress=${activitySnapshot.progress.length} contexts=${activitySnapshot.learnerContexts.length} fingerprint=${activitySnapshot.fingerprint.slice(0, 12)}`,
  );

  const courseList = await fetchLearningJson(request, "/courses/?is_published=true&page_size=100");

  const courses = ((courseList?.items as Array<Record<string, unknown>> | undefined) || [])
    .map((course) => ({
      id: String(course.id || "").trim(),
      title: String(course.title || "").trim(),
      description: String(course.description || "").trim() || null,
      category: String(course.category || "").trim() || null,
      difficulty: String(course.difficulty || "").trim() || null,
      isPublished: Boolean(course.is_published ?? true),
    }))
    .filter((course) => course.id && course.title);

  console.log(
    `${AGENT_PREFIX} feed compute learning catalog ready. tenantId=${tenantId} userId=${userId} courses=${courses.length} skillRadar=${skillRadar.length}`,
  );

  const result = await startRecommendationFeedWorkflow({
    tenantId,
    userId,
    source: "recommendations-page",
    pagePath: "/recommendations",
    skillRadar,
    courses,
    enrollments: activitySnapshot.enrollments,
    learnerContexts: activitySnapshot.learnerContexts,
  });

  console.log(
    `${AGENT_PREFIX} feed workflow finished. tenantId=${tenantId} userId=${userId} recommendations=${result.recommendations?.length || 0} summaryTotal=${result.summary?.total ?? "n/a"}`,
  );

  const profilePayload = {
    ...result,
    workflowName: result.workflowName || "recommendation-agent",
    action: result.action || "recommendation-feed",
    status: "ready",
    message: "Recommendations prepared from the latest learner profile.",
    sourceFingerprint: activitySnapshot.fingerprint,
  };

  const databaseRecord = await upsertLearnerSkillProfile({
    tenantId,
    userId,
    profileType: "recommendation_feed",
    status: "ready",
    bankId: `tenant:${tenantId}:user:${userId}:skill-profile`,
    source: "recommendations-page",
    payload: profilePayload,
  });

  console.log(
    `${AGENT_PREFIX} feed cache stored. tenantId=${tenantId} userId=${userId} recordId=${databaseRecord?.id || "n/a"} updatedAt=${databaseRecord?.updated_at || "n/a"}`,
  );

  return {
    ...profilePayload,
    cached: false,
    cacheStatus: "fresh" as const,
    databaseRecordId: databaseRecord?.id || null,
    lastComputedAt: databaseRecord?.updated_at || null,
  };
}

function launchBackgroundRecommendationRefresh(input: {
  refreshKey: string;
  request: Request;
  tenantId: string;
  userId: string;
  activitySnapshot?: LearnerActivitySnapshot | null;
}) {
  const refreshState = getRefreshState();
  if (refreshState.has(input.refreshKey)) {
    console.log(
      `${AGENT_PREFIX} background feed refresh already running. tenantId=${input.tenantId} userId=${input.userId} key=${input.refreshKey}`,
    );
    return;
  }

  refreshState.add(input.refreshKey);
  console.log(
    `${AGENT_PREFIX} background feed refresh started. tenantId=${input.tenantId} userId=${input.userId} key=${input.refreshKey}`,
  );

  void (async () => {
    try {
      await computeAndStoreRecommendationFeed(input);
      console.log(
        `${AGENT_PREFIX} background feed refresh completed. tenantId=${input.tenantId} userId=${input.userId} key=${input.refreshKey}`,
      );
    } catch (error) {
      console.error(
        `${AGENT_PREFIX} background feed refresh failed. tenantId=${input.tenantId} userId=${input.userId} key=${input.refreshKey}`,
        error,
      );
    } finally {
      refreshState.delete(input.refreshKey);
    }
  })();
}

export async function POST(request: Request) {
  const token = getTokenFromRequest(request);
  const claims = decodeJwtClaims(token);
  const body = await request.json().catch(() => ({}));

  const requestedTenantId =
    typeof body?.tenantId === "string" ? body.tenantId : claims?.tenantId || null;
  const userId =
    typeof body?.userId === "string" ? body.userId : claims?.sub || null;

  if (!userId) {
    return Response.json(
      {
        success: false,
        workflowName: "recommendation-agent",
        action: "recommendations-route-rejected",
        error: "userId is required.",
      },
      { status: 400 },
    );
  }

  try {
    const tenantId = await resolveTenantIdForRecommendationRequest(
      request,
      userId,
      requestedTenantId,
    );

    if (!tenantId) {
      return Response.json(
        {
          success: false,
          workflowName: "recommendation-agent",
          action: "recommendations-route-rejected",
          error:
            "A company context is required. No tenant could be resolved from this user's profile or enrolled courses.",
        },
        { status: 400 },
      );
    }

    console.log(
      `${AGENT_PREFIX} recommendations request received. tenantId=${tenantId} userId=${userId}`,
    );
    const [cachedSkillProfile, cachedRecommendationProfile] = await Promise.all([
      getLearnerSkillProfile({
        tenantId,
        userId,
        profileType: "skill_gap_radar",
      }),
      getLearnerSkillProfile({
        tenantId,
        userId,
        profileType: "recommendation_feed",
      }),
    ]);

    const cachedSkillPayload = (cachedSkillProfile?.profile_payload || {}) as Record<string, unknown>;
    const skillRadar = normalizeSkillRadar(cachedSkillPayload);
    const refreshKey = `${tenantId}:${userId}`;
    const cachedRecommendationHasContent = hasRecommendationPayload(cachedRecommendationProfile);
    const cachedRecommendationHasLearnerMessages =
      hasRecommendationLearnerMessages(cachedRecommendationProfile);
    const cachedRecommendationFingerprint = getCachedRecommendationFingerprint(cachedRecommendationProfile);
    console.log(
      `${AGENT_PREFIX} recommendations cache check. skillRadar=${skillRadar.length} recommendationCacheHasContent=${cachedRecommendationHasContent} recommendationCacheHasLearnerMessages=${cachedRecommendationHasLearnerMessages} recommendationCachePresent=${Boolean(cachedRecommendationProfile)} cachedFingerprint=${cachedRecommendationFingerprint?.slice(0, 12) || "missing"}`,
    );

    if (skillRadar.length === 0) {
      console.log(
        `${AGENT_PREFIX} No skill radar available yet. Requesting skill-gap refresh before building recommendations. tenantId=${tenantId} userId=${userId}`,
      );
      const origin = new URL(request.url).origin;
      void fetch(`${origin}/api/recommendation-agent/skill-gap/start`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          tenantId,
          userId,
          pagePath: "/recommendations/skill-gap",
        }),
      }).catch(() => null);

      if (cachedRecommendationProfile && cachedRecommendationHasContent) {
        console.log(
          `${AGENT_PREFIX} Returning cached recommendations while skill-gap refresh runs in the background. tenantId=${tenantId} userId=${userId}`,
        );
        launchBackgroundRecommendationRefresh({
          refreshKey,
          request,
          tenantId,
          userId,
        });

        return Response.json(
          buildCachedRecommendationResponse({
            cachedProfile: cachedRecommendationProfile,
            cacheStatus: "stale_revalidating",
          }),
          { status: 200 },
        );
      }

      console.log(
        `${AGENT_PREFIX} recommendations response ready. tenantId=${tenantId} userId=${userId} mode=pending cacheStatus=missing_revalidating`,
      );
      return Response.json(
        {
          success: true,
          workflowName: "recommendation-agent",
          action: "recommendations-pending-skill-gap",
          status: "pending",
          message:
            "Your personalized recommendations are being prepared from your latest learner activity. This usually takes a moment.",
          recommendations: [],
          cached: false,
          cacheStatus: "missing_revalidating",
        } satisfies RecommendationResponse,
        { status: 200 },
      );
    }

    console.log(
      `${AGENT_PREFIX} loading learner activity snapshot for feed decision. tenantId=${tenantId} userId=${userId}`,
    );
    const currentActivitySnapshot = await loadLearnerActivitySnapshot(request, userId);
    const latestActivityAt = getLatestActivityTimestamp(currentActivitySnapshot);
    const fingerprintChanged =
      !cachedRecommendationFingerprint ||
      cachedRecommendationFingerprint !== currentActivitySnapshot.fingerprint ||
      !cachedRecommendationHasLearnerMessages;

    console.log(
      `${AGENT_PREFIX} learner activity fingerprint. tenantId=${tenantId} userId=${userId} current=${currentActivitySnapshot.fingerprint.slice(0, 12)} cached=${cachedRecommendationFingerprint?.slice(0, 12) || "missing"} changed=${fingerprintChanged} latestActivityAt=${latestActivityAt || "none"} hasLearnerMessages=${cachedRecommendationHasLearnerMessages}`,
    );

    if (
      cachedRecommendationProfile &&
      cachedRecommendationHasContent &&
      !fingerprintChanged
    ) {
      console.log(
        `${AGENT_PREFIX} Returning cached recommendations for unchanged learner activity. tenantId=${tenantId} userId=${userId}`,
      );
      console.log(
        `${AGENT_PREFIX} recommendations response ready. tenantId=${tenantId} userId=${userId} mode=cached cacheStatus=fresh`,
      );
      return Response.json(
        buildCachedRecommendationResponse({
          cachedProfile: cachedRecommendationProfile,
          cacheStatus: "fresh",
        }),
        { status: 200 },
      );
    }

    if (cachedRecommendationProfile && cachedRecommendationHasContent && fingerprintChanged) {
      console.log(
        `${AGENT_PREFIX} Learner activity changed. Returning cached recommendations while scheduling a refresh. tenantId=${tenantId} userId=${userId}`,
      );
      launchBackgroundRecommendationRefresh({
        refreshKey,
        request,
        tenantId,
        userId,
        activitySnapshot: currentActivitySnapshot,
      });

      console.log(
        `${AGENT_PREFIX} recommendations response ready. tenantId=${tenantId} userId=${userId} mode=stale cacheStatus=stale_revalidating`,
      );

      return Response.json(
        buildCachedRecommendationResponse({
          cachedProfile: cachedRecommendationProfile,
          cacheStatus: "stale_revalidating",
        }),
        { status: 200 },
      );
    }

    console.log(
      `${AGENT_PREFIX} No usable recommendations cache found or learner activity changed without cached feed. Starting background rebuild. tenantId=${tenantId} userId=${userId}`,
    );
    launchBackgroundRecommendationRefresh({
      refreshKey,
      request,
      tenantId,
      userId,
      activitySnapshot: currentActivitySnapshot,
    });

    console.log(
      `${AGENT_PREFIX} recommendations response ready. tenantId=${tenantId} userId=${userId} mode=background cacheStatus=missing_revalidating`,
    );

    return Response.json(
      {
        success: true,
        workflowName: "recommendation-agent",
        action: "recommendations-refresh-started",
        status: "pending",
        message:
          "Your personalized recommendations are being prepared from your latest learner activity. This usually takes a moment.",
        recommendations: [],
        cached: false,
        cacheStatus: "missing_revalidating",
      } satisfies RecommendationResponse,
      { status: 200 },
    );
  } catch (error) {
    console.error(
      `${AGENT_PREFIX} recommendations route failed. tenantId=${requestedTenantId || "auto"} userId=${userId}`,
      error,
    );
    return Response.json(
      {
        success: false,
        workflowName: "recommendation-agent",
        action: "recommendations-route-failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
