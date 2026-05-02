"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bot,
  ChevronRight,
  LogOut,
  Settings,
  UserCircle,
  Users,
  X,
  Zap,
} from "lucide-react";

import { AuthGuard } from "@/app/components/auth/AuthGuard";
import { AdminSidebar } from "@/app/components/layout/AdminSidebar";
import { useAuth } from "@/app/context/AuthContext";
import { getAvatarUrl } from "@/app/lib/api";
import { routes } from "@/app/lib/routes";

const adminHeaderContent: Array<{
  match: (pathname: string) => boolean;
  title: string;
  description: string;
}> = [
  {
    match: (pathname) => pathname === routes.dashboard,
    title: "Company Admin Workspace",
    description:
      "Operate your company workspace with user management, learning operations, and team-level actions in one place.",
  },
  {
    match: (pathname) => pathname.startsWith(routes.adminUsers),
    title: "User Administration",
    description:
      "Invite users, assign roles, manage departments, and control account access for your company.",
  },
  {
    match: (pathname) => pathname.startsWith(routes.adminCourses),
    title: "Course Administration",
    description:
      "Create, edit, publish, and maintain the courses available to your company learners.",
  },
  {
    match: (pathname) => pathname.startsWith(routes.adminAiCourseStudio),
    title: "AI Course Studio",
    description:
      "Prepare the next authoring workflow where learning experts generate courses from source material with AI assistance.",
  },
  {
    match: (pathname) => pathname.startsWith(routes.adminAiCourseBuilder),
    title: "AI Course Builder",
    description:
      "Upload source material, monitor generation progress, and refine the AI-generated draft before publishing it into the platform.",
  },
  {
    match: (pathname) => pathname.startsWith(routes.adminContent),
    title: "Content Library",
    description:
      "Review uploaded course assets, manage files, and keep media organized by course.",
  },
  {
    match: (pathname) => pathname.startsWith(routes.adminTeams),
    title: "Team Operations",
    description:
      "Manage team structure, monitor team progress, and assign learning across teams.",
  },
];

const allowedRoles = new Set(["Admin", "Manager", "LearningExpert"]);

