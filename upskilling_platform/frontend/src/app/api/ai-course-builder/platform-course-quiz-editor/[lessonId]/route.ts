import {
  safeGetAiPlatformLessonQuizForEditor,
  safeUpdateAiPlatformLessonQuizForEditor,
} from "@/app/lib/safe-ai-course-db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const quiz = await safeGetAiPlatformLessonQuizForEditor(request, lessonId);
    if (!quiz) {
      return Response.json(
        { success: false, error: "AI platform quiz not found for this lesson." },
        { status: 404 },
      );
    }

    return Response.json({ success: true, quiz }, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to load AI platform quiz editor content.",
      },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ lessonId: string }> },
) {
  try {
    const { lessonId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      questions?: Array<{
        id: string;
        text: string;
        type: string;
        options: Array<{ value: string; label: string }>;
        correctAnswers: string[];
        explanation?: string | null;
        order: number;
      }>;
    };

    const updated = await safeUpdateAiPlatformLessonQuizForEditor(
      request,
      lessonId,
      body.questions || [],
    );

    if (!updated) {
      return Response.json(
        { success: false, error: "AI platform quiz could not be updated." },
        { status: 400 },
      );
    }

    return Response.json({ success: true }, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update AI platform quiz editor content.",
      },
      { status: 500 },
    );
  }
}
