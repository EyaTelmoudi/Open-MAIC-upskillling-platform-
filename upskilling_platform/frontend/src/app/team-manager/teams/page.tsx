"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ChevronRight, Search, Trash2, Users } from "lucide-react";

import { TeamManagerTeamsNav } from "@/app/team-manager/teams/TeamManagerTeamsNav";
import { TeamManagerShell } from "@/app/components/layout/TeamManagerShell";
import { Input } from "@/app/components/ui/Input";
import { useAuth } from "@/app/context/AuthContext";
import { deleteTeam, getTeams, type Team } from "@/app/lib/api";
import { routes } from "@/app/lib/routes";

export default function TeamManagerTeamsPage() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [error, setError] = useState<string | null>(null);

  const canManageTeams = user?.role === "TeamManager";

  useEffect(() => {
    if (canManageTeams) {
      void loadTeams();
    } else {
      setLoading(false);
    }
  }, [canManageTeams]);

  async function loadTeams() {
    try {
      setLoading(true);
      setError(null);
      const teamsData = await getTeams();
      setTeams(teamsData);
    } catch (err) {
      console.error("Failed to load teams:", err);
      setError(err instanceof Error ? err.message : "Failed to load teams.");
    } finally {
      setLoading(false);
    }
  }

  async function handleDeleteTeam(teamId: string) {
    if (!confirm("Are you sure you want to delete this team?")) return;
    try {
      await deleteTeam(teamId);
      await loadTeams();
    } catch (err) {
      console.error("Failed to delete team:", err);
      setError(err instanceof Error ? err.message : "Failed to delete team.");
    }
  }

  const filteredTeams = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) {
      return teams;
    }
    return teams.filter((team) =>
      [team.name, team.description || ""].some((value) =>
        value.toLowerCase().includes(needle)
      )
    );
  }, [search, teams]);

  if (!canManageTeams) {
    return (
      <TeamManagerShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="text-center">
            <AlertCircle className="mx-auto h-12 w-12 text-rose-600" />
            <h1 className="mt-4 text-xl font-semibold text-slate-950">Access Denied</h1>
            <p className="mt-2 text-slate-600">
              Only Team Managers can manage company teams here.
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

        <div className="flex justify-end">
          <div className="relative w-full max-w-xs">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search teams"
              className="h-9 rounded-xl border-slate-200 bg-white pl-9 text-sm text-slate-900 shadow-sm placeholder:text-slate-400"
            />
          </div>
        </div>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center text-slate-500 shadow-sm">
            Loading teams...
          </div>
        ) : filteredTeams.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center shadow-sm">
            <Users className="mx-auto mb-4 h-12 w-12 text-slate-300" />
            <p className="text-lg font-medium text-slate-950">
              {teams.length === 0 ? "No teams yet" : "No matching teams"}
            </p>
            <p className="mt-2 text-sm text-slate-500">
              {teams.length === 0
                ? "Create your first team for this company workspace."
                : "Adjust the search term to find another team."}
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredTeams.map((team) => (
              <div
                key={team.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-colors hover:border-emerald-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-slate-950">
                      {team.name}
                    </h2>
                    <p className="mt-1 line-clamp-2 text-sm text-slate-500">
                      {team.description || "No team description provided yet."}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleDeleteTeam(team.id)}
                    className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700"
                    aria-label={`Delete ${team.name}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="mt-5 flex items-center gap-2 text-sm text-slate-600">
                  <Users className="h-4 w-4 text-emerald-700" />
                  <span>{team.member_count || 0} member(s)</span>
                </div>

                <div className="mt-5 flex gap-3">
                  <Link
                    href={routes.teamManagerTeamDetail(team.id)}
                    className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-900"
                  >
                    Open Team
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </TeamManagerShell>
  );
}
