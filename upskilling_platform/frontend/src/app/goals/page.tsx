"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/app/components/layout/AppShell";
import { Button } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Input";
import { useAuth } from "@/app/context/AuthContext";
import { routes } from "@/app/lib/routes";
import {
  createGoal,
  createTeamGoal,
  getTeamAvailableUsers,
  getEnrollments,
  getGamificationProfile,
  getGoals,
  getTeamGoals,
  getTeams,
  getUserProgress,
  type EnrollmentResponse,
  type GamificationProfileResponse,
  type Goal,
  type TeamAvailableUser,
  type Team,
  type TeamGoal,
  type UserProgressResponse,
} from "@/app/lib/api";
import {
  buildGoalMetricsSummary,
  getGoalHealth,
  getGoalNextAction,
  getGoalTypeLabel,
  getGoalTypeUnit,
  GOAL_TYPE_OPTIONS,
  parseGoalDescription,
  type GoalType,
  type GoalMetricsSummary,
} from "@/app/lib/goal-utils";
import {
  AlertTriangle,
  Flag,
  ListChecks,
  Loader2,
  PlusCircle,
  Users,
} from "lucide-react";

const emptyGoalForm = {
  title: "",
  description: "",
  target_date: "",
  target_count: 1,
  xp_reward: 0,
  goal_type: "lessons_completed" as GoalType,
};

type GoalFormErrors = {
  user_id?: string;
  team_id?: string;
  goal_type?: string;
  title?: string;
  target_count?: string;
  xp_reward?: string;
};

type GoalsContentProps = {
  workspace?: "learner" | "team-manager" | "admin";
  view?: "personal" | "team" | "details" | "created";
};

