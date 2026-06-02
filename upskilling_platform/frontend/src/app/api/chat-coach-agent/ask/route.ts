import {
  askChatCoachQuestion,
  startPreparedCoachingContextCollection,
  upsertPreparedCoachingContextFacts,
} from "@/app/lib/chat-coach-agent";
import {
  appendCoachTurn,
  getOrCreateActiveCoachSession,
  type CoachSessionSource,
} from "@/app/lib/coach-session-db";
import {
  extractLearnerDiscussionFacts,
  retainLearnerLessonMemory,
} from "@/app/lib/learner-memory-agent";

const DEFAULT_COURSE_ID = "30e2a552-f281-496e-99b8-cbab2fbff07b";
const CHAT_COACH_PREFIX = "\u{1F3AF}CC [Agno Chat Coach Agent]";
const PREPARED_CONTEXT_PREFIX = "\u{1F5C3}\uFE0FPC [Prepared Coaching Context]";

function ccMessage(message: string) {
  return message.replace("[Agno Chat Coach Agent]", CHAT_COACH_PREFIX);
}

function pcMessage(message: string) {
  return message.replace("[Prepared Coaching Context]", PREPARED_CONTEXT_PREFIX);
}

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

  const coachContext = {
    tenant_id: validatedContext.tenant_id ?? null,
    course_id: validatedContext.course_id ?? null,
    course_title: validatedContext.course_title ?? null,
    bank_id: validatedContext.bank_id ?? null,
    prepared_context_id: validatedContext.prepared_context_id ?? null,
    user_id: validatedContext.user_id ?? null,
    current_lesson_id: validatedContext.current_lesson_id ?? null,
    current_lesson_title: validatedContext.current_lesson_title ?? null,
    ordered_lessons_count: Array.isArray(validatedContext.ordered_lessons) ? validatedContext.ordered_lessons.length : 0,
    learner_discussion_general_facts: validatedContext.learner_discussion_general_facts ?? [],
    learner_discussion_course_facts: validatedContext.learner_discussion_course_facts ?? [],
    learner_discussion_reasoning: validatedContext.learner_discussion_reasoning ?? null,
    session_id: validatedContext.session_id ?? null,
    conversation_turns: validatedContext.conversation_turns ?? null,
    updated_at: validatedContext.updated_at ?? null,
  };

  console.log(ccMessage("[Agno Chat Coach Agent] Collected coaching context:"));
  console.log(JSON.stringify(coachContext, null, 2));

  const isValid = Boolean(
    coachContext.tenant_id &&
      coachContext.course_id &&
      coachContext.user_id,
  );
  console.log(ccMessage(`[Agno Chat Coach Agent] Coaching context status: ${isValid ? "READY" : "MISSING_IDENTIFIERS"}`));
}

function logQuestionIntentForTerminal(questionIntent: Record<string, unknown> | undefined) {
  if (!questionIntent) {
    return;
  }

  console.log(ccMessage("[Agno Chat Coach Agent] Chosen question intent:"));
  console.log(JSON.stringify(questionIntent, null, 2));

  const intent = cleanText(questionIntent.intent) || "unknown";
  const topic = cleanText(questionIntent.topic) || "unknown";
  const difficulty = cleanText(questionIntent.difficulty_expected) || "unknown";
  const mode = cleanText(questionIntent.classification_mode) || "unknown";
  const reasoning = cleanText(questionIntent.reasoning) || "No reasoning provided.";

  console.log(
    ccMessage(
      `[Agno Chat Coach Agent] Classification decision: intent=${intent} topic=${topic} difficulty=${difficulty} mode=${mode}`,
    ),
  );
  console.log(ccMessage(`[Agno Chat Coach Agent] Classification reason: ${reasoning}`));
}

