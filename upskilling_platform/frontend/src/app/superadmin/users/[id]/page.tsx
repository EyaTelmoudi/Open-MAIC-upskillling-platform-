"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Building2, Mail, Save, Shield, Trash2, Users } from "lucide-react";

import { addDepartmentForTenant, getDepartmentsForTenant } from "@/app/lib/departments";
import {
  api,
  deletePlatformUser,
  getTenants,
  updatePlatformUser,
  type TenantResponse,
} from "@/app/lib/api";
import { routes } from "@/app/lib/routes";
import { UsersManagementNav } from "../UsersManagementNav";

type UserDetail = {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  tenant_id?: string | null;
  department?: string | null;
};

const ROLE_OPTIONS = [
  "Admin",
  "Manager",
  "LearningExpert",
  "TeamManager",
  "TeamMember",
  "TeamIntern",
];

const STATUS_OPTIONS = ["active", "provisioned", "pending", "pending_invitation", "suspended"];

type EditForm = {
  first_name: string;
  last_name: string;
  role: string;
  department: string;
  status: string;
};

function buildForm(user: UserDetail): EditForm {
  return {
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    role: user.role || "TeamMember",
    department: user.department || "",
    status: user.status || "active",
  };
}

export default function SuperAdminUserDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const userId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [form, setForm] = useState<EditForm | null>(null);
  const [tenants, setTenants] = useState<TenantResponse[]>([]);
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
  const [showAddDepartment, setShowAddDepartment] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const loadData = useCallback(async () => {
    if (!userId) {
      setMessage({ type: "error", text: "User not found." });
      setLoading(false);
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const [user, tenantsData] = await Promise.all([
        api.get<UserDetail>(`/api/v1/identity/users/${userId}`),
        getTenants(1, 100),
      ]);
      setUserDetail(user);
      setForm(buildForm(user));
      setTenants(tenantsData.tenants || []);
      setDepartmentOptions(
        getDepartmentsForTenant(user.tenant_id || null, [user.department || null])
      );
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to load user.",
      });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!userDetail) {
      return;
    }
    setDepartmentOptions(
      getDepartmentsForTenant(userDetail.tenant_id || null, [userDetail.department || null])
    );
  }, [userDetail]);

  const companyName = useMemo(() => {
    if (!userDetail?.tenant_id) return "No company";
    return tenants.find((tenant) => tenant.id === userDetail.tenant_id)?.name || "Unknown company";
  }, [tenants, userDetail?.tenant_id]);

  const detailLabel = userDetail
    ? `${userDetail.first_name} ${userDetail.last_name}`.trim() || userDetail.email
    : "Selected user profile";

  const hasChanges = useMemo(() => {
    if (!userDetail || !form) return false;
    return JSON.stringify(buildForm(userDetail)) !== JSON.stringify(form);
  }, [form, userDetail]);

  const handleAddDepartment = () => {
    if (!userDetail?.tenant_id) {
      setMessage({ type: "error", text: "This user must belong to a company before adding a department." });
      return;
    }
    const departmentName = newDepartmentName.trim();
    if (!departmentName) {
      return;
    }
    const nextDepartments = addDepartmentForTenant(userDetail.tenant_id, departmentName);
    setDepartmentOptions(nextDepartments);
    setForm((current) => (current ? { ...current, department: departmentName } : current));
    setNewDepartmentName("");
    setShowAddDepartment(false);
  };

  const handleSave = async () => {
    if (!userDetail || !form || !form.first_name || !form.last_name) {
      setMessage({ type: "error", text: "Please fill in all required fields." });
      return;
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const updated = await updatePlatformUser(userDetail.id, {
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        role: form.role,
        department: form.department || "",
        status: form.status,
      });
      const nextUser: UserDetail = {
        ...userDetail,
        ...updated,
      };
      setUserDetail(nextUser);
      setForm(buildForm(nextUser));
      setMessage({ type: "success", text: "User updated successfully." });
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to update user.",
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!userDetail) return;
    const confirmed = window.confirm(`Delete ${userDetail.first_name} ${userDetail.last_name} permanently?`);
    if (!confirmed) return;

    setSubmitting(true);
    setMessage(null);
    try {
      await deletePlatformUser(userDetail.id);
      router.push(routes.superadminUsers);
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to delete user.",
      });
      setSubmitting(false);
    }
  };

  if (loading || !form) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,250,248,0.94),rgba(232,244,248,0.9))] shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
        <div className="text-sm font-medium text-slate-700">Loading user details...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
      <UsersManagementNav detailHref={routes.superadminUserDetail(userId || "")} detailLabel={detailLabel} />

      {message && (
        <div
          className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="rounded-3xl border border-slate-200/80 bg-white p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <div className="mb-5">
            <h2 className="text-xl font-semibold text-slate-950">Edit User</h2>
            <p className="mt-1 text-sm text-slate-600">
              Update the selected user information as super admin.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">First Name *</label>
              <input
                type="text"
                value={form.first_name}
                onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Last Name *</label>
              <input
                type="text"
                value={form.last_name}
                onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">Email</label>
              <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm text-slate-700">
                <Mail className="h-4 w-4 text-slate-500" />
                {userDetail?.email}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Role *</label>
              <select
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              >
                {ROLE_OPTIONS.map((role) => (
                  <option key={role} value={role}>
                    {role}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">Status *</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              >
                {STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="mb-2 block text-sm font-medium text-slate-700">Department</label>
              <select
                value={form.department}
                onChange={(e) => setForm({ ...form, department: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
              >
                <option value="">Select department</option>
                {departmentOptions.map((department) => (
                  <option key={department} value={department}>
                    {department}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setShowAddDepartment((current) => !current)}
                className="mt-2 text-xs font-medium text-emerald-700 transition-colors hover:text-emerald-800"
              >
                {showAddDepartment ? "Cancel new department" : "Add new department"}
              </button>
              {showAddDepartment && (
                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={newDepartmentName}
                    onChange={(e) => setNewDepartmentName(e.target.value)}
                    placeholder="New department name"
                    className="flex-1 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                  <button
                    type="button"
                    onClick={handleAddDepartment}
                    className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Save
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(243,249,251,0.96)_100%)] p-5 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
            <h2 className="text-lg font-semibold text-slate-950">User Snapshot</h2>
            <div className="mt-4 space-y-3 text-sm text-slate-700">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-500" />
                {companyName}
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-slate-500" />
                {form.department || "No department"}
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-emerald-700" />
                {form.role}
              </div>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-slate-500" />
                {userDetail?.email}
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
            <h2 className="text-lg font-semibold text-slate-950">Actions</h2>
            <div className="mt-5 flex flex-col gap-3">
              <button
                onClick={handleSave}
                disabled={submitting || !hasChanges}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {submitting ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => router.push(routes.superadminUsers)}
                className="rounded-lg border border-slate-200 px-4 py-2.5 text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
              >
                Cancel
              </button>
            </div>
          </div>

          <div className="rounded-3xl border border-red-200 bg-red-50 p-5">
            <h2 className="text-lg font-semibold text-red-950">Delete User</h2>
            <p className="mt-2 text-sm text-red-700">
              Permanently remove this platform user if the account is no longer needed.
            </p>
            <button
              onClick={handleDelete}
              disabled={submitting || userDetail?.role === "SuperAdmin"}
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-red-200 bg-white px-4 py-2.5 text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {submitting ? "Deleting..." : "Delete User"}
            </button>
          </div>
        </aside>
      </div>
    </div>
  );
}
