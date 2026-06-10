import {
  Brain,
  Flame,
  Lightbulb,
  Lock,
  Medal,
  MoonStar,
  Rocket,
  Sparkles,
  Sunrise,
  Trophy,
  UserRoundPlus,
  Zap,
} from "lucide-react";

interface AchievementBadgeProps {
  name: string;
  icon: string;
  tier: "bronze" | "silver" | "gold" | "platinum";
  unlocked: boolean;
  description?: string | null;
  unlockHint?: string | null;
}

const tierColors = {
  bronze: { bg: "bg-amber-700/20", border: "border-amber-700", text: "text-amber-600" },
  silver: { bg: "bg-gray-400/20", border: "border-gray-400", text: "text-gray-400" },
  gold: { bg: "bg-yellow-500/20", border: "border-yellow-500", text: "text-yellow-500" },
  platinum: { bg: "bg-purple-500/20", border: "border-purple-400", text: "text-purple-400" },
};

export function AchievementBadge({
  name,
  icon,
  tier,
  unlocked,
  description,
  unlockHint,
}: AchievementBadgeProps) {
  const colors = tierColors[tier];
  const helperText = unlocked
    ? description
    : unlockHint || description || "Complete the required activity to unlock this badge.";
  const renderIcon = () => {
    switch (name) {
      case "First Steps":
        return <Sparkles className="h-7 w-7" />;
      case "Quick Learner":
        return <Zap className="h-7 w-7" />;
      case "Course Crusher":
        return <Trophy className="h-7 w-7" />;
      case "Perfectionist":
        return <Medal className="h-7 w-7" />;
      case "Streak Master":
        return <Flame className="h-7 w-7" />;
      case "On Fire":
        return <Rocket className="h-7 w-7" />;
      case "Team Player":
        return <UserRoundPlus className="h-7 w-7" />;
      case "Top 10":
        return <Trophy className="h-7 w-7" />;
      case "Mentor":
        return <Brain className="h-7 w-7" />;
      case "Innovator":
        return <Lightbulb className="h-7 w-7" />;
      case "Night Owl":
        return <MoonStar className="h-7 w-7" />;
      case "Early Bird":
        return <Sunrise className="h-7 w-7" />;
      case "Legend":
        return <Trophy className="h-7 w-7" />;
      default:
        return <span className="text-2xl">{icon || "★"}</span>;
    }
  };

  return (
    <div
      title={helperText || undefined}
      className={`relative flex min-h-[132px] flex-col items-center gap-1 rounded-xl border p-3 transition-all ${
        unlocked
          ? `${colors.bg} ${colors.border}`
          : "border-slate-200 bg-slate-50/80"
      }`}
    >
      <div className={unlocked ? colors.text : "text-slate-400"}>
        {renderIcon()}
      </div>
      <span className={`text-center text-[10px] font-medium ${
        unlocked ? colors.text : "text-slate-500"
      }`}>
        {name}
      </span>
      <span className="mt-1 line-clamp-2 text-center text-[10px] leading-4 text-slate-500">
        {helperText}
      </span>
      {!unlocked ? (
        <span className="absolute right-2 top-2 rounded-full bg-white/90 p-1 text-slate-400 shadow-sm">
          <Lock className="h-3.5 w-3.5" />
        </span>
      ) : null}
    </div>
  );
}
