import { deleteManagedCourse } from "@/app/lib/course-deletion";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  try {
    const { courseId } = await params;
    return await deleteManagedCourse(request, courseId);
  } catch (error) {
    return Response.json(
      {
        success: false,
        detail:
          error instanceof Error
            ? error.message
            : "Failed to delete course and its related resources.",
      },
      { status: 500 },
    );
  }
}
