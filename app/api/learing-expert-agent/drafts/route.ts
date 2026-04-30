import { apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { listDraftSummaries } from '@/lib/learing-expert-agent/draft-store';

const log = createLogger('LearningExpertDraftsAPI');

export async function GET() {
  try {
    const drafts = await listDraftSummaries();
    return apiSuccess({ drafts });
  } catch (error) {
    log.error('Failed to list learning expert drafts:', error);
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 },
    );
  }
}
