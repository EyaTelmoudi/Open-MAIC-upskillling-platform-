"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, FilePenLine, PlusCircle } from "lucide-react";

import { routes } from "@/app/lib/routes";

export function CompaniesManagementNav({
  editHref,
  editLabel = "Current company settings",
}: {
  editHref?: string;
  editLabel?: string;
}) {
  const pathname = usePathname();
  const isCompaniesActive = pathname === routes.superadminTenants;
  const isCreateActive = pathname === routes.superadminTenantNew;
  const isEditActive = Boolean(editHref && pathname === editHref);

  const itemClassName = (active: boolean) =>
    [
      "flex min-w-0 items-center gap-3 rounded-2xl px-4 py-3 text-left transition",
      active
        ? "bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(59,130,246,0.1))] text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
        : "text-slate-600 hover:bg-slate-50 hover:text-slate-950",
    ].join(" ");

  const iconClassName = (active: boolean) =>
    [
      "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
      active ? "bg-white text-emerald-700" : "bg-slate-100 text-slate-600",
    ].join(" ");
  const editContent = (
    <>
      <span className={iconClassName(isEditActive)}>
        <FilePenLine className="h-5 w-5" />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">Edit Company</span>
        <span className="mt-1 block truncate text-xs text-slate-500">{editLabel}</span>
      </span>
    </>
  );

  return (
    <nav className="mb-6 rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
      <div className="grid gap-3 lg:grid-cols-3">
        <Link href={routes.superadminTenants} className={itemClassName(isCompaniesActive)}>
          <span className={iconClassName(isCompaniesActive)}>
            <Building2 className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Companies</span>
            <span className="mt-1 block text-xs text-slate-500">
              Browse and manage created companies
            </span>
          </span>
        </Link>

        <Link href={routes.superadminTenantNew} className={itemClassName(isCreateActive)}>
          <span className={iconClassName(isCreateActive)}>
            <PlusCircle className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Create New Company</span>
            <span className="mt-1 block text-xs text-slate-500">
              Add a new company workspace
            </span>
          </span>
        </Link>

        {editHref ? (
          <Link href={editHref} className={itemClassName(isEditActive)}>
            {editContent}
          </Link>
        ) : (
          <div className={`${itemClassName(false)} cursor-not-allowed opacity-60`} aria-disabled="true">
            {editContent}
          </div>
        )}
      </div>
    </nav>
  );
}
