import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";
import {
  safeGetAiCourseDraft,
  safeUpsertAiCourseDraft,
} from "@/app/lib/safe-ai-course-db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
    const storedDraft = await safeGetAiCourseDraft(draftId);
    if (storedDraft?.draft_payload) {
      return Response.json(
        {
          success: true,
          draft: storedDraft.draft_payload,
          record: {
            draftId: storedDraft.external_draft_id,
            status: storedDraft.review_status,
            approvedBy: storedDraft.approved_by || undefined,
            approvedAt: storedDraft.approved_at || undefined,
            createdAt: storedDraft.created_at,
            updatedAt: storedDraft.updated_at,
            platformCourseId: storedDraft.platform_course_id,
          },
        },
        { status: 200 }
      );
    }

    const upstream = await fetch(
      buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}`),
      { cache: "no-store" }
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
          error instanceof Error ? error.message : "Failed to load draft from OpenMAIC",
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
    const body = await request.json();
    const upstream = await fetch(
      buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}`),
      {
        method: "PUT",
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
          error instanceof Error ? error.message : "Failed to save draft to OpenMAIC",
      },
      { status: 500 }
    );
  }
}
