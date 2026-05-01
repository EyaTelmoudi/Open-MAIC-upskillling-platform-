import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";
import {
  safeListAiCourseDrafts,
  safeUpsertAiCourseDraft,
} from "@/app/lib/safe-ai-course-db";

export async function GET(request: Request) {
  try {
    const storedDrafts = await safeListAiCourseDrafts();
    if (storedDrafts.length > 0) {
      return Response.json({ success: true, drafts: storedDrafts }, { status: 200 });
    }

    const upstream = await fetch(buildOpenMAICUrl("/api/learing-expert-agent/drafts"), {
      cache: "no-store",
    });
    const data = await upstream.json();

    if (upstream.ok && data?.success && Array.isArray(data.drafts)) {
      for (const draftSummary of data.drafts) {
        const draftId = draftSummary?.draftId;
        if (!draftId) continue;
        try {
          const fullDraftResponse = await fetch(
            buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}`),
            { cache: "no-store" }
          );
          const fullDraftData = await fullDraftResponse.json();
          if (fullDraftResponse.ok && fullDraftData?.success && fullDraftData?.draft) {
            await safeUpsertAiCourseDraft(request, { draft: fullDraftData.draft });
          }
        } catch {
          // Best-effort migration only; keep returning the OpenMAIC list.
        }
      }
    }

    return Response.json(data, { status: upstream.status });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch drafts from OpenMAIC",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const upstream = await fetch(buildOpenMAICUrl("/api/learing-expert-agent/drafts"), {
      cache: "no-store",
    });
    const data = await upstream.json();

    if (!upstream.ok || !data?.success || !Array.isArray(data.drafts)) {
      return Response.json(
        {
          success: false,
          error: data?.error || "Failed to load existing OpenMAIC drafts",
        },
        { status: upstream.status || 500 }
      );
    }

    let importedCount = 0;

    for (const draftSummary of data.drafts) {
      const draftId = draftSummary?.draftId;
      if (!draftId) continue;

      try {
        const [draftResponse, finalCourseResponse] = await Promise.all([
          fetch(buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}`), {
            cache: "no-store",
          }),
          fetch(buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}/final-course`), {
            cache: "no-store",
          }),
        ]);

        const draftData = await draftResponse.json().catch(() => ({}));
        const finalCourseData = await finalCourseResponse.json().catch(() => ({}));

        if (draftResponse.ok && draftData?.success && draftData?.draft) {
          await safeUpsertAiCourseDraft(request, {
            draft: draftData.draft,
            finalCourse: finalCourseResponse.ok && finalCourseData?.success
              ? finalCourseData.course || null
              : null,
          });
          importedCount += 1;
        }
      } catch {
        // Continue importing the remaining drafts.
      }
    }

    return Response.json({
      success: true,
      importedCount,
      totalCount: data.drafts.length,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to import existing OpenMAIC drafts",
      },
      { status: 500 }
    );
  }
}
