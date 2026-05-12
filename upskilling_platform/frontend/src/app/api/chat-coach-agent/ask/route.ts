import { askChatCoachQuestion } from "@/app/lib/chat-coach-agent";
import {
  appendCoachTurn,
  getOrCreateActiveCoachSession,
  type CoachSessionSource,
} from "@/app/lib/coach-session-db";
import { sendLearnerMemoryEvent } from "@/app/lib/learner-memory-agent";

const DEFAULT_COURSE_ID = "30e2a552-f281-496e-99b8-cbab2fbff07b";

function decodeJwtClaims(token: string | null): { tenantId?: string | null; sub?: string | null } | null {
  if (!token) {
    return null;
  }

  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }

    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as { tenantId?: string | null; sub?: string | null };
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

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function extractLeadingJsonObject(text: string) {
  const start = text.indexOf("{");
  if (start < 0) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < text.length; index += 1) {
    const char = text[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
      continue;
    }

    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1);
      }
    }
  }

  return null;
}

function formatStructuredAnswer(payload: Record<string, unknown>) {
  const answer = cleanText(payload.answer);
  const whyThisMatters = cleanText(payload.why_this_matters ?? payload.whyThisMatters);
  const nextStep = cleanText(payload.next_step ?? payload.nextStep);

  const sections = [
    answer ? `Answer:\n${answer}` : "",
    whyThisMatters ? `Why this matters:\n${whyThisMatters}` : "",
    nextStep ? `Next step:\n${nextStep}` : "",
  ].filter(Boolean);

  return sections.join("\n\n").trim();
}

function normalizeCoachAnswer(rawAnswer: unknown) {
  const text = cleanText(rawAnswer);
  if (!text) {
    return "";
  }

  const candidates = [text];
  if (text.toLowerCase().startsWith("answer:")) {
    candidates.unshift(text.slice("answer:".length).trim());
  }

  for (const candidate of candidates) {
    const jsonObject = extractLeadingJsonObject(candidate);
    if (!jsonObject) {
      continue;
    }

    try {
      const parsed = JSON.parse(jsonObject);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        const formatted = formatStructuredAnswer(parsed as Record<string, unknown>);
        if (formatted) {
          return formatted;
        }
      }
    } catch {
      continue;
    }
  }

  return text;
}

function logValidatedContextForTerminal(validatedContext: Record<string, unknown> | undefined) {
  if (!validatedContext) {
    return;
  }

  const layer1 = {
    tenant_id: validatedContext.tenant_id ?? null,
    course_id: validatedContext.course_id ?? null,
    course_is_published: validatedContext.course_is_published ?? null,
    bank_id: validatedContext.bank_id ?? null,
    hindsight_bank_populated: validatedContext.hindsight_bank_populated ?? null,
    hindsight_bank_document_count: validatedContext.hindsight_bank_document_count ?? null,
    tenant_status: validatedContext.tenant_status ?? null,
  };

  const layer2 = {
    user_id: validatedContext.user_id ?? null,
    learner_enrolled: validatedContext.learner_enrolled ?? null,
    learner_enrollment_status: validatedContext.learner_enrollment_status ?? null,
    lessons_completed: validatedContext.lessons_completed ?? [],
    quiz_scores: validatedContext.quiz_scores ?? {},
    weak_areas: validatedContext.weak_areas ?? [],
    weak_topics: validatedContext.weak_topics ?? [],
    failed_quiz_count: validatedContext.failed_quiz_count ?? null,
    latest_quiz_attempt: validatedContext.latest_quiz_attempt ?? null,
  };

  const layer3 = {
    user_bank_id: validatedContext.user_bank_id ?? null,
    conversation_turns: validatedContext.conversation_turns ?? null,
    rate_limit: validatedContext.rate_limit ?? null,
    updated_at: validatedContext.updated_at ?? null,
  };

  console.log("[Agno Chat Coach Agent] Collected validation context:");
  console.log(
    JSON.stringify(
      {
        layer_1_platform_validation: layer1,
        layer_2_learner_validation: layer2,
        layer_3_session_and_security: layer3,
      },
      null,
      2,
    ),
  );

  const isValid = Boolean(
    layer1.tenant_id &&
      layer1.course_id &&
      layer2.user_id &&
      layer1.course_is_published === true &&
      layer1.hindsight_bank_populated === true &&
      layer1.tenant_status === "active" &&
      layer2.learner_enrolled === true,
  );
  console.log(`[Agno Chat Coach Agent] Validation context status: ${isValid ? "VALID" : "INVALID"}`);
}

