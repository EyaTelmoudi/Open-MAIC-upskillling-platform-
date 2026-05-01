import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";
import {
  safeGetAiCourseDraft,
  safeSaveAiCourseAsPlatformDraft,
  safeUpsertAiCourseDraft,
} from "@/app/lib/safe-ai-course-db";

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
          approvedAt: record.approved_at || undefined,
          createdAt: record.created_at,
          updatedAt: record.updated_at,
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

    return Response.json(
      {
        success: true,
        record: {
          draftId: saved.external_draft_id,
          status: saved.review_status,
          approvedBy: saved.approved_by || undefined,
          approvedAt: saved.approved_at || undefined,
          createdAt: saved.created_at,
          updatedAt: saved.updated_at,
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
