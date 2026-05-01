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

    const result = await assemblePublishedCourseForMemory(request, courseId, tenantId);

    return Response.json(
      {
        success: true,
        result,
      },
      { status: 200 },
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