function logQuestionIntentForTerminal(questionIntent: Record<string, unknown> | undefined) {
  if (!questionIntent) {
    return;
  }

  console.log("[Agno Chat Coach Agent] Chosen question intent:");
  console.log(JSON.stringify(questionIntent, null, 2));

  const intent = cleanText(questionIntent.intent) || "unknown";
  const topic = cleanText(questionIntent.topic) || "unknown";
  const difficulty = cleanText(questionIntent.difficulty_expected) || "unknown";
  const mode = cleanText(questionIntent.classification_mode) || "unknown";
  const reasoning = cleanText(questionIntent.reasoning) || "No reasoning provided.";

  console.log(
    `[Agno Chat Coach Agent] Classification decision: intent=${intent} topic=${topic} difficulty=${difficulty} mode=${mode}`,
  );
  console.log(`[Agno Chat Coach Agent] Classification reason: ${reasoning}`);
}

function logClassificationInputForTerminal(
  question: string,
  validatedContext: Record<string, unknown> | undefined,
) {
  if (!validatedContext) {
    return;
  }

  console.log("[Agno Chat Coach Agent] Classification input:");
  console.log(
    JSON.stringify(
      {
        question,
        course_name: validatedContext.course_title ?? validatedContext.course_id ?? null,
        current_lesson: validatedContext.current_lesson_title ?? null,
        completed_lessons: validatedContext.completed_lesson_titles ?? [],
        weak_areas: validatedContext.weak_areas ?? [],
        weak_topics: validatedContext.weak_topics ?? [],
        conversation_history: {
          conversation_turns: validatedContext.conversation_turns ?? 0,
          history_available: false,
          note: "Only the conversation turn count is currently available in this workflow.",
        },
        validated_context: validatedContext,
      },
      null,
      2,
    ),
  );
}

type WorkflowSessionTurn = {
  turn_id: string;
  session_id: string;
  user_message: string;
  agent_answer: string;
  intent: string | null;
  topic: string | null;
  is_repeat: boolean;
  classification_mode: string | null;
  created_at: string;
  supporting_memories: Array<Record<string, unknown>>;
};

type PersistedSessionTurn = {
  id: string;
  sessionId: string;
  userMessage: string;
  agentAnswer: string;
  intent: string | null;
  topic: string | null;
  isRepeat: boolean;
  classificationMode: string | null;
  createdAt: string;
  supportingMemories: Array<Record<string, unknown>>;
};

function buildWorkflowSessionTurns(turns: PersistedSessionTurn[] | undefined): WorkflowSessionTurn[] {
  return (turns || []).map((turn) => ({
    turn_id: turn.id,
    session_id: turn.sessionId,
    user_message: turn.userMessage,
    agent_answer: turn.agentAnswer,
    intent: turn.intent,
    topic: turn.topic,
    is_repeat: turn.isRepeat,
    classification_mode: turn.classificationMode,
    created_at: turn.createdAt,
    supporting_memories: turn.supportingMemories,
  }));
}

