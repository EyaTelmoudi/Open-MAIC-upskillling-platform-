import { useState } from "react";

interface HeatmapData {
  date: string;
  count: number;
}

interface ActivityHeatmapProps {
  data: HeatmapData[];
}

const WEEKS = 52;
const DAYS = 7;

function getColor(count: number): string {
  if (count === 0) return "bg-border/30";
  if (count === 1) return "bg-primary/20";
  if (count === 2) return "bg-primary/40";
  if (count === 3) return "bg-primary/60";
  return "bg-primary";
}

function generateEmptyHeatmapData(): HeatmapData[] {
  const data: HeatmapData[] = [];
  const today = new Date();
  for (let i = WEEKS * DAYS - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    data.push({
      date: date.toISOString().split("T")[0],
      count: 0,
    });
  }
  return data;
}

export function ActivityHeatmap({ data: propData }: ActivityHeatmapProps) {
  const generated = generateEmptyHeatmapData();
  const data =
    propData.length > 0
      ? generated.map((day, index) => ({
          ...day,
          count: propData[index]?.count ?? 0,
          date: propData[index]?.date ?? day.date,
        }))
      : generated;
  const [tooltip, setTooltip] = useState<{ date: string; count: number } | null>(null);

  const weeks: HeatmapData[][] = [];
  for (let w = 0; w < WEEKS; w++) {
    weeks.push(data.slice(w * DAYS, (w + 1) * DAYS));
  }

  return (
    <div className="relative">
      <div className="flex gap-[3px]">
        {weeks.map((week, wi) => (
          <div key={wi} className="flex flex-col gap-[3px]">
            {week.map((day, di) => (
              <div
                key={di}
                className={`h-[12px] w-[12px] rounded-[2px] ${getColor(day.count)} cursor-pointer transition-colors`}
                onMouseEnter={() => setTooltip(day)}
                onMouseLeave={() => setTooltip(null)}
              />
            ))}
          </div>
        ))}
      </div>
      {tooltip && (
        <div className="absolute bottom-full left-1/2 z-10 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-popover px-3 py-1.5 text-xs text-text-primary shadow-lg">
          {tooltip.count} activities on {tooltip.date}
        </div>
      )}
      <div className="mt-3 flex items-center gap-2 justify-end">
        <span className="text-[10px] text-text-secondary">Less</span>
        {[0, 1, 2, 3, 4].map((c) => (
          <div key={c} className={`h-[12px] w-[12px] rounded-[2px] ${getColor(c)}`} />
        ))}
        <span className="text-[10px] text-text-secondary">More</span>
      </div>
    </div>
  );
}
