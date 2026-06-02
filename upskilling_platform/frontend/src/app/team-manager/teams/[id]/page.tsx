"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  Loader2,
  Save,
  Trash2,
  UserPlus,
  Users,
} from "lucide-react";

import { TeamManagerTeamsNav } from "@/app/team-manager/teams/TeamManagerTeamsNav";
import { TeamManagerShell } from "@/app/components/layout/TeamManagerShell";
import { Button } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Input";
import {
  addTeamMember,
  getTeam,
  getTeamAvailableUsers,
  getTeamProgress,
  removeTeamMember,
  updateTeam,
  type Team,
  type TeamAvailableUser,
  type TeamProgress,
} from "@/app/lib/api";
import { routes } from "@/app/lib/routes";

function formatDate(value?: string | null) {
  if (!value) {
    return "Unknown";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleDateString("en-GB");
}

export default function TeamManagerTeamDetailPage() {
  const params = useParams<{ id: string }>();
  const teamId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [team, setTeam] = useState<Team | null>(null);
  const [progress, setProgress] = useState<TeamProgress | null>(null);
  const [availableUsers, setAvailableUsers] = useState<TeamAvailableUser[]>([]);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [memberBusyId, setMemberBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadTeamWorkspace() {
    if (!teamId) {
      setError("Missing team id.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const [teamData, progressData] = await Promise.all([
        getTeam(teamId),
        getTeamProgress(teamId),
      ]);
      const availableUserData = await getTeamAvailableUsers(teamData.tenant_id);
      setTeam(teamData);
      setProgress(progressData);
      setAvailableUsers(availableUserData);
      setName(teamData.name);
      setDescription(teamData.description || "");
    } catch (err) {
      console.error("Failed to load team workspace:", err);
      setError(err instanceof Error ? err.message : "Failed to load team workspace.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTeamWorkspace();
  }, [teamId]);

  async function handleSave() {
    if (!teamId) return;

    try {
      setSaving(true);
      setError(null);
      setSuccess(null);
      await updateTeam(teamId, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      await loadTeamWorkspace();
      setSuccess("Team updated successfully.");
    } catch (err) {
      console.error("Failed to update team:", err);
      setError(err instanceof Error ? err.message : "Failed to update team.");
    } finally {
      setSaving(false);
    }
  }

  async function handleAddMember() {
    if (!teamId || !selectedUserId) return;

    try {
      setMemberBusyId(selectedUserId);
      setError(null);
      setSuccess(null);
      await addTeamMember(teamId, { user_id: selectedUserId });
      setSelectedUserId("");
      await loadTeamWorkspace();
      setSuccess("Member added successfully.");
    } catch (err) {
      console.error("Failed to add team member:", err);
      setError(err instanceof Error ? err.message : "Failed to add member.");
    } finally {
      setMemberBusyId(null);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!teamId) return;

    try {
      setMemberBusyId(userId);
      setError(null);
      setSuccess(null);
      await removeTeamMember(teamId, userId);
      await loadTeamWorkspace();
      setSuccess("Member removed successfully.");
    } catch (err) {
      console.error("Failed to remove team member:", err);
      setError(err instanceof Error ? err.message : "Failed to remove member.");
    } finally {
      setMemberBusyId(null);
    }
  }

  const currentMemberIds = new Set((team?.memberships || []).map((member) => member.user_id));
  const selectableUsers = availableUsers.filter((user) => !currentMemberIds.has(user.id));
  const totalAssignedCourses =
    progress?.members.reduce((total, member) => total + member.courses_assigned, 0) || 0;
  const totalCompletedCourses =
    progress?.members.reduce((total, member) => total + member.courses_completed, 0) || 0;
  const totalInProgressCourses =
    progress?.members.reduce((total, member) => total + member.courses_in_progress, 0) || 0;
  const avgCompletionRate =
    progress && progress.members.length > 0
      ? Math.round(
          progress.members.reduce((total, member) => total + member.completion_rate, 0) /
            progress.members.length
        )
      : 0;

  return (
    <TeamManagerShell>
      <div className="space-y-6">
        <TeamManagerTeamsNav
          detailHref={teamId ? routes.teamManagerTeamDetail(teamId) : undefined}
          detailLabel={team?.name || "Current team workspace"}
        />

        {error && (
          <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        )}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-6 py-14 text-center text-slate-500 shadow-sm">
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-emerald-700" />
            <p className="mt-3">Loading team details...</p>
          </div>
        ) : team ? (
          <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
            <div className="border-b border-slate-200 bg-[linear-gradient(135deg,rgba(16,185,129,0.12),rgba(59,130,246,0.08),rgba(245,158,11,0.06))] px-5 py-5 sm:px-6">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                    Team workspace
                  </p>
                  <h2 className="mt-2 truncate text-2xl font-semibold tracking-tight text-slate-950">
                    {team.name}
                  </h2>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
                    {team.description || "No team description provided yet."}
                  </p>
                </div>

                <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4">
                  {[
                    { label: "Members", value: team.member_count || 0, icon: Users },
                    { label: "Assigned", value: totalAssignedCourses, icon: BookOpen },
                    { label: "Completed", value: totalCompletedCourses, icon: CheckCircle2 },
                    { label: "Average", value: `${avgCompletionRate}%`, icon: Clock },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="min-w-[104px] rounded-2xl border border-white/70 bg-white/80 px-3 py-2.5 shadow-sm"
                    >
                      <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
                        <item.icon className="h-3.5 w-3.5 text-emerald-700" />
                        {item.label}
                      </div>
                      <p className="mt-1 font-mono text-xl font-semibold text-slate-950">
                        {item.value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-6 p-5 sm:p-6">
                <div>
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-950">Team Information</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Edit the core team details used across assignments and reporting.
                      </p>
                    </div>
                    <span className="hidden rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 sm:inline-flex">
                      Created {formatDate(team.created_at)}
                    </span>
                  </div>

                  <div className="grid gap-4 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Team Name
                      </label>
                      <Input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="h-10 border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Description
                      </label>
                      <textarea
                        value={description}
                        onChange={(event) => setDescription(event.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                      />
                    </div>
                  </div>

                  <div className="mt-4 flex justify-end">
                    <Button onClick={handleSave} disabled={saving || !name.trim()}>
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      {saving ? "Saving..." : "Save Team"}
                    </Button>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div>
                      <h3 className="text-base font-semibold text-slate-950">Team Members</h3>
                      <p className="mt-1 text-sm text-slate-600">
                        Current users assigned to this team.
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                      {team.member_count || 0} member(s)
                    </span>
                  </div>

                  {team.memberships && team.memberships.length > 0 ? (
                    <div className="grid gap-3 md:grid-cols-2">
                      {team.memberships.map((member) => (
                        <div
                          key={member.user_id}
                          className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-950">
                              {member.user_name}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {member.role} - Joined {formatDate(member.joined_at)}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => void handleRemoveMember(member.user_id)}
                            disabled={memberBusyId === member.user_id}
                            className="shrink-0 rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                            aria-label={`Remove ${member.user_name}`}
                          >
                            {memberBusyId === member.user_id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 px-4 py-8 text-center text-sm text-slate-500">
                      No members assigned to this team yet.
                    </div>
                  )}
                </div>
              </div>

              <aside className="space-y-5 border-t border-slate-200 bg-slate-50/70 p-5 sm:p-6 xl:border-l xl:border-t-0">
                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                      <UserPlus className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold text-slate-950">Add Member</h3>
                      <p className="text-xs text-slate-600">Assign a company user.</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <select
                      value={selectedUserId}
                      onChange={(event) => setSelectedUserId(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                    >
                      <option value="">Select a user</option>
                      {selectableUsers.map((userOption) => (
                        <option key={userOption.id} value={userOption.id}>
                          {(userOption.display_name || `${userOption.first_name} ${userOption.last_name}`.trim() || userOption.email)} - {userOption.role}
                        </option>
                      ))}
                    </select>
                    <Button
                      onClick={handleAddMember}
                      disabled={!selectedUserId || memberBusyId === selectedUserId}
                      className="w-full justify-center"
                    >
                      {memberBusyId === selectedUserId ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <UserPlus className="h-4 w-4" />
                      )}
                      Add Member
                    </Button>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                  <h3 className="text-base font-semibold text-slate-950">Progress Snapshot</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-600">
                    Real team learning activity from assigned members.
                  </p>

                  <div className="mt-4 grid grid-cols-2 gap-3">
                    {[
                      { label: "Members", value: progress?.total_members || 0 },
                      { label: "Assigned", value: totalAssignedCourses },
                      { label: "Completed", value: totalCompletedCourses },
                      { label: "In Progress", value: totalInProgressCourses },
                    ].map((metric) => (
                      <div key={metric.label} className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                        <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                          {metric.label}
                        </p>
                        <p className="mt-1 font-mono text-xl font-semibold text-slate-950">
                          {metric.value}
                        </p>
                      </div>
                    ))}
                  </div>

                  <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-emerald-700">
                      Avg Completion Rate
                    </p>
                    <p className="mt-1 font-mono text-2xl font-semibold text-emerald-900">
                      {avgCompletionRate}%
                    </p>
                  </div>
                </div>
              </aside>
            </div>
          </section>
        ) : null}
      </div>
    </TeamManagerShell>
  );
}
