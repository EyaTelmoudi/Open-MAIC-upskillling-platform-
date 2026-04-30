"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  Loader2,
  Save,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";

import { AdminShell } from "@/app/components/layout/AdminShell";
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

export default function AdminTeamDetailPage() {
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
      const [teamData, progressData, availableUserData] = await Promise.all([
        getTeam(teamId),
        getTeamProgress(teamId),
        getTeamAvailableUsers(),
      ]);
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
    <AdminShell>
      <div className="space-y-6">
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
          <>
            <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <Users className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">Team Information</h2>
                  <p className="text-sm text-slate-600">
                    Update the core information of this team.
                  </p>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Team Name
                  </label>
                  <Input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400"
                  />
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Members
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-slate-950">
                    {team.member_count || 0}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Team Created
                  </p>
                  <p className="mt-2 text-lg font-semibold text-slate-950">
                    {formatDate(team.created_at)}
                  </p>
                </div>
                <div className="space-y-2 md:col-span-2">
                  <label className="text-xs font-medium uppercase tracking-wide text-slate-500">
                    Description
                  </label>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              </div>

              <div className="mt-6 flex justify-end">
                <Button onClick={handleSave} disabled={saving || !name.trim()}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {saving ? "Saving..." : "Save Team"}
                </Button>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <Users className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">Team Members</h2>
                    <p className="text-sm text-slate-600">
                      See the current members and remove them if needed.
                    </p>
                  </div>
                </div>

                {team.memberships && team.memberships.length > 0 ? (
                  <div className="space-y-3">
                    {team.memberships.map((member) => (
                      <div
                        key={member.user_id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                      >
                        <div>
                          <p className="font-medium text-slate-950">{member.user_name}</p>
                          <p className="mt-1 text-xs text-slate-500">
                            {member.role} • Joined {formatDate(member.joined_at)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => void handleRemoveMember(member.user_id)}
                          disabled={memberBusyId === member.user_id}
                          className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
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

              <div className="space-y-6">
                <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="mb-5 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                      <UserPlus className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">Add Members</h2>
                      <p className="text-sm text-slate-600">
                        Assign available company users to this team.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <select
                      value={selectedUserId}
                      onChange={(event) => setSelectedUserId(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
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

                <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
                  <h2 className="text-lg font-semibold text-slate-950">Progress Snapshot</h2>
                  <p className="mt-1 text-sm text-slate-600">
                    Real team learning activity based on the members currently assigned to this team.
                  </p>

                  <div className="mt-5 grid gap-3">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Total Members
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {progress?.total_members || 0}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Assigned Courses
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {totalAssignedCourses}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Completed Courses
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {totalCompletedCourses}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        In Progress Courses
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {totalInProgressCourses}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                        Avg Completion Rate
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {avgCompletionRate}%
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}
