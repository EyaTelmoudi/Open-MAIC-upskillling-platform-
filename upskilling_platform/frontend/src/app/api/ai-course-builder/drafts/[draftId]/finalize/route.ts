import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";
import { safeUpsertAiCourseDraft } from "@/app/lib/safe-ai-course-db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
    const upstream = await fetch(
      buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}/finalize`),
      {
        method: "POST",
      }
    );
    const data = await upstream.json();
    if (upstream.ok && data?.success && data?.draft) {
      const finalCourseResponse = await fetch(
        buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}/final-course`),
        { cache: "no-store" }
      );
      const finalCourseData = await finalCourseResponse.json().catch(() => ({}));
      await safeUpsertAiCourseDraft(request, {
        draft: data.draft,
        finalCourse: finalCourseData?.course || null,
        finalCoursePathRelative: data.finalCoursePathRelative || null,
      });
    }
    return Response.json(data, { status: upstream.status });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to finalize draft in OpenMAIC",
      },
      { status: 500 }
    );
  }
}
