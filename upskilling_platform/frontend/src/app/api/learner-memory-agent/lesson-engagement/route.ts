import { NextRequest, NextResponse } from "next/server";

import { retainLearnerLessonMemory } from "@/app/lib/learner-memory-agent";

type RequestBody = {
  tenantId?: string | null;
  userId?: string | null;
  courseId?: string | null;
  courseTitle?: string | null;
  lessonId?: string | null;
  lessonTitle?: string | null;
  moduleId?: string | null;
  moduleTitle?: string | null;
  lessonContentType?: string | null;
  lessonDurationMinutes?: number | null;
  lessonOrder?: number | null;
  assessmentId?: string | null;
  eventType?: string | null;
  quizId?: string | null;
  quizPassed?: boolean | null;
  quizScore?: number | null;
  wrongAnswers?: Array<Record<string, unknown>>;
  lessonReferenceIds?: string[];
  supportReferences?: Array<{
    title?: string | null;
    url?: string | null;
  }>;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => null)) as RequestBody | null;
    const tenantId = typeof body?.tenantId === "string" ? body.tenantId.trim() : "";
    const userId = typeof body?.userId === "string" ? body.userId.trim() : "";
    const courseId = typeof body?.courseId === "string" ? body.courseId.trim() : "";
    const lessonId = typeof body?.lessonId === "string" ? body.lessonId.trim() : "";

    if (!tenantId || !userId || !courseId || !lessonId) {
      return NextResponse.json(
        {
          success: false,
          error: "tenantId, userId, courseId, and lessonId are required.",
        },
        { status: 400 },
      );
    }

    console.log(
      "[Agno Learner Memory Agent] Lesson engagement route received a learner memory request. "
        + `tenantId=${tenantId} userId=${userId} courseId=${courseId} lessonId=${lessonId}`,
    );
    console.log(
      "[Agno Learner Memory Agent] Route payload summary: "
        + JSON.stringify({
          eventType: typeof body?.eventType === "string" ? body.eventType : "lesson_opened",
          courseTitle: typeof body?.courseTitle === "string" ? body.courseTitle : null,
          lessonTitle: typeof body?.lessonTitle === "string" ? body.lessonTitle : null,
          moduleTitle: typeof body?.moduleTitle === "string" ? body.moduleTitle : null,
          quizId: typeof body?.quizId === "string" ? body.quizId : null,
          quizPassed: typeof body?.quizPassed === "boolean" ? body.quizPassed : null,
          quizScore: typeof body?.quizScore === "number" ? body.quizScore : null,
          wrongAnswersCount: Array.isArray(body?.wrongAnswers) ? body.wrongAnswers.length : 0,
          lessonReferenceIds: Array.isArray(body?.lessonReferenceIds) ? body?.lessonReferenceIds : [],
          supportReferenceCount: Array.isArray(body?.supportReferences) ? body.supportReferences.length : 0,
        }),
    );

    const result = await retainLearnerLessonMemory({
      tenantId,
      userId,
      courseId,
      courseTitle: typeof body?.courseTitle === "string" ? body.courseTitle : null,
      lessonId,
      lessonTitle: typeof body?.lessonTitle === "string" ? body.lessonTitle : null,
      moduleId: typeof body?.moduleId === "string" ? body.moduleId : null,
      moduleTitle: typeof body?.moduleTitle === "string" ? body.moduleTitle : null,
      lessonContentType:
        typeof body?.lessonContentType === "string" ? body.lessonContentType : null,
      lessonDurationMinutes:
        typeof body?.lessonDurationMinutes === "number" ? body.lessonDurationMinutes : null,
      lessonOrder: typeof body?.lessonOrder === "number" ? body.lessonOrder : null,
      assessmentId: typeof body?.assessmentId === "string" ? body.assessmentId : null,
      eventType: typeof body?.eventType === "string" ? body.eventType : "lesson_opened",
      quizId: typeof body?.quizId === "string" ? body.quizId : null,
      quizPassed: typeof body?.quizPassed === "boolean" ? body.quizPassed : null,
      quizScore: typeof body?.quizScore === "number" ? body.quizScore : null,
      wrongAnswers: Array.isArray(body?.wrongAnswers)
        ? body.wrongAnswers.filter(
            (item): item is Record<string, unknown> => Boolean(item) && typeof item === "object",
          )
        : [],
      lessonReferenceIds: Array.isArray(body?.lessonReferenceIds)
        ? body!.lessonReferenceIds.filter((item): item is string => typeof item === "string")
        : [],
      supportReferences: Array.isArray(body?.supportReferences)
        ? body!.supportReferences.map((item) => ({
            title: typeof item?.title === "string" ? item.title : null,
            url: typeof item?.url === "string" ? item.url : null,
          }))
        : [],
    });

    console.log(
      "[Agno Learner Memory Agent] Lesson engagement route finished. "
        + `success=${String(result.success)} action=${result.action} bankId=${result.bankId || "unknown"}`,
    );

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error(
      "[Agno Learner Memory Agent] Lesson engagement route failed:",
      error instanceof Error ? error.message : error,
    );
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Learner Memory Agent route failed.",
      },
      { status: 500 },
    );
  }
}
