"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, Building2, Mail, Search, Users } from "lucide-react";

import { api, getTenant, type TenantResponse } from "@/app/lib/api";
import { routes } from "@/app/lib/routes";

interface CompanyUser {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  role: string;
  status: string;
  tenant_id?: string;
}

const MAX_PAGE_SIZE = 100;

const statusStyles: Record<string, string> = {
  active: "bg-green-500/20 text-green-400",
  provisioned: "bg-blue-500/20 text-blue-400",
  pending: "bg-yellow-500/20 text-yellow-400",
  pending_invitation: "bg-yellow-500/20 text-yellow-400",
  suspended: "bg-red-500/20 text-red-400",
};

export default function TenantUsersPage() {
  const params = useParams();
  const tenantId = params.id as string;

  const [tenant, setTenant] = useState<TenantResponse | null>(null);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    async function loadData() {
      try {
        const [tenantData, usersResponse] = await Promise.all([
          getTenant(tenantId),
          api.get<{ users: CompanyUser[] }>(`/api/v1/identity/users/?page=1&page_size=${MAX_PAGE_SIZE}`),
        ]);

        setTenant(tenantData);
        setUsers((usersResponse.users || []).filter((user) => user.tenant_id === tenantId));
      } finally {
        setLoading(false);
      }
    }

    if (tenantId) {
      void loadData();
    }
  }, [tenantId]);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return users.filter((user) => {
      const matchesStatus = statusFilter === "all" || user.status === statusFilter;
      const fullName = `${user.first_name} ${user.last_name}`.trim().toLowerCase();
      const matchesSearch =
        !query ||
        fullName.includes(query) ||
        user.email.toLowerCase().includes(query) ||
        user.role.toLowerCase().includes(query);

      return matchesStatus && matchesSearch;
    });
  }, [users, search, statusFilter]);

  const uniqueStatuses = Array.from(new Set(users.map((user) => user.status))).sort();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F1117]">
        <div className="text-white">Loading users...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] p-8">
      <div className="mx-auto max-w-7xl">
        <Link
          href={routes.superadminTenantDetail(tenantId)}
          className="mb-4 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Company
        </Link>

        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[#2A2D3E] bg-[#1A1D27] px-3 py-1 text-xs text-gray-300">
              <Building2 className="h-3.5 w-3.5 text-[#6C63FF]" />
              {tenant?.name || "Company"}
            </div>
            <h1 className="text-3xl font-bold text-white">Company Users</h1>
            <p className="mt-1 text-gray-400">
              Review all users assigned to this company in one place.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-[#2A2D3E] bg-[#1A1D27] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Total Users</p>
              <p className="mt-2 text-2xl font-semibold text-white">{users.length}</p>
            </div>
            <div className="rounded-2xl border border-[#2A2D3E] bg-[#1A1D27] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Active Users</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {users.filter((user) => user.status === "active").length}
              </p>
            </div>
          </div>
        </div>

        <div className="mb-6 grid gap-4 rounded-2xl border border-[#2A2D3E] bg-[#1A1D27] p-5 lg:grid-cols-[minmax(0,1fr)_220px]">
          <label className="flex items-center gap-3 rounded-xl border border-[#2A2D3E] bg-[#0F1117] px-4 py-3">
            <Search className="h-4 w-4 text-gray-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, email, or role"
              className="w-full bg-transparent text-sm text-white outline-none placeholder:text-gray-500"
            />
          </label>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-xl border border-[#2A2D3E] bg-[#0F1117] px-4 py-3 text-sm text-white outline-none"
          >
            <option value="all">All statuses</option>
            {uniqueStatuses.map((status) => (
              <option key={status} value={status}>
                {status}
              </option>
            ))}
          </select>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[#2A2D3E] bg-[#1A1D27]">
          <div className="flex items-center justify-between border-b border-[#2A2D3E] px-5 py-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-[#6C63FF]" />
              <h2 className="text-lg font-semibold text-white">Users Directory</h2>
            </div>
            <span className="text-sm text-gray-400">
              {filteredUsers.length} result{filteredUsers.length === 1 ? "" : "s"}
            </span>
          </div>

          {filteredUsers.length === 0 ? (
            <div className="px-6 py-14 text-center text-gray-400">
              No users match the current search or filter.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px]">
                <thead className="bg-[#0F1117]">
                  <tr className="border-b border-[#2A2D3E]">
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      User
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      Contact
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      Role
                    </th>
                    <th className="px-5 py-3 text-left text-xs font-medium uppercase tracking-wide text-gray-500">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredUsers.map((user) => {
                    const initials = `${user.first_name?.charAt(0) || ""}${user.last_name?.charAt(0) || ""}` || "U";

                    return (
                      <tr key={user.id} className="border-b border-[#2A2D3E] last:border-b-0 hover:bg-[#202433]">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#6C63FF]/20 text-sm font-semibold text-[#B8B4FF]">
                              {initials.toUpperCase()}
                            </div>
                            <div>
                              <p className="font-medium text-white">
                                {user.first_name} {user.last_name}
                              </p>
                              <p className="text-xs text-gray-500">ID: {user.id}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2 text-sm text-gray-300">
                            <Mail className="h-4 w-4 text-gray-500" />
                            {user.email}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-300">{user.role}</td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              statusStyles[user.status] || "bg-gray-500/20 text-gray-300"
                            }`}
                          >
                            {user.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
