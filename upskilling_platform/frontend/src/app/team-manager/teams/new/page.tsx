"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { AlertCircle, Loader2, Plus } from "lucide-react";

import { TeamManagerTeamsNav } from "@/app/team-manager/teams/TeamManagerTeamsNav";
import { TeamManagerShell } from "@/app/components/layout/TeamManagerShell";
import { Button } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Input";
import { useAuth } from "@/app/context/AuthContext";
import { createTeam } from "@/app/lib/api";
import { routes } from "@/app/lib/routes";

export default function TeamManagerNewTeamPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canManageTeams = user?.role === "TeamManager";

  async function handleCreate() {
    if (!name.trim()) {
      setError("Team name is required.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);
      const team = await createTeam({
        name: name.trim(),
        description: description.trim() || undefined,
      });
      router.push(routes.teamManagerTeamDetail(team.id));
    } catch (err) {
      console.error("Failed to create team:", err);
      setError(err instanceof Error ? err.message : "Failed to create team.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!canManageTeams) {
    return (
      <TeamManagerShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-rose-600" />
            <h1 className="mt-4 text-xl font-semibold text-slate-950">Access Denied</h1>
            <p className="mt-2 text-slate-600">
              Only Team Managers can create teams here.
            </p>
          </div>
        </div>
      </TeamManagerShell>
    );
  }

  return (
    <TeamManagerShell>
      <div className="space-y-6">
        <TeamManagerTeamsNav />

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <section className="mx-auto max-w-5xl rounded-[2rem] border border-slate-200/80 bg-white/95 p-5 shadow-[0_24px_70px_rgba(15,23,42,0.1)] sm:p-6">
          <div className="space-y-5">
              <div className="grid gap-5">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Team Name
                  </label>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Engineering Team"
                    className="h-12 rounded-2xl border-slate-200 bg-white text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={5}
                    className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    placeholder="Describe the mission and structure of this team."
                  />
                </div>
              </div>

              <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
                <Link
                  href={routes.teamManagerTeams}
                  className="inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
                >
                  Cancel
                </Link>
                <Button
                  onClick={handleCreate}
                  disabled={isSubmitting}
                  className="min-h-11 rounded-xl bg-emerald-600 px-5 text-white hover:bg-emerald-700"
                >
                  {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  {isSubmitting ? "Creating..." : "Create Team"}
                </Button>
              </div>
          </div>
        </section>
      </div>
    </TeamManagerShell>
  );
}