function logSessionTurnsForTerminal(sessionId: string, sessionTurns: WorkflowSessionTurn[]) {
  console.log(`[Agno Chat Coach Agent] Session turns prepared for sessionId=${sessionId}:`);
  console.log(JSON.stringify(sessionTurns, null, 2));
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      tenantId?: string | null;
      courseId?: string | null;
      question?: string | null;
      source?: "coach-page" | "course-page" | "course-lesson-coach" | null;
      lessonId?: string | null;
      pagePath?: string | null;
      conversationTurns?: number | null;
      sessionId?: string | null;
    };

    const token = getTokenFromRequest(request);
    const claims = decodeJwtClaims(token);
    const tenantId = body.tenantId?.trim() || claims?.tenantId?.trim() || null;
    const userId = claims?.sub?.trim() || null;
    const courseId = body.courseId?.trim() || DEFAULT_COURSE_ID;
    const question = body.question?.trim();
    const sessionSource: CoachSessionSource =
      body.source === "course-lesson-coach" || body.source === "course-page" ? body.source : "coach-page";
    const source = sessionSource === "course-lesson-coach" ? "course-lesson-coach" : "coach-page";
    const lessonId = body.lessonId?.trim() || null;
    const pagePath = body.pagePath?.trim() || null;
    const requestedSessionId = body.sessionId?.trim() || null;

    if (!tenantId) {
      return Response.json(
        { success: false, error: "tenantId is required" },
        { status: 400 },
      );
    }

    if (!question) {
      return Response.json(
        { success: false, error: "question is required" },
        { status: 400 },
      );
    }

    if (!userId) {
      return Response.json(
        { success: false, error: "userId is required" },
        { status: 400 },
      );
    }

    console.log(
      `[Agno Chat Coach Agent] AI coaching agent starts working. source=${sessionSource} course=${courseId}${lessonId ? ` lesson=${lessonId}` : ""}${pagePath ? ` path=${pagePath}` : ""}`,
    );

    const activeSession = await getOrCreateActiveCoachSession(
      {
        tenantId,
        userId,
        courseId,
        lessonId,
        source: sessionSource,
        pagePath,
      },
      requestedSessionId,
    );
    const currentTurnCount = activeSession.session.turnCount;
    const conversationTurns = currentTurnCount + 1;
    const resolvedSessionSource = activeSession.session.source;
    const resolvedLessonId = lessonId || activeSession.session.lessonId || null;
    const resolvedSourceForAgent =
      resolvedSessionSource === "course-lesson-coach" ? "course-lesson-coach" : "coach-page";

    console.log(
      `[Agno Chat Coach Agent] Resolved discussion session. sessionId=${activeSession.session.id} status=${activeSession.session.status} turnCount=${activeSession.session.turnCount} source=${resolvedSessionSource}${resolvedLessonId ? ` lesson=${resolvedLessonId}` : ""}`,
    );

    const result = await askChatCoachQuestion({
      tenantId,
      courseId,
      userId,
      question,
      source: resolvedSourceForAgent,
      lessonId: resolvedLessonId || undefined,
      pagePath: pagePath || undefined,
      authToken: token || undefined,
      conversationTurns,
      sessionId: activeSession.session.id,
      sessionTurns: [],
    });

    const normalizedResult = {
      ...result,
      answer: normalizeCoachAnswer(result.answer),
    };

    logValidatedContextForTerminal(result.validatedContext);
    logClassificationInputForTerminal(question, result.validatedContext);
    logQuestionIntentForTerminal(result.questionIntent);

    const topic = cleanText(result.questionIntent?.topic);
    const intent = cleanText(result.questionIntent?.intent);
    const isRepeat = Boolean(result.questionIntent?.is_repeat);
    const supportingMemories = (normalizedResult.supportingMemories ||
      normalizedResult.basedOn?.memories ||
      []) as Array<Record<string, unknown>>;

    const persistedSession = await appendCoachTurn({
      sessionId: activeSession.session.id,
      userId,
      userMessage: question,
      agentAnswer: normalizedResult.answer || "I could not generate an answer.",
      intent: intent || null,
      topic: topic || null,
      isRepeat,
      classificationMode: cleanText(result.questionIntent?.classification_mode) || null,
      supportingMemories,
    });
    const sessionTurns = buildWorkflowSessionTurns(
      (persistedSession?.turns || []) as PersistedSessionTurn[],
    );

    logSessionTurnsForTerminal(activeSession.session.id, sessionTurns);

    console.log(
      `[Agno Learner Memory Agent] Real platform trigger detected: coaching_turn course=${courseId}${resolvedLessonId ? ` lesson=${resolvedLessonId}` : ""} user=${userId}`,
    );
    try {
      const learnerMemoryResult = await sendLearnerMemoryEvent(
        {
          tenantId,
          userId,
          courseId,
          eventType: "question",
          lessonId: resolvedLessonId || undefined,
          topic: topic || undefined,
          intent: intent || undefined,
          questionText: question,
          sessionId: activeSession.session.id,
          sessionTurns:
            sessionTurns.length > 0
              ? sessionTurns
              : [
                  {
                    turn_id: crypto.randomUUID(),
                    session_id: activeSession.session.id,
                    user_message: question,
                    agent_answer: normalizedResult.answer || "I could not generate an answer.",
                    intent: intent || null,
                    topic: topic || null,
                    is_repeat: isRepeat,
                    classification_mode: cleanText(result.questionIntent?.classification_mode) || null,
                    created_at: new Date().toISOString(),
                    supporting_memories: supportingMemories,
                  },
                ],
          source: resolvedSessionSource,
        },
        "/v1/learner-memory/coaching-turn",
      );

      console.log("[Agno Learner Memory Agent] Learner memory event processed from platform:");
      console.log(JSON.stringify(learnerMemoryResult, null, 2));
    } catch (error) {
      console.error(
        `[Agno Learner Memory Agent] Coaching turn trigger failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`,
      );
    }

    return Response.json(
      {
        success: true,
        result: {
          ...normalizedResult,
          sessionId: activeSession.session.id,
          session: persistedSession
            ? {
                id: persistedSession.id,
                title: persistedSession.title,
                turnCount: persistedSession.turnCount,
                status: persistedSession.status,
                lastActivityAt: persistedSession.lastActivityAt,
              }
            : null,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to run the Chat Coach agent";
    console.error(`[Agno Chat Coach Agent] Route error: ${message}`);
    return Response.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
