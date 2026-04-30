"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Building2,
  Mail,
  Plus,
  Search,
  Shield,
  Trash2,
  Users,
  X,
} from "lucide-react";

import {
  createAdminDirect,
  createPlatformUser,
  deletePlatformUser,
  getPlatformUsers,
  getTenants,
  type TenantResponse,
  type UserResponse,
} from "@/app/lib/api";
import { addDepartmentForTenant, getDepartmentsForTenant } from "@/app/lib/departments";
import { Input } from "@/app/components/ui/Input";
import { routes } from "@/app/lib/routes";

const ROLE_OPTIONS = [
  "Admin",
  "Manager",
  "LearningExpert",
  "TeamManager",
  "TeamMember",
  "TeamIntern",
];

const MAX_PAGE_SIZE = 100;

const statusStyles: Record<string, string> = {
  active: "bg-green-100 text-green-700",
  provisioned: "bg-blue-100 text-blue-700",
  pending: "bg-yellow-100 text-yellow-700",
  pending_invitation: "bg-yellow-100 text-yellow-700",
  suspended: "bg-red-100 text-red-700",
};

export default function SuperAdminUsersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialTenantFilter = searchParams.get("tenant") || "all";

  const [users, setUsers] = useState<UserResponse[]>([]);
  const [tenants, setTenants] = useState<TenantResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [tenantFilter, setTenantFilter] = useState(initialTenantFilter);
  const [roleFilter, setRoleFilter] = useState("all");
  const [departmentOptions, setDepartmentOptions] = useState<string[]>([]);
  const [showAddDepartment, setShowAddDepartment] = useState(false);
  const [newDepartmentName, setNewDepartmentName] = useState("");
  const [form, setForm] = useState({
    first_name: "",
    last_name: "",
    email: "",
    role: "TeamMember",
    tenant_id: "",
    department: "",
    password: "",
  });
  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const tenantFromQuery = searchParams.get("tenant") || "all";
    setTenantFilter(tenantFromQuery);
  }, [searchParams]);

  useEffect(() => {
    const selectedTenantId = form.tenant_id || (tenantFilter !== "all" ? tenantFilter : "");
    const tenantUsers = users.filter((user) => user.tenant_id === selectedTenantId);
    setDepartmentOptions(
      getDepartmentsForTenant(
        selectedTenantId || null,
        tenantUsers.map((user) => user.department)
      )
    );
  }, [form.tenant_id, tenantFilter, users]);

  async function loadData() {
    try {
      const [usersData, tenantsData] = await Promise.all([
        getPlatformUsers(1, MAX_PAGE_SIZE),
        getTenants(1, MAX_PAGE_SIZE),
      ]);
      setUsers(usersData.users || []);
      setTenants(tenantsData.tenants || []);
    } catch (error) {
      console.error("Failed to load platform users:", error);
      setMessage({ type: "error", text: "Failed to load users." });
    } finally {
      setLoading(false);
    }
  }

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return users.filter((user) => {
      const fullName = `${user.first_name} ${user.last_name}`.trim().toLowerCase();
      const matchesSearch =
        !query ||
        fullName.includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query);
      const matchesTenant = tenantFilter === "all" || user.tenant_id === tenantFilter;
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      return matchesSearch && matchesTenant && matchesRole;
    });
  }, [users, search, tenantFilter, roleFilter]);

  const tenantNameById = useMemo(
    () =>
      Object.fromEntries(tenants.map((tenant) => [tenant.id, tenant.name])),
    [tenants]
  );

  const activeTenant = useMemo(
    () => tenants.find((tenant) => tenant.id === tenantFilter) || null,
    [tenants, tenantFilter]
  );

  useEffect(() => {
    if (!showCreateForm) {
      return;
    }

    if (tenantFilter !== "all") {
      setForm((current) => ({
        ...current,
        tenant_id: current.tenant_id || tenantFilter,
      }));
    }
  }, [showCreateForm, tenantFilter]);

  async function handleCreateUser() {
    if (!form.first_name || !form.last_name || !form.email || !form.tenant_id || !form.password) {
      setMessage({ type: "error", text: "Please fill in all required fields." });
      return;
    }
    if (form.password.length < 8) {
      setMessage({ type: "error", text: "Password must contain at least 8 characters." });
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      if (form.role === "Admin") {
        await createAdminDirect({
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          password: form.password,
          tenant_id: form.tenant_id,
          department: form.department || undefined,
        });
      } else {
        await createPlatformUser({
          first_name: form.first_name,
          last_name: form.last_name,
          email: form.email,
          role: form.role,
          tenant_id: form.tenant_id,
          department: form.department || undefined,
          status: "active",
          password: form.password || undefined,
        });
      }

      setShowCreateForm(false);
      setForm({
        first_name: "",
        last_name: "",
        email: "",
        role: "TeamMember",
        tenant_id: "",
        department: "",
        password: "",
      });
      setMessage({
        type: "success",
        text: form.role === "Admin" ? "Admin created successfully." : "User created successfully.",
      });
      await loadData();
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to create user." });
    } finally {
      setSubmitting(false);
    }
  }

  function handleAddDepartment() {
    const selectedTenantId = form.tenant_id || (tenantFilter !== "all" ? tenantFilter : "");
    if (!selectedTenantId) {
      setMessage({ type: "error", text: "Select a company before adding a department." });
      return;
    }

    const nextDepartments = addDepartmentForTenant(selectedTenantId, newDepartmentName);
    if (!newDepartmentName.trim()) {
      return;
    }

    setDepartmentOptions(nextDepartments);
    setForm((current) => ({
      ...current,
      tenant_id: current.tenant_id || selectedTenantId,
      department: newDepartmentName.trim(),
    }));
    setNewDepartmentName("");
    setShowAddDepartment(false);
  }

  async function handleDeleteUser(user: UserResponse) {
    const confirmed = window.confirm(
      `Delete ${user.first_name} ${user.last_name} permanently?`
    );
    if (!confirmed) {
      return;
    }

    setSubmitting(true);
    setMessage(null);

    try {
      await deletePlatformUser(user.id);
      setUsers((current) => current.filter((item) => item.id !== user.id));
      setMessage({ type: "success", text: "User deleted successfully." });
    } catch (error: any) {
      setMessage({ type: "error", text: error.message || "Failed to delete user." });
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,250,248,0.94),rgba(232,244,248,0.9))] shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
        <div className="text-sm font-medium text-slate-700">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex justify-end">
          <button
            onClick={() => setShowCreateForm(true)}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#10B981] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#0ea371]"
          >
            <Plus className="h-4 w-4" />
            Add User
          </button>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] px-5 py-4 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-700">Total Users</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{users.length}</p>
          </div>
          <div className="rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] px-5 py-4 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-700">Admins</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">
              {users.filter((user) => user.role === "Admin").length}
            </p>
          </div>
          <div className="rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] px-5 py-4 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-700">Companies</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{tenants.length}</p>
          </div>
        </div>

        {message && (
          <div
            className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
              message.type === "success"
                ? "border-green-500/30 bg-green-500/10 text-green-400"
                : "border-red-500/30 bg-red-500/10 text-red-400"
            }`}
          >
            {message.text}
          </div>
        )}

        {showCreateForm && (
          <div className="mb-6 rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
            <div className="mb-5 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-semibold text-slate-950">Add New User</h2>
                <p className="mt-1 text-sm text-slate-600">
                  Use the same core account details as the admin user flow. Admin accounts require a password for direct local login.
                </p>
              </div>
              <button
                onClick={() => setShowCreateForm(false)}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {activeTenant && (
              <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Company</p>
                <p className="mt-1 text-sm font-medium text-slate-900">{activeTenant.name}</p>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm text-slate-700">First Name *</label>
                <input
                  type="text"
                  value={form.first_name}
                  onChange={(e) => setForm({ ...form, first_name: e.target.value })}
                  placeholder="First name"
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-700">Last Name *</label>
                <input
                  type="text"
                  value={form.last_name}
                  onChange={(e) => setForm({ ...form, last_name: e.target.value })}
                  placeholder="Last name"
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm text-slate-700">Email *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  placeholder="user@company.com"
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                />
              </div>
              {!activeTenant && (
              <div>
                <label className="mb-2 block text-sm text-slate-700">Company *</label>
                <select
                  value={form.tenant_id}
                  onChange={(e) => setForm({ ...form, tenant_id: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                >
                  <option value="">Select company</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              </div>
              )}
              <div>
                <label className="mb-2 block text-sm text-slate-700">Role *</label>
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
                <label className="mb-2 block text-sm text-slate-700">Department</label>
                <select
                  value={form.department}
                  onChange={(e) => setForm({ ...form, department: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  disabled={!form.tenant_id && !activeTenant}
                >
                  <option value="">
                    {form.tenant_id || activeTenant ? "Select department" : "Select company first"}
                  </option>
                  {departmentOptions.map((department) => (
                    <option key={department} value={department}>
                      {department}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowAddDepartment((current) => !current)}
                  className="mt-2 text-xs text-emerald-700 transition-colors hover:text-emerald-800"
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
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm text-slate-700">Password *</label>
                <div>
                  <Input
                    type="password"
                    value={form.password}
                    onChange={(e) => setForm({ ...form, password: e.target.value })}
                    placeholder="Minimum 8 characters for local login"
                    className="w-full rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Every new user must receive direct local login credentials at creation time.
                </p>
              </div>
            </div>

            <div className="mt-5 flex gap-3">
              <button
                onClick={() => setShowCreateForm(false)}
                className="rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateUser}
                disabled={submitting}
                className="rounded-lg bg-emerald-600 px-4 py-2.5 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {submitting ? "Creating..." : form.role === "Admin" ? "Create Admin" : "Create User"}
              </button>
            </div>
          </div>
        )}

        <div className="mb-6 grid gap-4 rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] p-5 shadow-[0_20px_40px_rgba(15,23,42,0.08)] lg:grid-cols-[minmax(0,1fr)_220px_220px]">
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or role"
              className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
            />
          </label>

          <select
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
          >
            <option value="all">All companies</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>

          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
          >
            <option value="all">All roles</option>
            {ROLE_OPTIONS.map((role) => (
              <option key={role} value={role}>
                {role}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h2 className="text-lg font-semibold text-slate-950">All Platform Users</h2>
            </div>
            <span className="text-sm text-slate-600">
              {filteredUsers.length} result{filteredUsers.length === 1 ? "" : "s"}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-[linear-gradient(180deg,rgba(244,250,252,0.95),rgba(237,247,248,0.9))]">
                <tr className="border-b border-slate-200">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">User</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Company</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Role</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Department</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Status</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => {
                  const initials = `${user.first_name?.charAt(0) || ""}${user.last_name?.charAt(0) || ""}` || "U";

                  return (
                    <tr key={user.id} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50/80">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                            {initials.toUpperCase()}
                          </div>
                          <div>
                            <p className="font-medium text-slate-950">{user.first_name} {user.last_name}</p>
                            <div className="flex items-center gap-2 text-sm text-slate-600">
                              <Mail className="h-3.5 w-3.5 text-slate-500" />
                              {user.email}
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-4 w-4 text-slate-500" />
                          {user.tenant_id ? tenantNameById[user.tenant_id] || "Unknown company" : "No company"}
                        </div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="inline-flex items-center gap-2 text-sm text-slate-700">
                          {user.role === "Admin" && <Shield className="h-4 w-4 text-primary" />}
                          {user.role}
                        </div>
                      </td>
                      <td className="px-5 py-4 text-sm text-slate-700">{user.department || "-"}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[user.status] || "bg-gray-500/20 text-gray-300"}`}>
                          {user.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => router.push(routes.superadminUserDetail(user.id))}
                            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => void handleDeleteUser(user)}
                            disabled={submitting || user.role === "SuperAdmin"}
                            className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredUsers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-14 text-center text-slate-600">
                      No users match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
    </div>
  );
}
