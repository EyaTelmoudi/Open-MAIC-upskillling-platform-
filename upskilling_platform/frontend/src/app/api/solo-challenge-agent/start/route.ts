import { startSoloChallengeWorkflow } from "@/app/lib/solo-challenge-agent";

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

export async function POST(request: Request) {
  const token = getTokenFromRequest(request);
  const claims = decodeJwtClaims(token);
  const body = await request.json().catch(() => ({}));

  try {
    const result = await startSoloChallengeWorkflow({
      tenantId: typeof body?.tenantId === "string" ? body.tenantId : claims?.tenantId || null,
      userId: typeof body?.userId === "string" ? body.userId : claims?.sub || null,
      role: typeof body?.role === "string" ? body.role : claims?.role || null,
      source: "learning-shell",
      pagePath: typeof body?.pagePath === "string" ? body.pagePath : "/courses",
    });

    return Response.json(result, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        success: false,
        workflowName: "solo-challenge-agent",
        action: "start_route_failed",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
