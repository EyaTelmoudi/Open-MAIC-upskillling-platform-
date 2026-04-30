import type { Goal, UserProgressResponse, EnrollmentResponse, GamificationProfileResponse } from "@/app/lib/api";
import { routes } from "@/app/lib/routes";

export type GoalType =
  | "manual"
  | "lessons_completed"
  | "courses_completed"
  | "study_minutes"
  | "xp_earned"
  | "streak_days";

export type GoalHealth = "completed" | "on_track" | "at_risk" | "overdue";

export type GoalPriority = "low" | "medium" | "high";

export type GoalReminder = {
  goalId: string;
  title: string;
  message: string;
  ctaLabel: string;
  ctaHref: string;
  priority: GoalPriority;
};

export type GoalMetricsSummary = {
  lessonsCompleted: number;
  coursesCompleted: number;
  studyMinutes: number;
  totalXp: number;
  currentStreak: number;
};

export type GoalInsight = {
  goalType: GoalType;
  cleanDescription: string | null;
  isAutoTracked: boolean;
  currentProgress: number;
  completionRate: number;
  remaining: number;
  health: GoalHealth;
  helperText: string;
  unitLabel: string;
  nextAction: string;
};

const GOAL_META_PREFIX = "[[SF_GOAL:";

const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  manual: "Manual milestone",
  lessons_completed: "Lessons completed",
  courses_completed: "Courses completed",
  study_minutes: "Study minutes",
  xp_earned: "XP earned",
  streak_days: "Learning streak",
};

const GOAL_TYPE_UNITS: Record<GoalType, string> = {
  manual: "steps",
  lessons_completed: "lessons",
  courses_completed: "courses",
  study_minutes: "minutes",
  xp_earned: "XP",
  streak_days: "days",
};

export const GOAL_TYPE_OPTIONS: Array<{
  value: GoalType;
  label: string;
  description: string;
}> = [
  {
    value: "lessons_completed",
    label: "Lessons completed",
    description: "Track finished lessons automatically from your real progress.",
  },
  {
    value: "courses_completed",
    label: "Courses completed",
    description: "Complete full courses and let the platform update the goal for you.",
  },
  {
    value: "study_minutes",
    label: "Study minutes",
    description: "Accumulate reading and lesson time automatically.",
  },
  {
    value: "xp_earned",
    label: "XP earned",
    description: "Grow your learning momentum through real XP gains.",
  },
  {
    value: "streak_days",
    label: "Learning streak",
    description: "Build consistency day after day without manual updates.",
  },
  {
    value: "manual",
    label: "Manual milestone",
    description: "Use this for personal outcomes that the system cannot measure directly.",
  },
];

export function serializeGoalDescription(
  description: string | null | undefined,
  goalType: GoalType
): string | null {
  const trimmed = (description || "").trim();
  if (goalType === "manual") {
    return trimmed || null;
  }
  return `${GOAL_META_PREFIX}type=${goalType}]]${trimmed ? `\n${trimmed}` : ""}`;
}

export function parseGoalDescription(
  rawDescription: string | null | undefined
): { goalType: GoalType; cleanDescription: string | null; isAutoTracked: boolean } {
  if (!rawDescription) {
    return { goalType: "manual", cleanDescription: null, isAutoTracked: false };
  }

  const trimmed = rawDescription.trim();
  if (!trimmed.startsWith(GOAL_META_PREFIX)) {
    return {
      goalType: "manual",
      cleanDescription: trimmed || null,
      isAutoTracked: false,
    };
  }

  const closingIndex = trimmed.indexOf("]]");
  if (closingIndex === -1) {
    return {
      goalType: "manual",
      cleanDescription: trimmed,
      isAutoTracked: false,
    };
  }

  const metadata = trimmed.slice(GOAL_META_PREFIX.length, closingIndex);
  const cleanDescription = trimmed.slice(closingIndex + 2).trim() || null;
  const parsedType = metadata.replace("type=", "").trim() as GoalType;
  const goalType = GOAL_TYPE_OPTIONS.some((option) => option.value === parsedType)
    ? parsedType
    : "manual";

  return {
    goalType,
    cleanDescription,
    isAutoTracked: goalType !== "manual",
  };
}

export function buildGoalMetricsSummary(
  progress: UserProgressResponse[],
  enrollments: EnrollmentResponse[],
  profile: GamificationProfileResponse | null
): GoalMetricsSummary {
  const lessonsCompleted = progress.filter((entry) => entry.status === "completed").length;
  const coursesCompleted = enrollments.filter((entry) => entry.status === "completed").length;
  const studyMinutes = Math.max(
    0,
    Math.round(progress.reduce((total, entry) => total + (entry.time_spent || 0), 0) / 60)
  );

  return {
    lessonsCompleted,
    coursesCompleted,
    studyMinutes,
    totalXp: profile?.xp.total || 0,
    currentStreak: profile?.streak.current_streak || 0,
  };
}

