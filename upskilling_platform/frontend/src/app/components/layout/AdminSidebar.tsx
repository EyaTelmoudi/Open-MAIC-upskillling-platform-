"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bot,
  BookOpen,
  FileStack,
  PanelLeftClose,
  PanelLeftOpen,
  Users,
  Workflow,
} from "lucide-react";

import { useAuth } from "@/app/context/AuthContext";
import { routes } from "@/app/lib/routes";
import { cn } from "@/app/lib/utils";

const adminNavItems = [
  {
    label: "Users",
    description: "People, roles, invitations",
    icon: Users,
    href: routes.adminUsers,
  },
  {
    label: "Courses",
    description: "Authoring and publishing",
    icon: BookOpen,
    href: routes.adminCourses,
  },
  {
    label: "Content",
    description: "Course media and files",
    icon: FileStack,
    href: routes.adminContent,
  },
  {
    label: "Teams",
    description: "Team structure and assignments",
    icon: Workflow,
    href: routes.adminTeams,
  },
];

export function AdminSidebar({
  isCompact,
  onToggleCompact,
}: {
  isCompact: boolean;
  onToggleCompact: () => void;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isLearningExpert = user?.role === "LearningExpert";
  const visibleNavItems = isLearningExpert
    ? [
        {
          label: "AI Course Studio",
          description: "AI authoring workspace",
          icon: Bot,
          href: routes.adminAiCourseStudio,
        },
        {
          label: "Course Management",
          description: "Authoring and publishing",
          icon: BookOpen,
          href: routes.adminCourses,
        },
      ]
    : adminNavItems;

  return (
    <aside
      className={cn(
        "sticky top-[76px] flex h-[calc(100vh-76px)] shrink-0 flex-col border-r border-border bg-[radial-gradient(circle_at_top,rgba(14,163,122,0.18),transparent_26%),radial-gradient(circle_at_20%_78%,rgba(242,165,27,0.1),transparent_18%),linear-gradient(180deg,rgba(238,251,245,0.98)_0%,rgba(227,245,245,0.96)_54%,rgba(219,233,241,0.98)_100%)] backdrop-blur-sm transition-[width] duration-200",
        isCompact ? "w-[88px]" : "w-[292px]"
      )}
    >
      <div className={cn("shrink-0 border-b border-border/70", isCompact ? "px-3 py-4" : "px-4 py-4")}>
        <div className={cn("flex items-center", isCompact ? "justify-center" : "justify-between gap-3")}>
          {!isCompact ? (
            <p className="px-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-700">
              {isLearningExpert ? "Learning Operations" : "Administration"}
            </p>
          ) : null}
          <button
            type="button"
            onClick={onToggleCompact}
            className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-white/78 text-slate-700 shadow-sm transition-colors hover:bg-white hover:text-slate-950"
            aria-label={isCompact ? "Expand sidebar" : "Collapse sidebar"}
            title={isCompact ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCompact ? (
              <PanelLeftOpen className="h-4 w-4" />
            ) : (
              <PanelLeftClose className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>

      <nav
        className={cn(
          "flex-1 overflow-y-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden",
          isCompact ? "px-3 py-4" : "px-4 py-5"
        )}
      >
        <div className="space-y-2">
          {visibleNavItems.map((item) => {
            const isActive =
              pathname === item.href ||
              pathname.startsWith(item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex rounded-2xl border transition-all",
                  isCompact ? "justify-center px-2 py-3" : "items-start gap-3 px-4 py-3",
                  isActive
                    ? "border-primary/25 bg-[linear-gradient(135deg,rgba(14,163,122,0.18),rgba(34,199,180,0.12),rgba(242,165,27,0.08))] shadow-[0_18px_36px_rgba(15,23,42,0.08)]"
                    : "border-transparent hover:border-border hover:bg-white/42"
                )}
                title={isCompact ? item.label : undefined}
              >
                <div
                  className={cn(
                    "mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors",
                    isActive
                      ? "bg-primary/12 text-primary"
                    : "bg-white/42 text-slate-600 group-hover:text-slate-900"
                  )}
                >
                  <item.icon className="h-5 w-5" />
                </div>
                {!isCompact ? (
                  <div className="min-w-0">
                    <p className={cn("text-sm font-semibold", isActive ? "text-slate-950" : "text-slate-800")}>
                      {item.label}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-600">
                      {item.description}
                    </p>
                  </div>
                ) : null}
              </Link>
            );
          })}
        </div>
      </nav>
    </aside>
  );
}
