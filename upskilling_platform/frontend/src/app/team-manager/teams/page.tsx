"use client";

import { useEffect, useMemo, useState } from "react";
import { TeamManagerShell } from "@/app/components/layout/TeamManagerShell";
import { Button } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Input";
import { useAuth } from "@/app/context/AuthContext";
import {
  addTeamMember,
  assignCourseToTeam,
  createTeam,
  deleteTeam,
  getCourses,
  getTeam,
  getTeamActivity,
  getTeamAvailableUsers,
  getTeamProgress,
  getTeams,
  removeTeamMember,
  updateTeam,
  Team,
  TeamActivityItem,
  TeamAvailableUser,
  TeamProgress,
  Course,
} from "@/app/lib/api";
import { Users, Plus, Trash2, UserPlus, BookOpen, Activity, ShieldAlert } from "lucide-react";

export default function TeamManagerTeamsPage() {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>("");
  const [selectedTeam, setSelectedTeam] = useState<Team | null>(null);
  const [availableUsers, setAvailableUsers] = useState<TeamAvailableUser[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [progress, setProgress] = useState<TeamProgress | null>(null);
  const [activity, setActivity] = useState<TeamActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [newTeamName, setNewTeamName] = useState("");
  const [newTeamDescription, setNewTeamDescription] = useState("");
  const [editTeamName, setEditTeamName] = useState("");
  const [editTeamDescription, setEditTeamDescription] = useState("");
  const [memberId, setMemberId] = useState("");
  const [courseId, setCourseId] = useState("");

  const canAccess = user?.role === "TeamManager";

  useEffect(() => {
    if (!canAccess) return;
    void loadInitial();
  }, [canAccess]);

  useEffect(() => {
    if (!selectedTeamId || !canAccess) return;
    void loadTeamWorkspace(selectedTeamId);
  }, [selectedTeamId, canAccess]);

  async function loadInitial() {
    try {
      setLoading(true);
      const [teamsData, usersData, coursesData] = await Promise.all([
        getTeams(),
        getTeamAvailableUsers(),
        getCourses({ page: 1, page_size: 100, is_published: true }),
      ]);
      setTeams(teamsData);
      setAvailableUsers(usersData.filter((candidate) => candidate.role !== "Admin" && candidate.role !== "SuperAdmin"));
      setCourses(coursesData.items);
      if (teamsData.length > 0) {
        setSelectedTeamId(teamsData[0].id);
      }
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team workspace");
    } finally {
      setLoading(false);
    }
  }

  async function loadTeamWorkspace(teamId: string) {
    try {
      const [teamData, progressData, activityData] = await Promise.all([
        getTeam(teamId),
        getTeamProgress(teamId),
        getTeamActivity(teamId),
      ]);
      setSelectedTeam(teamData);
      setEditTeamName(teamData.name);
      setEditTeamDescription(teamData.description || "");
      setProgress(progressData);
      setActivity(activityData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load team details");
    }
  }

  async function handleCreateTeam() {
    if (!newTeamName.trim()) return;
    try {
      setBusy(true);
      const created = await createTeam({
        name: newTeamName.trim(),
        description: newTeamDescription.trim() || undefined,
      });
      setNewTeamName("");
      setNewTeamDescription("");
      setSuccess("Team created successfully.");
      const refreshed = await getTeams();
      setTeams(refreshed);
      setSelectedTeamId(created.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create team");
    } finally {
      setBusy(false);
    }
  }

  async function handleUpdateTeam() {
    if (!selectedTeamId || !editTeamName.trim()) return;
    try {
      setBusy(true);
      await updateTeam(selectedTeamId, {
        name: editTeamName.trim(),
        description: editTeamDescription.trim() || undefined,
      });
      setSuccess("Team updated successfully.");
      const refreshed = await getTeams();
      setTeams(refreshed);
      await loadTeamWorkspace(selectedTeamId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update team");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddMember() {
    if (!selectedTeamId || !memberId) return;
    try {
      setBusy(true);
      await addTeamMember(selectedTeamId, { user_id: memberId });
      setSuccess("Member added to team.");
      setMemberId("");
      await loadTeamWorkspace(selectedTeamId);
      const refreshed = await getTeams();
      setTeams(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add member");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveMember(userId: string) {
    if (!selectedTeamId) return;
    try {
      setBusy(true);
      await removeTeamMember(selectedTeamId, userId);
      setSuccess("Member removed from team.");
      await loadTeamWorkspace(selectedTeamId);
      const refreshed = await getTeams();
      setTeams(refreshed);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove member");
    } finally {
      setBusy(false);
    }
  }

  async function handleAssignCourse() {
    if (!selectedTeamId || !courseId) return;
    try {
      setBusy(true);
      await assignCourseToTeam(selectedTeamId, { course_id: courseId, is_mandatory: true });
      setSuccess("Course assigned to the team.");
      setCourseId("");
      await loadTeamWorkspace(selectedTeamId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign course");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteTeam() {
    if (!selectedTeamId) return;
    if (!confirm("Delete this team?")) return;
    try {
      setBusy(true);
      await deleteTeam(selectedTeamId);
      setSuccess("Team deleted.");
      const refreshed = await getTeams();
      setTeams(refreshed);
      setSelectedTeamId(refreshed[0]?.id || "");
      setSelectedTeam(null);
      setProgress(null);
      setActivity([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete team");
    } finally {
      setBusy(false);
    }
  }

  const unassignedUsers = useMemo(() => {
    const memberIds = new Set((selectedTeam?.memberships || []).map((membership) => membership.user_id));
    return availableUsers.filter((candidate) => !memberIds.has(candidate.id));
  }, [availableUsers, selectedTeam]);

  if (!canAccess) {
    return (
      <TeamManagerShell>
        <div className="flex min-h-[60vh] items-center justify-center">
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
            <h1 className="mt-4 text-xl font-semibold text-slate-950">Access Denied</h1>
            <p className="mt-2 text-slate-600">This workspace is reserved for Team Managers.</p>
          </div>
        </div>
      </TeamManagerShell>
    );
  }

  return (
    <TeamManagerShell>
      <div className="space-y-6">
        <div className="rounded-3xl border border-slate-200/80 bg-[linear-gradient(135deg,rgba(255,255,255,0.98)_0%,rgba(238,251,245,0.94)_42%,rgba(235,244,248,0.92)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Team Manager</p>
          <div className="mt-3 flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <h1 className="text-3xl font-semibold text-slate-950">Teams Workspace</h1>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                Manage company teams, keep membership clean, assign learning at scale, and monitor progress from one operational workspace.
              </p>
            </div>
            <div className="grid gap-3 rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] xl:min-w-[560px]">
              <Input
                value={newTeamName}
                onChange={(e) => setNewTeamName(e.target.value)}
                placeholder="New team name"
                className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              <Input
                value={newTeamDescription}
                onChange={(e) => setNewTeamDescription(e.target.value)}
                placeholder="Description"
                className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              />
              <Button
                onClick={() => void handleCreateTeam()}
                disabled={busy || !newTeamName.trim()}
                className="min-h-10 bg-emerald-600 text-white hover:bg-emerald-700"
              >
                <Plus className="h-4 w-4" />
                Create Team
              </Button>
            </div>
          </div>
        </div>

        {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">{error}</div>}
        {success && <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div>}

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-600 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">Loading teams...</div>
        ) : teams.length === 0 ? (
          <div className="rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,249,252,0.95)_100%)] p-10 text-center shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
            <Users className="mx-auto h-10 w-10 text-slate-400" />
            <p className="mt-3 text-slate-700">No teams yet. Create your first managed team above.</p>
          </div>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-[0_16px_34px_rgba(15,23,42,0.08)]">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Company Teams</p>
                <p className="mt-1.5 text-2xl font-semibold text-slate-950">{teams.length}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-[0_16px_34px_rgba(15,23,42,0.08)]">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Selected Team</p>
                <p className="mt-1.5 truncate text-base font-semibold text-slate-950">{selectedTeam?.name || "None"}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-[0_16px_34px_rgba(15,23,42,0.08)]">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Members</p>
                <p className="mt-1.5 text-2xl font-semibold text-slate-950">{selectedTeam?.memberships?.length || 0}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-[0_16px_34px_rgba(15,23,42,0.08)]">
                <p className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Activity Entries</p>
                <p className="mt-1.5 text-2xl font-semibold text-slate-950">{activity.length}</p>
              </div>
            </div>

            <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
            <div className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,249,252,0.95)_100%)] p-4 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <h2 className="mb-4 px-1 text-sm font-semibold uppercase tracking-[0.15em] text-slate-500">Company Teams</h2>
              <div className="space-y-3">
                {teams.map((team) => (
                  <button
                    key={team.id}
                    onClick={() => setSelectedTeamId(team.id)}
                    className={`w-full rounded-2xl border p-4 text-left transition-colors ${
                      selectedTeamId === team.id
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-slate-200 bg-white hover:border-emerald-200 hover:bg-slate-50"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-medium text-slate-950">{team.name}</p>
                        <p className="mt-1 text-sm text-slate-600">{team.description || "No description yet"}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2 py-1 text-xs text-slate-700">{team.member_count || 0} members</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              {selectedTeam && (
                <div className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,249,252,0.95)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h2 className="text-2xl font-semibold text-slate-950">Team Details</h2>
                      <p className="mt-1 text-slate-700">Update this team, manage its members, and assign learning to it.</p>
                    </div>
                    <Button variant="outline" onClick={() => void handleDeleteTeam()} disabled={busy} className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100">
                      <Trash2 className="h-4 w-4" />
                      Delete Team
                    </Button>
                  </div>

                  <div className="mt-6 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h3 className="font-medium text-slate-950">Edit Team</h3>
                      <div className="mt-4 space-y-3">
                        <Input value={editTeamName} onChange={(e) => setEditTeamName(e.target.value)} placeholder="Team name" className="border-slate-200 bg-white text-slate-900 placeholder:text-slate-400 focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100" />
                        <textarea
                          value={editTeamDescription}
                          onChange={(e) => setEditTeamDescription(e.target.value)}
                          rows={4}
                          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                          placeholder="Team description"
                        />
                        <Button onClick={() => void handleUpdateTeam()} disabled={busy || !editTeamName.trim()} className="bg-emerald-600 text-white hover:bg-emerald-700">
                          Save Changes
                        </Button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                      <div className="mb-4 flex items-center gap-2">
                        <UserPlus className="h-4 w-4 text-primary" />
                        <h3 className="font-medium text-slate-950">Add Member</h3>
                      </div>
                      <select
                        value={memberId}
                        onChange={(e) => setMemberId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                      >
                        <option value="">Select a same-tenant user</option>
                        {unassignedUsers.map((candidate) => (
                          <option key={candidate.id} value={candidate.id}>
                            {candidate.display_name || `${candidate.first_name} ${candidate.last_name}`.trim() || candidate.email} - {candidate.role}
                          </option>
                        ))}
                      </select>
                      <Button className="mt-3 w-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void handleAddMember()} disabled={busy || !memberId}>
                        Add To Team
                      </Button>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:col-start-2">
                      <div className="mb-4 flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-primary" />
                        <h3 className="font-medium text-slate-950">Assign Course</h3>
                      </div>
                      <select
                        value={courseId}
                        onChange={(e) => setCourseId(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                      >
                        <option value="">Select a published course</option>
                        {courses.map((course) => (
                          <option key={course.id} value={course.id}>
                            {course.title}
                          </option>
                        ))}
                      </select>
                      <Button className="mt-3 w-full bg-emerald-600 text-white hover:bg-emerald-700" onClick={() => void handleAssignCourse()} disabled={busy || !courseId}>
                        Assign To Entire Team
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,249,252,0.95)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
                  <h3 className="mb-4 font-semibold text-slate-950">Members</h3>
                  <div className="space-y-3">
                    {(selectedTeam?.memberships || []).map((membership) => (
                      <div key={membership.user_id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
                        <div>
                          <p className="font-medium text-slate-950">{membership.user_name}</p>
                          <p className="text-sm text-slate-600">{membership.role}</p>
                        </div>
                        <Button variant="outline" onClick={() => void handleRemoveMember(membership.user_id)} disabled={busy} className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                          Remove
                        </Button>
                      </div>
                    ))}
                    {(selectedTeam?.memberships || []).length === 0 && (
                      <p className="text-sm text-slate-600">No members in this team yet.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,249,252,0.95)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
                  <h3 className="mb-4 font-semibold text-slate-950">Progress Snapshot</h3>
                  <div className="space-y-3">
                    {(progress?.members || []).map((member) => (
                      <div key={member.user_id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-slate-950">{member.user_name}</p>
                          <span className="text-sm text-emerald-700">{member.completion_rate}%</span>
                        </div>
                        <p className="mt-2 text-sm text-slate-600">
                          Assigned {member.courses_assigned} | Completed {member.courses_completed} | In progress {member.courses_in_progress}
                        </p>
                      </div>
                    ))}
                    {(progress?.members || []).length === 0 && (
                      <p className="text-sm text-slate-600">Progress will appear when members have enrollments.</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(244,249,252,0.95)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
                <div className="mb-4 flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  <h3 className="font-semibold text-slate-950">Activity Feed</h3>
                </div>
                <div className="space-y-3">
                  {activity.map((item, index) => (
                    <div key={`${item.type}-${item.user_id}-${index}`} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <p className="font-medium text-slate-950">{item.user_name}</p>
                      <p className="mt-1 text-sm text-slate-600">{item.message}</p>
                      <p className="mt-2 text-xs text-slate-500">{new Date(item.timestamp).toLocaleString()}</p>
                    </div>
                  ))}
                  {activity.length === 0 && <p className="text-sm text-slate-600">No activity yet for this team.</p>}
                </div>
              </div>
            </div>
          </div>
          </>
        )}
      </div>
    </TeamManagerShell>
  );
}
