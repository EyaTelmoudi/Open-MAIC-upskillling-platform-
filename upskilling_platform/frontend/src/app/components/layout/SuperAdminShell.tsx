"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  Building2,
  ChevronRight,
  History,
  LogOut,
  Settings,
  UserCircle,
  Users,
  Zap,
} from "lucide-react";

import { AuthGuard } from "@/app/components/auth/AuthGuard";
import { SuperAdminSidebar } from "@/app/components/layout/SuperAdminSidebar";
import { useAuth } from "@/app/context/AuthContext";
import { getAvatarUrl } from "@/app/lib/api";
import { routes } from "@/app/lib/routes";

const headerContent: Array<{
  match: (pathname: string) => boolean;
  title: string;
  description: string;
}> = [
  {
    match: (pathname) => pathname === routes.superadmin,
    title: "Platform Overview",
    description: "Monitor the platform, govern companies, and drive onboarding from one control plane.",
  },
  {
    match: (pathname) => pathname.startsWith(routes.superadminTenants),
    title: "Company Governance",
    description: "Manage tenant lifecycle, activation, limits, and organization readiness.",
  },
  {
    match: (pathname) => pathname.startsWith(routes.superadminUsers),
    title: "Users & Admins Management",
    description:
      "Create platform identities, assign company access, and maintain user roles, departments, status, and admin privileges from one workspace.",
  },
  {
    match: (pathname) => pathname.startsWith(routes.superadminCourses),
    title: "Platform Course Catalog",
    description: "See every course published across the platform without entering the learner workspace.",
  },
  {
    match: (pathname) => pathname.startsWith(routes.superadminAnalytics),
    title: "Platform Analytics",
    description: "Track cross-tenant adoption, governance completion, and operational health.",
  },
  {
    match: (pathname) => pathname.startsWith(routes.superadminAudit),
    title: "Audit Trail",
    description: "Inspect platform-level administrative activity and change history.",
  },
  {
    match: (pathname) => pathname.startsWith(routes.superadminSettings),
    title: "Platform Settings",
    description: "Configure the control-plane defaults used by your platform operators and tenants.",
  },
];

function resolveHeader(pathname: string) {
  return (
    headerContent.find((item) => item.match(pathname)) || {
      title: "Super Admin Workspace",
      description:
        "Operate the platform control plane without the learner-facing workspace noise.",
    }
  );
}

const SUPER_ADMIN_SIDEBAR_STORAGE_KEY = "super-admin-sidebar-compact";
const WORKSPACE_VIEW_COOKIE = "sf_workspace_view";

function readSuperAdminSidebarCompactPreference() {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(SUPER_ADMIN_SIDEBAR_STORAGE_KEY) === "true";
}