function logClassificationInputForTerminal(
  question: string,
  validatedContext: Record<string, unknown> | undefined,
) {
  if (!validatedContext) {
    return;
  }

  console.log(ccMessage("[Agno Chat Coach Agent] Classification input:"));
  console.log(
    JSON.stringify(
      {
        question,
        course_name: validatedContext.course_title ?? validatedContext.course_id ?? null,
        current_lesson: validatedContext.current_lesson_title ?? null,
        learner_discussion_general_facts: validatedContext.learner_discussion_general_facts ?? [],
        learner_discussion_course_facts: validatedContext.learner_discussion_course_facts ?? [],
        learner_discussion_reasoning: validatedContext.learner_discussion_reasoning ?? null,
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
  console.log(ccMessage(`[Agno Chat Coach Agent] Session turns prepared for sessionId=${sessionId}:`));
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
      messageCreatedAt?: string | null;
    };

    const token = getTokenFromRequest(request);
    const claims = decodeJwtClaims(token);
    const tenantId = body.tenantId?.trim() || claims?.tenantId?.trim() || null;
    const userId = claims?.sub?.trim() || null;
    const courseId = body.courseId?.trim() || DEFAULT_COURSE_ID;
    const question = body.question?.trim();
    const sessionSource: CoachSessionSource =
      body.source === "course-lesson-coach" || body.source === "course-page" ? body.source : "coach-page";
    const lessonId = body.lessonId?.trim() || null;
    const pagePath = body.pagePath?.trim() || null;
    const requestedSessionId = body.sessionId?.trim() || null;
    const messageCreatedAt = cleanText(body.messageCreatedAt) || null;

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
      ccMessage(
        `[Agno Chat Coach Agent] AI coaching agent starts working. source=${sessionSource} course=${courseId}${lessonId ? ` lesson=${lessonId}` : ""}${pagePath ? ` path=${pagePath}` : ""}`,
      ),
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
      ccMessage(
        `[Agno Chat Coach Agent] Resolved discussion session. sessionId=${activeSession.session.id} status=${activeSession.session.status} turnCount=${activeSession.session.turnCount} source=${resolvedSessionSource}${resolvedLessonId ? ` lesson=${resolvedLessonId}` : ""}`,
      ),
    );

    console.log(
      ccMessage(
        `[Agno Chat Coach Agent] Launching learner-memory agent for coaching discussion fact extraction. userId=${userId} courseId=${courseId} sessionId=${activeSession.session.id}`,
      ),
    );

    const preparedContextId = `coach-session:${activeSession.session.id}:user:${userId}:course:${courseId}`;
    console.log(
      pcMessage(
        `[Prepared Coaching Context] Reserved for Redis-backed shared recall. preparedContextId=${preparedContextId}`,
      ),
    );
    console.log(
      pcMessage(
        `[Prepared Coaching Context] Starting collection immediately in parallel with learner-memory extraction. preparedContextId=${preparedContextId}`,
      ),
    );
    void startPreparedCoachingContextCollection({
      tenantId,
      courseId,
      userId,
      question,
      sessionId: activeSession.session.id,
      preparedContextId,
      learnerDiscussionGeneralFacts: [],
      learnerDiscussionCourseFacts: [],
      learnerDiscussionReasoning: "",
    }).catch((error) => {
      const message =
        error instanceof Error ? error.message : "Unknown prepared-context kickoff error";
      console.error(
        pcMessage(
          `[Prepared Coaching Context] Kickoff failed: ${message}`,
        ),
      );
    });

    const learnerMemoryPayload = {
      tenantId,
      userId,
      courseId,
      lessonId: `discussion-session:${activeSession.session.id}`,
      lessonTitle: "Coaching discussion",
      courseTitle: null,
      eventType: "coaching_discussion_message",
      discussionMessage: question,
      sessionId: activeSession.session.id,
      source: resolvedSourceForAgent,
      preparedContextId,
    };

    const extractedDiscussionFacts = await extractLearnerDiscussionFacts(learnerMemoryPayload);

    console.log(
      ccMessage(
        `[Agno Chat Coach Agent] Learner-memory extracted discussion facts. Starting coaching and learner-memory retention in parallel. generalFacts=${JSON.stringify(extractedDiscussionFacts.generalFacts || [])} courseFacts=${JSON.stringify(extractedDiscussionFacts.courseFacts || [])}`,
      ),
    );
    console.log(
      pcMessage(
        `[Prepared Coaching Context] Upserting extracted learner discussion facts into Redis before learner-memory duplicate checks. preparedContextId=${preparedContextId}`,
      ),
    );
    const preparedFactsUpsertPromise = upsertPreparedCoachingContextFacts({
      preparedContextId,
      learnerDiscussionGeneralFacts: extractedDiscussionFacts.generalFacts || [],
      learnerDiscussionCourseFacts: extractedDiscussionFacts.courseFacts || [],
      learnerDiscussionReasoning: extractedDiscussionFacts.reasoning || "",
    }).catch((error) => {
      const message =
        error instanceof Error ? error.message : "Unknown prepared-context facts upsert error";
      console.error(
        pcMessage(
          `[Prepared Coaching Context] Facts upsert failed: ${message}`,
        ),
      );
    });

    void preparedFactsUpsertPromise.then(() =>
      retainLearnerLessonMemory({
        ...learnerMemoryPayload,
        preExtractedGeneralFacts: extractedDiscussionFacts.generalFacts || [],
        preExtractedCourseFacts: extractedDiscussionFacts.courseFacts || [],
        preExtractionReasoning: extractedDiscussionFacts.reasoning || "",
      }),
    ).catch((error) => {
      const message =
        error instanceof Error ? error.message : "Unknown learner-memory retention error";
      console.error(ccMessage(`[Agno Chat Coach Agent] Learner-memory post-extraction retention failed: ${message}`));
    });

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
      learnerDiscussionGeneralFacts: extractedDiscussionFacts.generalFacts || [],
      learnerDiscussionCourseFacts: extractedDiscussionFacts.courseFacts || [],
      learnerDiscussionReasoning: extractedDiscussionFacts.reasoning || "",
      preparedContextId,
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
      userMessageCreatedAt: messageCreatedAt,
      agentAnswerCreatedAt: new Date().toISOString(),
    });
    const sessionTurns = buildWorkflowSessionTurns(
      (persistedSession?.turns || []) as PersistedSessionTurn[],
    );

    logSessionTurnsForTerminal(activeSession.session.id, sessionTurns);

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
    console.error(ccMessage(`[Agno Chat Coach Agent] Route error: ${message}`));
    return Response.json(
      {
        success: false,
        error: message,
      },
      { status: 500 },
    );
  }
}
