'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { ChevronRight, History, LogOut, Settings, ShieldCheck, UserCircle, Users, Zap } from 'lucide-react';

import { AuthGuard } from '@/app/components/auth/AuthGuard';
import { AdminSidebar } from '@/app/components/layout/AdminSidebar';
import { SuperAdminSidebar } from '@/app/components/layout/SuperAdminSidebar';
import { useAuth } from '@/app/context/AuthContext';
import { getAvatarUrl } from '@/app/lib/api';
import { routes } from '@/app/lib/routes';

const adminHeaderContent: Array<{
  match: (pathname: string) => boolean;
  title: string;
  description: string;
}> = [
  {
    match: (pathname) => pathname === routes.dashboard,
    title: 'Company Admin Workspace',
    description:
      'Operate your company workspace with user management, learning operations, and team-level actions in one place.',
  },
  {
    match: (pathname) => pathname.startsWith(routes.adminUsers),
    title: 'User Administration',
    description:
      'Invite users, assign roles, manage departments, and control account access for your company.',
  },
  {
    match: (pathname) => pathname.startsWith(routes.adminCourses),
    title: 'Course Administration',
    description:
      'Create, edit, publish, and maintain the courses available to your company learners.',
  },
  {
    match: (pathname) => pathname.startsWith(routes.adminAiCourseStudio),
    title: 'AI Course Studio',
    description:
      'Prepare the next authoring workflow where learning experts generate courses from source material with AI assistance.',
  },
  {
    match: (pathname) => pathname.startsWith(routes.adminAiCourseBuilder),
    title: 'AI Course Builder',
    description:
      'Upload source material, monitor generation progress, and refine the AI-generated draft before publishing it into the platform.',
  },
  {
    match: (pathname) => pathname.startsWith(routes.adminTeams),
    title: 'Team Operations',
    description: 'Manage team structure, monitor team progress, and assign learning across teams.',
  },
  {
    match: (pathname) => pathname.startsWith(routes.adminGoals),
    title: 'Goal Management',
    description: 'Create learner and team goals, then track visibility and progress from one workspace.',
  },
  {
    match: (pathname) => pathname.startsWith(routes.adminBadges),
    title: 'Badge Management',
    description:
      'Create company badge definitions for learning paths, skills, courses, teams, and challenges.',
  },
  {
    match: (pathname) => pathname.startsWith(routes.adminAudit),
    title: 'Company Audit Log',
    description:
      'Review identity, role, status, and access changes within the company you administer.',
  },
];

const allowedRoles = new Set(['Admin', 'Manager', 'LearningExpert', 'SuperAdmin']);
const ADMIN_SIDEBAR_STORAGE_KEY = 'admin-sidebar-compact';
const WORKSPACE_VIEW_COOKIE = 'sf_workspace_view';

function readAdminSidebarCompactPreference() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.localStorage.getItem(ADMIN_SIDEBAR_STORAGE_KEY) === 'true';
}

function isLearningWorkspaceActive() {
  if (typeof window === 'undefined') {
    return false;
  }

  return window.document.cookie
    .split('; ')
    .some((entry) => entry === `${WORKSPACE_VIEW_COOKIE}=learning`);
}

function resolveAdminHeader(pathname: string) {
  return (
    adminHeaderContent.find((item) => item.match(pathname)) || {
      title: 'Admin Workspace',
      description:
        'Run your company workspace without falling back into the learner-facing interface.',
    }
  );
}

