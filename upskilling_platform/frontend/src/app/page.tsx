"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/app/components/layout/AdminShell";
import { AppShell } from "@/app/components/layout/AppShell";
import { useAuth } from "@/app/context/AuthContext";
import {
  api,
  getCourses,
  getEnrollments,
  getGamificationProfile,
  getGoals,
  getTeams,
  type EnrollmentResponse,
  type GamificationProfileResponse,
  type Goal,
} from "@/app/lib/api";
import { routes } from "@/app/lib/routes";
import {
  BookOpen,
  ChevronRight,
  Flame,
  Target,
  Trophy,
  Users,
  Workflow,
  Zap,
} from "lucide-react";

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning!";
  if (hour < 18) return "Good afternoon!";
  return "Good evening!";
}

function formatDate(value?: string | null): string {
  if (!value) return "No deadline";
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type AdminWorkspaceStats = {
  totalUsers: number;
  activeUsers: number;
  pendingUsers: number;
  totalCourses: number;
  publishedCourses: number;
  totalTeams: number;
};

function AdminDashboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<AdminWorkspaceStats>({
    totalUsers: 0,
    activeUsers: 0,
    pendingUsers: 0,
    totalCourses: 0,
    publishedCourses: 0,
    totalTeams: 0,
  });

  useEffect(() => {
    async function loadAdminWorkspace() {
      try {
        const [usersResponse, coursesResponse, publishedCoursesResponse, teamsResponse] =
          await Promise.all([
            api.get<{ users: Array<{ status: string }> }>(
              "/api/v1/identity/users/?page=1&page_size=100"
            ),
            getCourses({ page: 1, page_size: 100 }),
            getCourses({ page: 1, page_size: 100, is_published: true }),
            getTeams().catch(() => []),
          ]);

        const listedUsers = usersResponse.users || [];
        setStats({
          totalUsers: listedUsers.length,
          activeUsers: listedUsers.filter((entry) => entry.status === "active").length,
          pendingUsers: listedUsers.filter(
            (entry) =>
              entry.status === "pending" || entry.status === "pending_invitation"
          ).length,
          totalCourses: coursesResponse.items?.length || 0,
          publishedCourses: publishedCoursesResponse.items?.length || 0,
          totalTeams: Array.isArray(teamsResponse) ? teamsResponse.length : 0,
        });
        setError(null);
      } catch (loadError) {
        console.error("Failed to load admin workspace:", loadError);
        setError("Failed to load company admin workspace.");
      } finally {
        setLoading(false);
      }
    }

    void loadAdminWorkspace();
  }, []);

  const firstName = user?.first_name || user?.email.split("@")[0] || "Admin";

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="rounded-3xl border border-[#3E544B] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.24),_transparent_34%),radial-gradient(circle_at_top_right,_rgba(34,197,94,0.16),_transparent_30%),linear-gradient(135deg,_#1A3A37_0%,_#1E293B_48%,_#0F172A_100%)] p-5 shadow-[0_22px_60px_rgba(0,0,0,0.28)] sm:p-6 lg:p-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#C7D2FE]">
            Company Admin
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-white sm:text-3xl">
            Welcome back, {firstName}
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#D1FAE5]">
            Your landing page is now focused on operating your company workspace rather than showing learner progress widgets.
          </p>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 px-5 py-4 text-sm text-red-300">
            {error}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-[#334155] bg-[#1E293B] px-6 py-12 text-center text-[#94A3B8]">
            Loading company workspace...
          </div>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Users",
                  value: stats.totalUsers,
                  hint: `${stats.activeUsers} active`,
                  icon: Users,
                  href: routes.adminUsers,
                },
                {
                  label: "Pending Access",
                  value: stats.pendingUsers,
                  hint: "Invitations and onboarding",
                  icon: ChevronRight,
                  href: routes.adminUsers,
                },
                {
                  label: "Courses",
                  value: stats.totalCourses,
                  hint: `${stats.publishedCourses} published`,
                  icon: BookOpen,
                  href: routes.adminCourses,
                },
                {
                  label: "Teams",
                  value: stats.totalTeams,
                  hint: "Managed in your workspace",
                  icon: Workflow,
                  href: routes.adminTeams,
                },
              ].map((item) => (
                <Link
                  key={item.label}
                  href={item.href}
                  className="block rounded-3xl border border-[#334155] bg-[linear-gradient(180deg,#243247_0%,#1E293B_100%)] p-6 transition-colors hover:border-[#10B981]/35 hover:bg-[linear-gradient(180deg,#2A394F_0%,#1E293B_100%)]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-[#CBD5E1]">{item.label}</p>
                      <p className="mt-3 font-mono text-3xl font-bold text-white sm:text-4xl">
                        {item.value}
                      </p>
                    </div>
                    <div
                      className={`flex h-11 w-11 items-center justify-center rounded-2xl ${
                        item.label === "Users"
                          ? "bg-[#10B981]/16 text-[#A7F3D0]"
                          : item.label === "Pending Access"
                            ? "bg-[#22C55E]/16 text-[#BBF7D0]"
                            : item.label === "Courses"
                              ? "bg-[#F59E0B]/16 text-[#FCD34D]"
                              : "bg-[#34D399]/16 text-[#A7F3D0]"
                      }`}
                    >
                      <item.icon className="h-5 w-5" />
                    </div>
                  </div>
                  <p
                    className={`mt-4 text-xs font-medium uppercase tracking-[0.18em] ${
                      item.label === "Courses" ? "text-[#FCD34D]" : "text-[#94A3B8]"
                    }`}
                  >
                    {item.hint}
                  </p>
                </Link>
              ))}
            </div>

            <div className="rounded-3xl border border-[#334155] bg-[#1E293B] p-5 sm:p-6">
                <h3 className="text-lg font-semibold text-white">Workspace Priorities</h3>
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl border border-[#10B981]/30 bg-[linear-gradient(180deg,#173A3C_0%,#1E293B_100%)] p-4">
                    <p className="text-sm font-semibold text-white">User Operations</p>
                    <p className="mt-2 text-sm leading-6 text-[#C0CCE0]">
                      Invite people, manage departments, and assign company roles from a dedicated user workspace.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#F59E0B]/25 bg-[linear-gradient(180deg,#3B3120_0%,#1E293B_100%)] p-4">
                    <p className="text-sm font-semibold text-white">Learning Operations</p>
                    <p className="mt-2 text-sm leading-6 text-[#C0CCE0]">
                      Create courses, publish content, and control what your company learners can access.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#22C55E]/25 bg-[linear-gradient(180deg,#183B2A_0%,#1E293B_100%)] p-4">
                    <p className="text-sm font-semibold text-white">Team Coordination</p>
                    <p className="mt-2 text-sm leading-6 text-[#C0CCE0]">
                      Build teams and assign learning paths without dropping into the learner UI first.
                    </p>
                  </div>
                  <div className="rounded-2xl border border-[#34D399]/25 bg-[linear-gradient(180deg,#173A3C_0%,#1E293B_100%)] p-4">
                    <p className="text-sm font-semibold text-white">Identity Control</p>
                    <p className="mt-2 text-sm leading-6 text-[#C0CCE0]">
                      Track directory sync and company access administration in one place.
                    </p>
                  </div>
                </div>
              </div>
          </>
        )}
      </div>
    </AdminShell>
  );
}

