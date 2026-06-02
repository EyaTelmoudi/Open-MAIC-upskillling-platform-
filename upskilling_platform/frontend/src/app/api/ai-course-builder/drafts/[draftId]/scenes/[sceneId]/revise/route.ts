import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";
import {
  safeGetAiCourseDraft,
  safeGetAiCourseRequestScope,
  safeUpsertAiCourseDraft,
} from "@/app/lib/safe-ai-course-db";

export async function POST(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ draftId: string; sceneId: string }>;
  },
) {
  try {
    const { draftId, sceneId } = await params;
    const body = await request.json();
    const scope = await safeGetAiCourseRequestScope(request);
    const storedDraft = await safeGetAiCourseDraft(request, draftId);
    if (!storedDraft && !scope?.isSuperAdmin) {
      return Response.json(
        { success: false, error: "Draft not found for this company." },
        { status: 404 },
      );
    }

    const upstream = await fetch(
      buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}`),
      {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...body,
          sceneId,
        }),
      },
    );

    const data = await upstream.json().catch(() => null);

    if (upstream.ok && data?.success && data?.draft) {
      await safeUpsertAiCourseDraft(request, { draft: data.draft }).catch(() => null);
    }

    return Response.json(
      data || {
        success: false,
        error: "The AI revision assistant did not return a valid response.",
      },
      { status: upstream.status || 500 },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to revise the selected draft scene with AI",
      },
      { status: 500 },
    );
  }
}
