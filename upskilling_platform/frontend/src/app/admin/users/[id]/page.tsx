"use client";

import {useCallback, useEffect, useMemo, useState} from "react";
import {useParams, useRouter} from "next/navigation";
import {Building2, IdCard, Save, Shield, Trash2} from "lucide-react";
import {AdminShell} from "@/app/components/layout/AdminShell";
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
import {UsersManagementNav} from "../UsersManagementNav";

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
        <UsersManagementNav
          detailHref={userId ? routes.adminUserDetail(userId) : undefined}
          detailLabel={userDetail ? `${userDetail.first_name} ${userDetail.last_name}`.trim() || userDetail.email : "Selected user profile"}
        />

        {error && (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
            {error}
          </div>
        )}
        {success && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-800">
            {success}
          </div>
        )}

        {isLoading || !form ? (
          <div className="rounded-3xl border border-slate-200 bg-white p-8 text-sm text-slate-600 shadow-sm">
            Loading user details...
          </div>
        ) : (
          <div className="rounded-[28px] border border-slate-200 bg-white p-5 shadow-[0_18px_55px_rgba(15,23,42,0.07)] sm:p-6">
            <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_340px]">
              <div className="space-y-8">
                <section>
                  <div className="mb-5 rounded-3xl border border-emerald-100 bg-[radial-gradient(circle_at_10%_15%,rgba(16,185,129,0.18),transparent_28%),linear-gradient(135deg,#f8fffd_0%,#ecfdf5_55%,#eef7ff_100%)] p-5 shadow-sm">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-700 text-white shadow-sm">
                        <IdCard className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
                          User Identity
                        </p>
                        <h2 className="mt-1 text-xl font-semibold text-slate-950">Identity</h2>
                        <p className="mt-1 text-sm text-slate-600">
                          Maintain the user&apos;s core profile and access role.
                        </p>
                      </div>
                    </div>
                  </div>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">First Name</label>
                    <Input
                      value={form.first_name}
                      onChange={(e) => setForm({...form, first_name: e.target.value})}
                      placeholder="First name"
                      className="h-11 border-slate-300 bg-white text-slate-950 placeholder:text-slate-400 shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Last Name</label>
                    <Input
                      value={form.last_name}
                      onChange={(e) => setForm({...form, last_name: e.target.value})}
                      placeholder="Last name"
                      className="h-11 border-slate-300 bg-white text-slate-950 placeholder:text-slate-400 shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-100"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Email</label>
                    <Input value={userDetail?.email || ""} readOnly className="h-11 border-slate-200 bg-slate-50 text-slate-700 shadow-sm" />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Role</label>
                    <Select
                      options={ROLE_OPTIONS.map((role) => ({value: role, label: role}))}
                      value={form.role}
                      onChange={(e) => setForm({...form, role: e.target.value})}
                      className="h-11 w-full border-slate-300 bg-white text-slate-950 shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-100"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Status</label>
                    <Select
                      options={STATUS_OPTIONS}
                      value={form.status}
                      onChange={(e) => setForm({...form, status: e.target.value})}
                      className="h-11 w-full border-slate-300 bg-white text-slate-950 shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-100"
                    />
                  </div>
                </div>
                </section>

                <section className="border-t border-slate-100 pt-6">
                  <div className="mb-5 rounded-3xl border border-sky-100 bg-[radial-gradient(circle_at_12%_18%,rgba(59,130,246,0.16),transparent_30%),linear-gradient(135deg,#f8fbff_0%,#eff6ff_48%,#ecfdf5_100%)] p-5 shadow-sm">
                    <div className="flex items-start gap-4">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-sky-700 text-white shadow-sm">
                        <Building2 className="h-5 w-5" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-sky-700">
                          Company Context
                        </p>
                        <h2 className="mt-1 text-xl font-semibold text-slate-950">
                          Workspace Profile
                        </h2>
                        <p className="mt-1 text-sm text-slate-600">
                          Adjust the user&apos;s department and learning context inside your company.
                        </p>
                      </div>
                    </div>
                  </div>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Department</label>
                    <Select
                      options={departmentOptions.map((department) => ({value: department, label: department}))}
                      value={form.department}
                      onChange={(e) => setForm({...form, department: e.target.value})}
                      className="h-11 w-full border-slate-300 bg-white text-slate-950 shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-100"
                    />
                    <button
                      type="button"
                      onClick={() => setShowAddDepartment((current) => !current)}
                      className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline"
                    >
                      {showAddDepartment ? "Cancel new department" : "Add new department"}
                    </button>
                    {showAddDepartment && (
                      <div className="flex gap-2">
                        <Input
                          value={newDepartmentName}
                          onChange={(e) => setNewDepartmentName(e.target.value)}
                          placeholder="New department name"
                          className="h-11 border-slate-300 bg-white text-slate-950 placeholder:text-slate-400 shadow-sm focus-visible:border-emerald-500 focus-visible:ring-emerald-100"
                        />
                        <Button type="button" variant="outline" onClick={handleAddDepartment} className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100">
                          Save
                        </Button>
                      </div>
                    )}
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-600">Skills</label>
                    <div className="min-h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                      {userDetail?.skills?.length ? userDetail.skills.join(", ") : "No skills added yet."}
                    </div>
                    <p className="text-[11px] text-slate-500">Skills are managed by the user from their own profile.</p>
                  </div>
                </div>
                </section>
              </div>

              <aside className="rounded-3xl border border-emerald-100 bg-gradient-to-br from-emerald-50 via-white to-sky-50 p-4">
                <div className="space-y-3">
                  <div className="rounded-2xl border border-emerald-100 bg-white p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-slate-950">Save changes</h2>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {hasChanges ? "Updates are ready to save." : "No unsaved changes."}
                        </p>
                      </div>
                      <Button size="sm" onClick={handleSave} disabled={isSaving || !hasChanges}>
                        <Save className="h-4 w-4" />
                        {isSaving ? "Saving..." : "Save"}
                      </Button>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-rose-200 bg-rose-50 p-3 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <h2 className="text-sm font-semibold text-rose-950">Delete user</h2>
                        <p className="mt-0.5 text-xs text-rose-700">
                          Permanently remove this account.
                        </p>
                      </div>
                      <Button size="sm" variant="destructive" onClick={handleDeleteUser} disabled={isSaving}>
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </Button>
                    </div>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
