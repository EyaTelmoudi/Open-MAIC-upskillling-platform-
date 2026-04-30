"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users } from "lucide-react";

import { routes } from "@/app/lib/routes";
import { cn } from "@/app/lib/utils";

const teamManagerNavItems = [
  {
    label: "Teams Workspace",
    description: "Company teams, members, and assignments",
    icon: Users,
    href: routes.teamManagerTeams,
  },
];

export function TeamManagerSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-[76px] flex h-[calc(100vh-76px)] w-[292px] shrink-0 flex-col border-r border-border bg-[radial-gradient(circle_at_top,rgba(20,184,166,0.12),transparent_24%),linear-gradient(180deg,rgba(241,251,247,0.97)_0%,rgba(232,246,247,0.95)_54%,rgba(226,238,243,0.97)_100%)] backdrop-blur-sm">
      <nav className="flex-1 overflow-y-auto px-4 py-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-[0.24em] text-text-secondary">
          Team Operations
        </p>
        <div className="space-y-2">
          {teamManagerNavItems.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-start gap-3 rounded-2xl border px-4 py-3 transition-all",
                  isActive
                    ? "border-primary/25 bg-[linear-gradient(135deg,rgba(15,159,119,0.16),rgba(20,184,166,0.1))] shadow-[0_18px_36px_rgba(15,23,42,0.08)]"
                    : "border-transparent hover:border-border hover:bg-white/42"
                )}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                    isActive
                      ? "bg-primary/12 text-primary"
                      : "bg-white/42 text-text-secondary group-hover:text-text-primary"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <p className={cn("text-sm font-semibold", isActive ? "text-text-primary" : "text-text-secondary")}>
                    {item.label}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-text-secondary">
                    {item.description}
                  </p>
                </div>
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
