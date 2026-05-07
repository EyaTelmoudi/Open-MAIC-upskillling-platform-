"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Sidebar } from "@/app/components/layout/Sidebar";
import { AuthGuard } from "@/app/components/auth/AuthGuard";
import { useAuth } from "@/app/context/AuthContext";
import {
  getAvatarUrl,
  getEnrollments,
  getGamificationProfile,
  getGoals,
  getUserProgress,
} from "@/app/lib/api";
import {
  buildGoalMetricsSummary,
  buildGoalReminder,
  type GoalReminder,
} from "@/app/lib/goal-utils";
import { routes } from "@/app/lib/routes";
import { useGamificationRealtime } from "@/app/hooks/useGamificationRealtime";
import {
  BellRing,
  ChartColumn,
  Flame,
  GraduationCap,
  LogOut,
  Medal,
  PanelLeft,
  PartyPopper,
  Settings,
  ShieldCheck,
  Sparkles,
  Stars,
  Trophy,
  UserCircle,
  X,
  Zap,
} from "lucide-react";

const THEME_PREF_VERSION = 2;
const SF_PREFERENCES_STORAGE_KEY = "sf_preferences";
const GLOBAL_BADGE_BURSTS = [
  { kind: "sparkles", left: "10%", top: "18%", delay: "0s", duration: "3.1s" },
  { kind: "trophy", left: "22%", top: "76%", delay: "0.2s", duration: "3.5s" },
  { kind: "stars", left: "34%", top: "14%", delay: "0.45s", duration: "3s" },
  { kind: "party", left: "66%", top: "20%", delay: "0.1s", duration: "3.2s" },
  { kind: "sparkles", left: "78%", top: "74%", delay: "0.35s", duration: "3.4s" },
  { kind: "stars", left: "90%", top: "28%", delay: "0.55s", duration: "2.9s" },
] as const;

function CelebrationBurstIcon({
  kind,
  className,
}: {
  kind: (typeof GLOBAL_BADGE_BURSTS)[number]["kind"];
  className?: string;
}) {
  if (kind === "trophy") {
    return <Trophy className={className} />;
  }

  if (kind === "party") {
    return <PartyPopper className={className} />;
  }

  if (kind === "stars") {
    return <Stars className={className} />;
  }

  return <Sparkles className={className} />;
}