export default function DashboardPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [profile, setProfile] = useState<GamificationProfileResponse | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentResponse[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);

  useEffect(() => {
    if (!isLoading && user?.role === "Admin") {
      router.replace(routes.adminUsers);
    }
    if (!isLoading && user?.role === "TeamManager") {
      router.replace(routes.teamManagerTeams);
    }
    if (!isLoading && user?.role === "LearningExpert") {
      router.replace(routes.adminAiCourseStudio);
    }
  }, [isLoading, router, user?.role]);

  useEffect(() => {
    async function loadDashboard() {
      if (!user) return;
      setDashboardLoading(true);
      try {
        const [profileData, enrollmentData, goalData] = await Promise.all([
          getGamificationProfile(),
          getEnrollments(user.id),
          getGoals().catch(() => []),
        ]);
        setProfile(profileData);
        setEnrollments(enrollmentData);
        setGoals(goalData);
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
      } finally {
        setDashboardLoading(false);
      }
    }

    if (user) {
      loadDashboard();
    }
  }, [user]);

  const stats = useMemo(() => {
    const completedCourses = enrollments.filter((item) => item.status === "completed").length;
    const inProgressCourses = enrollments.filter((item) => item.status === "in_progress").length;
    const notStartedCourses = enrollments.filter((item) => item.status === "not_started").length;
    const activeGoals = goals.filter((goal) => goal.status !== "completed");
    const completedGoals = goals.filter((goal) => goal.status === "completed").length;
    const latestEnrollment = [...enrollments]
      .sort((a, b) => new Date(b.enrolled_at).getTime() - new Date(a.enrolled_at).getTime())[0];
    const latestCompletion = [...enrollments]
      .filter((item) => item.completed_at)
      .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())[0];

    return {
      completedCourses,
      inProgressCourses,
      notStartedCourses,
      totalEnrollments: enrollments.length,
      activeGoals: activeGoals.length,
      completedGoals,
      nextGoalDeadline: activeGoals
        .filter((goal) => goal.target_date)
        .sort((a, b) => new Date(a.target_date!).getTime() - new Date(b.target_date!).getTime())[0]
        ?.target_date,
      latestEnrollment: latestEnrollment?.enrolled_at,
      latestCompletion: latestCompletion?.completed_at,
    };
  }, [enrollments, goals]);

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center text-text-secondary">
          Loading your learning overview...
        </div>
      </AppShell>
    );
  }

  if (!isAuthenticated || !user) {
    return null;
  }

  if (user.role === "TeamManager") {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center text-text-secondary">
          Opening your teams workspace...
        </div>
      </AppShell>
    );
  }

  if (user.role === "LearningExpert") {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center text-text-secondary">
          Opening your course workspace...
        </div>
      </AppShell>
    );
  }

  if (user.role === "Admin") {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center text-text-secondary">
          Opening your user workspace...
        </div>
      </AppShell>
    );
  }

  if (["Admin", "Manager"].includes(user.role)) {
    return <AdminDashboardPage />;
  }

  const firstName = user.first_name || user.email.split("@")[0];
  const totalXp = profile?.xp.total || 0;
  const currentStreak = profile?.streak.current_streak || 0;
  const teamRank = profile?.rank?.rank ? `#${profile.rank.rank}` : "Unranked";
  const level = profile?.level.level || 1;
  const progressToNextLevel = profile?.level.progress || 0;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="rounded-2xl bg-gradient-to-r from-primary/20 to-secondary/20 p-8">
          <h1 className="text-2xl font-bold text-text-primary">{getGreeting()}</h1>
          <p className="mt-1 text-text-secondary">
            Welcome back, {firstName}. Keep building your momentum.
          </p>
        </div>

        {dashboardLoading ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-text-secondary">
            Loading your learning overview...
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[
                { label: "Courses Completed", value: stats.completedCourses, hint: `${stats.inProgressCourses} in progress`, icon: BookOpen },
                { label: "Current Streak", value: `${currentStreak} day${currentStreak === 1 ? "" : "s"}`, hint: "Keep the habit alive", icon: Flame },
                { label: "Total XP", value: totalXp.toLocaleString(), hint: `Level ${level}`, icon: Zap },
                { label: "Active Goals", value: stats.activeGoals, hint: `${stats.completedGoals} completed`, icon: Target },
              ].map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex items-center gap-2 text-text-secondary">
                    <stat.icon className="h-4 w-4" />
                    <p className="text-sm">{stat.label}</p>
                  </div>
                  <p className="mt-2 font-mono text-2xl font-bold text-text-primary">{stat.value}</p>
                  <p className="mt-1 text-xs text-secondary">{stat.hint}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="rounded-2xl border border-border bg-card p-6 lg:col-span-2">
                <h2 className="text-lg font-semibold text-text-primary">Learning Progress</h2>
                <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
                  <div>
                    <p className="text-sm text-text-secondary">Total Enrollments</p>
                    <p className="mt-1 text-2xl font-bold text-text-primary">{stats.totalEnrollments}</p>
                  </div>
                  <div>
                    <p className="text-sm text-text-secondary">Completed</p>
                    <p className="mt-1 text-2xl font-bold text-text-primary">{stats.completedCourses}</p>
                  </div>
                  <div>
                    <p className="text-sm text-text-secondary">In Progress</p>
                    <p className="mt-1 text-2xl font-bold text-text-primary">{stats.inProgressCourses}</p>
                  </div>
                  <div>
                    <p className="text-sm text-text-secondary">Not Started</p>
                    <p className="mt-1 text-2xl font-bold text-text-primary">{stats.notStartedCourses}</p>
                  </div>
                </div>

                <div className="mt-6">
                  <div className="mb-2 flex items-center justify-between text-sm">
                    <span className="text-text-secondary">Level Progress</span>
                    <span className="font-medium text-text-primary">{progressToNextLevel.toFixed(1)}%</span>
                  </div>
                  <div className="h-3 rounded-full bg-background">
                    <div
                      className="h-3 rounded-full bg-primary transition-all duration-500"
                      style={{ width: `${Math.min(progressToNextLevel, 100)}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-text-primary">
                  <Trophy className="h-5 w-5 text-gold" />
                  Achievements
                </h2>
                <div className="mt-5 space-y-4">
                  <div>
                    <p className="text-sm text-text-secondary">Badges Earned</p>
                    <p className="mt-1 text-2xl font-bold text-text-primary">
                      {profile?.badges.user.length || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-text-secondary">Leaderboard Rank</p>
                    <p className="mt-1 text-2xl font-bold text-text-primary">{teamRank}</p>
                  </div>
                  <div>
                    <p className="text-sm text-text-secondary">Longest Streak</p>
                    <p className="mt-1 text-2xl font-bold text-text-primary">
                      {profile?.streak.longest_streak || 0} days
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-6">
                <h2 className="text-lg font-semibold text-text-primary">Goals Snapshot</h2>
                <div className="mt-5 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-text-secondary">Active Goals</p>
                    <p className="mt-1 text-2xl font-bold text-text-primary">{stats.activeGoals}</p>
                  </div>
                  <div>
                    <p className="text-sm text-text-secondary">Completed Goals</p>
                    <p className="mt-1 text-2xl font-bold text-text-primary">{stats.completedGoals}</p>
                  </div>
                </div>
                <div className="mt-6">
                  <p className="text-sm text-text-secondary">Next Goal Deadline</p>
                  <p className="mt-1 text-base font-medium text-text-primary">
                    {formatDate(stats.nextGoalDeadline)}
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6">
                <h2 className="text-lg font-semibold text-text-primary">Recent Momentum</h2>
                <div className="mt-5 space-y-4">
                  <div>
                    <p className="text-sm text-text-secondary">Last Enrollment</p>
                    <p className="mt-1 text-base font-medium text-text-primary">
                      {formatDate(stats.latestEnrollment)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-text-secondary">Last Completion</p>
                    <p className="mt-1 text-base font-medium text-text-primary">
                      {formatDate(stats.latestCompletion)}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-text-secondary">Today</p>
                    <p className="mt-1 text-base font-medium text-text-primary">
                      {currentStreak > 0 ? "You are on track today." : "Start a lesson to build momentum."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