export function getGoalTypeLabel(goalType: GoalType): string {
  return GOAL_TYPE_LABELS[goalType];
}

export function getGoalTypeUnit(goalType: GoalType): string {
  return GOAL_TYPE_UNITS[goalType];
}

export function getGoalMetricValue(goalType: GoalType, metrics: GoalMetricsSummary, fallback: number): number {
  switch (goalType) {
    case "lessons_completed":
      return metrics.lessonsCompleted;
    case "courses_completed":
      return metrics.coursesCompleted;
    case "study_minutes":
      return metrics.studyMinutes;
    case "xp_earned":
      return metrics.totalXp;
    case "streak_days":
      return metrics.currentStreak;
    default:
      return fallback;
  }
}

export function getGoalHealth(goal: Goal, progress: number): GoalHealth {
  if (progress >= goal.target_count || goal.status === "completed") {
    return "completed";
  }

  if (!goal.target_date) {
    return "on_track";
  }

  const today = new Date();
  const deadline = new Date(goal.target_date);
  today.setHours(0, 0, 0, 0);
  deadline.setHours(0, 0, 0, 0);

  const daysRemaining = Math.ceil((deadline.getTime() - today.getTime()) / 86400000);
  const completionRate = progress / Math.max(goal.target_count, 1);

  if (daysRemaining < 0) {
    return "overdue";
  }

  if ((daysRemaining <= 2 && completionRate < 0.7) || (daysRemaining <= 5 && completionRate < 0.4)) {
    return "at_risk";
  }

  return "on_track";
}

export function getGoalNextAction(goalType: GoalType, remaining: number): string {
  const safeRemaining = Math.max(remaining, 0);
  switch (goalType) {
    case "lessons_completed":
      return `Complete ${safeRemaining} more lesson${safeRemaining === 1 ? "" : "s"} to hit this goal.`;
    case "courses_completed":
      return `Finish ${safeRemaining} more course${safeRemaining === 1 ? "" : "s"} to close this goal.`;
    case "study_minutes":
      return `Schedule ${safeRemaining} more study minute${safeRemaining === 1 ? "" : "s"} to stay on track.`;
    case "xp_earned":
      return `Earn ${safeRemaining} more XP through lessons, completions, or streaks.`;
    case "streak_days":
      return `Keep showing up for ${safeRemaining} more day${safeRemaining === 1 ? "" : "s"} in a row.`;
    default:
      return "Update this goal when you complete the next meaningful step.";
  }
}

export function buildGoalInsight(goal: Goal, metrics: GoalMetricsSummary): GoalInsight {
  const { goalType, cleanDescription, isAutoTracked } = parseGoalDescription(goal.description);
  const currentProgress = getGoalMetricValue(goalType, metrics, goal.progress);
  const completionRate = Math.min(
    Math.round((currentProgress / Math.max(goal.target_count, 1)) * 1000) / 10,
    100
  );
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
      : "Manual goal: update progress yourself when you complete a milestone.",
    unitLabel: getGoalTypeUnit(goalType),
    nextAction: getGoalNextAction(goalType, remaining),
  };
}

export function buildGoalReminder(goals: Goal[], metrics: GoalMetricsSummary): GoalReminder | null {
  const activeGoals = goals
    .map((goal) => ({ goal, insight: buildGoalInsight(goal, metrics) }))
    .filter(({ insight }) => insight.health !== "completed");

  if (activeGoals.length === 0) {
    return null;
  }

  activeGoals.sort((left, right) => {
    const priorityScore = (health: GoalHealth) => {
      if (health === "overdue") return 0;
      if (health === "at_risk") return 1;
      return 2;
    };

    const leftPriority = priorityScore(left.insight.health);
    const rightPriority = priorityScore(right.insight.health);
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    if (left.goal.target_date && right.goal.target_date) {
      return new Date(left.goal.target_date).getTime() - new Date(right.goal.target_date).getTime();
    }

    if (left.goal.target_date) return -1;
    if (right.goal.target_date) return 1;
    return left.insight.remaining - right.insight.remaining;
  });

  const focus = activeGoals[0];
  const priority: GoalPriority =
    focus.insight.health === "overdue"
      ? "high"
      : focus.insight.health === "at_risk"
        ? "medium"
        : "low";

  const ctaHref =
    focus.insight.goalType === "lessons_completed" ||
    focus.insight.goalType === "courses_completed" ||
    focus.insight.goalType === "study_minutes" ||
    focus.insight.goalType === "xp_earned"
      ? routes.courses
      : routes.goals;

  return {
    goalId: focus.goal.id,
    title: focus.goal.title,
    message:
      focus.insight.health === "overdue"
        ? `This goal is overdue. ${focus.insight.nextAction}`
        : focus.insight.health === "at_risk"
          ? `This goal needs attention. ${focus.insight.nextAction}`
          : focus.insight.nextAction,
    ctaLabel: ctaHref === routes.courses ? "Continue Learning" : "Open Goals",
    ctaHref,
    priority,
  };
}
