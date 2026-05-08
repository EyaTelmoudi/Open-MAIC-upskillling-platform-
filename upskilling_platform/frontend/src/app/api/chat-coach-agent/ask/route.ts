import { askChatCoachQuestion } from "@/app/lib/chat-coach-agent";

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

function logCoachRoute(label: string, payload: Record<string, unknown>) {
  console.log(`[Coach API] ${label}`);
  console.log(JSON.stringify(payload, null, 2));
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

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      tenantId?: string | null;
      courseId?: string | null;
      question?: string | null;
    };

    const token = getTokenFromRequest(request);
    const claims = decodeJwtClaims(token);
    const tenantId = body.tenantId?.trim() || claims?.tenantId?.trim() || null;
    const userId = claims?.sub?.trim() || null;
    const courseId = body.courseId?.trim() || DEFAULT_COURSE_ID;
    const question = body.question?.trim();

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

    logCoachRoute("Incoming UI question", {
      tenantId,
      userId,
      courseId,
      question,
    });

    const result = await askChatCoachQuestion({
      tenantId,
      courseId,
      userId,
      question,
    });

    const normalizedResult = {
      ...result,
      answer: normalizeCoachAnswer(result.answer),
    };

    logCoachRoute("Final coaching result returned to /coach", {
      tenantId,
      userId,
      courseId,
      question,
      answer: normalizedResult.answer,
      supportingMemories: normalizedResult.supportingMemories,
      basedOn: normalizedResult.basedOn,
    });

    return Response.json({ success: true, result: normalizedResult }, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to run the Chat Coach agent",
      },
      { status: 500 },
    );
  }
}
