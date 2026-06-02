"use client";

import {ShieldCheck, Sparkles, UsersRound} from "lucide-react";

export function UsersAdministrationHero() {
  return (
    <section className="overflow-hidden rounded-3xl border border-[#2A5B4A] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.22),_transparent_32%),radial-gradient(circle_at_76%_18%,_rgba(59,130,246,0.2),_transparent_26%),linear-gradient(135deg,_#102E2D_0%,_#132A3A_48%,_#0F172A_100%)] p-6 text-white shadow-[0_26px_70px_rgba(0,0,0,0.28)] sm:p-8">
      <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
        <UsersRound className="h-3.5 w-3.5" />
        Tenant Admin
      </div>
      <div className="mt-5 max-w-3xl">
        <div className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
          Company Workspace
        </div>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          User Administration
        </h1>
        <p className="mt-4 text-sm leading-7 text-slate-200 sm:text-base">
          Invite users, assign roles, manage departments, and control account access for your
          company.
        </p>
        <div className="mt-6 flex flex-wrap gap-3 text-xs font-medium text-emerald-100">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
            <UsersRound className="h-3.5 w-3.5" />
            Company user management
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
            <ShieldCheck className="h-3.5 w-3.5" />
            Role and access control
          </span>
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Department workspace organization
          </span>
        </div>
      </div>
    </section>
  );
}
