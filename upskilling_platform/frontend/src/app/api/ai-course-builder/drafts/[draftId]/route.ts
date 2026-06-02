import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";
import { runCourseRefinementAgentAction } from "@/app/lib/course-maker-agent";
import { getActiveGenerationRun } from "@/app/lib/ai-course-active-run-store";
import {
  safeDeleteAiCourseDraft,
  safeGetAiCourseDraft,
  safeGetAiCourseRequestScope,
  safeUpsertAiCourseDraft,
} from "@/app/lib/safe-ai-course-db";
import { toUtcIsoString } from "@/app/lib/ai-course-db";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
    const scope = await safeGetAiCourseRequestScope(request);
    const storedDraft = await safeGetAiCourseDraft(request, draftId);
    if (storedDraft?.draft_payload) {
      await runCourseRefinementAgentAction({
        action: "open_draft_for_editor",
        draftId,
        title: storedDraft.title,
        scenesCount: (storedDraft.draft_payload?.editableScenes || []).length,
        source: "postgresql",
        status: storedDraft.status,
      }).catch(() => null);

      return Response.json(
        {
          success: true,
          draft: storedDraft.draft_payload,
          record: {
            draftId: storedDraft.external_draft_id,
            status: storedDraft.review_status,
            approvedBy: storedDraft.approved_by || undefined,
            approvedAt: toUtcIsoString(storedDraft.approved_at),
            createdAt: toUtcIsoString(storedDraft.created_at),
            updatedAt: toUtcIsoString(storedDraft.updated_at),
            platformCourseId: storedDraft.platform_course_id,
          },
        },
        { status: 200 }
      );
    }

    if (!scope?.isSuperAdmin) {
      return Response.json(
        { success: false, error: "Draft not found for this company." },
        { status: 404 },
      );
    }

    const upstream = await fetch(
      buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}`),
      { cache: "no-store" }
    );
    const data = await upstream.json();
    if (upstream.ok && data?.success && data?.draft) {
      await safeUpsertAiCourseDraft(request, { draft: data.draft });
      await runCourseRefinementAgentAction({
        action: "open_draft_for_editor",
        draftId,
        title: data.draft?.stage?.name || data.draft?.draftId || null,
        scenesCount: Array.isArray(data.draft?.editableScenes)
          ? data.draft.editableScenes.length
          : null,
        source: "openmaic",
        status: data.draft?.status || null,
      }).catch(() => null);
      return Response.json(data, { status: 200 });
    }

    if (upstream.status === 404) {
      const activeRun = await getActiveGenerationRun().catch(() => null);
      const pendingDraftId = activeRun?.progress?.draftId || activeRun?.result?.draftId;
      if (activeRun?.active && pendingDraftId === draftId) {
        return Response.json(
          {
            success: false,
            pending: true,
            draftId,
            error: "Draft is still being prepared by OpenMAIC.",
          },
          { status: 202 }
        );
      }
    }

    return Response.json(data, { status: upstream.status });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to load draft from OpenMAIC",
      },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
    const body = await request.json();
    const draftPayload = body?.draft;
    const scope = await safeGetAiCourseRequestScope(request);
    const storedDraft = await safeGetAiCourseDraft(request, draftId);

    if (!draftPayload || draftPayload.draftId !== draftId) {
      return Response.json(
        { success: false, error: "Invalid draft payload" },
        { status: 400 },
      );
    }

    if (!storedDraft && !scope?.isSuperAdmin) {
      return Response.json(
        { success: false, error: "Draft not found for this company." },
        { status: 404 },
      );
    }

    await runCourseRefinementAgentAction({
      action: "save_refined_draft",
      draftId,
      title: draftPayload?.stage?.name || draftPayload?.draftId || null,
      scenesCount: Array.isArray(draftPayload?.editableScenes)
        ? draftPayload.editableScenes.length
        : null,
      source: "editor",
      status: draftPayload?.status || null,
    }).catch(() => null);

    const locallySavedDraft = await safeUpsertAiCourseDraft(request, {
      draft: draftPayload,
    });

    if (!locallySavedDraft) {
      return Response.json(
        {
          success: false,
          error: "The Course Refinement Agent received the edited draft, but saving it to PostgreSQL failed.",
        },
        { status: 500 },
      );
    }

    await runCourseRefinementAgentAction({
      action: "confirm_refined_draft_saved",
      draftId,
      title: draftPayload?.stage?.name || draftPayload?.draftId || null,
      scenesCount: Array.isArray(draftPayload?.editableScenes)
        ? draftPayload.editableScenes.length
        : null,
      source: "postgresql",
      status: draftPayload?.status || null,
    }).catch(() => null);

    try {
      const upstream = await fetch(
        buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}`),
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      const data = await upstream.json();
      if (upstream.ok && data?.success && data?.draft) {
        await safeUpsertAiCourseDraft(request, { draft: data.draft });
        await runCourseRefinementAgentAction({
          action: "confirm_refined_draft_saved",
          draftId,
          title: data.draft?.stage?.name || data.draft?.draftId || null,
          scenesCount: Array.isArray(data.draft?.editableScenes)
            ? data.draft.editableScenes.length
            : null,
          source: "postgresql_sync",
          status: data.draft?.status || null,
        }).catch(() => null);
      }
      return Response.json(data, { status: upstream.status });
    } catch (syncError) {
      console.warn(
        `[AI Course Builder] Draft ${draftId} was saved locally, but OpenMAIC sync is unavailable: ${
          syncError instanceof Error ? syncError.message : "Unknown error"
        }`,
      );
      return Response.json(
        {
          success: true,
          draft: draftPayload,
          warning:
            "The draft was saved in PostgreSQL, but synchronization with OpenMAIC is currently unavailable.",
          syncedToOpenmaic: false,
        },
        { status: 200 },
      );
    }
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to save draft to OpenMAIC",
      },
      { status: 500 }
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
    const body = await request.json();
    const scope = await safeGetAiCourseRequestScope(request);
    const storedDraft = await safeGetAiCourseDraft(request, draftId);
    if (!storedDraft && !scope?.isSuperAdmin) {
      return Response.json(
        { success: false, error: "Draft not found for this company." },
        { status: 404 },
      );
    }

    const upstream = await fetch(
      buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}`),
      {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );

    const data = await upstream.json().catch(() => null);

    if (upstream.ok && data?.success && data?.draft) {
      await safeUpsertAiCourseDraft(request, { draft: data.draft }).catch(() => null);
    }

    return Response.json(
      data || {
        success: false,
        error: "The AI revision assistant did not return a valid response.",
      },
      { status: upstream.status || 500 }
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to revise the selected draft scene with AI",
      },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
    const scope = await safeGetAiCourseRequestScope(request);
    const storedDraft = await safeGetAiCourseDraft(request, draftId);
    if (!storedDraft && !scope?.isSuperAdmin) {
      return Response.json(
        { success: false, error: "Draft not found for this company." },
        { status: 404 },
      );
    }

    const upstream = await fetch(
      buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}`),
      {
        method: "DELETE",
        cache: "no-store",
      }
    );

    const data = await upstream.json().catch(() => null);

    if (!upstream.ok) {
      return Response.json(
        data || {
          success: false,
          error: "Failed to delete draft from OpenMAIC",
        },
        { status: upstream.status || 500 }
      );
    }

    await safeDeleteAiCourseDraft(request, draftId).catch(() => null);

    return Response.json(
      {
        success: true,
        deleted: true,
        draftId,
      },
      { status: 200 }
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to delete generated draft",
      },
      { status: 500 }
    );
  }
}