export function AppShell({
  children,
  fullBleed = false,
}: {
  children: React.ReactNode;
  fullBleed?: boolean;
}) {
  const pathname = usePathname();
  const [isCompactSidebar, setIsCompactSidebar] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    try {
      const raw = window.localStorage.getItem(SF_PREFERENCES_STORAGE_KEY);
      if (!raw) return false;
      const parsed = JSON.parse(raw) as { compactSidebar?: boolean };
      return parsed.compactSidebar ?? false;
    } catch {
      return false;
    }
  });
  const [currentStreak, setCurrentStreak] = useState(0);
  const [totalXp, setTotalXp] = useState(0);
  const [goalReminder, setGoalReminder] = useState<GoalReminder | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const [celebrationModal, setCelebrationModal] = useState<{
    kind: "badge" | "level";
    title: string;
    subtitle: string;
  } | null>(null);
  const [celebrationQueue, setCelebrationQueue] = useState<
    Array<{
      kind: "badge" | "level";
      title: string;
      subtitle: string;
    }>
  >([]);
  const [courseMemoryNotice, setCourseMemoryNotice] = useState<{
    kind: "success" | "error";
    title: string;
    message: string;
  } | null>(null);
  const { user, logout } = useAuth();
  const profileHref = routes.profile;
  const displayName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email
    : "";

  const persistCompactSidebar = (nextCompactSidebar: boolean) => {
    if (typeof window === "undefined") {
      return;
    }

    const raw = window.localStorage.getItem(SF_PREFERENCES_STORAGE_KEY);

    try {
      const parsed = raw
        ? (JSON.parse(raw) as {
            darkMode?: boolean;
            compactSidebar?: boolean;
            emailDigest?: boolean;
            language?: string;
            timezone?: string;
            themeVersion?: number;
          })
        : {};

      const migrated = {
        ...parsed,
        darkMode:
          parsed.themeVersion === THEME_PREF_VERSION ? parsed.darkMode ?? false : false,
        compactSidebar: nextCompactSidebar,
        themeVersion: THEME_PREF_VERSION,
      };

      window.localStorage.setItem(SF_PREFERENCES_STORAGE_KEY, JSON.stringify(migrated));
    } catch {
      window.localStorage.setItem(
        SF_PREFERENCES_STORAGE_KEY,
        JSON.stringify({
          darkMode: false,
          compactSidebar: nextCompactSidebar,
          emailDigest: true,
          language: "English",
          timezone: "UTC+01:00",
          themeVersion: THEME_PREF_VERSION,
        })
      );
    }
  };

  const handleToggleSidebar = () => {
    const nextValue = !isCompactSidebar;
    setIsCompactSidebar(nextValue);
    persistCompactSidebar(nextValue);
  };

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncPreferences = () => {
      const raw = window.localStorage.getItem(SF_PREFERENCES_STORAGE_KEY);
      if (!raw) {
        document.documentElement.classList.remove("dark");
        return;
      }

      try {
        const parsed = JSON.parse(raw) as {
          darkMode?: boolean;
          compactSidebar?: boolean;
          themeVersion?: number;
        };

        const migrated =
          parsed.themeVersion === THEME_PREF_VERSION
            ? parsed
            : {
                ...parsed,
                darkMode: false,
                themeVersion: THEME_PREF_VERSION,
              };

        if (migrated !== parsed) {
          window.localStorage.setItem(SF_PREFERENCES_STORAGE_KEY, JSON.stringify(migrated));
        }

        const darkMode = migrated.darkMode ?? false;
        const compactSidebar = migrated.compactSidebar ?? false;

        setIsCompactSidebar(compactSidebar);
        document.documentElement.classList.toggle("dark", darkMode);
      } catch {
        // Ignore malformed saved preferences and keep defaults.
        document.documentElement.classList.remove("dark");
      }
    };

    syncPreferences();
    window.addEventListener("storage", syncPreferences);
    return () => window.removeEventListener("storage", syncPreferences);
  }, []);

  useEffect(() => {
    if (!isProfileMenuOpen || typeof window === "undefined") {
      return;
    }

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("[data-profile-menu-root]")) {
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

  useEffect(() => {
    if (!user) {
      setGoalReminder(null);
      setCurrentStreak(0);
      setTotalXp(0);
      return;
    }
    const currentUser = user;

    if (typeof window !== "undefined") {
      const dismissedKey = `sf_goal_reminder_dismissed:${new Date().toISOString().slice(0, 10)}`;
      if (window.localStorage.getItem(dismissedKey) === "1") {
        setGoalReminder(null);
        return;
      }
    }

    let cancelled = false;

    async function loadGoalReminder() {
      try {
        const [goals, enrollments, progress, profile] = await Promise.all([
          getGoals().catch(() => []),
          getEnrollments(currentUser.id).catch(() => []),
          getUserProgress(currentUser.id).catch(() => []),
          getGamificationProfile().catch(() => null),
        ]);

        if (cancelled) {
          return;
        }

        const metrics = buildGoalMetricsSummary(progress, enrollments, profile);
        setGoalReminder(buildGoalReminder(goals, metrics));
        setCurrentStreak(profile?.streak?.current_streak ?? 0);
        setTotalXp(profile?.xp?.total ?? 0);
      } catch (error) {
        console.error("Failed to load goal reminder:", error);
      }
    }

    loadGoalReminder();

    return () => {
      cancelled = true;
    };
  }, [user]);

  useEffect(() => {
    if (celebrationModal || celebrationQueue.length === 0) {
      return;
    }

    const [nextCelebration, ...remaining] = celebrationQueue;
    setCelebrationModal(nextCelebration);
    setCelebrationQueue(remaining);
  }, [celebrationModal, celebrationQueue]);

  useEffect(() => {
    if (!courseMemoryNotice) {
      return;
    }

    const timer = setTimeout(() => setCourseMemoryNotice(null), 9000);
    return () => clearTimeout(timer);
  }, [courseMemoryNotice]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handleGamificationSync = (event: Event) => {
      const detail = (event as CustomEvent<{
        totalXp?: number;
        currentStreak?: number;
      }>).detail;

      if (typeof detail?.totalXp === "number" && Number.isFinite(detail.totalXp)) {
        setTotalXp(detail.totalXp);
      }

      if (
        typeof detail?.currentStreak === "number" &&
        Number.isFinite(detail.currentStreak)
      ) {
        setCurrentStreak(detail.currentStreak);
      }
    };

    window.addEventListener("learning.gamification.sync", handleGamificationSync as EventListener);
    return () => {
      window.removeEventListener("learning.gamification.sync", handleGamificationSync as EventListener);
    };
  }, []);

  useGamificationRealtime(user?.id, Boolean(user), (event, payload) => {
    if (event === "badge.earned") {
      if (pathname.startsWith("/learn/")) {
        return;
      }
      const name = typeof payload.badge_name === "string" ? payload.badge_name : "";
      const tier = typeof payload.tier === "string" ? payload.tier : "badge";
      if (!name) {
        return;
      }

      setCelebrationQueue((current) => [...current, {
        kind: "badge",
        title: name,
        subtitle: `${tier} badge unlocked`,
      }]);
      return;
    }

    if (event === "level.up") {
      if (pathname.startsWith("/learn/")) {
        const newTotalXp =
          typeof payload.total_xp === "number"
            ? payload.total_xp
            : Number(payload.total_xp);
        if (Number.isFinite(newTotalXp)) {
          setTotalXp(newTotalXp);
        }
        return;
      }

      const newLevel =
        typeof payload.new_level === "number"
          ? payload.new_level
          : Number(payload.new_level);

      if (!Number.isFinite(newLevel)) {
        return;
      }

      setCelebrationQueue((current) => [...current, {
        kind: "level",
        title: `Level ${newLevel}`,
        subtitle: "New level reached",
      }]);

      const newTotalXp =
        typeof payload.total_xp === "number"
          ? payload.total_xp
          : Number(payload.total_xp);
      if (Number.isFinite(newTotalXp)) {
        setTotalXp(newTotalXp);
      }
      return;
    }

    if (event === "streak.update") {
      const nextStreak =
        typeof payload.current_streak === "number"
          ? payload.current_streak
          : Number(payload.current_streak);

      if (Number.isFinite(nextStreak)) {
        setCurrentStreak(nextStreak);
      }
      return;
    }

    if (event === "xp.gained") {
      const awardedAmount =
        typeof payload.amount === "number"
          ? payload.amount
          : Number(payload.amount);
      if (Number.isFinite(awardedAmount)) {
        setTotalXp((current) => current + awardedAmount);
      }
      return;
    }

    if (event === "course_memory.completed") {
      if (pathname.startsWith("/learn/")) {
        return;
      }
      const courseId = typeof payload.courseId === "string" ? payload.courseId : "unknown";
      setCourseMemoryNotice({
        kind: "success",
        title: "Course memory saved",
        message: `Hindsight finished processing course ${courseId}.`,
      });
      return;
    }

    if (event === "course_memory.failed") {
      if (pathname.startsWith("/learn/")) {
        return;
      }
      const errorMessage =
        typeof payload.error === "string" && payload.error.trim().length > 0
          ? payload.error
          : "Unknown error";
      setCourseMemoryNotice({
        kind: "error",
        title: "Course memory failed",
        message: `Hindsight could not finish processing the course: ${errorMessage}.`,
      });
    }
  });

  const administrationHref =
    user?.role === "SuperAdmin"
      ? routes.superadmin
      : ["Admin", "Manager"].includes(user?.role || "")
        ? routes.dashboard
        : user?.role === "LearningExpert"
          ? routes.adminAiCourseStudio
        : user?.role === "TeamManager"
          ? pathname.startsWith(routes.teamManagerTeams)
            ? routes.courses
            : routes.teamManagerTeams
        : null;
  const administrationLabel =
    user?.role === "LearningExpert"
      ? "Course Management"
      : user?.role === "TeamManager"
        ? pathname.startsWith(routes.teamManagerTeams)
          ? "Learning View"
          : "Teams Workspace"
        : "Administration";
  return (
    <AuthGuard>
      <div className="min-h-screen scroll-smooth bg-[radial-gradient(circle_at_top_left,rgba(14,163,122,0.24),transparent_18%),radial-gradient(circle_at_top_right,rgba(34,199,180,0.22),transparent_18%),radial-gradient(circle_at_18%_88%,rgba(242,165,27,0.14),transparent_18%),radial-gradient(circle_at_82%_14%,rgba(168,85,247,0.08),transparent_14%),linear-gradient(180deg,#eafaf6_0%,#e2f4f5_36%,#d9e7f0_100%)]">
        <header className="sticky top-0 z-40 w-full border-b border-border/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(244,250,251,0.88))] backdrop-blur-md">
          <div className="flex w-full items-center justify-between gap-3 px-4 py-3 sm:px-5 lg:px-6">
            <div className="flex min-w-0 items-center gap-3">
              <button
                type="button"
                onClick={handleToggleSidebar}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-white/70 text-text-secondary transition-colors hover:border-primary/30 hover:bg-white hover:text-text-primary"
                aria-label={isCompactSidebar ? "Expand sidebar" : "Compact sidebar"}
                title={isCompactSidebar ? "Expand sidebar" : "Compact sidebar"}
              >
                <PanelLeft className="h-5 w-5" />
              </button>
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0ea37a_0%,#22c7b4_56%,#f2a51b_112%)] shadow-[0_12px_28px_rgba(14,163,122,0.25)]">
                <Zap className="h-5 w-5 text-white" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-text-primary">
                  SkillForge
                </p>
                <p className="truncate text-xs font-medium uppercase tracking-[0.18em] text-primary/75">
                  Learning Platform
                </p>
              </div>
            </div>
            {user && (
              <div className="flex flex-wrap items-center justify-end gap-3">
                <div className="inline-flex h-[46px] items-center gap-2 rounded-2xl border border-cyan-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(236,254,255,0.92),rgba(125,211,252,0.16))] px-2.5 py-2 shadow-[0_10px_22px_rgba(14,165,233,0.12)]">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#0ea5e9_0%,#06b6d4_100%)] text-white shadow-[0_6px_14px_rgba(14,165,233,0.22)]">
                    <Medal className="h-4 w-4" />
                  </div>
                  <div className="text-left leading-none">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-cyan-700">
                      XP Points
                    </p>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-sm font-black leading-none text-cyan-950">
                        {totalXp}
                      </span>
                      <span className="text-[10px] font-medium text-cyan-800">
                        XP
                      </span>
                    </div>
                  </div>
                </div>
                <div className="inline-flex h-[46px] items-center gap-2 rounded-2xl border border-amber-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.92),rgba(255,247,237,0.92),rgba(254,240,138,0.2))] px-2.5 py-2 shadow-[0_10px_22px_rgba(245,158,11,0.12)]">
                  <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[linear-gradient(135deg,#f59e0b_0%,#f97316_100%)] text-white shadow-[0_6px_14px_rgba(249,115,22,0.22)]">
                    <Flame className="h-4 w-4" />
                  </div>
                  <div className="text-left leading-none">
                    <p className="text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-700">
                      Current Streak
                    </p>
                    <div className="mt-1 flex items-baseline gap-1">
                      <span className="text-sm font-black leading-none text-amber-950">
                        {currentStreak}
                      </span>
                      <span className="text-[10px] font-medium text-amber-800">
                        {currentStreak === 1 ? "day" : "days"}
                      </span>
                    </div>
                  </div>
                </div>
                {user && administrationHref && (
                  <Link
                    href={administrationHref}
                    className="inline-flex h-[46px] items-center gap-2 rounded-2xl border border-border bg-card px-4 text-sm font-medium text-text-primary shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5"
                  >
                    <ShieldCheck className="h-4 w-4 text-primary" />
                    {administrationLabel}
                  </Link>
                )}
                <div className="relative" data-profile-menu-root>
                  <button
                    type="button"
                    onClick={() => setIsProfileMenuOpen((current) => !current)}
                    className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-card shadow-sm transition-colors hover:border-primary/30 hover:bg-primary/5"
                    aria-expanded={isProfileMenuOpen}
                    aria-haspopup="menu"
                    aria-label="Open profile menu"
                  >
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-medium text-white">
                      {user.avatar ? (
                        <img src={getAvatarUrl(user.avatar) || ""} alt="" className="h-full w-full object-cover" />
                      ) : (
                        (user.first_name?.charAt(0) || user.email.charAt(0)).toUpperCase()
                      )}
                    </div>
                  </button>
                  {isProfileMenuOpen && (
                    <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 min-w-[220px] rounded-3xl border border-border bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(245,250,251,0.94))] p-2 shadow-[0_24px_60px_rgba(15,23,42,0.14)] backdrop-blur-md">
                      <div className="mb-2 rounded-2xl border border-border/70 bg-[linear-gradient(135deg,rgba(14,163,122,0.1),rgba(34,199,180,0.08),rgba(242,165,27,0.06))] px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary text-sm font-semibold text-white shadow-[0_10px_24px_rgba(14,163,122,0.2)]">
                            {user.avatar ? (
                              <img src={getAvatarUrl(user.avatar) || ""} alt="" className="h-full w-full object-cover" />
                            ) : (
                              (user.first_name?.charAt(0) || user.email.charAt(0)).toUpperCase()
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-text-primary">
                              {displayName}
                            </p>
                            <p className="truncate text-xs text-text-secondary">
                              {user.role}
                            </p>
                          </div>
                        </div>
                      </div>
                      <Link
                        href={routes.myLearning}
                        onClick={() => setIsProfileMenuOpen(false)}
                        className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:bg-primary/8"
                      >
                        <GraduationCap className="h-4 w-4 text-primary" />
                        My Learning
                      </Link>
                      <Link
                        href={routes.progress}
                        onClick={() => setIsProfileMenuOpen(false)}
                        className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:bg-primary/8"
                      >
                        <ChartColumn className="h-4 w-4 text-primary" />
                        Progress
                      </Link>
                      <Link
                        href={profileHref}
                        onClick={() => setIsProfileMenuOpen(false)}
                        className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:bg-primary/8"
                      >
                        <UserCircle className="h-4 w-4 text-primary" />
                        Profile
                      </Link>
                      <Link
                        href={routes.settings}
                        onClick={() => setIsProfileMenuOpen(false)}
                        className="flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:bg-primary/8"
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
                        className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium text-text-primary transition-colors hover:bg-destructive/8 hover:text-destructive"
                      >
                        <LogOut className="h-4 w-4 text-destructive" />
                        Logout
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </header>
        <div className="flex min-h-[calc(100vh-76px)]">
          <Sidebar isCompact={isCompactSidebar} />
          <main className="min-w-0 flex-1 overflow-x-hidden">
            <div className={fullBleed ? "h-full" : "mx-auto max-w-[1440px] p-4 sm:p-6"}>
            {goalReminder && (
              <div
                className={`mb-4 flex flex-col gap-3 rounded-3xl border px-4 py-4 shadow-sm sm:flex-row sm:items-start sm:justify-between ${
                  goalReminder.priority === "high"
                    ? "border-red-500/20 bg-red-500/10"
                    : goalReminder.priority === "medium"
                      ? "border-amber-500/25 bg-amber-500/10"
                      : "border-primary/20 bg-primary/5"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-card text-primary">
                    <BellRing className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-secondary">
                      Goal Reminder
                    </p>
                    <h2 className="mt-1 text-base font-semibold text-text-primary">
                      {goalReminder.title}
                    </h2>
                    <p className="mt-1 text-sm text-text-secondary">
                      {goalReminder.message}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={goalReminder.ctaHref}
                    className="inline-flex items-center justify-center rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-light"
                  >
                    {goalReminder.ctaLabel}
                  </Link>
                  <button
                    type="button"
                    onClick={() => {
                      setGoalReminder(null);
                      if (typeof window !== "undefined") {
                        const dismissedKey = `sf_goal_reminder_dismissed:${new Date().toISOString().slice(0, 10)}`;
                        window.localStorage.setItem(dismissedKey, "1");
                      }
                    }}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-border bg-card text-text-secondary transition-colors hover:text-text-primary"
                    aria-label="Dismiss goal reminder"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            {children}
          </div>
          </main>
        </div>
      </div>
      {celebrationModal && (
        <div className="fixed inset-0 z-[150] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          {GLOBAL_BADGE_BURSTS.map((burst) => (
            <div
              key={`${burst.kind}-${burst.left}-${burst.top}`}
              className="pointer-events-none absolute text-primary/80"
              style={{
                left: burst.left,
                top: burst.top,
                animation: `badge-float ${burst.duration} ease-in-out ${burst.delay} infinite`,
              }}
            >
              <CelebrationBurstIcon kind={burst.kind} className="h-8 w-8" />
            </div>
          ))}
          <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-primary/30 bg-[#141925] p-8 text-center shadow-2xl">
            <button
              type="button"
              onClick={() => setCelebrationModal(null)}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close celebration"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="pointer-events-none absolute inset-x-16 top-4 h-20 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative mx-auto mb-4 flex h-24 w-24 animate-[badge-pop_0.9s_ease-out] items-center justify-center rounded-full bg-primary/15 text-primary shadow-[0_0_30px_rgba(59,130,246,0.25)]">
              <Trophy className="h-10 w-10" />
              <Sparkles className="absolute -right-1 top-2 h-5 w-5 animate-pulse" />
              <Stars className="absolute -left-1 bottom-3 h-5 w-5 animate-pulse" />
            </div>
            <p className="relative text-sm font-semibold uppercase tracking-[0.3em] text-primary">
              {celebrationModal.kind === "level" ? "Level Up" : "New Badge"}
            </p>
            <h2 className="relative mt-3 text-3xl font-black text-white">
              {celebrationModal.title}
            </h2>
            <p className="relative mt-2 text-sm capitalize text-white/70">
              {celebrationModal.subtitle}
            </p>
            <p className="relative mt-3 text-sm text-white/70">
              {celebrationModal.kind === "level"
                ? "That XP paid off. Take the win when you are ready."
                : "Fresh achievement secured. Keep the streak alive."}
            </p>
            <div className="relative mt-5 flex items-center justify-center gap-2 text-white">
              <Trophy className="h-5 w-5 text-primary" />
              <Sparkles className="h-5 w-5 text-primary" />
              <PartyPopper className="h-5 w-5 text-primary" />
              <Stars className="h-5 w-5 text-primary" />
            </div>
            <button
              type="button"
              onClick={() => setCelebrationModal(null)}
              className="relative mt-6 inline-flex items-center justify-center rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-light"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {courseMemoryNotice && (
        <div className="pointer-events-none fixed bottom-5 right-5 z-[140] max-w-sm">
          <div
            className={`pointer-events-auto rounded-3xl border px-4 py-4 shadow-[0_24px_60px_rgba(15,23,42,0.18)] backdrop-blur-md ${
              courseMemoryNotice.kind === "success"
                ? "border-emerald-200 bg-[linear-gradient(135deg,rgba(236,253,245,0.95),rgba(209,250,229,0.92))]"
                : "border-rose-200 bg-[linear-gradient(135deg,rgba(255,241,242,0.96),rgba(255,228,230,0.92))]"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl text-white ${
                  courseMemoryNotice.kind === "success"
                    ? "bg-[linear-gradient(135deg,#059669_0%,#10b981_100%)]"
                    : "bg-[linear-gradient(135deg,#e11d48_0%,#fb7185_100%)]"
                }`}
              >
                <BellRing className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-text-primary">{courseMemoryNotice.title}</p>
                <p className="mt-1 text-sm text-text-secondary">{courseMemoryNotice.message}</p>
              </div>
              <button
                type="button"
                onClick={() => setCourseMemoryNotice(null)}
                className="rounded-full p-1 text-text-secondary transition-colors hover:bg-white/70 hover:text-text-primary"
                aria-label="Dismiss notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
      <style jsx global>{`
        @keyframes badge-pop {
          0% {
            opacity: 0;
            transform: scale(0.75);
          }
          70% {
            opacity: 1;
            transform: scale(1.08);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes badge-float {
          0%,
          100% {
            transform: translateY(0) rotate(0deg) scale(1);
            opacity: 0.5;
          }
          50% {
            transform: translateY(-14px) rotate(8deg) scale(1.08);
            opacity: 1;
          }
        }
      `}</style>
    </AuthGuard>
  );
}
