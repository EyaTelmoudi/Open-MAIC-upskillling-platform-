import {
  getCourseReviewRecord,
  markCourseReviewAsDraftSaved,
} from "@/app/lib/ai-course-review-store";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const record = await getCourseReviewRecord(draftId);
    return Response.json({ success: true, record });
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
    const record = await markCourseReviewAsDraftSaved(
      draftId,
      body.approvedBy || "LearningExpert",
    );
    return Response.json({ success: true, record });
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
