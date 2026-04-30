"use client";

import {useCallback, useEffect, useMemo, useState} from "react";
import {useParams, useRouter} from "next/navigation";
import {ArrowLeft, Save, Shield, Trash2} from "lucide-react";
import {AdminShell} from "@/app/components/layout/AdminShell";
import {Badge} from "@/app/components/ui/Badge";
import {Button} from "@/app/components/ui/Button";
import {Input} from "@/app/components/ui/Input";
import {Select} from "@/app/components/ui/Select";
import {useAuth} from "@/app/context/AuthContext";
import {api, deletePlatformUser} from "@/app/lib/api";
import {
  DEFAULT_DEPARTMENTS,
  addDepartmentForTenant,
  getDepartmentsForTenant,
} from "@/app/lib/departments";
import {routes} from "@/app/lib/routes";

type UserDetail = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  department: string | null;
  bio: string | null;
  skills: string[];
  created_at: string;
  last_login: string | null;
  tenant_id: string | null;
};

type EditableUserForm = {
  first_name: string;
  last_name: string;
  role: string;
  department: string;
  status: string;
};

const ROLE_OPTIONS = ["Admin", "Manager", "TeamManager", "TeamMember", "TeamIntern", "LearningExpert"];
const STATUS_OPTIONS = [
  {value: "active", label: "Active"},
  {value: "pending_invitation", label: "Pending invitation"},
  {value: "provisioned", label: "Provisioned"},
  {value: "suspended", label: "Suspended"},
];

function buildInitialForm(user: UserDetail): EditableUserForm {
  return {
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    role: user.role || "TeamMember",
    department: user.department || DEFAULT_DEPARTMENTS[0],
    status: user.status || "active",
  };
}

