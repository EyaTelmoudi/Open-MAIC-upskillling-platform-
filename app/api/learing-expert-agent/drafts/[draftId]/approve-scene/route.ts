import { createLogger } from '@/lib/logger';
import { apiSuccess } from '@/lib/server/api-response';
import { readDraft, saveDraft } from '@/lib/learing-expert-agent/draft-store';

const log = createLogger('LearningExpertApproveSceneAPI');

export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const body = (await request.json()) as { sceneId: string; approved: boolean };
    const draft = await readDraft(draftId);
    if (!draft) {
      return Response.json({ success: false, error: 'Draft not found' }, { status: 404 });
    }

    draft.editableScenes = draft.editableScenes.map((scene) =>
      scene.sceneId === body.sceneId
        ? {
            ...scene,
            status:
              scene.status === 'generating' ? 'generating' : body.approved ? 'approved' : 'draft',
          }
        : scene,
    );

    draft.status = draft.editableScenes.some((scene) => scene.status === 'generating')
      ? 'generating'
      : draft.editableScenes.every((scene) => scene.status === 'approved')
        ? 'approved'
        : 'draft';

    const saved = await saveDraft(draft);
    return apiSuccess({ draft: saved });
  } catch (error) {
    log.error('Failed to approve learning expert scene:', error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
