import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";
import { LEARNING_URL } from "@/app/lib/api";
import { deletePublishedCourseMemory } from "@/app/lib/course-memory-agent";
import {
  safeDeleteAiCourseDraft,
  safeGetAiCourseDraftByPlatformCourseId,
} from "@/app/lib/safe-ai-course-db";

function getAuthTokenFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader;
  }

  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
  return match?.[1] ? `Bearer ${decodeURIComponent(match[1])}` : null;
}

export async function deleteManagedCourse(request: Request, courseId: string) {
  const authorization = getAuthTokenFromRequest(request);

  if (!authorization) {
    return Response.json(
      { success: false, detail: "Missing authentication token." },
      { status: 401 },
    );
  }

  const [linkedDraft, courseResponse] = await Promise.all([
    safeGetAiCourseDraftByPlatformCourseId(request, courseId).catch(() => null),
    fetch(`${LEARNING_URL}/api/v1/courses/${courseId}`, {
      method: "GET",
      headers: { Authorization: authorization },
      cache: "no-store",
    }),
  ]);

  if (!courseResponse.ok) {
    const error = await courseResponse.json().catch(() => ({ detail: courseResponse.statusText }));
    return Response.json(
      { success: false, detail: error.detail || "Course not found." },
      { status: courseResponse.status },
    );
  }

  const course = (await courseResponse.json().catch(() => null)) as
    | {
        tenant_id?: string | null;
        modules?: Array<{
          lessons?: Array<{ id?: string; content?: string | null }>;
        }>;
      }
    | null;

  await deletePublishedCourseMemory(courseId, course?.tenant_id || null, course);

  const deleteResponse = await fetch(`${LEARNING_URL}/api/v1/courses/${courseId}`, {
    method: "DELETE",
    headers: { Authorization: authorization },
    cache: "no-store",
  });

  if (!deleteResponse.ok && deleteResponse.status !== 204) {
    const error = await deleteResponse.json().catch(() => ({ detail: deleteResponse.statusText }));
    return Response.json(
      { success: false, detail: error.detail || "Failed to delete course." },
      { status: deleteResponse.status || 500 },
    );
  }

  if (linkedDraft?.external_draft_id) {
    const upstreamDraftDelete = await fetch(
      buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${linkedDraft.external_draft_id}`),
      {
        method: "DELETE",
        cache: "no-store",
      },
    );

    if (upstreamDraftDelete.ok) {
      await safeDeleteAiCourseDraft(linkedDraft.external_draft_id).catch(() => null);
    } else {
      console.warn(
        `[Course deletion] Failed to delete linked OpenMAIC draft ${linkedDraft.external_draft_id} for course ${courseId}. status=${upstreamDraftDelete.status}`,
      );
    }
  }

  return Response.json(
    {
      success: true,
      deleted: true,
      courseId,
      linkedAiDraftDeleted: Boolean(linkedDraft?.external_draft_id),
    },
    { status: 200 },
  );
}
