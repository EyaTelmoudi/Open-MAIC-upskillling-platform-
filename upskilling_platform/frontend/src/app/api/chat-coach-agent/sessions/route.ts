import {
  createCoachSession,
  listCoachSessions,
  type CoachSessionSource,
} from "@/app/lib/coach-session-db";

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

function normalizeSource(value: string | null): CoachSessionSource {
  if (value === "course-page" || value === "course-lesson-coach") {
    return value;
  }
  return "coach-page";
}

export async function GET(request: Request) {
  try {
    const token = getTokenFromRequest(request);
    const claims = decodeJwtClaims(token);
    const userId = claims?.sub?.trim() || null;
    const url = new URL(request.url);
    const courseId = url.searchParams.get("courseId")?.trim() || null;
    const lessonIdParam = url.searchParams.get("lessonId");
    const lessonId = lessonIdParam === null ? undefined : lessonIdParam.trim() || null;
    const rawSource = url.searchParams.get("source")?.trim() || null;
    const source = rawSource ? normalizeSource(rawSource) : null;

    if (!userId || !courseId) {
      return Response.json({ success: false, error: "userId and courseId are required" }, { status: 400 });
    }

    const sessions = await listCoachSessions({
      userId,
      courseId,
      lessonId,
      source: source || undefined,
    });

    return Response.json({ success: true, sessions }, { status: 200 });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to load coach sessions." },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json().catch(() => ({}))) as {
      tenantId?: string | null;
      courseId?: string | null;
      lessonId?: string | null;
      source?: string | null;
      pagePath?: string | null;
    };
    const token = getTokenFromRequest(request);
    const claims = decodeJwtClaims(token);
    const tenantId = body.tenantId?.trim() || claims?.tenantId?.trim() || null;
    const userId = claims?.sub?.trim() || null;
    const courseId = body.courseId?.trim() || null;
    const lessonId = body.lessonId?.trim() || null;
    const source = normalizeSource(body.source || null);
    const pagePath = body.pagePath?.trim() || null;

    if (!tenantId || !userId || !courseId) {
      return Response.json({ success: false, error: "tenantId, userId, and courseId are required" }, { status: 400 });
    }

    const created = await createCoachSession({
      tenantId,
      userId,
      courseId,
      lessonId,
      source,
      pagePath,
    });

    return Response.json({ success: true, session: created.session }, { status: 201 });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Failed to create coach session." },
      { status: 500 },
    );
  }
}
