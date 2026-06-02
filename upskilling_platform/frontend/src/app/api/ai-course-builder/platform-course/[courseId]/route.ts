import { NextResponse } from "next/server";

import {
  safeGetAiCourseDraft,
  safeGetAiCourseDraftByPlatformCourseId,
} from "@/app/lib/safe-ai-course-db";
import { toUtcIsoString } from "@/app/lib/ai-course-db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const { courseId } = await params;
    const title = new URL(request.url).searchParams.get("title");
    const record = await safeGetAiCourseDraftByPlatformCourseId(
      request,
      courseId,
      title,
    );

    if (!record) {
      return NextResponse.json(
        { success: false, detail: "AI draft not found for this platform course." },
        { status: 404 },
      );
    }

    const hydrated = await safeGetAiCourseDraft(request, record.external_draft_id);
    const resolved = hydrated || record;

    return NextResponse.json(
      {
        success: true,
        draftId: resolved.external_draft_id,
        record: {
          draftId: resolved.external_draft_id,
          status: resolved.review_status,
          approvedBy: resolved.approved_by || undefined,
          approvedAt: toUtcIsoString(resolved.approved_at),
          createdAt: toUtcIsoString(resolved.created_at),
          updatedAt: toUtcIsoString(resolved.updated_at),
          platformCourseId: resolved.platform_course_id,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        detail:
          error instanceof Error
            ? error.message
            : "Failed to resolve AI draft for this platform course.",
      },
      { status: 500 },
    );
  }
}
