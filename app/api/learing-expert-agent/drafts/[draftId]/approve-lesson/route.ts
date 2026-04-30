import { createLogger } from '@/lib/logger';
import { apiSuccess } from '@/lib/server/api-response';
import { readDraft, saveDraft } from '@/lib/learing-expert-agent/draft-store';

const log = createLogger('LearningExpertApproveLessonAPI');

export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const body = (await request.json()) as { approved: boolean };
    const draft = await readDraft(draftId);
    if (!draft) {
      return Response.json({ success: false, error: 'Draft not found' }, { status: 404 });
    }

    draft.editableScenes = draft.editableScenes.map((scene) => ({
      ...scene,
      status: body.approved ? 'approved' : 'draft',
    }));
    draft.status = body.approved ? 'approved' : 'draft';

    const saved = await saveDraft(draft);
    return apiSuccess({ draft: saved });
  } catch (error) {
    log.error('Failed to approve lesson:', error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
