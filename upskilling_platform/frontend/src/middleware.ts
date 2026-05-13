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

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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

const SUPERADMIN_PATHS = [
  '/superadmin',
  '/superadmin/dashboard',
  '/superadmin/tenants',
  '/superadmin/identity',
  '/superadmin/analytics',
  '/superadmin/settings',
];

const ONBOARDING_EXEMPT_ROLES = new Set([
  'Admin',
  'Manager',
  'TeamManager',
  'LearningExpert',
]);

function matchesPath(pathname: string, path: string): boolean {
  return pathname === path || pathname.startsWith(`${path}/`);
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

  const token = request.cookies.get('access_token')?.value 
    || request.headers.get('authorization')?.replace('Bearer ', '');

  if (!token) {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const tokenParts = token.split('.');
    if (tokenParts.length !== 3) {
      throw new Error('Invalid token format');
    }

    const payload = JSON.parse(Buffer.from(tokenParts[1], 'base64').toString());
    const role = payload.role;
    const onboarded = payload.onboarded;
    const userStatus = payload.status;

    if (role === 'SuperAdmin') {
      return NextResponse.next();
    }

    const needsOnboarding =
      !ONBOARDING_EXEMPT_ROLES.has(role) &&
      (!onboarded || userStatus === 'pending' || userStatus === 'pending_invitation');

    if (needsOnboarding) {
      const onboardingUrl = new URL('/onboarding', request.url);
      return NextResponse.redirect(onboardingUrl);
    }
  } catch {
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
