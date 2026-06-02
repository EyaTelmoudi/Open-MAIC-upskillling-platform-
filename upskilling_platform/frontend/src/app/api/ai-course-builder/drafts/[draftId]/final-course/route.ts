import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";
import {
  safeGetAiCourseDraft,
  safeGetAiCourseRequestScope,
  safeUpsertAiCourseDraft,
} from "@/app/lib/safe-ai-course-db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const scope = await safeGetAiCourseRequestScope(request);
    const storedDraft = await safeGetAiCourseDraft(request, draftId);
    if (storedDraft?.final_course_payload) {
      return Response.json({ success: true, course: storedDraft.final_course_payload }, { status: 200 });
    }

    if (!scope?.isSuperAdmin) {
      return Response.json(
        { success: false, error: "Final course not found for this company." },
        { status: 404 },
      );
    }

    const upstream = await fetch(
      buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}/final-course`),
      { cache: "no-store" },
    );
    const data = await upstream.json();
    if (upstream.ok && data?.success && data?.course) {
      const draftResponse = await fetch(
        buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}`),
        { cache: "no-store" }
      );
      const draftData = await draftResponse.json().catch(() => ({}));
      if (draftResponse.ok && draftData?.success && draftData?.draft) {
        await safeUpsertAiCourseDraft(request, {
          draft: draftData.draft,
          finalCourse: data.course,
        });
      }
    }
    return Response.json(data, { status: upstream.status });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load finalized course from OpenMAIC",
      },
      { status: 500 },
    );
  }
}