export function GoalsContent({ workspace = "learner", view = "details" }: GoalsContentProps = {}) {
  const { user } = useAuth();
  const pathname = usePathname();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [teamGoals, setTeamGoals] = useState<TeamGoal[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [availableUsers, setAvailableUsers] = useState<TeamAvailableUser[]>([]);
  const [personalForm, setPersonalForm] = useState(emptyGoalForm);
  const [teamForm, setTeamForm] = useState({
    title: "",
    description: "",
    target_date: "",
    target_count: 1,
    xp_reward: 0,
    team_id: "",
    goal_type: "lessons_completed" as GoalType,
  });
  const [metrics, setMetrics] = useState<GoalMetricsSummary>({
    lessonsCompleted: 0,
    coursesCompleted: 0,
    studyMinutes: 0,
    totalXp: 0,
    currentStreak: 0,
  });
  const [selectedUserId, setSelectedUserId] = useState<string>("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [personalErrors, setPersonalErrors] = useState<GoalFormErrors>({});
  const [teamErrors, setTeamErrors] = useState<GoalFormErrors>({});

  const canManageGoals =
    !!user &&
    ["TeamManager", "Manager", "Admin", "SuperAdmin"].includes(user.role);
  const canViewTeamGoals = !!user;
  const isTeamManagerWorkspace = workspace === "team-manager";
  const isAdminWorkspace = workspace === "admin";
  const isGoalManagementWorkspace = isTeamManagerWorkspace || isAdminWorkspace;
  const managementRoutes = isAdminWorkspace
    ? {
        personal: routes.adminGoalsPersonal,
        team: routes.adminGoalsTeam,
        details: routes.adminGoalsDetails,
        created: routes.adminGoalsCreated,
      }
    : {
        personal: routes.teamManagerGoalsPersonal,
        team: routes.teamManagerGoalsTeam,
        details: routes.teamManagerGoalsDetails,
        created: routes.teamManagerGoalsCreated,
      };
  const showPersonalGoalForm = isGoalManagementWorkspace && view === "personal";
  const showTeamGoalForm = isGoalManagementWorkspace && view === "team";
  const showDetails = !isGoalManagementWorkspace || view === "details";
  const showCreatedGoals = isGoalManagementWorkspace && view === "created";
  const showManagementGuide = isGoalManagementWorkspace && view !== "details";
  const managerFieldClass =
    "w-full rounded-xl border border-emerald-300 bg-white px-3 py-2 text-sm font-medium text-slate-950 shadow-sm outline-none transition focus:border-emerald-600 focus:ring-2 focus:ring-emerald-100";
  const defaultFieldClass =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary";
  const inputFieldClass = isGoalManagementWorkspace
    ? "h-10 rounded-xl border-emerald-300 bg-white font-medium text-slate-950 shadow-sm placeholder:text-slate-400 focus-visible:border-emerald-600 focus-visible:ring-emerald-100"
    : undefined;
  const managerLabelClass = isGoalManagementWorkspace
    ? "mb-1 block text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800"
    : "mb-1 block text-xs font-medium text-text-secondary";

  const loadData = useCallback(async () => {
    try {
      setError(null);
      const [personalGoals, availableTeams, currentTeamGoals, availableUsers, enrollments, progress, profile] =
        await Promise.all([
          getGoals(user?.id),
          canManageGoals ? getTeams().catch(() => []) : Promise.resolve([]),
          canViewTeamGoals ? getTeamGoals().catch(() => []) : Promise.resolve([]),
          canManageGoals ? getTeamAvailableUsers().catch(() => []) : Promise.resolve([]),
          user ? getEnrollments(user.id).catch(() => []) : Promise.resolve([] as EnrollmentResponse[]),
          user ? getUserProgress(user.id).catch(() => []) : Promise.resolve([] as UserProgressResponse[]),
          getGamificationProfile().catch(() => null as GamificationProfileResponse | null),
        ]);

      const resolvedMetrics = buildGoalMetricsSummary(progress, enrollments, profile);
      let resolvedPersonalGoals = personalGoals;
      if (canManageGoals) {
        const learnerIds = Array.from(
          new Set([
            user?.id,
            ...availableUsers.map((person) => person.id),
          ].filter(Boolean) as string[]),
        );
        const managedGoals = await Promise.all(
          learnerIds.map((learnerId) => getGoals(learnerId).catch(() => [] as Goal[])),
        );
        const seenGoalIds = new Set<string>();
        resolvedPersonalGoals = managedGoals.flat().filter((goal) => {
          if (seenGoalIds.has(goal.id)) {
            return false;
          }
          seenGoalIds.add(goal.id);
          return true;
        });
      }

      setGoals(resolvedPersonalGoals);
      setTeams(availableTeams);
      setTeamGoals(currentTeamGoals);
      setAvailableUsers(availableUsers);
      setMetrics(resolvedMetrics);
    } catch (err) {
      console.error("Failed to load goals:", err);
      setError(err instanceof Error ? err.message : "Failed to load goals");
    } finally {
      setIsLoading(false);
    }
  }, [canManageGoals, canViewTeamGoals, user]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!teamForm.team_id && teams.length > 0) {
      setTeamForm((current) => ({ ...current, team_id: teams[0].id }));
    }
  }, [teams, teamForm.team_id]);

  useEffect(() => {
    if (user?.id && !selectedUserId) {
      setSelectedUserId(user.id);
    }
  }, [user?.id, selectedUserId]);

  const buildGoalView = (goal: Goal | TeamGoal) => {
    const { goalType, cleanDescription, isAutoTracked } = parseGoalDescription(goal.description);
    const currentProgress = Number(goal.progress || 0);
    const completionRate = Number(goal.completion_rate || 0);
    const remaining = Math.max(goal.target_count - currentProgress, 0);
    const health = getGoalHealth(goal, currentProgress);

    return {
      goalType,
      cleanDescription,
      isAutoTracked,
      currentProgress,
      completionRate,
      remaining,
      health,
      helperText: isAutoTracked
        ? "Tracked automatically from your real learning activity."
        : "Goal status is managed by the platform.",
      unitLabel: getGoalTypeUnit(goalType),
      nextAction: getGoalNextAction(goalType, remaining),
    };
  };

  const personalGoalViews = useMemo(
    () =>
      goals.map((goal) => ({
        goal,
        insight: buildGoalView(goal),
      })),
    [goals]
  );

  const personalStats = useMemo(() => {
    const completed = personalGoalViews.filter((entry) => entry.insight.health === "completed").length;
    const atRisk = personalGoalViews.filter((entry) => entry.insight.health === "at_risk").length;
    const overdue = personalGoalViews.filter((entry) => entry.insight.health === "overdue").length;
    return {
      total: personalGoalViews.length,
      completed,
      active: personalGoalViews.length - completed,
      atRisk,
      overdue,
    };
  }, [personalGoalViews]);

  const teamStats = useMemo(() => {
    const completed = teamGoals.filter((goal) => goal.status === "completed").length;
    return {
      total: teamGoals.length,
      completed,
    };
  }, [teamGoals]);

  async function handleCreateGoal() {
    const targetUserId = canManageGoals ? selectedUserId || user?.id || "" : user?.id || "";
    const nextErrors: GoalFormErrors = {};
    if (!user?.id) {
      nextErrors.user_id = "Your session is still loading. Please try again in a moment.";
    }
    if (canManageGoals && !targetUserId) {
      nextErrors.user_id = "Choose the learner who will receive this goal.";
    }
    if (!personalForm.goal_type) {
      nextErrors.goal_type = "Choose what the platform should track.";
    }
    if (!personalForm.title.trim()) {
      nextErrors.title = "Add a clear goal title.";
    }
    if (!Number.isFinite(Number(personalForm.target_count)) || Number(personalForm.target_count) < 1) {
      nextErrors.target_count = "Target value must be at least 1.";
    }
    if (!Number.isFinite(Number(personalForm.xp_reward)) || Number(personalForm.xp_reward) < 0) {
      nextErrors.xp_reward = "XP reward cannot be negative.";
    }
    setPersonalErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setError("Complete the highlighted fields before creating the goal.");
      setSuccess(null);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createGoal({
        user_id: targetUserId,
        goal_type: personalForm.goal_type,
        title: personalForm.title,
        description: personalForm.description || null,
        target_date: personalForm.target_date || null,
        target_count: personalForm.target_count,
        xp_reward: personalForm.xp_reward,
      });
      setGoals((current) => [created, ...current]);
      setPersonalForm(emptyGoalForm);
      setPersonalErrors({});
      setSuccess(
        canManageGoals
          ? "Goal assigned successfully. Progress will update automatically."
          : "Goal created successfully. Progress will update automatically.",
      );
      await loadData();
    } catch (err) {
      console.error("Failed to create goal:", err);
      setError(err instanceof Error ? err.message : "Failed to create goal");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateTeamGoal() {
    const nextErrors: GoalFormErrors = {};
    if (!teamForm.team_id) {
      nextErrors.team_id = "Select the team that should receive this goal.";
    }
    if (!teamForm.goal_type) {
      nextErrors.goal_type = "Choose what the platform should track for the team.";
    }
    if (!teamForm.title.trim()) {
      nextErrors.title = "Add a clear team goal title.";
    }
    if (!Number.isFinite(Number(teamForm.target_count)) || Number(teamForm.target_count) < 1) {
      nextErrors.target_count = "Target count must be at least 1.";
    }
    if (!Number.isFinite(Number(teamForm.xp_reward)) || Number(teamForm.xp_reward) < 0) {
      nextErrors.xp_reward = "XP reward cannot be negative.";
    }
    setTeamErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setError("Complete the highlighted team goal fields before creating the goal.");
      setSuccess(null);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createTeamGoal({
        ...teamForm,
        goal_type: teamForm.goal_type,
        description: teamForm.description || null,
        target_date: teamForm.target_date || null,
      });
      setTeamGoals((current) => [created, ...current]);
      setTeamForm({
        title: "",
        description: "",
        target_date: "",
        target_count: 1,
        xp_reward: 0,
        team_id: teamForm.team_id,
        goal_type: "lessons_completed",
      });
      setTeamErrors({});
      setSuccess("Team goal created successfully.");
    } catch (err) {
      console.error("Failed to create team goal:", err);
      setError(err instanceof Error ? err.message : "Failed to create team goal");
    } finally {
      setIsSubmitting(false);
    }
  }

  function GoalCard({
    goal,
    subtitle,
  }: {
    goal: Goal | TeamGoal;
    subtitle?: string;
  }) {
    const insight = buildGoalView(goal);
    const statusTone =
      isGoalManagementWorkspace
        ? insight.health === "completed"
          ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
          : insight.health === "overdue"
            ? "border border-red-200 bg-red-50 text-red-700"
            : insight.health === "at_risk"
              ? "border border-amber-200 bg-amber-50 text-amber-700"
              : "border border-sky-200 bg-sky-50 text-sky-700"
        : insight.health === "completed"
          ? "bg-green-500/10 text-green-600"
          : insight.health === "overdue"
            ? "bg-red-500/10 text-red-600"
            : insight.health === "at_risk"
              ? "bg-amber-500/10 text-amber-600"
              : "bg-primary/10 text-primary";

    return (
      <div
        className={
          isGoalManagementWorkspace
            ? "rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_16px_38px_rgba(15,23,42,0.08)]"
            : "rounded-3xl border border-border bg-card p-5 shadow-sm"
        }
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className={isGoalManagementWorkspace ? "text-lg font-semibold text-slate-950" : "text-lg font-semibold text-text-primary"}>
                {goal.title}
              </h3>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone}`}>
                {insight.health.replace("_", " ")}
              </span>
              <span
                className={
                  isGoalManagementWorkspace
                    ? "rounded-full border border-sky-200 bg-sky-50 px-2.5 py-1 text-xs font-medium text-sky-700"
                    : "rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-text-secondary"
                }
              >
                {getGoalTypeLabel(insight.goalType)}
              </span>
            </div>
            {subtitle && (
              <p className={isGoalManagementWorkspace ? "mt-1 text-sm font-medium text-slate-700" : "mt-1 text-sm text-text-secondary"}>
                {subtitle}
              </p>
            )}
            {insight.cleanDescription && (
              <p className={isGoalManagementWorkspace ? "mt-2 text-sm text-slate-700" : "mt-2 text-sm text-text-secondary"}>
                {insight.cleanDescription}
              </p>
            )}
          <p className={isGoalManagementWorkspace ? "mt-3 text-sm font-medium text-emerald-800" : "mt-3 text-sm text-primary"}>
            {insight.nextAction}
          </p>
        </div>
        <div className="text-right text-sm">
          <p className={isGoalManagementWorkspace ? "font-semibold text-emerald-700" : "font-medium text-primary"}>
            +{goal.xp_reward} XP
          </p>
          <p className={isGoalManagementWorkspace ? "text-slate-700" : "text-text-secondary"}>
              {insight.currentProgress}/{goal.target_count} {insight.unitLabel}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div
            className={
              isGoalManagementWorkspace
                ? "mb-2 flex items-center justify-between text-xs font-medium text-slate-700"
                : "mb-2 flex items-center justify-between text-xs text-text-secondary"
            }
          >
            <span>{insight.completionRate}% complete</span>
            <span>{goal.target_date ? `Deadline ${goal.target_date}` : "No deadline"}</span>
          </div>
          <div className={isGoalManagementWorkspace ? "h-2 rounded-full bg-slate-100" : "h-2 rounded-full bg-background"}>
            <div
              className={`h-2 rounded-full ${
                insight.health === "completed"
                  ? "bg-green-500"
                  : insight.health === "overdue"
                    ? "bg-red-500"
                    : insight.health === "at_risk"
                      ? "bg-amber-500"
                      : "bg-primary"
              }`}
              style={{ width: `${Math.min(insight.completionRate, 100)}%` }}
            />
          </div>
        </div>

        <div
          className={
            isGoalManagementWorkspace
              ? "mt-4 rounded-2xl border border-emerald-100 bg-white/80 px-4 py-3 text-sm text-slate-600"
              : "mt-4 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-text-secondary"
          }
        >
          {insight.helperText}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isGoalManagementWorkspace && (
        <nav className="rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
          <div className="grid gap-3 lg:grid-cols-3">
            {[
              {
                label: "Created Goals",
                description: "Present created goals",
                href: managementRoutes.created,
                icon: ListChecks,
              },
              {
                label: "Personal Goals",
                description: "Assign a goal to one learner",
                href: managementRoutes.personal,
                icon: PlusCircle,
              },
              {
                label: "Team Goals",
                description: "Create a shared team target",
                href: managementRoutes.team,
                icon: Users,
              },
            ].map((item) => {
              const isActive = pathname === item.href;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex min-w-0 items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
                    isActive
                      ? "bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(59,130,246,0.1))] text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
                      : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                  }`}
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                      isActive ? "bg-white text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="mt-1 block text-xs text-slate-500">{item.description}</span>
                  </span>
                </Link>
              );
            })}
          </div>
        </nav>
      )}

      {!isGoalManagementWorkspace && (
        <div className="overflow-hidden rounded-3xl border border-emerald-300/55 bg-[radial-gradient(circle_at_12%_18%,_rgba(52,211,153,0.46),_transparent_30%),radial-gradient(circle_at_76%_14%,_rgba(14,165,233,0.42),_transparent_28%),radial-gradient(circle_at_88%_82%,_rgba(242,165,27,0.24),_transparent_24%),linear-gradient(135deg,_#063B35_0%,_#075E63_42%,_#0B315F_72%,_#101827_100%)] p-5 text-white shadow-[0_30px_80px_rgba(6,78,59,0.36)] sm:p-6 lg:p-8">
          <div className="max-w-4xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100/90">
              Goals
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight drop-shadow-sm sm:text-[2.25rem]">
              Make your goals drive your learning, not sit beside it.
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50 sm:text-base">
              Smart goals are now best when they track real activity automatically. Use manual goals only for outcomes the platform cannot measure.
            </p>
          </div>
        </div>
      )}

        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-600">
            {success}
          </div>
        )}

        {isLoading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border border-border bg-card">
            <div className="inline-flex items-center gap-2 text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading goals...
            </div>
          </div>
        ) : (
          <>
            {(!isGoalManagementWorkspace || showDetails || showCreatedGoals) && (
            <div className="rounded-3xl border border-emerald-200/80 bg-[linear-gradient(135deg,#ffffff_0%,#f0fdfa_48%,#eff6ff_100%)] p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)] sm:p-6">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    {isGoalManagementWorkspace ? (isAdminWorkspace ? "Admin workspace" : "Manager workspace") : "Goal overview"}
                  </p>
                  <h2 className="mt-1 text-xl font-semibold text-slate-950">
                    {isGoalManagementWorkspace ? "Goal management overview" : "Your current goal status"}
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                    {isGoalManagementWorkspace
                      ? "Assign individual goals, create team targets, and follow progress from one organized workspace."
                      : "Follow your active goals, completed progress, and learning momentum."}
                  </p>
                </div>
              </div>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                {[
                  { label: isGoalManagementWorkspace ? "Learner Goals" : "Personal Goals", value: personalStats.total, tone: "text-slate-950" },
                  { label: "Completed", value: personalStats.completed, tone: "text-emerald-700" },
                  { label: "Need Attention", value: personalStats.atRisk + personalStats.overdue, tone: "text-amber-700" },
                  {
                    label: isGoalManagementWorkspace ? "Managed Teams" : "Current Streak",
                    value: isGoalManagementWorkspace ? teams.length : metrics.currentStreak,
                    tone: "text-sky-700",
                  },
                ].map((item) => (
                  <div key={item.label} className="border-t border-emerald-200/70 pt-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0 first:sm:border-l-0 first:sm:pl-0">
                    <p className="text-sm font-medium text-slate-600">{item.label}</p>
                    <p className={`mt-1 text-3xl font-bold ${item.tone}`}>{item.value}</p>
                  </div>
                ))}
              </div>
            </div>
            )}

            {showManagementGuide && !showCreatedGoals && (
              <div className="grid gap-3 md:grid-cols-3">
                {[
                  {
                    step: "1",
                    title: "Choose the owner",
                    text: "Assign the goal to one learner or one managed team.",
                  },
                  {
                    step: "2",
                    title: "Define the measure",
                    text: "Use lessons, courses, XP, streak, or study time.",
                  },
                  {
                    step: "3",
                    title: "Track completion",
                    text: "Progress updates automatically from learning activity.",
                  },
                ].map((item) => (
                  <div key={item.step} className="rounded-2xl border border-emerald-100 bg-white px-4 py-3 shadow-sm">
                    <div className="flex items-start gap-3">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-xs font-bold text-white">
                        {item.step}
                      </span>
                      <div>
                        <p className="font-semibold text-slate-950">{item.title}</p>
                        <p className="mt-1 text-sm leading-5 text-slate-600">{item.text}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {(showPersonalGoalForm || showTeamGoalForm || !isGoalManagementWorkspace) && (
            <div className={`gap-6 ${isGoalManagementWorkspace ? "mx-auto grid max-w-3xl" : "grid lg:grid-cols-[1.1fr_0.9fr]"}`}>
              <div className="space-y-4">
                {showPersonalGoalForm && (
                <div className="rounded-3xl border border-emerald-300 bg-[radial-gradient(circle_at_12%_0%,rgba(16,185,129,0.16),transparent_30%),linear-gradient(180deg,#ffffff_0%,#ecfdf5_100%)] p-5 shadow-[0_22px_55px_rgba(15,118,110,0.14)] sm:p-6">
                  <div className="mb-5 rounded-2xl border border-emerald-200 bg-white/78 px-4 py-4 shadow-sm">
                    <div className="flex items-center gap-2">
                      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-600 text-white shadow-sm">
                        <Flag className="h-5 w-5" />
                      </span>
                      <h2 className="text-lg font-semibold text-emerald-950">
                        {canManageGoals ? "Assign Personal Goal" : "Create Personal Goal"}
                      </h2>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-emerald-800">
                      {isGoalManagementWorkspace
                        ? "Select a learner, define the measurable target, then let the platform update progress automatically."
                        : "Define one measurable target. The platform will update progress automatically from real activity."}
                    </p>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    {canManageGoals && (
                      <div className="md:col-span-2">
                        <label className={managerLabelClass}>Assign to learner</label>
                        <select
                          value={selectedUserId}
                          onChange={(e) => {
                            setSelectedUserId(e.target.value);
                            setPersonalErrors((current) => ({ ...current, user_id: undefined }));
                          }}
                          className={isGoalManagementWorkspace ? managerFieldClass : defaultFieldClass}
                        >
                          {availableUsers.map((person) => (
                            <option key={person.id} value={person.id}>
                              {person.display_name || `${person.first_name} ${person.last_name}`.trim()} ({person.role})
                            </option>
                          ))}
                        </select>
                        {personalErrors.user_id && (
                          <p className="mt-1 text-xs font-medium text-destructive">{personalErrors.user_id}</p>
                        )}
                      </div>
                    )}

                      <div className="md:col-span-2">
                        <label className={managerLabelClass}>Goal Type</label>
                        <select
                          value={personalForm.goal_type}
                          onChange={(e) =>
                            setPersonalForm((current) => ({
                              ...current,
                              goal_type: e.target.value as GoalType,
                            }))
                          }
                          onBlur={() => setPersonalErrors((current) => ({ ...current, goal_type: undefined }))}
                          className={isGoalManagementWorkspace ? managerFieldClass : defaultFieldClass}
                        >
                          {GOAL_TYPE_OPTIONS.filter((option) => option.value !== "manual").map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                        <p className={isGoalManagementWorkspace ? "mt-2 text-xs font-medium text-emerald-700" : "mt-2 text-xs text-text-secondary"}>
                          {
                            GOAL_TYPE_OPTIONS.find((option) => option.value === personalForm.goal_type)
                              ?.description
                          }
                        </p>
                        {personalErrors.goal_type && (
                          <p className="mt-1 text-xs font-medium text-destructive">{personalErrors.goal_type}</p>
                        )}
                      </div>

                      <div className="md:col-span-2">
                        <label className={managerLabelClass}>Title</label>
                        <Input
                          value={personalForm.title}
                          className={inputFieldClass}
                          onChange={(e) => {
                            setPersonalForm((current) => ({ ...current, title: e.target.value }));
                            setPersonalErrors((current) => ({ ...current, title: undefined }));
                          }}
                          placeholder="Reach the next learning milestone"
                        />
                        {personalErrors.title && (
                          <p className="mt-1 text-xs font-medium text-destructive">{personalErrors.title}</p>
                        )}
                      </div>
                      <div className="md:col-span-2">
                        <label className={managerLabelClass}>Context</label>
                        <textarea
                          value={personalForm.description}
                          onChange={(e) => setPersonalForm((current) => ({ ...current, description: e.target.value }))}
                          rows={3}
                          className={isGoalManagementWorkspace ? managerFieldClass : defaultFieldClass}
                          placeholder="Short context for the learner"
                        />
                      </div>
                      <div>
                        <label className={managerLabelClass}>Target Value</label>
                        <Input
                          type="number"
                          min={1}
                          value={personalForm.target_count}
                          className={inputFieldClass}
                          onChange={(e) => {
                            setPersonalForm((current) => ({ ...current, target_count: parseInt(e.target.value, 10) || 1 }));
                            setPersonalErrors((current) => ({ ...current, target_count: undefined }));
                          }}
                        />
                        {personalErrors.target_count && (
                          <p className="mt-1 text-xs font-medium text-destructive">{personalErrors.target_count}</p>
                        )}
                      </div>
                      <div>
                        <label className={managerLabelClass}>XP Reward</label>
                        <Input
                          type="number"
                          min={0}
                          value={personalForm.xp_reward}
                          className={inputFieldClass}
                          onChange={(e) => {
                            setPersonalForm((current) => ({ ...current, xp_reward: parseInt(e.target.value, 10) || 0 }));
                            setPersonalErrors((current) => ({ ...current, xp_reward: undefined }));
                          }}
                        />
                        {personalErrors.xp_reward && (
                          <p className="mt-1 text-xs font-medium text-destructive">{personalErrors.xp_reward}</p>
                        )}
                      </div>
                      <div className="md:col-span-2">
                        <label className={managerLabelClass}>Deadline</label>
                        <Input
                          type="date"
                          value={personalForm.target_date}
                          className={inputFieldClass}
                          onChange={(e) => setPersonalForm((current) => ({ ...current, target_date: e.target.value }))}
                        />
                      </div>
                  </div>
                  <div className="mt-4">
                    <Button
                      onClick={handleCreateGoal}
                      disabled={
                        isSubmitting ||
                        !user?.id
                      }
                    >
                      {canManageGoals ? "Assign Goal" : "Create Goal"}
                    </Button>
                  </div>
                </div>
                )}
              </div>

              <div className="space-y-4">
                {canViewTeamGoals && (
                  <>
                    {canManageGoals && showTeamGoalForm && (
                      <div className="rounded-3xl border border-sky-300 bg-[radial-gradient(circle_at_12%_0%,rgba(14,165,233,0.16),transparent_30%),linear-gradient(180deg,#ffffff_0%,#eff6ff_100%)] p-5 shadow-[0_22px_55px_rgba(14,116,144,0.14)] sm:p-6">
                        <div className="mb-5 rounded-2xl border border-sky-200 bg-white/82 px-4 py-4 shadow-sm">
                          <div className="flex items-center gap-2">
                            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-600 text-white shadow-sm">
                              <Users className="h-5 w-5" />
                            </span>
                            <h2 className="text-lg font-semibold text-sky-950">Create Team Goal</h2>
                          </div>
                          <p className="mt-3 text-sm leading-6 text-sky-800">
                            Create a shared target for one managed team and monitor member completion.
                          </p>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="md:col-span-2">
                            <label className={managerLabelClass}>Team</label>
                            <select
                              value={teamForm.team_id}
                              onChange={(e) => {
                                setTeamForm((current) => ({ ...current, team_id: e.target.value }));
                                setTeamErrors((current) => ({ ...current, team_id: undefined }));
                              }}
                              className={isGoalManagementWorkspace ? managerFieldClass : defaultFieldClass}
                            >
                              <option value="">Select team</option>
                              {teams.map((team) => (
                                <option key={team.id} value={team.id}>
                                  {team.name}
                                </option>
                              ))}
                            </select>
                            {teamErrors.team_id && (
                              <p className="mt-1 text-xs font-medium text-destructive">{teamErrors.team_id}</p>
                            )}
                          </div>
                          <div className="md:col-span-2">
                            <label className={managerLabelClass}>Goal Type</label>
                            <select
                              value={teamForm.goal_type}
                              onChange={(e) => {
                                setTeamForm((current) => ({ ...current, goal_type: e.target.value as GoalType }));
                                setTeamErrors((current) => ({ ...current, goal_type: undefined }));
                              }}
                              className={isGoalManagementWorkspace ? managerFieldClass : defaultFieldClass}
                            >
                              {GOAL_TYPE_OPTIONS.filter((option) => option.value !== "manual").map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            {teamErrors.goal_type && (
                              <p className="mt-1 text-xs font-medium text-destructive">{teamErrors.goal_type}</p>
                            )}
                          </div>
                          <div className="md:col-span-2">
                            <label className={managerLabelClass}>Title</label>
                            <Input
                              value={teamForm.title}
                              className={inputFieldClass}
                              onChange={(e) => {
                                setTeamForm((current) => ({ ...current, title: e.target.value }));
                                setTeamErrors((current) => ({ ...current, title: undefined }));
                              }}
                              placeholder="Finish onboarding plan as a team"
                            />
                            {teamErrors.title && (
                              <p className="mt-1 text-xs font-medium text-destructive">{teamErrors.title}</p>
                            )}
                          </div>
                          <div className="md:col-span-2">
                            <label className={managerLabelClass}>Context</label>
                            <textarea
                              value={teamForm.description}
                              onChange={(e) => setTeamForm((current) => ({ ...current, description: e.target.value }))}
                              rows={3}
                              className={isGoalManagementWorkspace ? managerFieldClass : defaultFieldClass}
                            />
                          </div>
                          <div>
                            <label className={managerLabelClass}>Target Count</label>
                            <Input
                              type="number"
                              min={1}
                              value={teamForm.target_count}
                              className={inputFieldClass}
                              onChange={(e) => {
                                setTeamForm((current) => ({ ...current, target_count: parseInt(e.target.value, 10) || 1 }));
                                setTeamErrors((current) => ({ ...current, target_count: undefined }));
                              }}
                            />
                            {teamErrors.target_count && (
                              <p className="mt-1 text-xs font-medium text-destructive">{teamErrors.target_count}</p>
                            )}
                          </div>
                          <div>
                            <label className={managerLabelClass}>XP Reward</label>
                            <Input
                              type="number"
                              min={0}
                              value={teamForm.xp_reward}
                              className={inputFieldClass}
                              onChange={(e) => {
                                setTeamForm((current) => ({ ...current, xp_reward: parseInt(e.target.value, 10) || 0 }));
                                setTeamErrors((current) => ({ ...current, xp_reward: undefined }));
                              }}
                            />
                            {teamErrors.xp_reward && (
                              <p className="mt-1 text-xs font-medium text-destructive">{teamErrors.xp_reward}</p>
                            )}
                          </div>
                          <div className="md:col-span-2">
                            <label className={managerLabelClass}>Deadline</label>
                            <Input
                              type="date"
                              value={teamForm.target_date}
                              className={inputFieldClass}
                              onChange={(e) => setTeamForm((current) => ({ ...current, target_date: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="mt-4">
                          <Button onClick={handleCreateTeamGoal} disabled={isSubmitting}>
                            Create Team Goal
                          </Button>
                        </div>
                      </div>
                    )}

                  </>
                )}

                {!canManageGoals && (
                  <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-5 w-5 text-primary" />
                      <h2 className="text-lg font-semibold text-text-primary">Good Goal Design</h2>
                    </div>
                    <ul className="mt-4 space-y-3 text-sm text-text-secondary">
                      <li>Use auto-tracked goals whenever the platform can measure the result.</li>
                      <li>Use reminders from the platform as your “what should I do next?” signal.</li>
                      <li>Set fewer goals, but make each one concrete and deadline-driven.</li>
                    </ul>
                  </div>
                )}
              </div>
            </div>
            )}

            {!isGoalManagementWorkspace && (
              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-3xl border border-emerald-200 bg-[linear-gradient(180deg,#ffffff_0%,#f0fdfa_100%)] p-5 shadow-[0_18px_45px_rgba(15,118,110,0.08)] sm:p-6">
                  <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-white px-4 py-3 shadow-sm">
                    <div>
                      <h2 className="text-lg font-semibold text-emerald-950">Personal Goals</h2>
                      <p className="mt-1 text-sm font-medium text-emerald-800">Goals assigned directly to you.</p>
                    </div>
                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                      {personalStats.total}
                    </span>
                  </div>
                  <div className="space-y-4">
                    {personalGoalViews.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-emerald-200 bg-white p-5 text-sm text-emerald-800">
                        No personal goals have been assigned to you yet.
                      </div>
                    ) : (
                      personalGoalViews.map(({ goal }) => <GoalCard key={goal.id} goal={goal} />)
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-sky-200 bg-[linear-gradient(180deg,#ffffff_0%,#eff6ff_100%)] p-5 shadow-[0_18px_45px_rgba(14,116,144,0.08)] sm:p-6">
                  <div className="mb-5 flex items-center justify-between gap-3 rounded-2xl border border-sky-200 bg-white px-4 py-3 shadow-sm">
                    <div>
                      <h2 className="text-lg font-semibold text-sky-950">Team Goals</h2>
                      <p className="mt-1 text-sm font-medium text-sky-800">Shared goals assigned to your team.</p>
                    </div>
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700">
                      {teamStats.total}
                    </span>
                  </div>
                  <div className="space-y-4">
                    {teamGoals.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-sky-200 bg-white p-5 text-sm text-sky-800">
                        No team goals have been assigned to your team yet.
                      </div>
                    ) : (
                      teamGoals.map((goal) => (
                        <GoalCard
                          key={goal.id}
                          goal={goal}
                          subtitle={`${goal.team_name} - ${goal.completed_members}/${goal.total_members} members completed`}
                        />
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}

            {showCreatedGoals && (
              <div className="mx-auto max-w-6xl space-y-6">
                <div className="grid gap-6 xl:grid-cols-2">
                  <div className="rounded-3xl border border-emerald-300 bg-[#F7FFFB] p-5 shadow-[0_18px_45px_rgba(15,118,110,0.1)] sm:p-6">
                    <div className="mb-5 rounded-2xl border border-emerald-200 bg-white px-4 py-3 shadow-sm">
                      <h2 className="text-lg font-semibold text-emerald-950">Created Personal Goals</h2>
                      <p className="mt-1 text-sm font-medium text-emerald-800">Goals already assigned to individual learners.</p>
                    </div>
                    <div className="space-y-4">
                      {personalGoalViews.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 p-5 text-sm text-emerald-800">
                          No created personal goals yet.
                        </div>
                      ) : (
                        personalGoalViews.map(({ goal }) => <GoalCard key={goal.id} goal={goal} />)
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-sky-300 bg-[#F7FBFF] p-5 shadow-[0_18px_45px_rgba(14,116,144,0.1)] sm:p-6">
                    <div className="mb-5 rounded-2xl border border-sky-200 bg-white px-4 py-3 shadow-sm">
                      <h2 className="text-lg font-semibold text-sky-950">Created Team Goals</h2>
                      <p className="mt-1 text-sm font-medium text-sky-800">Shared goals already created for managed teams.</p>
                    </div>
                    <div className="space-y-4">
                      {teamGoals.length === 0 ? (
                        <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/60 p-5 text-sm text-sky-800">
                          No created team goals yet.
                        </div>
                      ) : (
                        teamGoals.map((goal) => (
                          <GoalCard
                            key={goal.id}
                            goal={goal}
                            subtitle={`${goal.team_name} - ${goal.completed_members}/${goal.total_members} members completed`}
                          />
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {isGoalManagementWorkspace && showDetails && (
              <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-2">
                <div className="rounded-3xl border border-emerald-200/80 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-4 flex items-center justify-between gap-3 border-b border-emerald-100 pb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-text-primary">Learner Goals</h2>
                      <p className="mt-1 text-sm text-text-secondary">Individual goals assigned to learners.</p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-sm font-semibold text-emerald-700">
                      {personalStats.total}
                    </span>
                  </div>
                  <div className="space-y-4">
                    {personalGoalViews.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-5 text-sm text-emerald-800">
                        No learner goals yet. Assign the first goal from the form above.
                      </div>
                    ) : (
                      personalGoalViews.map(({ goal }) => <GoalCard key={goal.id} goal={goal} />)
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-sky-200/80 bg-white p-5 shadow-sm sm:p-6">
                  <div className="mb-4 flex items-center justify-between gap-3 border-b border-sky-100 pb-4">
                    <div>
                      <h2 className="text-lg font-semibold text-text-primary">Team Goal Progress</h2>
                      <p className="mt-1 text-sm text-text-secondary">Shared goals and member completion.</p>
                    </div>
                    <span className="rounded-full bg-sky-50 px-3 py-1 text-sm font-semibold text-sky-700">
                      {teamStats.total}
                    </span>
                  </div>
                  {teamGoals.length === 0 ? (
                    <p className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/50 px-4 py-3 text-sm text-sky-800">
                      No team goals yet. Create one from the team goal form above.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {teamGoals.map((goal) => (
                        <div key={goal.id} className="rounded-2xl border border-border bg-background px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-medium text-text-primary">{goal.title}</p>
                              <p className="mt-1 text-xs text-text-secondary">
                                {goal.team_name} - {goal.completed_members}/{goal.total_members} members completed
                              </p>
                            </div>
                            <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                              {goal.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </>
        )}
    </div>
  );
}

export default function GoalsPage() {
  return (
    <AppShell>
      <GoalsContent />
    </AppShell>
  );
}
