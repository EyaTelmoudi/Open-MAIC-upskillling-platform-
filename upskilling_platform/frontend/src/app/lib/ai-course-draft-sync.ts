import {
  buildLearningApiPath,
  buildLearningServiceUrl,
  getLearningServiceAuthHeaders,
} from "@/app/lib/learning-service-proxy";

export async function syncDraftToLearningService(
  request: Request,
  payload: {
    draft: Record<string, unknown>;
    finalCourse?: Record<string, unknown> | null;
    finalCoursePathRelative?: string | null;
    prompt?: string | null;
    sourcePdfName?: string | null;
    reviewStatus?: string | null;
  },
) {
  const response = await fetch(
    buildLearningServiceUrl(buildLearningApiPath("/ai-course-drafts/sync")),
    {
      method: "POST",
      headers: getLearningServiceAuthHeaders(request),
      body: JSON.stringify(payload),
      cache: "no-store",
    },
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.detail || data.error || "Failed to sync AI course draft");
  }
  return data;
}

export async function syncDraftToLearningServiceBestEffort(
  request: Request,
  payload: Parameters<typeof syncDraftToLearningService>[1],
) {
  try {
    return await syncDraftToLearningService(request, payload);
  } catch (error) {
    console.error("Best-effort AI course draft sync failed:", error);
    return null;
  }
}
