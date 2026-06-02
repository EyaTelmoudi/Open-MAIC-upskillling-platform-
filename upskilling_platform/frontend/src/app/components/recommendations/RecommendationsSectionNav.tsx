"use client";

import { Radar, Sparkles } from "lucide-react";
import { cn } from "@/app/lib/utils";

const navItems = [
  {
    label: "Overview",
    description: "At-a-glance summary",
    href: "#overview",
    icon: Sparkles,
  },
  {
    label: "Skill Gap",
    description: "Visual knowledge radar",
    href: "#skill-gap",
    icon: Radar,
  },
  {
    label: "Recommendations",
    description: "Next best learning actions",
    href: "#recommendations",
    icon: Sparkles,
  },
];

export function RecommendationsSectionNav() {
  return (
    <div className="rounded-3xl border border-border/70 bg-white/80 p-2 shadow-[0_18px_60px_rgba(15,23,42,0.08)] backdrop-blur">
      <div className="grid gap-2 md:grid-cols-3">
        {navItems.map((item) => {
          return (
            <a key={item.href} href={item.href} className="block">
              <div
                className={cn(
                  "flex items-center gap-3 rounded-2xl px-4 py-3 transition-all hover:-translate-y-0.5",
                  "bg-[linear-gradient(135deg,rgba(14,163,122,0.08),rgba(34,199,180,0.06),rgba(242,165,27,0.05))] text-text-primary hover:bg-[linear-gradient(135deg,rgba(14,163,122,0.16),rgba(34,199,180,0.1),rgba(242,165,27,0.08))]",
                )}
              >
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 shadow-sm">
                  <item.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{item.label}</p>
                  <p className="text-xs text-text-secondary">{item.description}</p>
                </div>
              </div>
            </a>
          );
        })}
      </div>
    </div>
  );
}
