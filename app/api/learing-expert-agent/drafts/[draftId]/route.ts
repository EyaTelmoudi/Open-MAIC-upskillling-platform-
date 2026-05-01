import { createLogger } from '@/lib/logger';
import { apiSuccess } from '@/lib/server/api-response';
import { deleteDraft, plainTextToHtml, readDraft, saveDraft } from '@/lib/learing-expert-agent/draft-store';
import type { LearningExpertDraft } from '@/lib/learing-expert-agent/types';

const log = createLogger('LearningExpertDraftAPI');

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const draft = await readDraft(draftId);
    if (!draft) {
      return Response.json({ success: false, error: 'Draft not found' }, { status: 404 });
    }
    return apiSuccess({ draft });
  } catch (error) {
    log.error('Failed to read learning expert draft:', error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const body = (await request.json()) as { draft: LearningExpertDraft };
    if (!body.draft || body.draft.draftId !== draftId) {
      return Response.json({ success: false, error: 'Invalid draft payload' }, { status: 400 });
    }

    const normalizedDraft: LearningExpertDraft = {
      ...body.draft,
      editableScenes: body.draft.editableScenes.map((scene) => ({
        ...scene,
        blocks: scene.blocks.map((block) => {
          if (block.type === 'slide_text') {
            return {
              ...block,
              html: plainTextToHtml(block.plainText),
            };
          }
          return block;
        }),
      })),
    };

    const savedDraft = await saveDraft(normalizedDraft);
    return apiSuccess({ draft: savedDraft });
  } catch (error) {
    log.error('Failed to save learning expert draft:', error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const deleted = await deleteDraft(draftId);
    if (!deleted) {
      return Response.json({ success: false, error: 'Draft not found' }, { status: 404 });
    }
    return apiSuccess({ deleted: true, draftId });
  } catch (error) {
    log.error('Failed to delete learning expert draft:', error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