export function SuperAdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading, logout } = useAuth();
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [isSidebarCompact, setIsSidebarCompact] = useState(readSuperAdminSidebarCompactPreference);
  const header = resolveHeader(pathname);
  const isOverviewPage = pathname === routes.superadmin;
  const isTenantGovernancePage = pathname.startsWith(routes.superadminTenants);
  const isUsersManagementPage = pathname.startsWith(routes.superadminUsers);
  const isAnalyticsPage = pathname.startsWith(routes.superadminAnalytics);
  const isAuditPage = pathname.startsWith(routes.superadminAudit);
  const isSettingsPage = pathname.startsWith(routes.superadminSettings);
  const useSpecialHeader =
    isOverviewPage ||
    isTenantGovernancePage ||
    isUsersManagementPage ||
    isAnalyticsPage ||
    isAuditPage ||
    isSettingsPage;

  const enterLearningWorkspace = () => {
    if (typeof document !== "undefined") {
      document.cookie = `${WORKSPACE_VIEW_COOKIE}=learning; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    }
    router.push(routes.dashboard);
  };

  useEffect(() => {
    if (!isLoading && user && user.role !== "SuperAdmin") {
      router.replace(routes.dashboard);
    }
  }, [isLoading, router, user]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    window.localStorage.setItem(SUPER_ADMIN_SIDEBAR_STORAGE_KEY, String(isSidebarCompact));
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
    : "Super Admin";

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
                  Platform Control
                </p>
              </div>
            </div>

            <div className="flex w-full flex-col gap-3 md:flex-row md:items-center md:justify-end lg:max-w-[860px]">
              <div className="inline-flex w-full items-center rounded-2xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(246,250,251,0.92))] p-1 shadow-[0_20px_50px_rgba(15,23,42,0.08)] backdrop-blur-sm md:w-auto md:min-w-[320px]">
                <span className="inline-flex min-w-0 flex-1 items-center justify-center rounded-xl bg-[linear-gradient(135deg,rgba(14,163,122,0.16),rgba(59,130,246,0.12),rgba(245,158,11,0.08))] px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-950 shadow-[0_8px_18px_rgba(15,23,42,0.08)] sm:text-xs sm:tracking-[0.18em]">
                  Administration
                </span>
                <button
                  type="button"
                  onClick={enterLearningWorkspace}
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
                  aria-label="Open super admin profile menu"
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
                  <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 min-w-[280px] rounded-3xl border border-slate-200 bg-white p-2 shadow-[0_24px_60px_rgba(15,23,42,0.18)]">
                    <div className="mb-2 rounded-2xl border border-emerald-900/10 bg-[linear-gradient(135deg,#0f766e_0%,#0b5f68_52%,#123a57_100%)] px-4 py-3 text-white shadow-[0_16px_34px_rgba(15,118,110,0.22)]">
                      <div className="flex items-center gap-3">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/35 bg-white/15 text-sm font-semibold text-white shadow-[0_10px_24px_rgba(0,0,0,0.18)]">
                          {user?.avatar ? (
                            <img src={getAvatarUrl(user.avatar) || ""} alt="" className="h-full w-full object-cover" />
                          ) : (
                            displayName.charAt(0).toUpperCase()
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-white">
                            {displayName}
                          </p>
                          <p className="mt-0.5 truncate text-xs font-semibold uppercase tracking-[0.14em] text-emerald-50/90">
                            Super Admin
                          </p>
                          <p className="mt-1 truncate text-xs text-white/85">
                            {user?.email}
                          </p>
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
          <SuperAdminSidebar
            isCompact={isSidebarCompact}
            onToggleCompact={() => setIsSidebarCompact((current) => !current)}
          />

          <main className="min-w-0 flex-1 overflow-x-hidden">
            <div
              className={
                useSpecialHeader
                  ? "bg-transparent px-4 pt-6 sm:px-6 lg:px-8"
                  : "border-b border-border bg-[linear-gradient(180deg,rgba(240,251,247,0.95)_0%,rgba(231,244,248,0.9)_100%)] backdrop-blur-sm"
              }
            >
              <div
                className={
                  useSpecialHeader
                    ? "mx-auto w-full max-w-[1680px] overflow-hidden rounded-[2rem] border border-[#2A5B4A] bg-[radial-gradient(circle_at_8%_18%,_rgba(16,185,129,0.26),_transparent_28%),radial-gradient(circle_at_78%_8%,_rgba(59,130,246,0.22),_transparent_30%),radial-gradient(circle_at_92%_92%,_rgba(245,158,11,0.16),_transparent_26%),linear-gradient(135deg,_#102E2D_0%,_#132A3A_48%,_#0F172A_100%)] px-5 py-6 text-white shadow-[0_26px_70px_rgba(0,0,0,0.28)] sm:px-7 lg:px-8 lg:py-8"
                    : "mx-auto w-full max-w-[1680px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7"
                }
              >
                <div className="relative max-w-3xl min-w-0">
                  {useSpecialHeader ? (
                    <div className="pointer-events-none absolute -right-36 -top-24 h-56 w-56 rounded-full border border-white/10 bg-white/8 blur-sm" />
                  ) : null}
                  <div
                    className={
                      useSpecialHeader
                        ? "mb-5 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100 shadow-[0_14px_32px_rgba(0,0,0,0.16)] backdrop-blur-sm sm:text-xs sm:tracking-[0.22em]"
                        : "mb-3 flex flex-wrap items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700 sm:text-xs sm:tracking-[0.24em]"
                    }
                  >
                    <span>Super Admin</span>
                    <ChevronRight className="h-3.5 w-3.5" />
                    <span>Control Plane</span>
                  </div>
                  <h1
                    className={
                      useSpecialHeader
                        ? "text-3xl font-semibold tracking-tight text-white sm:text-4xl"
                        : "text-2xl font-semibold tracking-tight text-slate-950 sm:text-3xl"
                    }
                  >
                    {header.title}
                  </h1>
                  <p
                    className={
                      useSpecialHeader
                        ? "mt-4 max-w-2xl text-sm leading-7 text-slate-200 sm:text-base"
                        : "mt-3 max-w-2xl text-sm leading-6 text-slate-700"
                    }
                  >
                    {header.description}
                  </p>
                  {useSpecialHeader ? (
                    <div className="mt-6 flex flex-wrap gap-3 text-xs font-medium text-emerald-100">
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                        {isSettingsPage ? (
                          <Settings className="h-3.5 w-3.5" />
                        ) : isAuditPage ? (
                          <History className="h-3.5 w-3.5" />
                        ) : isAnalyticsPage ? (
                          <BarChart3 className="h-3.5 w-3.5" />
                        ) : (
                          <Building2 className="h-3.5 w-3.5" />
                        )}
                        {isSettingsPage
                          ? "Platform defaults"
                          : isAuditPage
                          ? "Activity timeline"
                          : isAnalyticsPage
                          ? "Cross-tenant adoption"
                          : isUsersManagementPage
                          ? "Company assignment"
                          : isTenantGovernancePage
                            ? "Tenant lifecycle"
                            : "Company governance"}
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                        {isSettingsPage ? (
                          <Building2 className="h-3.5 w-3.5" />
                        ) : isAuditPage ? (
                          <Settings className="h-3.5 w-3.5" />
                        ) : isAnalyticsPage ? (
                          <Activity className="h-3.5 w-3.5" />
                        ) : isUsersManagementPage ? (
                          <Users className="h-3.5 w-3.5" />
                        ) : (
                          <Settings className="h-3.5 w-3.5" />
                        )}
                        {isSettingsPage
                          ? "Tenant configuration"
                          : isAuditPage
                          ? "Change inspection"
                          : isAnalyticsPage
                          ? "Operational health"
                          : isUsersManagementPage
                          ? "User profiles"
                          : isTenantGovernancePage
                            ? "Activation controls"
                            : "Platform operations"}
                      </span>
                      <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                        <Zap className="h-3.5 w-3.5" />
                        {isSettingsPage
                          ? "Security controls"
                          : isAuditPage
                          ? "Excel export"
                          : isAnalyticsPage
                          ? "Governance signals"
                          : isUsersManagementPage
                          ? "Privileged access"
                          : isTenantGovernancePage
                            ? "Organization readiness"
                            : "Onboarding control"}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>

            <div className="mx-auto w-full max-w-[1680px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
              {children}
            </div>
          </main>
        </div>
      </div>
    </AuthGuard>
  );
}
