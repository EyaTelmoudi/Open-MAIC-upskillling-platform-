import path from 'path';
import { NextRequest } from 'next/server';
import { createLogger } from '@/lib/logger';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import { apiSuccess } from '@/lib/server/api-response';
import { finalizeDraft } from '@/lib/learing-expert-agent/draft-store';

const log = createLogger('LearningExpertFinalizeAPI');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const result = await finalizeDraft(draftId, buildRequestOrigin(request));
    const finalCoursePathRelative = path.isAbsolute(result.finalPath)
      ? path.relative(process.cwd(), result.finalPath)
      : result.finalPath;
    return apiSuccess({
      draft: result.draft,
      finalCoursePath: result.finalPath,
      finalCoursePathRelative,
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
