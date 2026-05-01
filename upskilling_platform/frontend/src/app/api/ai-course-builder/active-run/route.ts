import {
  getActiveGenerationRun,
} from "@/app/lib/ai-course-active-run-store";

export async function GET() {
  try {
    const record = await getActiveGenerationRun();
    return Response.json({ success: true, run: record }, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to read active course generation run",
      },
      { status: 500 },
    );
  }
}
