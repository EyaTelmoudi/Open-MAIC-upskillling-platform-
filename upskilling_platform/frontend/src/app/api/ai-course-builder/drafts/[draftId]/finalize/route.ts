import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";
import { runCourseRefinementAgentAction } from "@/app/lib/course-maker-agent";
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
    const scope = await safeGetAiCourseRequestScope(request);
    const storedDraft = await safeGetAiCourseDraft(request, draftId);
    if (!storedDraft && !scope?.isSuperAdmin) {
      return Response.json(
        { success: false, error: "Draft not found for this company." },
        { status: 404 },
      );
    }

    console.log(
      `[Agno Course Refinement Agent] Starting action "generate_final_course" for draft ${draftId}.`,
    );
    await runCourseRefinementAgentAction({
      action: "generate_final_course",
      draftId,
      source: "editor",
      status: "finalizing",
    }).catch(() => null);

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
      const savedRecord = await safeUpsertAiCourseDraft(request, {
        draft: data.draft,
        finalCourse: finalCourseData?.course || null,
        finalCoursePathRelative: data.finalCoursePathRelative || null,
      });
      if (savedRecord) {
        console.log(
          `[Agno Course Refinement Agent] Final learner-facing course was saved for draft ${draftId}.`,
        );
        await runCourseRefinementAgentAction({
          action: "confirm_final_course_generated",
          draftId,
          title: data.draft?.stage?.name || data.draft?.draftId || null,
          scenesCount: Array.isArray(data.draft?.editableScenes)
            ? data.draft.editableScenes.length
            : null,
          source: "postgresql",
          status: data.draft?.status || null,
        }).catch(() => null);
      }
    }
    console.log(
      `[Agno Course Refinement Agent] Finished action "generate_final_course" for draft ${draftId}.`,
    );
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
