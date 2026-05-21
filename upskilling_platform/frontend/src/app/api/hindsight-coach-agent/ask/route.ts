import { askAICoachingAgent2 } from "@/app/lib/ai-coaching-agent-2";
import { appendCoachTurn, getOrCreateActiveCoachSession, type CoachSessionSource } from "@/app/lib/coach-session-db";

const DEFAULT_COURSE_ID = "30e2a552-f281-496e-99b8-cbab2fbff07b";
const DEFAULT_HINDSIGHT_URL = process.env.HINDSIGHT_URL || "http://127.0.0.1:8888";
const DEFAULT_HINDSIGHT_API_KEY = process.env.HINDSIGHT_API_KEY || "";

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

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      tenantId?: string | null;
      courseId?: string | null;
      question?: string | null;
      lessonId?: string | null;
      pagePath?: string | null;
      sessionId?: string | null;
    };

    const token = getTokenFromRequest(request);
    const claims = decodeJwtClaims(token);
    const tenantId = cleanText(body.tenantId) || cleanText(claims?.tenantId) || null;
    const userId = cleanText(claims?.sub) || null;
    const courseId = cleanText(body.courseId) || DEFAULT_COURSE_ID;
    const question = cleanText(body.question);
    const lessonId = cleanText(body.lessonId) || null;
    const pagePath = cleanText(body.pagePath) || "/coach-hindsight";
    const requestedSessionId = cleanText(body.sessionId) || null;
    const sessionSource: CoachSessionSource = "hindsight-coach-page";

    if (!tenantId) {
      return Response.json({ success: false, error: "tenantId is required" }, { status: 400 });
    }

    if (!userId) {
      return Response.json({ success: false, error: "userId is required" }, { status: 400 });
    }

    if (!question) {
      return Response.json({ success: false, error: "question is required" }, { status: 400 });
    }

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

    const agentResult = await askAICoachingAgent2({
      tenantId,
      courseId,
      userId,
      question,
      lessonId: lessonId || undefined,
      pagePath,
      sessionId: activeSession.session.id,
      hindsightApiUrl: DEFAULT_HINDSIGHT_URL,
      hindsightApiKey: DEFAULT_HINDSIGHT_API_KEY || undefined,
    });

    const answer =
      cleanText(agentResult.answer) ||
      "I could not find enough grounded course memory to answer that question yet.";

    const supportingMemories = (Array.isArray(agentResult.supportingMemories) ? agentResult.supportingMemories : [])
      .map((memory) => ({
        text: typeof memory.text === "string" ? memory.text : "",
        type: typeof memory.type === "string" ? memory.type : "memory",
      }))
      .filter((memory) => memory.text);

    const persistedSession = await appendCoachTurn({
      sessionId: activeSession.session.id,
      userId,
      userMessage: question,
      agentAnswer: answer,
      intent: "hindsight_reflect",
      topic: null,
      isRepeat: false,
      classificationMode: "hindsight_reflect",
      supportingMemories,
    });

    return Response.json(
      {
        success: true,
        result: {
          answer,
          sessionId: activeSession.session.id,
          basedOn: agentResult.basedOn || null,
          bankId: agentResult.bankId || null,
          supportingMemories,
          session: persistedSession,
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return Response.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to run the Hindsight coach reflect flow.",
      },
      { status: 500 },
    );
  }
}
