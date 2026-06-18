/**
 * Access Gate Middleware for Three-State Flow
 * 
 * Three states:
 * 1. Platform not set up (setup_completed = false) → redirect to /setup
 * 2. Platform set up but user not onboarded → redirect to /onboarding
 * 3. Normal authenticated flow
 * 
 * Also handles SuperAdmin login (SuperAdmin role bypasses tenant).
 */

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const API_BASE =
  process.env.INTERNAL_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  'http://localhost:8000';
const IDENTITY_BASE =
  process.env.INTERNAL_IDENTITY_URL ||
  process.env.NEXT_PUBLIC_IDENTITY_URL ||
  API_BASE;

const SETUP_ALLOWED_PATHS = [
  '/setup',
  '/api',
];

const PUBLIC_PATHS = [
  '/login',
  '/auth',
  '/verify',
  '/onboarding',
  '/onboarding/profile',
  '/onboarding/skills',
  '/onboarding/goals',
  '/onboarding/recommendation',
  '/onboarding/complete',
  '/superadmin/login',
];

const ONBOARDING_EXEMPT_ROLES = new Set([
  'Admin',
  'Manager',
  'TeamManager',
  'LearningExpert',
]);

const WORKSPACE_VIEW_COOKIE = 'sf_workspace_view';

function matchesPath(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      return null;
    }
    const normalizedPayload = tokenParts[1].replace(/-/g, '+').replace(/_/g, '/');
    const paddedPayload = normalizedPayload.padEnd(
      normalizedPayload.length + ((4 - (normalizedPayload.length % 4)) % 4),
      '=',
    );
    return JSON.parse(atob(paddedPayload));
  } catch {
    return null;
  }
}

function isValidTokenShape(token: string | null | undefined): token is string {
  const value = String(token || '').trim();
  return Boolean(value && value !== 'undefined' && value !== 'null' && value.split('.').length === 3);
}

async function refreshSession(refreshToken: string) {
  if (!isValidTokenShape(refreshToken)) {
    return null;
  }

  try {
    const response = await fetch(`${API_BASE}/api/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (!isValidTokenShape(data?.access_token) || !isValidTokenShape(data?.refresh_token)) {
      return null;
    }

    return data as {
      access_token: string;
      refresh_token: string;
      expires_in?: number;
    };
  } catch {
    return null;
  }
}

async function validateSessionToken(token: string) {
  if (!isValidTokenShape(token)) {
    return false;
  }

  try {
    const response = await fetch(`${IDENTITY_BASE}/api/v1/identity/users/me`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
      cache: 'no-store',
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function refreshAndValidateSession(refreshToken: string | null) {
  if (!refreshToken) {
    return null;
  }

  const refreshed = await refreshSession(refreshToken);
  if (!refreshed) {
    return null;
  }

  const payload = decodeJwtPayload(refreshed.access_token);
  if (!payload) {
    return null;
  }

  const isValid = await validateSessionToken(refreshed.access_token);
  if (!isValid) {
    return null;
  }

  return { refreshed, payload };
}

async function getSetupStatus(): Promise<boolean | null> {
  try {
    const response = await fetch(`${API_BASE}/setup/status`);
    if (response.ok) {
      const data = await response.json();
      return data.setup_completed;
    }
    return null;
  } catch {
    return null;
  }
}

function applyRefreshedSessionCookies(
  response: NextResponse,
  refreshed: { access_token: string; refresh_token: string; expires_in?: number },
) {
  response.cookies.set('access_token', refreshed.access_token, {
    path: '/',
    maxAge: Number(refreshed.expires_in || 900),
    sameSite: 'lax',
  });
  response.cookies.set('refresh_token', refreshed.refresh_token, {
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
    sameSite: 'lax',
  });
}

function resolveProtectedRouteResponse(
  request: NextRequest,
  payload: Record<string, unknown>,
  response: NextResponse = NextResponse.next(),
) {
  const { pathname } = request.nextUrl;
  const role = String(payload.role || '');
  const onboarded = Boolean(payload.onboarded);
  const userStatus = String(payload.status || '');
  const workspaceView = request.cookies.get(WORKSPACE_VIEW_COOKIE)?.value;

  if (role === 'SuperAdmin') {
    return response;
  }

  const needsOnboarding =
    !ONBOARDING_EXEMPT_ROLES.has(role) &&
    (!onboarded || userStatus === 'pending' || userStatus === 'pending_invitation');

  if (needsOnboarding) {
    const onboardingUrl = new URL('/onboarding', request.url);
    return NextResponse.redirect(onboardingUrl);
  }

  if (role === 'Admin' && workspaceView !== 'learning' && !pathname.startsWith('/admin')) {
    const adminUrl = new URL('/admin/users', request.url);
    return NextResponse.redirect(adminUrl);
  }

  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  const isSetupAllowedPath = SETUP_ALLOWED_PATHS.some(path => matchesPath(pathname, path));
  if (!isSetupAllowedPath) {
    const setupCompleted = await getSetupStatus();
    if (setupCompleted === false || setupCompleted === null) {
      const setupUrl = new URL('/setup', request.url);
      return NextResponse.redirect(setupUrl);
    }
  }

  if (PUBLIC_PATHS.some(path => matchesPath(pathname, path))) {
    return NextResponse.next();
  }

  let token = request.cookies.get('access_token')?.value 
    || request.headers.get('authorization')?.replace('Bearer ', '');
  token = isValidTokenShape(token) ? token : undefined;
  const storedRefreshToken = request.cookies.get('refresh_token')?.value || null;
  const refreshToken = isValidTokenShape(storedRefreshToken) ? storedRefreshToken : null;

  if (!token && refreshToken) {
    const session = await refreshAndValidateSession(refreshToken);
    if (session) {
      const nextResponse = NextResponse.next();
      applyRefreshedSessionCookies(nextResponse, session.refreshed);
      return resolveProtectedRouteResponse(request, session.payload, nextResponse);
    }
  }

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const payload = decodeJwtPayload(token);
    if (!payload) {
      throw new Error('Invalid token format');
    }

    const exp = Number(payload.exp || 0);
    const now = Math.floor(Date.now() / 1000);
    if (exp && exp <= now) {
      const session = await refreshAndValidateSession(refreshToken);
      if (session) {
        const nextResponse = NextResponse.next();
        applyRefreshedSessionCookies(nextResponse, session.refreshed);
        return resolveProtectedRouteResponse(request, session.payload, nextResponse);
      }

      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    const isTokenAccepted = await validateSessionToken(token);
    if (!isTokenAccepted) {
      const session = await refreshAndValidateSession(refreshToken);
      if (session) {
        const nextResponse = NextResponse.next();
        applyRefreshedSessionCookies(nextResponse, session.refreshed);
        return resolveProtectedRouteResponse(request, session.payload, nextResponse);
      }

      const loginUrl = new URL('/login', request.url);
      return NextResponse.redirect(loginUrl);
    }

    return resolveProtectedRouteResponse(request, payload);
  } catch {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:csv|svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
