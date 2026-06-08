import { retainLearnerLessonMemory } from "@/app/lib/learner-memory-agent";
import {
  completeSoloChallengeAttempt,
  getSoloChallengeAttempt,
} from "@/app/lib/solo-challenge-db";

const DEFAULT_LEARNING_URL = process.env.LEARNING_URL || process.env.NEXT_PUBLIC_LEARNING_URL || "http://localhost:8002";

function decodeJwtClaims(token: string | null): { tenantId?: string | null; sub?: string | null; role?: string | null } | null {
  if (!token) {
    return null;
  }

  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }

    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as { tenantId?: string | null; sub?: string | null; role?: string | null };
  } catch {
    return null;
  }
}

function getTokenFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }

  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function evaluateChallengeBadges(input: {
  token: string | null;
  challengeId: string;
  courseId: string;
  lessonId?: string | null;
  isCorrect: boolean;
}) {
  if (!input.token || !input.isCorrect) {
    return [];
  }

  const response = await fetch(`${DEFAULT_LEARNING_URL}/api/v1/gamification/custom-badges/evaluate`, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${input.token}`,
    },
    body: JSON.stringify({
      event_type: "solo_challenge.completed",
      challenge_id: input.challengeId,
      course_id: input.courseId,
      completed: true,
      won: true,
      fast_finish: false,
      score: 100,
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(payload?.detail || payload?.error || "Custom badge evaluation failed.");
  }
  return Array.isArray(payload?.awarded) ? payload.awarded : [];
}

export async function POST(request: Request) {
  const token = getTokenFromRequest(request);
  const claims = decodeJwtClaims(token);
  const body = await request.json().catch(() => ({}));

  const challengeId = typeof body?.challengeId === "string" ? body.challengeId : "";
  const selectedOptionId = typeof body?.selectedOptionId === "string" ? body.selectedOptionId : "";
  const userId = typeof body?.userId === "string" ? body.userId : claims?.sub || "";
  const tenantId = typeof body?.tenantId === "string" ? body.tenantId : claims?.tenantId || "";

  if (!challengeId || !selectedOptionId || !userId) {
    return Response.json(
      {
        success: false,
        error: "challengeId, selectedOptionId, and userId are required.",
      },
      { status: 400 },
    );
  }

  try {
    const challenge = await getSoloChallengeAttempt(challengeId, userId);
    if (!challenge) {
      return Response.json(
        {
          success: false,
          error: "Solo challenge not found.",
        },
        { status: 404 },
      );
    }

    const activeQuestion = challenge.quiz.questions?.[0];
    if (!activeQuestion?.correctOptionId) {
      return Response.json(
        {
          success: false,
          error: "Stored solo challenge answer key is missing.",
        },
        { status: 500 },
      );
    }

    const isCorrect = activeQuestion.correctOptionId === selectedOptionId;
    const selectedOption =
      activeQuestion.options.find((option) => option.id === selectedOptionId) || null;
    const correctOption =
      activeQuestion.options.find((option) => option.id === activeQuestion.correctOptionId) || null;

    await completeSoloChallengeAttempt({
      id: challengeId,
      userId,
      selectedOptionId,
      isCorrect,
    });

    await retainLearnerLessonMemory({
      tenantId,
      userId,
      courseId: challenge.courseId,
      courseTitle: challenge.quiz.courseTitle || null,
      lessonId: challenge.quiz.lessonId || activeQuestion.questionId,
      lessonTitle: challenge.quiz.lessonTitle || "Solo challenge",
      assessmentId: challenge.quiz.assessmentId || null,
      eventType: "solo_challenge_answered",
      quizId: challenge.quiz.assessmentId || activeQuestion.questionId,
      quizPassed: isCorrect,
      quizScore: isCorrect ? 100 : 0,
      wrongAnswers: [
        {
          question: activeQuestion.text,
          questionId:
            (challenge.quiz as { sourceFailedQuestionId?: string | null } | null | undefined)
              ?.sourceFailedQuestionId || activeQuestion.questionId,
          user_answer: selectedOption?.label || selectedOption?.value || selectedOptionId,
          correct_answer: correctOption?.label || correctOption?.value || activeQuestion.correctOptionId,
        },
      ],
      lessonReferenceIds: [],
      supportReferences: [],
    });

    let awardedBadges: unknown[] = [];
    try {
      awardedBadges = await evaluateChallengeBadges({
        token,
        challengeId,
        courseId: challenge.courseId,
        lessonId: challenge.quiz.lessonId || null,
        isCorrect,
      });
    } catch (badgeError) {
      console.error(
        "[Solo Challenge] Custom badge evaluation failed:",
        badgeError instanceof Error ? badgeError.message : badgeError,
      );
    }

    return Response.json({
      success: true,
      challengeId,
      isCorrect,
      xpAwarded: isCorrect ? 50 : 0,
      awardedBadges,
      explanation: activeQuestion.explanation || null,
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
