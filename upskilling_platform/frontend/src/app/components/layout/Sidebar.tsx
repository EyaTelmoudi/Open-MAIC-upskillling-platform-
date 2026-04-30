"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  BookOpen,
  Bookmark,
  Bot,
  Lightbulb,
  GitBranchPlus,
  Trophy,
  Users,
  Target,
  Award,
} from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import { routes } from "@/app/lib/routes";
import { cn } from "@/app/lib/utils";

const navItems = [
  { label: "Dashboard", icon: LayoutDashboard, href: routes.dashboard },
  { label: "Courses", icon: BookOpen, href: routes.courses },
  { label: "Bookmarks", icon: Bookmark, href: routes.bookmarks },
  { label: "Certificates", icon: Award, href: routes.certificates },
  { label: "AI Coach", icon: Bot, href: routes.coach },
  { label: "Recommendations", icon: Lightbulb, href: routes.recommendations },
  { label: "Skill Gap", icon: GitBranchPlus, href: routes.skillGap },
  { label: "Leaderboard", icon: Trophy, href: routes.leaderboard },
  { label: "My Team", icon: Users, href: routes.team },
  { label: "Goals", icon: Target, href: routes.goals },
];

export function Sidebar({
  isCompact,
}: {
  isCompact: boolean;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const isSuperAdmin = user?.role === "SuperAdmin";
  const hideLearnerDashboard =
    user?.role === "SuperAdmin" ||
    user?.role === "Admin" ||
    user?.role === "Manager" ||
    user?.role === "LearningExpert" ||
    user?.role === "TeamManager" ||
    user?.role === "TeamMember";
  const visibleNavItems = navItems.filter((item) => {
    if (hideLearnerDashboard && item.href === routes.dashboard) return false;
    if (isSuperAdmin && item.href === routes.team) return false;
    return true;
  });

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col overflow-hidden border-r border-border bg-[radial-gradient(circle_at_top,rgba(14,163,122,0.18),transparent_26%),radial-gradient(circle_at_18%_82%,rgba(242,165,27,0.1),transparent_18%),linear-gradient(180deg,rgba(238,251,245,0.98)_0%,rgba(227,245,245,0.96)_54%,rgba(219,233,241,0.98)_100%)] backdrop-blur-sm transition-[width] duration-200",
        isCompact ? "w-[88px]" : "w-[240px]"
      )}
    >
      <div
        className={cn(
          "shrink-0 py-4",
          isCompact ? "px-3" : "px-5"
        )}
      >
        {!isCompact && (
          <div className="px-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-primary/70">
              Learning Space
            </p>
          </div>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto px-3 pb-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <div className="space-y-1">
        {visibleNavItems.map((item) => {
          const isActive =
            pathname === item.href ||
            (
              item.href !== routes.dashboard &&
              pathname.startsWith(item.href)
            );
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex rounded-lg py-2.5 text-sm font-medium transition-colors",
                isCompact ? "justify-center px-2" : "items-center gap-3 px-3",
                isActive
                  ? "bg-[linear-gradient(135deg,rgba(14,163,122,0.18),rgba(34,199,180,0.12),rgba(242,165,27,0.08))] text-primary shadow-[0_10px_24px_rgba(14,163,122,0.12)]"
                  : "text-text-secondary hover:bg-white/60 hover:text-text-primary"
              )}
              title={isCompact ? item.label : undefined}
            >
              <item.icon className="h-5 w-5" />
              {!isCompact && item.label}
            </Link>
          );
        })}
        </div>
      </nav>
    </aside>
  );
}
