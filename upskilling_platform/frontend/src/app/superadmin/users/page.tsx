"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Building2, Mail, Search, Shield, Trash2, Users } from "lucide-react";

import {
  deletePlatformUser,
  getPlatformUsers,
  getTenants,
  type TenantResponse,
  type UserResponse,
} from "@/app/lib/api";
import { routes } from "@/app/lib/routes";
import { UsersManagementNav } from "./UsersManagementNav";

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
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [search, setSearch] = useState("");
  const [tenantFilter, setTenantFilter] = useState(initialTenantFilter);
  const [roleFilter, setRoleFilter] = useState("all");

  useEffect(() => {
    void loadData();
  }, []);

  useEffect(() => {
    const tenantFromQuery = searchParams.get("tenant") || "all";
    setTenantFilter(tenantFromQuery);
  }, [searchParams]);

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
    () => Object.fromEntries(tenants.map((tenant) => [tenant.id, tenant.name])),
    [tenants]
  );

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
    } catch (error) {
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to delete user.",
      });
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
      <UsersManagementNav />

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
              ? "border-green-200 bg-green-50 text-green-800"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          {message.text}
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
                const initials =
                  `${user.first_name?.charAt(0) || ""}${user.last_name?.charAt(0) || ""}` || "U";

                return (
                  <tr
                    key={user.id}
                    onClick={() => router.push(routes.superadminUserDetail(user.id))}
                    className="cursor-pointer border-b border-slate-200 transition last:border-b-0 hover:bg-slate-50/80"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                          {initials.toUpperCase()}
                        </div>
                        <div>
                          <p className="font-medium text-slate-950">
                            {user.first_name} {user.last_name}
                          </p>
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
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${statusStyles[user.status] || "bg-gray-100 text-gray-700"}`}>
                        {user.status}
                      </span>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(routes.superadminUserDetail(user.id));
                          }}
                          className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
                        >
                          Edit
                        </button>
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleDeleteUser(user);
                          }}
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
