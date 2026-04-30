"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Plus, Users } from "lucide-react";

import { AdminShell } from "@/app/components/layout/AdminShell";
import { Button } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Input";
import { createTeam } from "@/app/lib/api";
import { routes } from "@/app/lib/routes";

export default function AdminNewTeamPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      router.push(routes.adminTeamDetail(team.id));
    } catch (err) {
      console.error("Failed to create team:", err);
      setError(err instanceof Error ? err.message : "Failed to create team.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="max-w-3xl rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Team Details</h2>
              <p className="text-sm text-slate-600">
                Start with the core information, then you can edit the team after creation.
              </p>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Team Name
              </label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Engineering Team"
                className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Description
              </label>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                rows={5}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                placeholder="Describe the mission and structure of this team."
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Link
              href={routes.adminTeams}
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
            >
              Cancel
            </Link>
            <Button onClick={handleCreate} disabled={isSubmitting}>
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {isSubmitting ? "Creating..." : "Create Team"}
            </Button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
