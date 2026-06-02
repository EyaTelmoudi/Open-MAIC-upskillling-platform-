import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";
import {
  safeGetAiCourseDraft,
  safeGetAiCourseRequestScope,
  safeUpsertAiCourseDraft,
} from "@/app/lib/safe-ai-course-db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
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
      buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}/approve-scene`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await upstream.json();
    if (upstream.ok && data?.success && data?.draft) {
      await safeUpsertAiCourseDraft(request, { draft: data.draft });
    }
    return Response.json(data, { status: upstream.status });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update scene approval in OpenMAIC",
      },
      { status: 500 }
    );
  }
}
