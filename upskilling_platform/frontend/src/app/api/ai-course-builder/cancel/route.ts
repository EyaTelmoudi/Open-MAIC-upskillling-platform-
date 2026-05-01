import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";
import {
  cancelCourseMakerGenerationService,
} from "@/app/lib/course-maker-agent";
import {
  clearActiveGenerationRun,
  getActiveGenerationRun,
} from "@/app/lib/ai-course-active-run-store";
import {
  safeDeleteAiCourseDraft,
} from "@/app/lib/safe-ai-course-db";

export async function POST() {
  try {
    const activeRun = await getActiveGenerationRun();
    if (!activeRun?.active) {
      return Response.json(
        { success: false, error: "No active course generation run to cancel." },
        { status: 404 },
      );
    }

    await fetch(
      buildOpenMAICUrl(`/api/learing-expert-agent/runs/${activeRun.runId}/cancel`),
      {
        method: "POST",
        cache: "no-store",
      },
    ).catch(() => undefined);

    await cancelCourseMakerGenerationService(activeRun.runId).catch(() => undefined);

    const draftId = activeRun.result?.draftId;
    if (draftId) {
      await fetch(buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}`), {
        method: "DELETE",
        cache: "no-store",
      }).catch(() => undefined);
      await safeDeleteAiCourseDraft(draftId).catch(() => undefined);
    }

    await clearActiveGenerationRun();

    return Response.json(
      {
        success: true,
        cancelled: true,
        runId: activeRun.runId,
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
            : "Failed to cancel the active course generation run",
      },
      { status: 500 },
    );
  }
}
