"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/app/components/layout/AdminShell";
import { AppShell } from "@/app/components/layout/AppShell";
import { useAuth } from "@/app/context/AuthContext";
import {
  api,
  getCourseById,
  getCourses,
  getEnrollments,
  getGamificationProfile,
  getGoals,
  getTeamGoals,
  getTeams,
  getUserProgress,
  type Course,
  type CourseDetailResponse,
  type EnrollmentResponse,
  type GamificationProfileResponse,
  type Goal,
  type TeamGoal,
  type UserProgressResponse,
} from "@/app/lib/api";
import {
  buildGoalMetricsSummary,
  buildGoalReminder,
  buildGoalInsight,
} from "@/app/lib/goal-utils";
import { routes } from "@/app/lib/routes";
import {
  ArrowRight,
  BellRing,
  BookOpen,
  ChevronRight,
  CheckCircle2,
  Flame,
  Lightbulb,
  Loader2,
  PlayCircle,
  Target,
  Trophy,
  Users,
  Workflow,
} from "lucide-react";

type DashboardRecommendation = {
  type?: string;
  priority?: string;
  title?: string;
  courseId?: string;
  lessonId?: string | null;
  courseTitle?: string;
  reason?: string;
  learnerMessage?: string;
  actionLabel?: string;
};

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

const WORKSPACE_VIEW_COOKIE = "sf_workspace_view";

