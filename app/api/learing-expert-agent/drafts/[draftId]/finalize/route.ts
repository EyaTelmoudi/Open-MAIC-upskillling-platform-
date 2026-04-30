import path from 'path';
import { createLogger } from '@/lib/logger';
import { apiSuccess } from '@/lib/server/api-response';
import { finalizeDraft } from '@/lib/learing-expert-agent/draft-store';

const log = createLogger('LearningExpertFinalizeAPI');

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const result = await finalizeDraft(draftId);
    return apiSuccess({
      draft: result.draft,
      finalCoursePath: result.finalPath,
      finalCoursePathRelative: path.relative(process.cwd(), result.finalPath),
      classroomUrl: result.classroomUrl,
      platformUrl: result.platformUrl,
      stage: result.stage,
      scenes: result.scenes,
    });
  } catch (error) {
    log.error('Failed to finalize draft:', error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
