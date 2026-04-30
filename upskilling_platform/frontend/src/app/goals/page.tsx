"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/app/components/layout/AppShell";
import { Button } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Input";
import { useAuth } from "@/app/context/AuthContext";
import {
  createGoal,
  createTeamGoal,
  deleteGoal,
  getEnrollments,
  getGamificationProfile,
  getGoals,
  getTeamGoals,
  getTeams,
  getUserProgress,
  updateGoal,
  updateTeamGoal,
  type EnrollmentResponse,
  type GamificationProfileResponse,
  type Goal,
  type Team,
  type TeamGoal,
  type UserProgressResponse,
} from "@/app/lib/api";
import {
  buildGoalInsight,
  buildGoalMetricsSummary,
  getGoalTypeLabel,
  GOAL_TYPE_OPTIONS,
  serializeGoalDescription,
  type GoalType,
  type GoalMetricsSummary,
} from "@/app/lib/goal-utils";
import {
  AlertTriangle,
  BellRing,
  CheckCircle2,
  Flag,
  Loader2,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Users,
  Zap,
} from "lucide-react";

const emptyGoalForm = {
  title: "",
  description: "",
  target_date: "",
  target_count: 1,
  xp_reward: 0,
  goal_type: "lessons_completed" as GoalType,
};

export default function GoalsPage() {
  const { user } = useAuth();
  const [goals, setGoals] = useState<Goal[]>([]);
  const [teamGoals, setTeamGoals] = useState<TeamGoal[]>([]);
  const [teams, setTeams] = useState<Team[]>([]);
  const [personalForm, setPersonalForm] = useState(emptyGoalForm);
  const [teamForm, setTeamForm] = useState({
    title: "",
    description: "",
    target_date: "",
    target_count: 1,
    xp_reward: 0,
    team_id: "",
  });
  const [personalProgress, setPersonalProgress] = useState<Record<string, number>>({});
  const [teamProgress, setTeamProgress] = useState<Record<string, number>>({});
  const [metrics, setMetrics] = useState<GoalMetricsSummary>({
    lessonsCompleted: 0,
    coursesCompleted: 0,
    studyMinutes: 0,
    totalXp: 0,
    currentStreak: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const canManageTeamGoals = !!user && user.role === "TeamManager";
  const canViewTeamGoals =
    !!user &&
    (canManageTeamGoals ||
      ["TeamMember", "TeamIntern", "LearningExpert"].includes(user.role));

  async function loadData() {
    try {
      setError(null);
      const [personalGoals, availableTeams, currentTeamGoals, enrollments, progress, profile] =
        await Promise.all([
          getGoals(),
          canManageTeamGoals ? getTeams().catch(() => []) : Promise.resolve([]),
          canViewTeamGoals ? getTeamGoals().catch(() => []) : Promise.resolve([]),
          user ? getEnrollments(user.id).catch(() => []) : Promise.resolve([] as EnrollmentResponse[]),
          user ? getUserProgress(user.id).catch(() => []) : Promise.resolve([] as UserProgressResponse[]),
          getGamificationProfile().catch(() => null as GamificationProfileResponse | null),
        ]);

      const resolvedMetrics = buildGoalMetricsSummary(progress, enrollments, profile);

      setGoals(personalGoals);
      setTeams(availableTeams);
      setTeamGoals(currentTeamGoals);
      setMetrics(resolvedMetrics);
      setPersonalProgress(
        Object.fromEntries(personalGoals.map((goal) => [goal.id, goal.progress]))
      );
      setTeamProgress(
        Object.fromEntries(currentTeamGoals.map((goal) => [goal.id, goal.progress]))
      );

      if (!teamForm.team_id && availableTeams.length > 0) {
        setTeamForm((current) => ({ ...current, team_id: availableTeams[0].id }));
      }

      // Keep auto-tracked goals aligned with real activity without asking the user
      // to mark them complete manually.
      await Promise.all(
        personalGoals.map(async (goal) => {
          const insight = buildGoalInsight(goal, resolvedMetrics);
          if (!insight.isAutoTracked) {
            return;
          }
          if (
            insight.currentProgress !== goal.progress ||
            (insight.health === "completed" && goal.status !== "completed")
          ) {
            const updated = await updateGoal(goal.id, {
              progress: insight.currentProgress,
              status: insight.health === "completed" ? "completed" : "active",
            });
            setGoals((current) =>
              current.map((item) => (item.id === goal.id ? updated : item))
            );
          }
        })
      );
    } catch (err) {
      console.error("Failed to load goals:", err);
      setError(err instanceof Error ? err.message : "Failed to load goals");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    void loadData();
  }, [canManageTeamGoals, canViewTeamGoals, user?.id]);

  const personalGoalViews = useMemo(
    () =>
      goals.map((goal) => ({
        goal,
        insight: buildGoalInsight(goal, metrics),
      })),
    [goals, metrics]
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

  const focusGoal = useMemo(() => {
    const incomplete = personalGoalViews.filter((entry) => entry.insight.health !== "completed");
    incomplete.sort((left, right) => {
      const priority = (value: string) => {
        if (value === "overdue") return 0;
        if (value === "at_risk") return 1;
        return 2;
      };
      const priorityGap = priority(left.insight.health) - priority(right.insight.health);
      if (priorityGap !== 0) return priorityGap;
      return left.insight.remaining - right.insight.remaining;
    });
    return incomplete[0] || null;
  }, [personalGoalViews]);

  async function handleCreateGoal() {
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createGoal({
        title: personalForm.title,
        description: serializeGoalDescription(personalForm.description, personalForm.goal_type),
        target_date: personalForm.target_date || null,
        target_count: personalForm.target_count,
        xp_reward: personalForm.xp_reward,
        progress: 0,
      });
      setGoals((current) => [created, ...current]);
      setPersonalProgress((current) => ({ ...current, [created.id]: created.progress }));
      setPersonalForm(emptyGoalForm);
      setSuccess(
        GOAL_TYPE_OPTIONS.find((option) => option.value === personalForm.goal_type)?.value === "manual"
          ? "Personal goal created successfully."
          : "Smart goal created. The platform will now track it automatically."
      );
      await loadData();
    } catch (err) {
      console.error("Failed to create goal:", err);
      setError(err instanceof Error ? err.message : "Failed to create goal");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateGoal(goal: Goal) {
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateGoal(goal.id, {
        progress: Number(personalProgress[goal.id] ?? goal.progress),
      });
      setGoals((current) =>
        current.map((item) => (item.id === goal.id ? updated : item))
      );
      setSuccess("Personal goal updated successfully.");
    } catch (err) {
      console.error("Failed to update goal:", err);
      setError(err instanceof Error ? err.message : "Failed to update goal");
    }
  }

  async function handleDeleteGoal(goalId: string) {
    setError(null);
    setSuccess(null);
    try {
      await deleteGoal(goalId);
      setGoals((current) => current.filter((goal) => goal.id !== goalId));
      setSuccess("Personal goal deleted successfully.");
    } catch (err) {
      console.error("Failed to delete goal:", err);
      setError(err instanceof Error ? err.message : "Failed to delete goal");
    }
  }

  async function handleCreateTeamGoal() {
    if (!teamForm.team_id) {
      setError("Select a team first.");
      return;
    }
    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const created = await createTeamGoal({
        ...teamForm,
        description: teamForm.description || null,
        target_date: teamForm.target_date || null,
      });
      setTeamGoals((current) => [created, ...current]);
      setTeamProgress((current) => ({ ...current, [created.id]: created.progress }));
      setTeamForm({
        title: "",
        description: "",
        target_date: "",
        target_count: 1,
        xp_reward: 0,
        team_id: teamForm.team_id,
      });
      setSuccess("Team goal created successfully.");
    } catch (err) {
      console.error("Failed to create team goal:", err);
      setError(err instanceof Error ? err.message : "Failed to create team goal");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleUpdateTeamGoal(goal: TeamGoal) {
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateTeamGoal(goal.id, {
        progress: Number(teamProgress[goal.id] ?? goal.progress),
      });
      setTeamGoals((current) =>
        current.map((item) => (item.id === goal.id ? updated : item))
      );
      setSuccess("Team goal updated successfully.");
    } catch (err) {
      console.error("Failed to update team goal:", err);
      setError(err instanceof Error ? err.message : "Failed to update team goal");
    }
  }

  function GoalCard({
    goal,
    progressValue,
    onProgressChange,
    onSave,
    onDelete,
    subtitle,
    readOnly = false,
    autoTracked = false,
  }: {
    goal: Goal | TeamGoal;
    progressValue: number;
    onProgressChange: (value: number) => void;
    onSave: () => void;
    onDelete?: () => void;
    subtitle?: string;
    readOnly?: boolean;
    autoTracked?: boolean;
  }) {
    const insight = buildGoalInsight(goal, metrics);
    const statusTone =
      insight.health === "completed"
        ? "bg-green-500/10 text-green-600"
        : insight.health === "overdue"
          ? "bg-red-500/10 text-red-600"
          : insight.health === "at_risk"
            ? "bg-amber-500/10 text-amber-600"
            : "bg-primary/10 text-primary";

    return (
      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold text-text-primary">{goal.title}</h3>
              <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusTone}`}>
                {insight.health.replace("_", " ")}
              </span>
              <span className="rounded-full border border-border bg-background px-2.5 py-1 text-xs font-medium text-text-secondary">
                {getGoalTypeLabel(insight.goalType)}
              </span>
            </div>
            {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
            {insight.cleanDescription && (
              <p className="mt-2 text-sm text-text-secondary">{insight.cleanDescription}</p>
            )}
            <p className="mt-3 text-sm text-primary">{insight.nextAction}</p>
          </div>
          <div className="text-right text-sm">
            <p className="font-medium text-primary">+{goal.xp_reward} XP</p>
            <p className="text-text-secondary">
              {insight.currentProgress}/{goal.target_count} {insight.unitLabel}
            </p>
          </div>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between text-xs text-text-secondary">
            <span>{insight.completionRate}% complete</span>
            <span>{goal.target_date ? `Deadline ${goal.target_date}` : "No deadline"}</span>
          </div>
          <div className="h-2 rounded-full bg-background">
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

        <div className="mt-4 rounded-2xl border border-border bg-background px-4 py-3 text-sm text-text-secondary">
          {autoTracked || insight.isAutoTracked
            ? insight.helperText
            : "Use manual updates only for goals that the platform cannot measure for you."}
        </div>

        {!readOnly && !insight.isAutoTracked && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <div className="w-28">
              <label className="mb-1 block text-xs font-medium text-text-secondary">
                Progress
              </label>
              <Input
                type="number"
                min={0}
                value={progressValue}
                onChange={(e) => onProgressChange(parseInt(e.target.value, 10) || 0)}
              />
            </div>
            <Button onClick={onSave}>Save Progress</Button>
            {onDelete && (
              <Button variant="outline" onClick={onDelete}>
                Delete
              </Button>
            )}
          </div>
        )}

        {!readOnly && insight.isAutoTracked && onDelete && (
          <div className="mt-4 flex justify-end">
            <Button variant="outline" onClick={onDelete}>
              Delete
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="rounded-3xl border border-border bg-[radial-gradient(circle_at_top_left,rgba(14,163,122,0.2),transparent_32%),radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_28%),radial-gradient(circle_at_18%_82%,rgba(242,165,27,0.12),transparent_22%),linear-gradient(135deg,rgba(245,252,248,0.96),rgba(231,245,247,0.94),rgba(221,234,241,0.96))] p-6 text-text-primary shadow-[0_24px_60px_rgba(15,23,42,0.08)] sm:p-8">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(14,163,122,0.16),rgba(34,199,180,0.14),rgba(242,165,27,0.12))] shadow-sm">
              <Target className="h-6 w-6 text-primary" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-primary/80">
                Goals
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-text-primary sm:text-4xl">
                Make your goals drive your learning, not sit beside it.
              </h1>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-slate-700">
                Smart goals are now best when they track real activity automatically. Use manual goals only for outcomes the platform cannot measure.
              </p>
            </div>
          </div>
        </div>

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
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <p className="text-sm text-text-secondary">Personal Goals</p>
                <p className="mt-2 text-3xl font-bold text-text-primary">{personalStats.total}</p>
              </div>
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <p className="text-sm text-text-secondary">Completed</p>
                <p className="mt-2 text-3xl font-bold text-green-600">{personalStats.completed}</p>
              </div>
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <p className="text-sm text-text-secondary">Need Attention</p>
                <p className="mt-2 text-3xl font-bold text-amber-600">
                  {personalStats.atRisk + personalStats.overdue}
                </p>
              </div>
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <p className="text-sm text-text-secondary">Current Streak</p>
                <p className="mt-2 text-3xl font-bold text-text-primary">{metrics.currentStreak}</p>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-3">
              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <BellRing className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-text-primary">Today’s Focus</h2>
                </div>
                {focusGoal ? (
                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-semibold text-text-primary">{focusGoal.goal.title}</p>
                    <p className="text-sm text-text-secondary">{focusGoal.insight.nextAction}</p>
                    <p className="text-xs text-primary">
                      {focusGoal.insight.currentProgress}/{focusGoal.goal.target_count} {focusGoal.insight.unitLabel}
                    </p>
                  </div>
                ) : (
                  <p className="mt-4 text-sm text-text-secondary">
                    No active personal goal needs attention right now.
                  </p>
                )}
              </div>

              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-text-primary">Real Learning Signals</h2>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-2xl border border-border bg-background p-3">
                    <p className="text-text-secondary">Lessons</p>
                    <p className="mt-1 text-xl font-semibold text-text-primary">{metrics.lessonsCompleted}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-3">
                    <p className="text-text-secondary">Courses</p>
                    <p className="mt-1 text-xl font-semibold text-text-primary">{metrics.coursesCompleted}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-3">
                    <p className="text-text-secondary">Study Minutes</p>
                    <p className="mt-1 text-xl font-semibold text-text-primary">{metrics.studyMinutes}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-3">
                    <p className="text-text-secondary">XP</p>
                    <p className="mt-1 text-xl font-semibold text-text-primary">{metrics.totalXp}</p>
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-primary" />
                  <h2 className="text-lg font-semibold text-text-primary">Why this is better</h2>
                </div>
                <ul className="mt-4 space-y-3 text-sm text-text-secondary">
                  <li>Auto goals update from real lessons, XP, streaks, and completed courses.</li>
                  <li>You no longer need to mark measurable goals as done manually.</li>
                  <li>The platform can now remind you what needs attention when you open it.</li>
                </ul>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="space-y-4">
                <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-2">
                    <Flag className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-text-primary">Create Personal Goal</h2>
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-text-secondary">Tracking Type</label>
                      <select
                        value={personalForm.goal_type}
                        onChange={(e) =>
                          setPersonalForm((current) => ({
                            ...current,
                            goal_type: e.target.value as GoalType,
                          }))
                        }
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                      >
                        {GOAL_TYPE_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-2 text-xs text-text-secondary">
                        {
                          GOAL_TYPE_OPTIONS.find((option) => option.value === personalForm.goal_type)
                            ?.description
                        }
                      </p>
                    </div>

                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-text-secondary">Title</label>
                      <Input
                        value={personalForm.title}
                        onChange={(e) => setPersonalForm((current) => ({ ...current, title: e.target.value }))}
                        placeholder={
                          personalForm.goal_type === "manual"
                            ? "Finish my React portfolio revision"
                            : "Reach my next learning milestone"
                        }
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-text-secondary">Why this matters</label>
                      <textarea
                        value={personalForm.description}
                        onChange={(e) => setPersonalForm((current) => ({ ...current, description: e.target.value }))}
                        rows={3}
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                        placeholder="Add context that will help you stay committed to this goal"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-text-secondary">Target Value</label>
                      <Input
                        type="number"
                        min={1}
                        value={personalForm.target_count}
                        onChange={(e) => setPersonalForm((current) => ({ ...current, target_count: parseInt(e.target.value, 10) || 1 }))}
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-text-secondary">XP Reward</label>
                      <Input
                        type="number"
                        min={0}
                        value={personalForm.xp_reward}
                        onChange={(e) => setPersonalForm((current) => ({ ...current, xp_reward: parseInt(e.target.value, 10) || 0 }))}
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="mb-1 block text-xs font-medium text-text-secondary">Deadline</label>
                      <Input
                        type="date"
                        value={personalForm.target_date}
                        onChange={(e) => setPersonalForm((current) => ({ ...current, target_date: e.target.value }))}
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <Button onClick={handleCreateGoal} disabled={isSubmitting || !personalForm.title.trim()}>
                      Create Goal
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  {personalGoalViews.length === 0 ? (
                    <div className="rounded-2xl border border-border bg-card p-6 text-sm text-text-secondary">
                      No personal goals yet. Create your first goal above.
                    </div>
                  ) : (
                    personalGoalViews.map(({ goal, insight }) => (
                      <GoalCard
                        key={goal.id}
                        goal={goal}
                        autoTracked={insight.isAutoTracked}
                        progressValue={personalProgress[goal.id] ?? goal.progress}
                        onProgressChange={(value) =>
                          setPersonalProgress((current) => ({ ...current, [goal.id]: value }))
                        }
                        onSave={() => handleUpdateGoal(goal)}
                        onDelete={() => handleDeleteGoal(goal.id)}
                      />
                    ))
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                  <div className="flex items-center gap-2">
                    <Zap className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-text-primary">Recommended Smart Goals</h2>
                  </div>
                  <div className="mt-4 space-y-3">
                    {[
                      {
                        title: "Finish 5 lessons this week",
                        type: "lessons_completed" as GoalType,
                        target: 5,
                      },
                      {
                        title: "Earn 300 XP this month",
                        type: "xp_earned" as GoalType,
                        target: 300,
                      },
                      {
                        title: "Build a 7-day streak",
                        type: "streak_days" as GoalType,
                        target: 7,
                      },
                    ].map((template) => (
                      <button
                        key={template.title}
                        type="button"
                        onClick={() =>
                          setPersonalForm((current) => ({
                            ...current,
                            title: template.title,
                            goal_type: template.type,
                            target_count: template.target,
                          }))
                        }
                        className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-left transition-colors hover:border-primary/30 hover:bg-primary/5"
                      >
                        <p className="font-medium text-text-primary">{template.title}</p>
                        <p className="mt-1 text-xs text-text-secondary">
                          {getGoalTypeLabel(template.type)}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>

                {canViewTeamGoals && (
                  <>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                        <p className="text-sm text-text-secondary">Team Goals</p>
                        <p className="mt-2 text-3xl font-bold text-text-primary">{teamStats.total}</p>
                      </div>
                      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                        <p className="text-sm text-text-secondary">Completed Team Goals</p>
                        <p className="mt-2 text-3xl font-bold text-green-600">{teamStats.completed}</p>
                      </div>
                    </div>

                    {canManageTeamGoals && (
                      <div className="rounded-3xl border border-border bg-card p-5 shadow-sm">
                        <div className="mb-4 flex items-center gap-2">
                          <Users className="h-5 w-5 text-primary" />
                          <h2 className="text-lg font-semibold text-text-primary">Create Team Goal</h2>
                        </div>
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="md:col-span-2">
                            <label className="mb-1 block text-xs font-medium text-text-secondary">Team</label>
                            <select
                              value={teamForm.team_id}
                              onChange={(e) => setTeamForm((current) => ({ ...current, team_id: e.target.value }))}
                              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                            >
                              <option value="">Select team</option>
                              {teams.map((team) => (
                                <option key={team.id} value={team.id}>
                                  {team.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="md:col-span-2">
                            <label className="mb-1 block text-xs font-medium text-text-secondary">Title</label>
                            <Input
                              value={teamForm.title}
                              onChange={(e) => setTeamForm((current) => ({ ...current, title: e.target.value }))}
                              placeholder="Finish onboarding plan as a team"
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="mb-1 block text-xs font-medium text-text-secondary">Description</label>
                            <textarea
                              value={teamForm.description}
                              onChange={(e) => setTeamForm((current) => ({ ...current, description: e.target.value }))}
                              rows={3}
                              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-text-secondary">Target Count</label>
                            <Input
                              type="number"
                              min={1}
                              value={teamForm.target_count}
                              onChange={(e) => setTeamForm((current) => ({ ...current, target_count: parseInt(e.target.value, 10) || 1 }))}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-xs font-medium text-text-secondary">XP Reward</label>
                            <Input
                              type="number"
                              min={0}
                              value={teamForm.xp_reward}
                              onChange={(e) => setTeamForm((current) => ({ ...current, xp_reward: parseInt(e.target.value, 10) || 0 }))}
                            />
                          </div>
                          <div className="md:col-span-2">
                            <label className="mb-1 block text-xs font-medium text-text-secondary">Deadline</label>
                            <Input
                              type="date"
                              value={teamForm.target_date}
                              onChange={(e) => setTeamForm((current) => ({ ...current, target_date: e.target.value }))}
                            />
                          </div>
                        </div>
                        <div className="mt-4">
                          <Button onClick={handleCreateTeamGoal} disabled={isSubmitting || !teamForm.title.trim()}>
                            Create Team Goal
                          </Button>
                        </div>
                      </div>
                    )}

                    <div className="space-y-4">
                      {teamGoals.length === 0 ? (
                        <div className="rounded-2xl border border-border bg-card p-6 text-sm text-text-secondary">
                          {canManageTeamGoals
                            ? "No team goals yet. Create one for a managed team above."
                            : "No team goals have been assigned to your team yet."}
                        </div>
                      ) : (
                        teamGoals.map((goal) => (
                          <GoalCard
                            key={goal.id}
                            goal={goal}
                            subtitle={`${goal.team_name} - ${goal.completed_members}/${goal.total_members} members completed`}
                            progressValue={teamProgress[goal.id] ?? goal.progress}
                            onProgressChange={(value) =>
                              setTeamProgress((current) => ({ ...current, [goal.id]: value }))
                            }
                            onSave={() => handleUpdateTeamGoal(goal)}
                            readOnly={!canManageTeamGoals}
                          />
                        ))
                      )}
                    </div>
                  </>
                )}

                {!canManageTeamGoals && (
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
          </>
        )}
      </div>
    </AppShell>
  );
}
