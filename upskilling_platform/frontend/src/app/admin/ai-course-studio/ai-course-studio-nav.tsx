"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Layers3, Wand2 } from "lucide-react";

import { routes } from "@/app/lib/routes";

const navItems = [
  {
    href: routes.adminAiCourseStudio,
    label: "AI Course Studio",
    description: "Workspace overview",
    icon: Layers3,
    match: (pathname: string) => pathname === routes.adminAiCourseStudio,
  },
  {
    href: routes.adminAiCourseBuilder,
    label: "AI Course Builder",
    description: "Generate and review",
    icon: Wand2,
    match: (pathname: string) => pathname.startsWith(routes.adminAiCourseBuilder),
  },
];

export function AiCourseStudioNav() {
  const pathname = usePathname();

  return (
    <nav className="rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-3 lg:flex-row">
        {navItems.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 py-3 transition ${
                active
                  ? "bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(59,130,246,0.1))] text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
              }`}
            >
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                  active ? "bg-white text-emerald-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                <item.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{item.label}</div>
                <div className="text-xs text-slate-500">{item.description}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