function resolveAdminHeader(pathname: string) {
  return (
    adminHeaderContent.find((item) => item.match(pathname)) || {
      title: "Admin Workspace",
      description:
        "Run your company workspace without falling back into the learner-facing interface.",
    }
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSidebarCompact, setIsSidebarCompact] = useState(false);
  const isLearningExpert = user?.role === "LearningExpert";
  const header = isLearningExpert
    ? pathname.startsWith(routes.adminAiCourseStudio)
      ? {
          title: "AI Course Studio",
          description: "This workspace will host AI-assisted course creation for learning experts.",
        }
      : {
          title: "Course Management Workspace",
          description: "Manage the course catalog and prepare future AI-generated learning experiences.",
        }
    : resolveAdminHeader(pathname);

  useEffect(() => {
    if (!isLoading && user && !allowedRoles.has(user.role)) {
      router.replace(user.role === "SuperAdmin" ? routes.superadmin : routes.dashboard);
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (
      !isLoading &&
      user?.role === "LearningExpert" &&
      !pathname.startsWith(routes.adminCourses) &&
      !pathname.startsWith(routes.adminAiCourseStudio)
    ) {
      router.replace(routes.adminAiCourseStudio);
    }
  }, [isLoading, pathname, router, user?.role]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const storedValue = window.localStorage.getItem("admin-sidebar-compact");
    setIsSidebarCompact(storedValue === "true");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem("admin-sidebar-compact", String(isSidebarCompact));
  }, [isSidebarCompact]);

  useEffect(() => {
    if (!isProfileMenuOpen || typeof window === "undefined") {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-admin-profile-menu-root]")) {
        return;
      }
      setIsProfileMenuOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", handleOutsideClick);
    window.addEventListener("keydown", handleEscape);

    return () => {
      window.removeEventListener("mousedown", handleOutsideClick);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [isProfileMenuOpen]);

  const displayName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email
    : "Admin";

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
                  {isLearningExpert ? "Course Workspace" : "Administration"}
                </p>
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-end lg:max-w-[860px]">
              <div className="inline-flex w-full items-center rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,250,251,0.92))] p-1 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm md:w-auto md:min-w-[320px]">
                <span className="inline-flex min-w-0 flex-1 items-center justify-center rounded-xl bg-[linear-gradient(135deg,rgba(14,163,122,0.16),rgba(59,130,246,0.12),rgba(245,158,11,0.08))] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 shadow-[0_8px_18px_rgba(15,23,42,0.08)] sm:text-xs sm:tracking-[0.18em]">
                  {isLearningExpert ? "Course Management" : "Administration"}
                </span>
                <button
                  type="button"
                  onClick={() => router.push(routes.courses)}
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
                        src={getAvatarUrl(user.avatar) || ""}
                        alt=""
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      displayName.charAt(0).toUpperCase()
                    )}
                  </div>
                </button>

                {isProfileMenuOpen && (
                  <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 min-w-[240px] rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.97),rgba(245,250,251,0.95))] p-2 shadow-[0_24px_60px_rgba(15,23,42,0.14)] backdrop-blur-md">
                    <button
                      type="button"
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
                      aria-label="Close profile menu"
                    >
                      <X className="h-4 w-4" />
                    </button>
                    <div className="mb-2 rounded-2xl border border-slate-200/80 bg-[linear-gradient(135deg,rgba(14,163,122,0.1),rgba(34,199,180,0.08),rgba(242,165,27,0.06))] px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-white shadow-[0_10px_24px_rgba(14,163,122,0.2)]">
                          {user?.avatar ? (
                            <img src={getAvatarUrl(user.avatar) || ""} alt="" className="h-full w-full object-cover" />
                          ) : (
                            displayName.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate pr-6 text-sm font-semibold text-text-primary">
                            {displayName}
                          </p>
                          <p className="truncate text-xs text-slate-700">
                            {user?.role || "Admin"}
                          </p>
                          <p className="truncate text-xs text-slate-600">
                            {user?.email}
                          </p>
                        </div>
                      </div>
                    </div>
                    <Link
                      href={routes.profile}
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-primary/8"
                    >
                      <UserCircle className="h-4 w-4 text-primary" />
                      Profile
                    </Link>
                    <Link
                      href={routes.settings}
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-primary/8"
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
                      className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-slate-900 transition-colors hover:bg-destructive/8 hover:text-destructive"
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
          <AdminSidebar
            isCompact={isSidebarCompact}
            onToggleCompact={() => setIsSidebarCompact((current) => !current)}
          />

          <main className="min-w-0 flex-1 overflow-x-hidden">
            <div className="border-b border-border bg-[linear-gradient(180deg,rgba(240,251,247,0.95)_0%,rgba(231,244,248,0.9)_100%)] backdrop-blur-sm">
              <div className="mx-auto w-full max-w-[1680px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
                <div className="max-w-3xl min-w-0">
                  <div className="mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700 sm:text-xs sm:tracking-[0.24em]">
                    <span>{isLearningExpert ? "Learning Operations" : "Tenant Admin"}</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                    <span>{isLearningExpert ? "Course Workspace" : user?.tenant_name || "Company Workspace"}</span>
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl">
                    {header.title}
                  </h1>
                  {header.description ? (
                    <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-700">
                      {header.description}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>

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
                      Admins now land in an operations-focused environment instead of the learner dashboard.
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
                      Learning View Removed
                    </p>
                    <p className="mt-3 text-lg font-semibold text-text-primary">
                      No mixed learner-first landing page
                    </p>
                    <p className="mt-2 text-sm leading-6 text-text-secondary">
                      The admin now gets a company-control experience before entering learning tools.
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
