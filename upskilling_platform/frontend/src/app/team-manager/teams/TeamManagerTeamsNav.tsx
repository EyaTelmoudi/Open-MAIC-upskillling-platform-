"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { FilePenLine, PlusCircle, Workflow } from "lucide-react";

import { routes } from "@/app/lib/routes";

type TeamManagerTeamsNavProps = {
  detailHref?: string;
  detailLabel?: string;
};

export function TeamManagerTeamsNav({
  detailHref,
  detailLabel = "Choose a team from the list",
}: TeamManagerTeamsNavProps) {
  const pathname = usePathname();
  const isTeamsActive = pathname === routes.teamManagerTeams;
  const isCreateActive = pathname === routes.teamManagerTeamNew;
  const isDetailsActive = Boolean(detailHref && pathname === detailHref);

  const itemClassName = (active: boolean, disabled = false) =>
    [
      "flex min-w-0 items-center gap-3 rounded-2xl px-4 py-3 text-left transition",
      active
        ? "bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(59,130,246,0.1))] text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
        : "text-slate-600",
      disabled ? "cursor-not-allowed opacity-60" : "hover:bg-slate-50 hover:text-slate-950",
    ].join(" ");

  const iconClassName = (active: boolean) =>
    [
      "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
      active ? "bg-white text-emerald-700" : "bg-slate-100 text-slate-600",
    ].join(" ");

  return (
    <nav className="rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
      <div className="grid gap-3 lg:grid-cols-3">
        <Link href={routes.teamManagerTeams} className={itemClassName(isTeamsActive)}>
          <span className={iconClassName(isTeamsActive)}>
            <Workflow className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Teams</span>
            <span className="mt-1 block text-xs text-slate-500">Browse and manage all teams</span>
          </span>
        </Link>

        <Link href={routes.teamManagerTeamNew} className={itemClassName(isCreateActive)}>
          <span className={iconClassName(isCreateActive)}>
            <PlusCircle className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Create Team</span>
            <span className="mt-1 block text-xs text-slate-500">Add a team to a company workspace</span>
          </span>
        </Link>

        {detailHref ? (
          <Link href={detailHref} className={itemClassName(isDetailsActive)}>
            <span className={iconClassName(isDetailsActive)}>
              <FilePenLine className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Team Information</span>
              <span className="mt-1 block truncate text-xs text-slate-500">{detailLabel}</span>
            </span>
          </Link>
        ) : (
          <div className={itemClassName(false, true)} aria-disabled="true">
            <span className={iconClassName(false)}>
              <FilePenLine className="h-5 w-5" />
            </span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">Team Information</span>
              <span className="mt-1 block truncate text-xs text-slate-500">{detailLabel}</span>
            </span>
          </div>
        )}
      </div>
    </nav>
  );
}
