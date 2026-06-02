import { NextResponse } from "next/server";

const IDENTITY_BASE_URL =
  process.env.NEXT_PUBLIC_IDENTITY_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  "http://localhost:8001";

function extractRefreshTokenFromCookie(cookieHeader: string | null) {
  if (!cookieHeader) {
    return null;
  }
  const match = cookieHeader.match(/(?:^|;\s*)refresh_token=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

async function tryRefreshWithToken(refreshToken: string) {
  return fetch(`${IDENTITY_BASE_URL}/api/v1/auth/refresh`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
    cache: "no-store",
  });
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => null)) as
    | { refresh_token?: string | null }
    | null;

  const bodyRefreshToken = String(body?.refresh_token || "").trim();
  const cookieRefreshToken = String(
    extractRefreshTokenFromCookie(request.headers.get("cookie")) || "",
  ).trim();
  const refreshCandidates = Array.from(
    new Set([cookieRefreshToken, bodyRefreshToken].filter(Boolean)),
  );

  if (refreshCandidates.length === 0) {
    return NextResponse.json(
      { detail: "Missing refresh token" },
      { status: 400 },
    );
  }

  let response: Response | null = null;
  let payload: unknown = null;

  for (const candidate of refreshCandidates) {
    response = await tryRefreshWithToken(candidate);
    payload = await response.json().catch(() => null);
    if (response.ok) {
      break;
    }
  }

  if (!response || !response.ok) {
    return NextResponse.json(
      payload || { detail: "Token refresh failed" },
      { status: response?.status || 500 },
    );
  }

  const tokenPayload = payload as
    | { access_token?: string; refresh_token?: string; expires_in?: number }
    | null;
  const nextResponse = NextResponse.json(tokenPayload, { status: 200 });
  if (tokenPayload?.access_token) {
    nextResponse.cookies.set("access_token", tokenPayload.access_token, {
      path: "/",
      maxAge: Number(tokenPayload?.expires_in || 900),
      sameSite: "lax",
    });
  }
  if (tokenPayload?.refresh_token) {
    nextResponse.cookies.set("refresh_token", tokenPayload.refresh_token, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
    });
  }

  return nextResponse;
}
