import { askChatCoachQuestion } from "@/app/lib/chat-coach-agent";

const DEFAULT_QUESTION =
  "In this HTML course, why is the alt attribute important for images, and what does the course say about the src attribute?";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      tenantId?: string;
      courseId?: string;
      question?: string;
    };

    const tenantId = body.tenantId?.trim();
    const courseId = body.courseId?.trim();
    const question = body.question?.trim() || DEFAULT_QUESTION;

    if (!tenantId || !courseId) {
      return Response.json(
        { success: false, error: "tenantId and courseId are required" },
        { status: 400 },
      );
    }

    const result = await askChatCoachQuestion({
      tenantId,
      courseId,
      question,
    });

    return Response.json({ success: true, result }, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to run the Chat Coach agent test",
      },
      { status: 500 },
    );
  }
}
