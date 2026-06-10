"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  BookOpen,
  ShieldAlert,
  TrendingUp,
  Users,
} from "lucide-react";

import { AppShell } from "@/app/components/layout/AppShell";
import { useAuth } from "@/app/context/AuthContext";
import {
  getTeam,
  getTeamActivity,
  getTeamProgress,
  getTeams,
  Team,
  TeamActivityItem,
  TeamProgress,
} from "@/app/lib/api";
import { formatDateForUser, formatDateOnlyForUser } from "@/app/lib/user-date-format";

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
}

export default function MyTeamPage() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [progress, setProgress] = useState<TeamProgress | null>(null);
  const [activity, setActivity] = useState<TeamActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const isManagementRole = useMemo(
    () => new Set(["Admin", "Manager", "TeamManager", "SuperAdmin"]).has(user?.role || ""),
    [user?.role]
  );

  useEffect(() => {
    void loadTeams();
  }, []);

  useEffect(() => {
    if (!selectedTeamId) return;
    void loadTeamDetails(selectedTeamId);
  }, [selectedTeamId]);

  async function loadTeams() {
    try {
      setLoading(true);
      const data = await getTeams();
      setTeams(data);
      if (data.length > 0) {
        setSelectedTeamId(data[0].id);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load your team");
    } finally {
      setLoading(false);
    }
  }

  async function loadTeamDetails(teamId: string) {
    try {
      const [teamData, progressData, activityData] = await Promise.all([
        getTeam(teamId),
        getTeamProgress(teamId),
        getTeamActivity(teamId),
      ]);
      setSelectedTeam(teamData);
      setProgress(progressData);
      setActivity(activityData);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team details");
    }
  }

  const summary = useMemo(() => {
    const members = progress?.members || [];
    return {
      memberCount: selectedTeam?.member_count || members.length || 0,
      assignedCourses: members.reduce((sum, member) => sum + member.courses_assigned, 0),
      completedCourses: members.reduce((sum, member) => sum + member.courses_completed, 0),
      inProgressCourses: members.reduce((sum, member) => sum + member.courses_in_progress, 0),
    };
  }, [progress, selectedTeam]);

  if (loading) {
    return (
      <AppShell>
        <div className="mx-auto max-w-[1440px]">
          <div className="flex min-h-[280px] items-center justify-center rounded-[28px] border border-white/70 bg-white/80 text-sm font-medium text-slate-500 shadow-[0_20px_48px_rgba(14,163,122,0.1)] backdrop-blur">
            Loading your team space...
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-[1440px] space-y-6">
        <section className="overflow-hidden rounded-[30px] border border-emerald-300/55 bg-[radial-gradient(circle_at_12%_18%,_rgba(52,211,153,0.46),_transparent_30%),radial-gradient(circle_at_76%_14%,_rgba(14,165,233,0.42),_transparent_28%),radial-gradient(circle_at_88%_82%,_rgba(242,165,27,0.24),_transparent_24%),linear-gradient(135deg,_#063B35_0%,_#075E63_42%,_#0B315F_72%,_#101827_100%)] px-6 py-7 text-white shadow-[0_30px_80px_rgba(6,78,59,0.36)] sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100/85">
                My Team
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-[2.25rem]">
                Team Space
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50 sm:text-base">
                See the team you belong to, follow member progress, and keep up with recent activity.
              </p>
            </div>
            {selectedTeam && (
              <div className="min-w-[260px] rounded-[24px] border border-white/30 bg-white/16 p-4 shadow-[0_20px_48px_rgba(6,78,59,0.18)] backdrop-blur">
                <div className="rounded-2xl border border-white/60 bg-white/88 px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
                  <div className="mb-3 h-1.5 w-10 rounded-full bg-emerald-500" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    Current team
                  </p>
                  <p className="mt-2 truncate text-lg font-semibold text-slate-950">
                    {selectedTeam.name}
                  </p>
                </div>
              </div>
            )}
          </div>
        </section>

        {error && (
          <div className="rounded-[24px] border border-red-200 bg-red-50/90 px-5 py-4 text-sm font-medium text-red-700 shadow-[0_18px_40px_rgba(239,68,68,0.08)]">
            {error}
          </div>
        )}

        {teams.length === 0 ? (
          <div className="overflow-hidden rounded-[28px] border border-dashed border-teal-200 bg-[radial-gradient(circle_at_18%_18%,rgba(34,199,180,0.18),transparent_30%),radial-gradient(circle_at_86%_12%,rgba(14,165,233,0.16),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(240,253,250,0.9),rgba(224,242,254,0.76))] px-6 py-12 text-center shadow-[0_22px_54px_rgba(14,163,122,0.1)] backdrop-blur">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0ea37a,#22c7b4,#0ea5e9)] text-white shadow-[0_16px_34px_rgba(14,163,122,0.24)]">
              <Users className="h-8 w-8" />
            </div>
            <h2 className="mt-5 text-xl font-semibold text-slate-950">No Team Yet</h2>
            <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-slate-600">
              You are not assigned to a team yet. Once your admin or team manager adds you to a team, it will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid gap-4 xl:grid-cols-3">
              {teams.map((team) => (
                <button
                  key={team.id}
                  onClick={() => setSelectedTeamId(team.id)}
                  className={`rounded-[24px] border p-5 text-left shadow-[0_14px_34px_rgba(15,23,42,0.05)] transition-all ${
                    selectedTeamId === team.id
                      ? "border-emerald-300 bg-[linear-gradient(135deg,rgba(236,253,245,0.96),rgba(224,242,254,0.82))] shadow-[0_18px_40px_rgba(14,163,122,0.14)]"
                      : "border-slate-200/80 bg-white/82 hover:-translate-y-0.5 hover:border-emerald-200 hover:bg-white"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-slate-950">{team.name}</p>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {team.description || "No team description provided."}
                      </p>
                    </div>
                    <span className="shrink-0 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-semibold text-emerald-700">
                      {team.member_count || 0} members
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {selectedTeam && (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-emerald-200/70 bg-white/86 p-5 shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
                    <div className="mb-3 h-1.5 w-10 rounded-full bg-emerald-500" />
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Members</p>
                    <p className="mt-3 text-3xl font-semibold text-slate-950">{summary.memberCount}</p>
                  </div>
                  <div className="rounded-2xl border border-cyan-200/70 bg-white/86 p-5 shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
                    <div className="mb-3 h-1.5 w-10 rounded-full bg-cyan-500" />
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Assigned Courses</p>
                    <p className="mt-3 text-3xl font-semibold text-slate-950">{summary.assignedCourses}</p>
                  </div>
                  <div className="rounded-2xl border border-emerald-200/70 bg-white/86 p-5 shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
                    <div className="mb-3 h-1.5 w-10 rounded-full bg-emerald-500" />
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">Completed</p>
                    <p className="mt-3 text-3xl font-semibold text-emerald-700">{summary.completedCourses}</p>
                  </div>
                  <div className="rounded-2xl border border-amber-200/70 bg-white/86 p-5 shadow-[0_14px_32px_rgba(15,23,42,0.05)]">
                    <div className="mb-3 h-1.5 w-10 rounded-full bg-gold" />
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-slate-500">In Progress</p>
                    <p className="mt-3 text-3xl font-semibold text-amber-600">{summary.inProgressCourses}</p>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
                  <div className="rounded-3xl border border-border bg-card p-6">
                    <div className="flex items-center gap-2">
                      <Users className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-semibold text-text-primary">Team Roster</h2>
                    </div>
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                      {(selectedTeam.memberships || []).map((membership) => (
                        <div
                          key={membership.user_id}
                          className="rounded-2xl border border-border bg-background p-4"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/15 text-sm font-semibold text-primary">
                              {getInitials(membership.user_name || "Unknown user")}
                            </div>
                            <div className="min-w-0">
                              <p className="truncate font-medium text-text-primary">
                                {membership.user_name || "Unknown user"}
                              </p>
                              <p className="text-sm text-text-secondary">{membership.role}</p>
                            </div>
                          </div>
                          <p className="mt-3 text-xs text-text-secondary">
                            Joined {formatDateOnlyForUser(membership.joined_at, user?.timezone)}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border bg-card p-6">
                    <div className="flex items-center gap-2">
                      <TrendingUp className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-semibold text-text-primary">Progress Snapshot</h2>
                    </div>
                    <div className="mt-5 space-y-3">
                      {(progress?.members || []).map((member) => (
                        <div key={member.user_id} className="rounded-2xl border border-border bg-background p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="font-medium text-text-primary">{member.user_name}</p>
                            <span className="text-sm font-semibold text-primary">{member.completion_rate}%</span>
                          </div>
                          <div className="mt-3 h-2 rounded-full bg-card">
                            <div
                              className="h-2 rounded-full bg-primary transition-all"
                              style={{ width: `${Math.max(member.completion_rate, 4)}%` }}
                            />
                          </div>
                          <p className="mt-3 text-xs text-text-secondary">
                            {member.courses_completed} completed • {member.courses_in_progress} in progress • {member.courses_assigned} assigned
                          </p>
                        </div>
                      ))}
                      {(progress?.members || []).length === 0 && (
                        <p className="text-sm text-text-secondary">
                          Progress details will appear here once your team has active enrollments.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                  <div className="rounded-3xl border border-border bg-card p-6">
                    <div className="flex items-center gap-2">
                      <BookOpen className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-semibold text-text-primary">Team Summary</h2>
                    </div>
                    <div className="mt-5 space-y-4 text-sm text-text-secondary">
                      <div className="rounded-2xl border border-border bg-background p-4">
                        <p className="font-medium text-text-primary">{selectedTeam.name}</p>
                        <p className="mt-1">
                          {selectedTeam.description || "No description was added for this team yet."}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-border bg-background p-4">
                        <p className="font-medium text-text-primary">What you can do here</p>
                        <ul className="mt-2 space-y-2">
                          <li>Follow who is in your team</li>
                          <li>Track shared course progress</li>
                          <li>Review recent team learning activity</li>
                        </ul>
                      </div>
                      {isManagementRole && (
                        <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4 text-primary">
                          You also have a management role. For editing teams, use the dedicated admin or team manager workspace from the sidebar.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-border bg-card p-6">
                    <div className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-primary" />
                      <h2 className="text-xl font-semibold text-text-primary">Recent Activity</h2>
                    </div>
                    <div className="mt-5 space-y-3">
                      {activity.map((item, index) => (
                        <div key={`${item.type}-${item.user_id}-${index}`} className="rounded-2xl border border-border bg-background p-4">
                          <p className="font-medium text-text-primary">{item.user_name}</p>
                          <p className="mt-1 text-sm text-text-secondary">{item.message}</p>
                          <p className="mt-3 text-xs text-text-secondary">
                            {formatDateForUser(item.timestamp, user?.timezone)}
                          </p>
                        </div>
                      ))}
                      {activity.length === 0 && (
                        <div className="rounded-2xl border border-border bg-background p-5 text-sm text-text-secondary">
                          No team activity has been recorded yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

        {user?.role === "SuperAdmin" && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive flex items-center gap-3">
            <ShieldAlert className="h-4 w-4" />
            Super Admin accounts are platform-level and are not expected to belong to tenant teams.
          </div>
        )}
      </div>
    </AppShell>
  );
}
