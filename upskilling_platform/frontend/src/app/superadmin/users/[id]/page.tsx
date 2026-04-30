"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Building2, Mail, Save, Shield, Trash2, Users } from "lucide-react";

import { addDepartmentForTenant, getDepartmentsForTenant } from "@/app/lib/departments";
import {
  api,
  deletePlatformUser,
  getTenants,
  updatePlatformUser,
  type TenantResponse,
} from "@/app/lib/api";
import { routes } from "@/app/lib/routes";

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
  tenant_id: string;
};

function buildForm(user: UserDetail): EditForm {
  return {
    first_name: user.first_name || "",
    last_name: user.last_name || "",
    role: user.role || "TeamMember",
    department: user.department || "",
    status: user.status || "active",
    tenant_id: user.tenant_id || "",
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
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to load user." });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (!form) return;
    const tenantUsers = [userDetail?.department];
    setDepartmentOptions(
      getDepartmentsForTenant(form.tenant_id || null, tenantUsers)
    );
  }, [form?.tenant_id, userDetail?.department]);

  const companyName = useMemo(() => {
    if (!userDetail?.tenant_id) return "No company";
    return tenants.find((tenant) => tenant.id === userDetail.tenant_id)?.name || "Unknown company";
  }, [tenants, userDetail?.tenant_id]);

  const hasChanges = useMemo(() => {
    if (!userDetail || !form) return false;
    return JSON.stringify(buildForm(userDetail)) !== JSON.stringify(form);
  }, [form, userDetail]);

  const handleAddDepartment = () => {
    if (!form?.tenant_id) {
      setMessage({ type: "error", text: "This user must belong to a company before adding a department." });
      return;
    }
    if (!newDepartmentName.trim()) {
      return;
    }
    const nextDepartments = addDepartmentForTenant(form.tenant_id, newDepartmentName);
    setDepartmentOptions(nextDepartments);
    setForm((current) => (current ? { ...current, department: newDepartmentName.trim() } : current));
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
        first_name: form.first_name,
        last_name: form.last_name,
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
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to update user." });
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
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to delete user." });
      setSubmitting(false);
    }
  };

  if (loading || !form) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-[#475569] bg-[linear-gradient(180deg,#243247_0%,#1A2434_100%)]">
        <div className="text-sm font-medium text-[#D7E3F1]">Loading user details...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="rounded-3xl border border-[#475569] bg-[linear-gradient(180deg,#2A3548_0%,#233043_100%)] p-6 shadow-[0_20px_50px_rgba(0,0,0,0.16)]">
        <button
          type="button"
          onClick={() => router.push(routes.superadminUsers)}
          className="inline-flex items-center gap-2 text-sm font-medium text-[#B8B4FF] hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to users
        </button>

        <div className="mt-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#6C63FF]/20 text-lg font-semibold text-[#B8B4FF]">
              {`${userDetail?.first_name?.charAt(0) || ""}${userDetail?.last_name?.charAt(0) || ""}`.trim() || "U"}
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">Edit User</h1>
              <p className="mt-1 text-sm text-[#C6D2E0]">
                Update the selected user information as super admin from a dedicated workspace.
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-[#475569] px-3 py-1 text-xs text-[#D7E3F1]">
                  <Shield className="h-3.5 w-3.5 text-[#6C63FF]" />
                  {userDetail.role}
                </span>
                <span className="inline-flex rounded-full border border-[#475569] px-3 py-1 text-xs text-[#D7E3F1]">
                  {userDetail.status}
                </span>
                <span className="inline-flex rounded-full border border-[#475569] px-3 py-1 text-xs text-[#D7E3F1]">
                  {companyName}
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#475569] bg-[#223043] px-4 py-3">
            <p className="text-xs uppercase tracking-[0.18em] text-[#C6D2E0]">Platform Scope</p>
            <p className="mt-2 text-sm text-white">You can manage users across all companies from this control plane.</p>
          </div>
        </div>
      </div>

      {message && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            message.type === "success"
              ? "border-green-500/30 bg-green-500/10 text-green-400"
              : "border-red-500/30 bg-red-500/10 text-red-400"
          }`}
        >
          {message.text}
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_340px]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-[#2A2D3E] bg-[#1A1D27] p-6">
            <div className="mb-5">
              <h2 className="text-xl font-semibold text-white">Edit User</h2>
              <p className="mt-1 text-sm text-gray-400">Update the selected user information as super admin.</p>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-gray-400">First Name *</label>
                <input
                  type="text"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  className="w-full rounded-lg border border-[#2A2D3E] bg-[#0F1117] px-4 py-2.5 text-white"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-gray-400">Last Name *</label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  className="w-full rounded-lg border border-[#2A2D3E] bg-[#0F1117] px-4 py-2.5 text-white"
                />
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-gray-400">Email</label>
                <div className="flex items-center gap-2 rounded-lg border border-[#2A2D3E] bg-[#0F1117] px-4 py-2.5 text-sm text-gray-300">
                  <Mail className="h-4 w-4 text-gray-500" />
                  {userDetail.email}
                </div>
              </div>
              <div>
                <label className="mb-2 block text-sm text-gray-400">Role *</label>
                <select
                  value={form.role}
                  onChange={(e) => setForm({ ...form, role: e.target.value })}
                  className="w-full rounded-lg border border-[#2A2D3E] bg-[#0F1117] px-4 py-2.5 text-white"
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-2 block text-sm text-gray-400">Status *</label>
                <select
                  value={form.status}
                  onChange={(e) => setForm({ ...form, status: e.target.value })}
                  className="w-full rounded-lg border border-[#2A2D3E] bg-[#0F1117] px-4 py-2.5 text-white"
                >
                  {STATUS_OPTIONS.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-gray-400">Department</label>
                <select
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="w-full rounded-lg border border-[#2A2D3E] bg-[#0F1117] px-4 py-2.5 text-white"
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
                  className="mt-2 text-xs text-[#B8B4FF] hover:text-white"
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
                      className="flex-1 rounded-lg border border-[#2A2D3E] bg-[#0F1117] px-4 py-2.5 text-white"
                    />
                    <button
                      type="button"
                      onClick={handleAddDepartment}
                      className="rounded-lg border border-[#2A2D3E] px-4 py-2.5 text-sm text-white hover:bg-[#202433]"
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-2xl border border-[#2A2D3E] bg-[#1A1D27] p-6">
            <h2 className="text-lg font-semibold text-white">User Snapshot</h2>
            <div className="mt-4 space-y-3 text-sm text-[#D7E3F1]">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-gray-500" />
                {companyName}
              </div>
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4 text-gray-500" />
                {form.department || "No department"}
              </div>
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-[#6C63FF]" />
                {form.role}
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-[#2A2D3E] bg-[#1A1D27] p-6">
            <h2 className="text-lg font-semibold text-white">Actions</h2>
            <div className="mt-5 flex flex-col gap-3">
              <button
                onClick={handleSave}
                disabled={submitting || !hasChanges}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[#6C63FF] px-4 py-2.5 text-white hover:bg-[#5a52d4] disabled:opacity-50"
              >
                <Save className="h-4 w-4" />
                {submitting ? "Saving..." : "Save Changes"}
              </button>
              <button
                onClick={() => router.push(routes.superadminUsers)}
                className="rounded-lg border border-[#2A2D3E] px-4 py-2.5 text-gray-300 hover:text-white"
              >
                Back to users
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-6">
            <h2 className="text-lg font-semibold text-white">Delete User</h2>
            <p className="mt-2 text-sm text-gray-400">Permanently remove this platform user if the account is no longer needed.</p>
            <button
              onClick={handleDelete}
              disabled={submitting || userDetail.role === "SuperAdmin"}
              className="mt-5 inline-flex items-center gap-2 rounded-lg border border-red-500/30 px-4 py-2.5 text-red-300 hover:bg-red-500/10 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2 className="h-4 w-4" />
              {submitting ? "Deleting..." : "Delete User"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
