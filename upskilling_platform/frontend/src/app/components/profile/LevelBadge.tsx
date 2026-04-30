interface LevelBadgeProps {
  level: number;
  size?: "sm" | "md" | "lg";
}

const sizeMap = {
  sm: { container: "w-10 h-10", text: "text-xs" },
  md: { container: "w-14 h-14", text: "text-sm" },
  lg: { container: "w-20 h-20", text: "text-xl" },
};

export function LevelBadge({ level, size = "lg" }: LevelBadgeProps) {
  const { container, text } = sizeMap[size];

  return (
    <div
      className={`relative ${container} flex items-center justify-center`}
      style={{ filter: "drop-shadow(0 0 8px rgba(245, 158, 11, 0.4))" }}
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <polygon
          points="50,3 93,25 93,75 50,97 7,75 7,25"
          fill="url(#goldGradient)"
          stroke="#F59E0B"
          strokeWidth="2"
        />
        <defs>
          <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#F59E0B" />
            <stop offset="50%" stopColor="#F59E0B" />
            <stop offset="100%" stopColor="#FBBF24" />
          </linearGradient>
        </defs>
      </svg>
      <span className={`relative font-bold text-gray-900 ${text}`}>
        {level}
      </span>
    </div>
  );
}
