import {
  safeGetAiPlatformLessonQuiz,
  safeSubmitAiPlatformLessonQuiz,
} from "@/app/lib/safe-ai-course-db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const quiz = await safeGetAiPlatformLessonQuiz(request, lessonId);
    if (!quiz) {
      return Response.json(
        {
          success: false,
          error: "Quiz not found or not accessible for the current learner.",
        },
        { status: 404 },
      );
    }

    return Response.json({ success: true, quiz }, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load AI platform quiz",
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      answers?: Record<string, string | string[]>;
    };

    const result = await safeSubmitAiPlatformLessonQuiz(
      request,
      lessonId,
      body.answers || {},
    );

    if (!result) {
      return Response.json(
        {
          success: false,
          error: "Quiz submission failed or the learner is not allowed to submit this quiz.",
        },
        { status: 400 },
      );
    }

    return Response.json({ success: true, result }, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to submit AI platform quiz",
      },
      { status: 500 },
    );
  }
}
