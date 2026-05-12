import { activateCoachSession, getCoachSessionDetail } from "@/app/lib/coach-session-db";

function decodeJwtClaims(token: string | null): { sub?: string | null } | null {
  if (!token) {
    return null;
  }

  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }

    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as { sub?: string | null };
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

function mapMessages(session: NonNullable<Awaited<ReturnType<typeof getCoachSessionDetail>>>) {
  return session.turns.flatMap((turn: NonNullable<Awaited<ReturnType<typeof getCoachSessionDetail>>>["turns"][number]) => [
    {
      id: `${turn.id}:user`,
      role: "user" as const,
      content: turn.userMessage,
      timestamp: turn.createdAt,
    },
    {
      id: `${turn.id}:assistant`,
      role: "assistant" as const,
      content: turn.agentAnswer,
      timestamp: turn.createdAt,
      sources: turn.supportingMemories.slice(0, 3).map((memory: Record<string, unknown>, index: number) => ({
        title: `Course memory ${index + 1}`,
        lesson:
          typeof memory.type === "string" && memory.type.trim().length > 0 ? memory.type : "observation",
        snippet: typeof memory.text === "string" ? memory.text : "",
      })),
    },
  ]);
}

export async function GET(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const token = getTokenFromRequest(request);
    const claims = decodeJwtClaims(token);
    const userId = claims?.sub?.trim() || null;
    const { sessionId } = await context.params;

    if (!userId || !sessionId) {
      return Response.json({ success: false, error: "userId and sessionId are required" }, { status: 400 });
    }

    const session = await getCoachSessionDetail(sessionId, userId);
    if (!session) {
      return Response.json({ success: false, error: "Coach session not found." }, { status: 404 });
    }

    return Response.json(
      {
        success: true,
        session: {
          ...session,
          messages: mapMessages(session),
        },
      },
      { status: 200 },
    );
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load coach session." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ sessionId: string }> }) {
  try {
    const token = getTokenFromRequest(request);
    const claims = decodeJwtClaims(token);
    const userId = claims?.sub?.trim() || null;
    const { sessionId } = await context.params;
    const body = (await request.json().catch(() => ({}))) as { action?: string | null };

    if (!userId || !sessionId) {
      return Response.json({ success: false, error: "userId and sessionId are required" }, { status: 400 });
    }

    if ((body.action || "").trim() !== "activate") {
      return Response.json({ success: false, error: "Unsupported coach session action." }, { status: 400 });
    }

    const activated = await activateCoachSession(sessionId, userId);
    return Response.json({ success: true, session: activated.session }, { status: 200 });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to update coach session." },
      { status: 500 },
    );
  }
}
