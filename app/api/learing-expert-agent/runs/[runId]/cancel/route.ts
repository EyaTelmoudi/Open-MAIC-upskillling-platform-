import { createLogger } from '@/lib/logger';
import { cancelCourseMakerRun } from '@/lib/server/course-maker-run-store';

const log = createLogger('LearningExpertRunCancelAPI');

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ runId: string }> },
) {
  try {
    const { runId } = await params;
    cancelCourseMakerRun(runId);
    log.info('Marked Course Maker run as cancelled', { runId });
    return Response.json({ success: true, runId }, { status: 200 });
  } catch (error) {
    log.error('Failed to cancel Course Maker run:', error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