export default function AdminUserDetailPage() {
  const {user: currentUser} = useAuth();
  const router = useRouter();
  const params = useParams<{id: string}>();
  const userId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [form, setForm] = useState<EditableUserForm | null>(null);
  const [departmentOptions, setDepartmentOptions] = useState<string[]>(DEFAULT_DEPARTMENTS);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [showAddDepartment, setShowAddDepartment] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadUser = useCallback(async () => {
    if (!userId) {
      setError("User not found.");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError("");
    try {
      const response = await api.get<UserDetail>(`/api/v1/identity/users/${userId}`);
      setUserDetail(response);
      setForm(buildInitialForm(response));
      setDepartmentOptions(
        getDepartmentsForTenant(currentUser?.tenant_id, [response.department, ...DEFAULT_DEPARTMENTS])
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user");
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.tenant_id, userId]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  const hasChanges = useMemo(() => {
    if (!userDetail || !form) return false;
    const initial = buildInitialForm(userDetail);
    return JSON.stringify(initial) !== JSON.stringify(form);
  }, [form, userDetail]);

  const handleSave = async () => {
    if (!userDetail || !form) return;
    setIsSaving(true);
    setError("");
    setSuccess("");

    try {
      const updated = await api.put<UserDetail>(`/api/v1/identity/users/${userDetail.id}`, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        role: form.role,
        department: form.department || null,
        status: form.status,
      });

      setUserDetail(updated);
      setForm(buildInitialForm(updated));
      setSuccess("User updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddDepartment = () => {
    if (!newDepartmentName.trim() || !form) return;
    const nextDepartments = addDepartmentForTenant(currentUser?.tenant_id, newDepartmentName);
    setDepartmentOptions(nextDepartments);
    setForm({...form, department: newDepartmentName.trim()});
    setNewDepartmentName("");
    setShowAddDepartment(false);
  };

  const handleDeleteUser = async () => {
    if (!userDetail) return;
    const userLabel = `${userDetail.first_name} ${userDetail.last_name}`.trim() || userDetail.email;
    const confirmed = window.confirm(
      `Delete ${userLabel}? This will permanently remove the user account from your company workspace.`
    );
    if (!confirmed) return;

    setIsSaving(true);
    setError("");
    setSuccess("");
    try {
      await deletePlatformUser(userDetail.id);
      router.push(routes.adminUsers);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user");
      setIsSaving(false);
    }
  };

  if (!currentUser || currentUser.role !== "Admin") {
    return (
      <AdminShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="text-center">
            <Shield className="mx-auto h-12 w-12 text-text-secondary" />
            <h2 className="mt-4 text-xl font-semibold text-text-primary">Access Denied</h2>
            <p className="mt-2 text-text-secondary">This page is only accessible to admins.</p>
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-6 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-4">
            <button
              type="button"
              onClick={() => router.push(routes.adminUsers)}
              className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to users
            </button>
            <div className="flex items-start gap-4">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-lg font-semibold text-white">
                {(userDetail?.first_name?.charAt(0) || userDetail?.email?.charAt(0) || "U").toUpperCase()}
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-text-primary">
                  {userDetail ? `${userDetail.first_name} ${userDetail.last_name}`.trim() : "User profile"}
                </h1>
                <p className="mt-1 text-sm text-text-secondary">
                  Review and update company user information from a dedicated admin workspace.
                </p>
                {userDetail && (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{userDetail.role}</Badge>
                    <Badge variant="secondary">{userDetail.status}</Badge>
                    <Badge variant="outline">{userDetail.department || "No department"}</Badge>
                  </div>
                )}
              </div>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-background/60 px-4 py-3">
            <p className="text-xs font-medium uppercase tracking-[0.2em] text-text-secondary">Admin Scope</p>
            <p className="mt-2 text-sm text-text-primary">You can manage this user because they belong to your company workspace.</p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600">
            {success}
          </div>
        )}

        {isLoading || !form ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-sm text-text-secondary">
            Loading user details...
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_360px]">
            <div className="space-y-6">
              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-5">
                  <h2 className="text-lg font-semibold text-text-primary">Identity</h2>
                  <p className="text-sm text-text-secondary">Maintain the user’s core profile and access role.</p>
                </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text-secondary">First Name</label>
                    <Input
                      value={form.first_name}
                      onChange={(e) => setForm({...form, first_name: e.target.value})}
                      placeholder="First name"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text-secondary">Last Name</label>
                    <Input
                      value={form.last_name}
                      onChange={(e) => setForm({...form, last_name: e.target.value})}
                      placeholder="Last name"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-medium text-text-secondary">Email</label>
                    <Input value={userDetail?.email || ""} readOnly className="bg-background/70 text-text-secondary" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text-secondary">Role</label>
                    <Select
                      options={ROLE_OPTIONS.map((role) => ({value: role, label: role}))}
                      value={form.role}
                      onChange={(e) => setForm({...form, role: e.target.value})}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text-secondary">Status</label>
                    <Select
                      options={STATUS_OPTIONS}
                      value={form.status}
                      onChange={(e) => setForm({...form, status: e.target.value})}
                      className="w-full"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6">
                <div className="mb-5">
                  <h2 className="text-lg font-semibold text-text-primary">Workspace Profile</h2>
                  <p className="text-sm text-text-secondary">Adjust the user’s department and learning context inside your company.</p>
                </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text-secondary">Department</label>
                    <Select
                      options={departmentOptions.map((department) => ({value: department, label: department}))}
                      value={form.department}
                      onChange={(e) => setForm({...form, department: e.target.value})}
                      className="w-full"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAddDepartment((current) => !current)}
                      className="text-xs text-primary hover:underline"
                    >
                      {showAddDepartment ? "Cancel new department" : "Add new department"}
                    </button>
                    {showAddDepartment && (
                      <div className="flex gap-2">
                        <Input
                          value={newDepartmentName}
                          onChange={(e) => setNewDepartmentName(e.target.value)}
                          placeholder="New department name"
                        />
                        <Button type="button" variant="outline" onClick={handleAddDepartment}>
                          Save
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text-secondary">Skills</label>
                    <div className="min-h-10 rounded-[10px] border border-border bg-background/70 px-3 py-2 text-sm text-text-primary">
                      {userDetail?.skills?.length ? userDetail.skills.join(", ") : "No skills added yet."}
                    </div>
                    <p className="text-[11px] text-text-secondary">Skills are managed by the user from their own profile.</p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-border bg-card p-6">
                <h2 className="text-lg font-semibold text-text-primary">Admin Actions</h2>
                <p className="mt-2 text-sm text-text-secondary">Save your changes directly to the company user record.</p>
                <div className="mt-5 flex flex-col gap-3">
                  <Button onClick={handleSave} disabled={isSaving || !hasChanges}>
                    <Save className="h-4 w-4" />
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                  <Button variant="outline" onClick={() => router.push(routes.adminUsers)}>
                    Back to user list
                  </Button>
                </div>
              </div>

              <div className="rounded-2xl border border-destructive/20 bg-destructive/5 p-6">
                <h2 className="text-lg font-semibold text-text-primary">Delete User</h2>
                <p className="mt-2 text-sm text-text-secondary">
                  Remove this user from your company workspace when the account is no longer needed.
                </p>
                <div className="mt-5">
                  <Button variant="destructive" onClick={handleDeleteUser} disabled={isSaving}>
                    <Trash2 className="h-4 w-4" />
                    {isSaving ? "Deleting..." : "Delete User"}
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
