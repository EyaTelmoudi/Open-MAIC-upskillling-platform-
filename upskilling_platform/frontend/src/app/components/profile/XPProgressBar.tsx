interface XPProgressBarProps {
  currentXP: number;
  maxXP: number;
  level: number;
}

export function XPProgressBar({ currentXP, maxXP, level }: XPProgressBarProps) {
  const percentage = Math.min((currentXP / maxXP) * 100, 100);

  return (
    <div className="w-full max-w-xs">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="font-mono text-text-secondary">
          Level {level}
        </span>
        <span className="font-mono text-text-secondary">
          {currentXP.toLocaleString()} / {maxXP.toLocaleString()} XP
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: `${percentage}%`,
            background: "linear-gradient(90deg, #10B981 0%, #22C55E 68%, #F59E0B 100%)",
          }}
        />
      </div>
    </div>
  );
}
