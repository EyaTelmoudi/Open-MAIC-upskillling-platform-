import { apiSuccess } from '@/lib/server/api-response';
import { createLogger } from '@/lib/logger';
import { readFinalizedCourse } from '@/lib/learing-expert-agent/draft-store';

const log = createLogger('LearningExpertFinalCourseAPI');

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const course = await readFinalizedCourse(draftId);
    if (!course) {
      return Response.json(
        { success: false, error: 'Finalized course not found' },
        { status: 404 },
      );
    }

    return apiSuccess({ course });
  } catch (error) {
    log.error('Failed to read finalized course:', error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
