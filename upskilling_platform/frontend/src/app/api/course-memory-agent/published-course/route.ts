import { assemblePublishedCourseForMemory } from "@/app/lib/course-memory-agent";

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      courseId?: string;
      tenantId?: string;
    };
    const courseId = body.courseId?.trim();
    const tenantId = body.tenantId?.trim() || null;

    if (!courseId) {
      return Response.json(
        { success: false, error: "courseId is required" },
        { status: 400 },
      );
    }

    void assemblePublishedCourseForMemory(request, courseId, tenantId)
      .then((result) => {
        console.log(
          `[Agno Course Memory Agent] Background retain workflow completed for course ${courseId}. async=${Boolean(result.isAsync)}`,
        );
      })
      .catch((error) => {
        console.error(
          `[Agno Course Memory Agent] Background retain workflow failed for course ${courseId}: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
        );
      });

    return Response.json(
      {
        success: true,
        queued: true,
        courseId,
      },
      { status: 202 },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to assemble the published course for memory",
      },
      { status: 500 },
    );
  }
}
