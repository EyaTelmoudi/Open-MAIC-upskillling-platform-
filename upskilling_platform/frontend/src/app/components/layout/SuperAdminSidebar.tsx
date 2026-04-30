"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  BookOpen,
  Building2,
  FileText,
  LayoutDashboard,
  Settings,
  Users,
} from "lucide-react";

import { routes } from "@/app/lib/routes";
import { cn } from "@/app/lib/utils";

const superAdminNavItems = [
  {
    label: "Overview",
    description: "Platform control center",
    icon: LayoutDashboard,
    href: routes.superadmin,
  },
  {
    label: "Companies",
    description: "Tenants and activation",
    icon: Building2,
    href: routes.superadminTenants,
  },
  {
    label: "Users & Admins",
    description: "Platform identities and tenant admin assignment",
    icon: Users,
    href: routes.superadminUsers,
  },
  {
    label: "Platform Courses",
    description: "Cross-tenant course catalog",
    icon: BookOpen,
    href: routes.superadminCourses,
  },
  {
    label: "Analytics",
    description: "Governance and growth metrics",
    icon: BarChart3,
    href: routes.superadminAnalytics,
  },
  {
    label: "Audit Log",
    description: "Platform change history",
    icon: FileText,
    href: routes.superadminAudit,
  },
  {
    label: "Settings",
    description: "Platform-wide configuration",
    icon: Settings,
    href: routes.superadminSettings,
  },
];

export function SuperAdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-[76px] flex h-[calc(100vh-76px)] w-[300px] shrink-0 flex-col border-r border-border bg-[radial-gradient(circle_at_top,rgba(59,130,246,0.12),transparent_24%),linear-gradient(180deg,rgba(241,251,247,0.97)_0%,rgba(232,246,247,0.95)_54%,rgba(226,238,243,0.97)_100%)] backdrop-blur-sm">
      <nav className="flex-1 overflow-y-auto px-4 py-5 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        <p className="mb-3 px-2 text-xs font-semibold uppercase tracking-[0.24em] text-slate-700">
          Workspace
        </p>
        <div className="space-y-2">
          {superAdminNavItems.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== routes.superadmin && pathname.startsWith(item.href));

            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "group flex items-start gap-3 rounded-2xl border px-4 py-3 transition-all",
                  isActive
                    ? "border-primary/25 bg-[linear-gradient(135deg,rgba(15,159,119,0.14),rgba(59,130,246,0.1))] shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
                    : "border-transparent bg-transparent hover:border-border hover:bg-white/42"
                )}
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
                <div className="min-w-0">
                  <p
                    className={cn(
                      "text-sm font-semibold",
                      isActive ? "text-slate-950" : "text-slate-800"
                    )}
                  >
                    {item.label}
                  </p>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
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