function isLearningWorkspaceActive() {
  if (typeof document === "undefined") {
    return false;
  }

  return document.cookie
    .split("; ")
    .some((entry) => entry === `${WORKSPACE_VIEW_COOKIE}=learning`);
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
  const [teamGoals, setTeamGoals] = useState<TeamGoal[]>([]);
  const [progress, setProgress] = useState<UserProgressResponse[]>([]);
  const [courseDetails, setCourseDetails] = useState<CourseDetailResponse[]>([]);
  const [publishedCourses, setPublishedCourses] = useState<Course[]>([]);
  const [recommendations, setRecommendations] = useState<DashboardRecommendation[]>([]);
  const [dashboardError, setDashboardError] = useState<string | null>(null);
  const learningWorkspaceActive = isLearningWorkspaceActive();

  useEffect(() => {
    if (!isLoading && user?.role === "Admin" && !learningWorkspaceActive) {
      router.replace(routes.adminUsers);
    }
    if (!isLoading && user?.role === "TeamManager" && !learningWorkspaceActive) {
      router.replace(routes.teamManagerTeams);
    }
    if (!isLoading && user?.role === "LearningExpert" && !learningWorkspaceActive) {
      router.replace(routes.adminAiCourseStudio);
    }
  }, [isLoading, learningWorkspaceActive, router, user?.role]);

  useEffect(() => {
    async function loadDashboard() {
      if (!user) return;
      setDashboardLoading(true);
      setDashboardError(null);
      try {
        const [profileData, enrollmentData, goalData, teamGoalData, progressData, publishedCourseData, recommendationData] = await Promise.all([
          getGamificationProfile().catch(() => null),
          getEnrollments(user.id).catch(() => []),
          getGoals().catch(() => []),
          getTeamGoals().catch(() => []),
          getUserProgress(user.id).catch(() => []),
          getCourses({ page: 1, page_size: 8, is_published: true }).catch(() => ({ items: [] })),
          fetch("/api/recommendation-agent/recommendations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              tenantId: user.tenant_id || null,
              userId: user.id,
            }),
          })
            .then((response) => response.json())
            .catch(() => null),
        ]);
        const enrolledCourseIds = Array.from(
          new Set(enrollmentData.map((item) => item.course_id).filter(Boolean))
        );
        const details = await Promise.all(
          enrolledCourseIds.slice(0, 8).map(async (courseId) => {
            try {
              return await getCourseById(courseId);
            } catch {
              return null;
            }
          })
        );
        setProfile(profileData);
        setEnrollments(enrollmentData);
        setGoals(goalData);
        setTeamGoals(teamGoalData);
        setProgress(progressData);
        setPublishedCourses(publishedCourseData.items || []);
        setCourseDetails(
          details.filter((course): course is CourseDetailResponse => Boolean(course))
        );
        setRecommendations(
          Array.isArray(recommendationData?.recommendations)
            ? recommendationData.recommendations.slice(0, 3)
            : []
        );
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
        setDashboardError("Some dashboard data could not be loaded right now.");
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
    const inProgressCourses = enrollments.filter((item) =>
      ["in_progress", "active", "enrolled"].includes(item.status)
    ).length;
    const notStartedCourses = enrollments.filter((item) =>
      ["not_started", "assigned"].includes(item.status)
    ).length;
    const activeGoals = goals.filter((goal) => goal.status !== "completed");
    const completedGoals = goals.filter((goal) => goal.status === "completed").length;
    const activeTeamGoals = teamGoals.filter((goal) => goal.status !== "completed");
    const completedTeamGoals = teamGoals.filter((goal) => goal.status === "completed").length;
    const courseMap = new Map(courseDetails.map((course) => [course.id, course]));
    const lessonCourseMap = new Map<string, string>();
    courseDetails.forEach((course) => {
      course.modules.forEach((module) => {
        module.lessons.forEach((lesson) => {
          lessonCourseMap.set(lesson.id, course.id);
        });
      });
    });
    const progressByCourse = progress.reduce((acc, item) => {
      const courseId = lessonCourseMap.get(item.lesson_id);
      if (!courseId) {
        return acc;
      }
      const current = acc.get(courseId) || {
        completedLessons: 0,
        timeSpent: 0,
        lastActivityAt: "",
      };
      if (item.status === "completed") {
        current.completedLessons += 1;
      }
      current.timeSpent += item.time_spent || 0;
      if (
        item.last_activity_at &&
        (!current.lastActivityAt ||
          new Date(item.last_activity_at).getTime() > new Date(current.lastActivityAt).getTime())
      ) {
        current.lastActivityAt = item.last_activity_at;
      }
      acc.set(courseId, current);
      return acc;
    }, new Map<string, { completedLessons: number; timeSpent: number; lastActivityAt: string }>());
    const latestEnrollment = [...enrollments]
      .filter((item) => item.status !== "completed")
      .sort((a, b) => {
        const activityA = progressByCourse.get(a.course_id)?.lastActivityAt || a.enrolled_at;
        const activityB = progressByCourse.get(b.course_id)?.lastActivityAt || b.enrolled_at;
        return new Date(activityB).getTime() - new Date(activityA).getTime();
      })[0] || [...enrollments]
      .sort((a, b) => new Date(b.enrolled_at).getTime() - new Date(a.enrolled_at).getTime())[0];
    const latestCompletion = [...enrollments]
      .filter((item) => item.completed_at)
      .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime())[0];
    const continueCourse = latestEnrollment ? courseMap.get(latestEnrollment.course_id) || null : null;
    const continueCourseProgress = continueCourse
      ? progressByCourse.get(continueCourse.id) || { completedLessons: 0, timeSpent: 0, lastActivityAt: "" }
      : null;
    const continueCourseLessonCount = continueCourse
      ? continueCourse.modules.reduce((total, module) => total + module.lessons.length, 0)
      : 0;
    const completedLessons = progress.filter((item) => item.status === "completed").length;
    const studyMinutes = Math.max(
      0,
      Math.round(progress.reduce((total, item) => total + (item.time_spent || 0), 0) / 60)
    );
    const goalMetrics = buildGoalMetricsSummary(progress, enrollments, profile);
    const goalReminder = buildGoalReminder(goals, goalMetrics);
    const focusGoal = activeGoals
      .map((goal) => ({ goal, insight: buildGoalInsight(goal, goalMetrics) }))
      .sort((left, right) => left.insight.remaining - right.insight.remaining)[0] || null;
    const focusTeamGoal = activeTeamGoals
      .map((goal) => ({ goal, insight: buildGoalInsight(goal, goalMetrics) }))
      .sort((left, right) => left.insight.remaining - right.insight.remaining)[0] || null;
    const enrolledCourseIds = new Set(enrollments.map((item) => item.course_id));
    const fallbackRecommendations = publishedCourses
      .filter((course) => !enrolledCourseIds.has(course.id))
      .slice(0, 3);

    return {
      completedCourses,
      inProgressCourses,
      notStartedCourses,
      totalEnrollments: enrollments.length,
      activeGoals: activeGoals.length + activeTeamGoals.length,
      personalActiveGoals: activeGoals.length,
      teamActiveGoals: activeTeamGoals.length,
      completedGoals,
      completedTeamGoals,
      completedLessons,
      studyMinutes,
      continueEnrollment: latestEnrollment || null,
      continueCourse,
      continueCourseProgress,
      continueCourseLessonCount,
      continuePercent:
        continueCourse && continueCourseLessonCount > 0
          ? Math.round(((continueCourseProgress?.completedLessons || 0) / continueCourseLessonCount) * 100)
          : 0,
      goalReminder,
      focusGoal,
      focusTeamGoal,
      fallbackRecommendations,
      nextGoalDeadline: activeGoals
        .filter((goal) => goal.target_date)
        .sort((a, b) => new Date(a.target_date!).getTime() - new Date(b.target_date!).getTime())[0]
        ?.target_date,
      latestEnrollment: latestEnrollment?.enrolled_at,
      latestCompletion: latestCompletion?.completed_at,
    };
  }, [courseDetails, enrollments, goals, profile, progress, publishedCourses, teamGoals]);

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

  if (user.role === "TeamManager" && !learningWorkspaceActive) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center text-text-secondary">
          Opening your teams workspace...
        </div>
      </AppShell>
    );
  }

  if (user.role === "LearningExpert" && !learningWorkspaceActive) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center text-text-secondary">
          Opening your course workspace...
        </div>
      </AppShell>
    );
  }

  if (user.role === "Admin" && !learningWorkspaceActive) {
    return (
      <AppShell>
        <div className="flex h-64 items-center justify-center text-text-secondary">
          Opening your user workspace...
        </div>
      </AppShell>
    );
  }

  if (["Admin", "Manager"].includes(user.role) && !learningWorkspaceActive) {
    return <AdminDashboardPage />;
  }

  const rawFirstName = (user.first_name || "").trim();
  const firstName =
    rawFirstName && !["platform", "user", "learner"].includes(rawFirstName.toLowerCase())
      ? rawFirstName
      : "";
  const currentStreak = profile?.streak.current_streak || 0;
  const teamRank = profile?.rank?.rank ? `#${profile.rank.rank}` : "Unranked";
  const level = profile?.level.level || 1;
  const progressToNextLevel = profile?.level.progress || 0;
  const recommendationCards: DashboardRecommendation[] = recommendations.length > 0
    ? recommendations
    : stats.fallbackRecommendations.map((course) => ({
        type: "course_recommendation",
        priority: "medium",
        title: course.title,
        courseId: course.id,
        lessonId: null,
        courseTitle: course.title,
        reason: course.description || "A published course available for your next learning step.",
        learnerMessage: course.description || "A published course available for your next learning step.",
        actionLabel: "Open course",
      }));

  return (
    <AppShell>
      <div className="space-y-6">
        <section className="overflow-hidden rounded-3xl border border-emerald-300/55 bg-[radial-gradient(circle_at_12%_18%,_rgba(52,211,153,0.46),_transparent_30%),radial-gradient(circle_at_76%_14%,_rgba(14,165,233,0.42),_transparent_28%),radial-gradient(circle_at_88%_82%,_rgba(242,165,27,0.24),_transparent_24%),linear-gradient(135deg,_#063B35_0%,_#075E63_42%,_#0B315F_72%,_#101827_100%)] p-5 text-white shadow-[0_30px_80px_rgba(6,78,59,0.36)] sm:p-6 lg:p-8">
          <div className="max-w-3xl">
              <h1 className="text-3xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-4xl">
                Learning Home
              </h1>
              <p className="mt-4 text-sm leading-7 text-emerald-50 sm:text-base">
                {firstName ? `${getGreeting()}, ${firstName}. ` : `${getGreeting()}. `}
                Welcome back. Continue your progress and discover the next recommended activities to develop your skills.
              </p>
          </div>
        </section>

        {dashboardLoading ? (
          <div className="flex min-h-[320px] items-center justify-center rounded-[28px] border border-white/70 bg-white/80 shadow-sm">
            <div className="inline-flex items-center gap-3 text-sm font-medium text-text-secondary">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
              Loading your real learning home...
            </div>
          </div>
        ) : (
          <>
            {dashboardError && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                {dashboardError}
              </div>
            )}

            <section className="grid gap-5 xl:grid-cols-[1.25fr_0.75fr]">
              <div className="rounded-[28px] border border-teal-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(236,253,245,0.92),rgba(224,242,254,0.82))] p-6 shadow-[0_20px_48px_rgba(14,163,122,0.1)] backdrop-blur">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0ea37a,#22c7b4)] text-white shadow-[0_10px_24px_rgba(14,163,122,0.22)]">
                        <PlayCircle className="h-6 w-6" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-700">
                          Continue learning
                        </p>
                        <h2 className="mt-1 text-xl font-semibold text-slate-950">
                          {stats.continueCourse?.title || "No active course yet"}
                        </h2>
                      </div>
                    </div>
                    <p className="mt-4 max-w-2xl text-sm leading-6 text-slate-600">
                      {stats.continueCourse
                        ? stats.continueCourse.description || "Continue the course you most recently enrolled in or opened."
                        : "Enroll in a course and this panel will become your direct path back into learning."}
                    </p>
                    {stats.continueCourse && (
                      <div className="mt-5">
                        <div className="mb-2 flex items-center justify-between text-xs font-medium text-slate-500">
                          <span>
                            {stats.continueCourseProgress?.completedLessons || 0}/{stats.continueCourseLessonCount} lessons completed
                          </span>
                          <span>{stats.continuePercent}%</span>
                        </div>
                        <div className="h-4 rounded-full border border-slate-300/80 bg-slate-200 shadow-inner">
                          <div
                            className="h-full rounded-full bg-[linear-gradient(90deg,#047857,#0ea37a,#0ea5e9)] shadow-[0_0_0_1px_rgba(255,255,255,0.45)_inset] transition-all"
                            style={{ width: `${Math.min(stats.continuePercent, 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <Link
                    href={
                      stats.continueCourse
                        ? routes.courseDetail(stats.continueCourse.id)
                        : routes.courses
                    }
                    className="inline-flex shrink-0 items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0ea37a,#22c7b4)] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_28px_rgba(14,163,122,0.22)] transition-transform hover:-translate-y-0.5"
                  >
                    {stats.continueCourse ? "Continue" : "Browse courses"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>

              <div className="rounded-[28px] border border-amber-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(255,251,235,0.94),rgba(254,243,199,0.78))] p-6 shadow-[0_20px_48px_rgba(245,158,11,0.1)] backdrop-blur">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#f59e0b,#f97316)] text-white shadow-[0_10px_24px_rgba(245,158,11,0.22)]">
                    <BellRing className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">Today&apos;s reminder</h2>
                    <p className="text-sm text-slate-600">Based on your active goals.</p>
                  </div>
                </div>
                <div className="mt-5 rounded-2xl border border-amber-200/70 bg-white/82 px-4 py-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-950">
                    {stats.goalReminder?.title || stats.focusGoal?.goal.title || "No urgent goal"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    {stats.goalReminder?.message ||
                      stats.focusGoal?.insight.nextAction ||
                      "You do not have an active goal that needs attention right now."}
                  </p>
                  <Link
                    href={stats.goalReminder?.ctaHref || routes.goals}
                    className="mt-4 inline-flex items-center gap-2 text-sm font-semibold text-primary"
                  >
                    {stats.goalReminder?.ctaLabel || "Open goals"}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Enrolled Courses", value: stats.totalEnrollments, hint: `${stats.inProgressCourses} active`, icon: BookOpen, card: "border-sky-200 bg-[linear-gradient(135deg,#ffffff,#eff6ff)]", iconTone: "bg-sky-100 text-sky-700", hintTone: "text-sky-700" },
                { label: "Completed Lessons", value: stats.completedLessons, hint: `${stats.studyMinutes} study minutes`, icon: CheckCircle2, card: "border-emerald-200 bg-[linear-gradient(135deg,#ffffff,#ecfdf5)]", iconTone: "bg-emerald-100 text-emerald-700", hintTone: "text-emerald-700" },
                { label: "Current Streak", value: `${currentStreak}`, hint: `${profile?.streak.longest_streak || 0} longest`, icon: Flame, card: "border-amber-200 bg-[linear-gradient(135deg,#ffffff,#fffbeb)]", iconTone: "bg-amber-100 text-amber-700", hintTone: "text-amber-700" },
                { label: "Active Goals", value: stats.activeGoals, hint: `${stats.completedGoals + stats.completedTeamGoals} completed`, icon: Target, card: "border-teal-200 bg-[linear-gradient(135deg,#ffffff,#f0fdfa)]", iconTone: "bg-teal-100 text-teal-700", hintTone: "text-teal-700" },
              ].map((stat) => (
                <div key={stat.label} className={`rounded-[24px] border p-5 shadow-[0_14px_34px_rgba(15,23,42,0.05)] ${stat.card}`}>
                  <div className="flex items-center gap-3 text-text-secondary">
                    <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${stat.iconTone}`}>
                      <stat.icon className="h-4 w-4" />
                    </div>
                    <p className="text-sm font-medium">{stat.label}</p>
                  </div>
                  <p className="mt-2 font-mono text-2xl font-bold text-text-primary">{stat.value}</p>
                  <p className={`mt-1 text-xs font-semibold ${stat.hintTone}`}>{stat.hint}</p>
                </div>
              ))}
            </div>

            <section className="grid gap-5 lg:grid-cols-2">
              <div className="rounded-[28px] border border-emerald-200 bg-[linear-gradient(135deg,#ffffff_0%,#ecfdf5_100%)] p-6 shadow-[0_18px_42px_rgba(15,118,110,0.08)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                      <Target className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">Personal Goals</h2>
                      <p className="mt-1 text-sm text-emerald-800">Targets assigned directly to you.</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-sm font-semibold text-emerald-700">
                    {stats.personalActiveGoals} active
                  </span>
                </div>
                <div className="mt-5 rounded-2xl border border-emerald-200 bg-white px-4 py-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-950">
                    {stats.focusGoal?.goal.title || "No active personal goal"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {stats.focusGoal?.insight.nextAction ||
                      "When an admin or manager assigns you a personal goal, it will appear here."}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-xs font-medium text-slate-600">
                    <span>{stats.completedGoals} completed</span>
                    <Link href={routes.goals} className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                      Open goals
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-sky-200 bg-[linear-gradient(135deg,#ffffff_0%,#eff6ff_100%)] p-6 shadow-[0_18px_42px_rgba(14,116,144,0.08)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                      <Users className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">Team Goals</h2>
                      <p className="mt-1 text-sm text-sky-800">Shared targets for your team.</p>
                    </div>
                  </div>
                  <span className="rounded-full border border-sky-200 bg-white px-3 py-1 text-sm font-semibold text-sky-700">
                    {stats.teamActiveGoals} active
                  </span>
                </div>
                <div className="mt-5 rounded-2xl border border-sky-200 bg-white px-4 py-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-950">
                    {stats.focusTeamGoal?.goal.title || "No active team goal"}
                  </p>
                  <p className="mt-2 text-sm leading-6 text-slate-700">
                    {stats.focusTeamGoal
                      ? `${stats.focusTeamGoal.goal.team_name}: ${stats.focusTeamGoal.insight.nextAction}`
                      : "When your team receives a shared goal, it will appear here separately from personal goals."}
                  </p>
                  <div className="mt-4 flex items-center justify-between text-xs font-medium text-slate-600">
                    <span>{stats.completedTeamGoals} completed</span>
                    <Link href={routes.goals} className="inline-flex items-center gap-1 font-semibold text-sky-700">
                      Open goals
                      <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              </div>
            </section>

            <section className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
              <div className="rounded-[28px] border border-emerald-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(236,253,245,0.9),rgba(240,249,255,0.76))] p-6 shadow-[0_18px_42px_rgba(15,23,42,0.06)]">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                  <Trophy className="h-5 w-5 text-gold" />
                  Momentum
                </h2>
                <div className="mt-5 space-y-5">
                  <div>
                    <div className="mb-2 flex items-center justify-between text-sm">
                      <span className="text-slate-600">Level {level} progress</span>
                      <span className="font-medium text-slate-950">{progressToNextLevel.toFixed(1)}%</span>
                    </div>
                    <div className="h-3 rounded-full bg-white shadow-inner">
                      <div
                        className="h-3 rounded-full bg-[linear-gradient(90deg,#0ea37a,#22c7b4,#f2a51b)] transition-all duration-500"
                        style={{ width: `${Math.min(progressToNextLevel, 100)}%` }}
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-teal-100 bg-white/82 p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-teal-700">Badges</p>
                      <p className="mt-1 text-2xl font-semibold text-slate-950">
                        {profile?.badges.user.length || 0}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-sky-100 bg-white/82 p-4 shadow-sm">
                      <p className="text-xs font-semibold uppercase tracking-wide text-sky-700">Rank</p>
                      <p className="mt-1 text-2xl font-semibold text-slate-950">{teamRank}</p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-amber-100 bg-amber-50/80 px-4 py-4">
                    <p className="text-sm font-semibold text-amber-900">
                      {currentStreak > 0 ? "You are active today." : "Start a lesson to build today's streak."}
                    </p>
                    <p className="mt-1 text-sm text-amber-800">
                      Longest streak: {profile?.streak.longest_streak || 0} days.
                    </p>
                  </div>
                </div>
              </div>

              <div className="rounded-[28px] border border-sky-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.95),rgba(240,249,255,0.9),rgba(236,253,245,0.72))] p-6 shadow-[0_18px_42px_rgba(15,23,42,0.06)]">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
                      <Lightbulb className="h-5 w-5 text-primary" />
                      Recommended next
                    </h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Personalized recommendations when ready, otherwise published courses you have not enrolled in yet.
                    </p>
                  </div>
                  <Link href={routes.recommendations} className="text-sm font-semibold text-primary">
                    See all
                  </Link>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-3">
                  {recommendationCards.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500 md:col-span-3">
                      No recommendation is available yet. Browse courses to start building learner signals.
                    </div>
                  ) : (
                    recommendationCards.map((item, index) => {
                      const href =
                        item.type === "lesson_recommendation" && item.courseId && item.lessonId
                          ? routes.learn(item.courseId, item.lessonId)
                          : item.courseId
                            ? routes.courseDetail(item.courseId)
                            : routes.recommendations;
                      return (
                        <Link
                          key={`${item.title || "recommendation"}-${index}`}
                          href={href}
                          className="rounded-2xl border border-sky-100 bg-white/82 p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:bg-primary/5"
                        >
                          <span className="rounded-full bg-[linear-gradient(135deg,rgba(14,163,122,0.14),rgba(14,165,233,0.14))] px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                            {item.priority || "suggested"}
                          </span>
                          <h3 className="mt-3 line-clamp-2 text-sm font-semibold leading-5 text-slate-950">
                            {item.title || item.courseTitle || "Recommendation"}
                          </h3>
                          <p className="mt-2 line-clamp-3 text-xs leading-5 text-slate-600">
                            {item.learnerMessage || item.reason || "Open this suggestion to continue learning."}
                          </p>
                        </Link>
                      );
                    })
                  )}
                </div>
              </div>
            </section>

          </>
        )}
      </div>
    </AppShell>
  );
}
