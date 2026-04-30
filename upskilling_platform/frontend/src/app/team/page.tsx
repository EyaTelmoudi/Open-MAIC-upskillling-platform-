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
        <div className="rounded-3xl border border-border bg-card p-8 text-text-secondary">
          Loading your team space...
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="rounded-3xl border border-border bg-card p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
            My Team
          </p>
          <div className="mt-2 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h1 className="text-3xl font-semibold text-text-primary">
                Team Space
              </h1>
              <p className="mt-1 text-text-secondary">
                See the team you belong to, follow member progress, and keep up with recent activity.
              </p>
            </div>
            {selectedTeam && (
              <div className="rounded-2xl border border-primary/20 bg-primary/10 px-4 py-3 text-sm text-primary">
                You are viewing <span className="font-semibold">{selectedTeam.name}</span>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
            {error}
          </div>
        )}

        {teams.length === 0 ? (
          <div className="rounded-3xl border border-border bg-card p-10 text-center">
            <Users className="mx-auto h-12 w-12 text-text-secondary" />
            <h2 className="mt-4 text-xl font-semibold text-text-primary">No Team Yet</h2>
            <p className="mt-2 max-w-xl mx-auto text-text-secondary">
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
                  className={`rounded-3xl border p-5 text-left transition-colors ${
                    selectedTeamId === team.id
                      ? "border-primary bg-primary/10"
                      : "border-border bg-card hover:border-primary/30"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-lg font-semibold text-text-primary">{team.name}</p>
                      <p className="mt-1 text-sm text-text-secondary">
                        {team.description || "No team description provided."}
                      </p>
                    </div>
                    <span className="rounded-full bg-background px-2 py-1 text-xs text-text-secondary">
                      {team.member_count || 0} members
                    </span>
                  </div>
                </button>
              ))}
            </div>

            {selectedTeam && (
              <>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <p className="text-xs uppercase tracking-[0.15em] text-text-secondary">Members</p>
                    <p className="mt-3 text-3xl font-semibold text-text-primary">{summary.memberCount}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <p className="text-xs uppercase tracking-[0.15em] text-text-secondary">Assigned Courses</p>
                    <p className="mt-3 text-3xl font-semibold text-text-primary">{summary.assignedCourses}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <p className="text-xs uppercase tracking-[0.15em] text-text-secondary">Completed</p>
                    <p className="mt-3 text-3xl font-semibold text-emerald-400">{summary.completedCourses}</p>
                  </div>
                  <div className="rounded-2xl border border-border bg-card p-5">
                    <p className="text-xs uppercase tracking-[0.15em] text-text-secondary">In Progress</p>
                    <p className="mt-3 text-3xl font-semibold text-primary">{summary.inProgressCourses}</p>
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
                            Joined {new Date(membership.joined_at).toLocaleDateString()}
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
                            {new Date(item.timestamp).toLocaleString()}
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
