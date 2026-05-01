import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";
import { runCourseRefinementAgentAction } from "@/app/lib/course-maker-agent";
import { assemblePublishedCourseForMemory } from "@/app/lib/course-memory-agent";
import {
  safeGetAiCourseDraft,
  safeSaveAiCourseAsPlatformDraft,
  safeUpsertAiCourseDraft,
} from "@/app/lib/safe-ai-course-db";
import { toUtcIsoString } from "@/app/lib/ai-course-db";

function buildPendingReviewRecord(draftId: string) {
  const now = new Date().toISOString();
  return {
    draftId,
    status: "pending_review",
    createdAt: now,
    updatedAt: now,
  };
}

async function importDraftIfMissing(request: Request, draftId: string) {
  const [draftResponse, finalCourseResponse] = await Promise.all([
    fetch(buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}`), {
      cache: "no-store",
    }),
    fetch(buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}/final-course`), {
      cache: "no-store",
    }),
  ]);

  const draftData = await draftResponse.json().catch(() => ({}));
  const finalCourseData = await finalCourseResponse.json().catch(() => ({}));

  if (draftResponse.ok && draftData?.success && draftData?.draft) {
    return safeUpsertAiCourseDraft(request, {
      draft: draftData.draft,
      finalCourse:
        finalCourseResponse.ok && finalCourseData?.success ? finalCourseData.course || null : null,
    });
  }

  return null;
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;

    let record = await safeGetAiCourseDraft(draftId);
    if (!record) {
      record = await importDraftIfMissing(request, draftId);
    }

    if (!record) {
      return Response.json(
        { success: true, record: buildPendingReviewRecord(draftId) },
        { status: 200 },
      );
    }

    return Response.json(
      {
        success: true,
        record: {
          draftId: record.external_draft_id,
          status: record.review_status,
          approvedBy: record.approved_by || undefined,
          approvedAt: toUtcIsoString(record.approved_at),
          createdAt: toUtcIsoString(record.created_at),
          updatedAt: toUtcIsoString(record.updated_at),
          platformCourseId: record.platform_course_id,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to read course review status",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const body = (await request.json().catch(() => ({}))) as { approvedBy?: string };

    let record = await safeGetAiCourseDraft(draftId);
    if (!record) {
      record = await importDraftIfMissing(request, draftId);
    }

    if (!record) {
      return Response.json(
        {
          success: false,
          error: "AI course draft could not be imported before final approval",
        },
        { status: 404 },
      );
    }

    console.log(
      `[Agno Course Refinement Agent] Starting action "save_as_platform_course" for draft ${draftId}.`,
    );
    await runCourseRefinementAgentAction({
      action: "save_as_platform_course",
      draftId,
      title: record.title,
      scenesCount: Array.isArray(record.draft_payload?.editableScenes)
        ? record.draft_payload.editableScenes.length
        : null,
      source: "final_review",
      status: record.status,
    }).catch(() => null);

    const saved = await safeSaveAiCourseAsPlatformDraft(
      request,
      draftId,
      body.approvedBy || "LearningExpert",
    );

    if (!saved) {
      return Response.json(
        {
          success: false,
          error: "The platform draft database layer is currently unavailable",
        },
        { status: 503 },
      );
    }

    console.log(
      `[Agno Course Refinement Agent] Official platform course draft saved for AI draft ${draftId}. Platform course ID: ${saved.platform_course_id}.`,
    );
    await runCourseRefinementAgentAction({
      action: "confirm_platform_course_saved",
      draftId,
      title: saved.title,
      scenesCount: Array.isArray(saved.draft_payload?.editableScenes)
        ? saved.draft_payload.editableScenes.length
        : null,
      source: "postgresql",
      status: saved.status,
      platformCourseId: saved.platform_course_id,
    }).catch(() => null);
    if (saved.platform_course_id) {
      console.log(
        `[Agno Course Memory Agent] Starting action "assemble_published_course" for course ${saved.platform_course_id} after final approval of draft ${draftId}.`,
      );
      try {
        await assemblePublishedCourseForMemory(
          request,
          saved.platform_course_id,
          saved.tenant_id,
        );
        console.log(
          `[Agno Course Memory Agent] Finished action "assemble_published_course" for course ${saved.platform_course_id} after final approval of draft ${draftId}.`,
        );
      } catch (memoryError) {
        console.error(
          `[Agno Course Memory Agent] Retain workflow failed for course ${saved.platform_course_id} after final approval of draft ${draftId}: ${
            memoryError instanceof Error ? memoryError.message : "Unknown error"
          }`,
        );
      }
    }
    console.log(
      `[Agno Course Refinement Agent] Finished action "save_as_platform_course" for draft ${draftId}.`,
    );

    return Response.json(
      {
        success: true,
        record: {
          draftId: saved.external_draft_id,
          status: saved.review_status,
          approvedBy: saved.approved_by || undefined,
          approvedAt: toUtcIsoString(saved.approved_at),
          createdAt: toUtcIsoString(saved.created_at),
          updatedAt: toUtcIsoString(saved.updated_at),
          platformCourseId: saved.platform_course_id,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to save course review draft",
      },
      { status: 500 },
    );
  }
}
