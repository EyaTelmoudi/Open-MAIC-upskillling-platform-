"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { routes } from "@/app/lib/routes";
import { getTenants, type TenantResponse } from "@/app/lib/api";
import { ArrowLeft, Building2, UserPlus, Users } from "lucide-react";

export default function SuperAdminAdminsPage() {
  const [tenants, setTenants] = useState<TenantResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadTenants() {
      try {
        const data = await getTenants(1, 100);
        setTenants(data.tenants || []);
      } catch (error) {
        console.error("Failed to load tenant users view:", error);
      } finally {
        setLoading(false);
      }
    }

    void loadTenants();
  }, []);

  const totalUsers = useMemo(
    () => tenants.reduce((sum, tenant) => sum + (tenant.user_count || 0), 0),
    [tenants]
  );

  const orderedTenants = useMemo(
    () => [...tenants].sort((a, b) => (b.user_count || 0) - (a.user_count || 0)),
    [tenants]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F1117]">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <Link
              href={routes.superadmin}
              className="mb-2 inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Link>
            <h1 className="text-3xl font-bold text-white">Users by Company</h1>
            <p className="mt-1 text-gray-400">
              {totalUsers} total users distributed across your companies.
            </p>
          </div>
          <Link
            href={routes.superadminTenants}
            className="inline-flex items-center gap-2 rounded-lg bg-[#6C63FF] px-4 py-2 text-white transition-colors hover:bg-[#5a52d4]"
          >
            <UserPlus className="h-4 w-4" />
            Add User
          </Link>
        </div>

        {orderedTenants.length === 0 ? (
          <div className="rounded-2xl border border-[#2A2D3E] bg-[#1A1D27] p-12 text-center">
            <p className="text-gray-400">No companies found yet.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[#2A2D3E] bg-[#1A1D27]">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[#2A2D3E]">
                  <th className="px-6 py-4 text-left text-gray-400">Company</th>
                  <th className="px-6 py-4 text-left text-gray-400">Domain</th>
                  <th className="px-6 py-4 text-left text-gray-400">Status</th>
                  <th className="px-6 py-4 text-right text-gray-400">Users</th>
                  <th className="px-6 py-4 text-right text-gray-400">Actions</th>
                </tr>
              </thead>
              <tbody>
                {orderedTenants.map((tenant) => (
                  <tr key={tenant.id} className="border-b border-[#2A2D3E] hover:bg-white/5">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {tenant.logo_url ? (
                          <img src={tenant.logo_url} alt="" className="h-8 w-8 rounded-lg object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#6C63FF]/20">
                            <Building2 className="h-4 w-4 text-[#6C63FF]" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-white">{tenant.name}</p>
                          <p className="text-xs text-gray-500">{tenant.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-300">
                      {tenant.email_domain || "-"}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`rounded-full px-2 py-1 text-xs ${
                          tenant.status === "active"
                            ? "bg-green-500/20 text-green-400"
                            : tenant.status === "suspended"
                              ? "bg-red-500/20 text-red-400"
                              : "bg-yellow-500/20 text-yellow-400"
                        }`}
                      >
                        {tenant.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2 text-gray-300">
                        <Users className="h-4 w-4 text-gray-500" />
                        {tenant.user_count || 0}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={routes.superadminTenantDetail(tenant.id)}
                          className="rounded-lg border border-[#3A3D4E] px-3 py-1.5 text-sm text-gray-200 transition-colors hover:bg-[#2A2D3E] hover:text-white"
                        >
                          View Users
                        </Link>
                        <Link
                          href={routes.superadminTenantDetail(tenant.id)}
                          className="rounded-lg bg-[#6C63FF] px-3 py-1.5 text-sm text-white transition-colors hover:bg-[#5a52d4]"
                        >
                          Add User
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