function enterLearningWorkspace(router: ReturnType<typeof useRouter>) {
  if (typeof window === 'undefined') {
    return;
  }

  window.document.cookie = `${WORKSPACE_VIEW_COOKIE}=learning; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
  router.push(routes.dashboard);
}

export function AdminShell({
  children,
  showPageHeader = true,
}: {
  children: React.ReactNode;
  showPageHeader?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSidebarCompact, setIsSidebarCompact] = useState(readAdminSidebarCompactPreference);
  const isLearningExpert = user?.role === 'LearningExpert';
  const isSuperAdminAdminWorkspace = user?.role === 'SuperAdmin' && pathname.startsWith('/admin');
  const isSuperAdminCourseWorkspace = user?.role === 'SuperAdmin' && pathname.startsWith(routes.adminCourses);
  const isUsersWorkspace = pathname.startsWith(routes.adminUsers);
  const isTeamsWorkspace = pathname.startsWith(routes.adminTeams);
  const isBadgesWorkspace = pathname.startsWith(routes.adminBadges);
  const isAuditWorkspace = pathname.startsWith(routes.adminAudit);
  const useSpecialHeader = isUsersWorkspace || isTeamsWorkspace || isBadgesWorkspace || isAuditWorkspace;
  const shouldShowPageHeader =
    showPageHeader &&
    !pathname.startsWith(routes.adminAiCourseStudio) &&
    !pathname.startsWith(routes.adminCourses) &&
    !pathname.startsWith(routes.adminUsers);
  const header = isLearningExpert
    ? pathname.startsWith(routes.adminBadges)
      ? {
          title: 'Badge Management',
          description:
            'Create tenant-scoped learning badges that stay private to your company workspace.',
        }
      : pathname.startsWith(routes.adminAiCourseStudio)
      ? {
          title: 'AI Course Studio',
          description: 'This workspace will host AI-assisted course creation for learning experts.',
        }
      : {
          title: 'Course Management Workspace',
          description:
            'Manage the course catalog and prepare future AI-generated learning experiences.',
        }
    : resolveAdminHeader(pathname);

  useEffect(() => {
    if (!isLoading && user && !allowedRoles.has(user.role)) {
      router.replace(routes.dashboard);
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (
      !isLoading &&
      user?.role === 'LearningExpert' &&
      !isLearningWorkspaceActive() &&
      !pathname.startsWith(routes.adminCourses) &&
      !pathname.startsWith(routes.adminAiCourseStudio) &&
      !pathname.startsWith(routes.adminBadges)
    ) {
      router.replace(routes.adminCourses);
    }
  }, [isLoading, pathname, router, user?.role]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    window.localStorage.setItem(ADMIN_SIDEBAR_STORAGE_KEY, String(isSidebarCompact));
  }, [isSidebarCompact]);

  useEffect(() => {
    if (!isProfileMenuOpen || typeof window === 'undefined') {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest('[data-admin-profile-menu-root]')) {
        return;
      }
      setIsProfileMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsProfileMenuOpen(false);
      }
    };

    window.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('keydown', handleEscape);

    return () => {
      window.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [isProfileMenuOpen]);

  const displayName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(' ') || user.email
    : 'Admin';

  return (
    <AuthGuard>
      <div className="min-h-screen scroll-smooth bg-[radial-gradient(circle_at_top_left,rgba(15,159,119,0.2),transparent_18%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_20%),radial-gradient(circle_at_20%_85%,rgba(245,158,11,0.08),transparent_16%),linear-gradient(180deg,#eefaf7_0%,#e7f3f8_34%,#dfe9f1_100%)] text-text-primary">
        <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(244,250,251,0.88))] backdrop-blur-md">
          <div className="flex w-full flex-col gap-3 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:justify-between lg:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0ea37a_0%,#22c7b4_56%,#f2a51b_112%)] shadow-[0_12px_28px_rgba(14,163,122,0.25)]">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-slate-950">SkillForge</p>
                <p className="truncate text-xs font-medium uppercase tracking-[0.18em] text-emerald-700">
                  {isSuperAdminAdminWorkspace
                    ? 'Platform Control'
                    : isLearningExpert
                      ? 'Course Workspace'
                      : 'Administration'}
                </p>
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-end lg:max-w-[860px]">
              <div className="inline-flex w-full items-center rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,250,251,0.92))] p-1 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm md:w-auto md:min-w-[320px]">
                <span className="inline-flex min-w-0 flex-1 items-center justify-center rounded-xl bg-[linear-gradient(135deg,rgba(14,163,122,0.16),rgba(59,130,246,0.12),rgba(245,158,11,0.08))] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 shadow-[0_8px_18px_rgba(15,23,42,0.08)] sm:text-xs sm:tracking-[0.18em]">
                  {isSuperAdminCourseWorkspace
                    ? 'Course Management'
                    : isSuperAdminAdminWorkspace
                      ? 'Administration'
                    : isLearningExpert
                      ? 'Course Management'
                      : 'Administration'}
                </span>
                <button
                  type="button"
                  onClick={() => enterLearningWorkspace(router)}
                  className="inline-flex min-w-0 flex-1 items-center justify-center rounded-xl px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700 transition-all duration-200 hover:-translate-y-0.5 hover:bg-[linear-gradient(135deg,rgba(14,163,122,0.08),rgba(59,130,246,0.08),rgba(245,158,11,0.06))] hover:text-slate-950 hover:shadow-[0_10px_22px_rgba(15,23,42,0.08)] active:translate-y-0 sm:text-xs sm:tracking-[0.18em]"
                >
                  Learning View
                </button>
              </div>

              <div className="relative md:w-auto" data-admin-profile-menu-root>
                <button
                  type="button"
                  onClick={() => setIsProfileMenuOpen((current) => !current)}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white/90 shadow-[0_18px_40px_rgba(15,23,42,0.08)] transition-colors hover:border-primary/25 hover:bg-white"
                  aria-expanded={isProfileMenuOpen}
                  aria-haspopup="menu"
                  aria-label="Open admin profile menu"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-white">
                    {user?.avatar ? (
                      <img
                        src={getAvatarUrl(user.avatar) || ''}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      displayName.charAt(0).toUpperCase()
                    )}
                  </div>
                </button>

                {isProfileMenuOpen && (
                  <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 min-w-[280px] rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
                    <div className="mb-2 rounded-2xl border border-emerald-900/10 bg-[linear-gradient(135deg,#0f766e_0%,#0b5f68_52%,#123a57_100%)] px-4 py-3 text-white shadow-[0_16px_34px_rgba(15,118,110,0.22)]">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/35 bg-white/15 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
                          {user?.avatar ? (
                            <img
                              src={getAvatarUrl(user.avatar) || ''}
                              alt=""
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            displayName.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">
                            {displayName}
                          </p>
                          <p className="mt-0.5 truncate text-xs font-semibold uppercase tracking-[0.14em] text-emerald-50/90">{user?.role || 'Admin'}</p>
                          <p className="mt-1 truncate text-xs text-white/85">{user?.email}</p>
                        </div>
                      </div>
                    </div>
                    <Link
                      href={routes.profile}
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-emerald-50 hover:text-emerald-900"
                    >
                      <UserCircle className="h-4 w-4 text-primary" />
                      Profile
                    </Link>
                    <Link
                      href={routes.settings}
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-emerald-50 hover:text-emerald-900"
                    >
                      <Settings className="h-4 w-4 text-primary" />
                      Settings
                    </Link>
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        logout();
                      }}
                      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-red-50 hover:text-red-700"
                    >
                      <LogOut className="h-4 w-4 text-destructive" />
                      Logout
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

        <div className="flex min-h-[calc(100vh-76px)]">
          {isSuperAdminAdminWorkspace ? (
            <SuperAdminSidebar
              isCompact={isSidebarCompact}
              onToggleCompact={() => setIsSidebarCompact((current) => !current)}
            />
          ) : (
            <AdminSidebar
              isCompact={isSidebarCompact}
              onToggleCompact={() => setIsSidebarCompact((current) => !current)}
            />
          )}

          <main className="min-w-0 flex-1 overflow-x-hidden">
            {shouldShowPageHeader ? (
              <div
                className={
                  useSpecialHeader
                    ? 'bg-transparent px-4 pt-6 sm:px-6 lg:px-8'
                    : 'border-b border-border bg-[linear-gradient(180deg,rgba(240,251,247,0.95)_0%,rgba(231,244,248,0.9)_100%)] backdrop-blur-sm'
                }
              >
                <div
                  className={
                    useSpecialHeader
                      ? 'mx-auto w-full max-w-[1680px] overflow-hidden rounded-[2rem] border border-[#2A5B4A] bg-[radial-gradient(circle_at_8%_18%,_rgba(16,185,129,0.26),_transparent_28%),radial-gradient(circle_at_78%_8%,_rgba(59,130,246,0.22),_transparent_30%),radial-gradient(circle_at_92%_92%,_rgba(245,158,11,0.16),_transparent_26%),linear-gradient(135deg,_#102E2D_0%,_#132A3A_48%,_#0F172A_100%)] px-5 py-6 text-white shadow-[0_26px_70px_rgba(0,0,0,0.28)] sm:px-7 lg:px-8 lg:py-8'
                      : 'mx-auto w-full max-w-[1680px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7'
                  }
                >
                  <div className="relative max-w-3xl min-w-0">
                    {useSpecialHeader ? (
                      <div className="pointer-events-none absolute -right-36 -top-24 h-56 w-56 rounded-full border border-white/10 bg-white/8 blur-sm" />
                    ) : null}
                    <div
                      className={`mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] sm:text-xs sm:tracking-[0.24em] ${
                        useSpecialHeader
                          ? 'w-fit rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-emerald-100 shadow-[0_14px_32px_rgba(0,0,0,0.16)] backdrop-blur-sm'
                          : 'text-emerald-700'
                      }`}
                    >
                      <span>
                        {isSuperAdminAdminWorkspace
                          ? 'Platform Admin'
                          : isLearningExpert
                            ? 'Learning Operations'
                            : 'Tenant Admin'}
                      </span>
                      <ChevronRight className="h-3.5 w-3.5" />
                      <span>
                        {isSuperAdminAdminWorkspace
                          ? '3S Companies'
                          : isLearningExpert
                          ? 'Course Workspace'
                          : user?.tenant_name || 'Company Workspace'}
                      </span>
                    </div>
                    <h1
                      className={`tracking-tight ${
                        useSpecialHeader ? 'text-white' : 'text-slate-950'
                      } ${useSpecialHeader ? 'text-3xl font-semibold sm:text-4xl' : 'text-2xl font-semibold sm:text-3xl'}`}
                    >
                      {header.title}
                    </h1>
                    {header.description ? (
                      <p
                        className={`max-w-2xl text-sm ${
                          useSpecialHeader ? 'text-slate-200' : 'text-slate-700'
                        } ${useSpecialHeader ? 'mt-4 leading-7 sm:text-base' : 'mt-3 leading-6'}`}
                      >
                        {header.description}
                      </p>
                    ) : null}
                    {isAuditWorkspace ? (
                      <div className="mt-6 flex flex-wrap gap-3 text-xs font-medium text-emerald-100">
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                          <History className="h-3.5 w-3.5" />
                          Company timeline
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Access changes
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                          <Users className="h-3.5 w-3.5" />
                          Identity activity
                        </span>
                      </div>
                    ) : null}
                    {isTeamsWorkspace ? (
                      <div className="mt-6 flex flex-wrap gap-3 text-xs font-medium text-emerald-100">
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                          <Users className="h-3.5 w-3.5" />
                          Team structure
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Progress monitoring
                        </span>
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                          <Zap className="h-3.5 w-3.5" />
                          Learning assignments
                        </span>
                      </div>
                    ) : null}
                  </div>
                </div>
              </div>
            ) : null}

            <div className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {children}

              {pathname === routes.dashboard && (
                <div className="mb-8 mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3 lg:mt-10">
                  <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-secondary">
                      Workspace Type
                    </p>
                    <p className="mt-3 text-lg font-semibold text-text-primary">
                      Company Admin Workspace
                    </p>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                      Admins now land in an operations-focused environment instead of the learner
                      dashboard.
                    </p>
                  </div>
                  <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-secondary">
                      Operator Scope
                    </p>
                    <div className="mt-3 flex items-center gap-3">
                      <Users className="h-5 w-5 text-primary" />
                      <p className="text-lg font-semibold text-text-primary">
                        Users, courses, content, teams
                      </p>
                    </div>
                  </div>
                  <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-text-secondary">
                      Learning View Shortcut
                    </p>
                    <p className="mt-3 text-lg font-semibold text-text-primary">
                      Separate admin and learner workspaces
                    </p>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                      Use the button above to switch into the learner platform when you need it.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
