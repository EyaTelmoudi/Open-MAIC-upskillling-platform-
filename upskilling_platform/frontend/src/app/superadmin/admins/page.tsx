"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Mail, Shield, UserPlus, Users } from "lucide-react";

import {
  getTenantAdmins,
  getTenants,
  type TenantAdminResponse,
  type TenantResponse,
} from "@/app/lib/api";
import { routes } from "@/app/lib/routes";

type TenantAdminRow = {
  tenant: TenantResponse;
  admin: TenantAdminResponse | null;
};

const statusStyles: Record<string, string> = {
  active: "bg-green-500/20 text-green-400",
  pending: "bg-yellow-500/20 text-yellow-400",
  pending_invitation: "bg-yellow-500/20 text-yellow-400",
  suspended: "bg-red-500/20 text-red-400",
  provisioned: "bg-blue-500/20 text-blue-400",
};

export default function SuperAdminAdminsPage() {
  const [tenants, setTenants] = useState<TenantResponse[]>([]);
  const [admins, setAdmins] = useState<TenantAdminResponse[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [tenantData, adminData] = await Promise.all([
          getTenants(1, 100),
          getTenantAdmins(1, 100),
        ]);

        setTenants(tenantData.tenants || []);
        setAdmins(adminData.admins || []);
      } catch (error) {
        console.error("Failed to load tenant admins page:", error);
      } finally {
        setLoading(false);
      }
    }

    void loadData();
  }, []);

  const rows = useMemo<TenantAdminRow[]>(() => {
    const adminByTenantId = new Map<string, TenantAdminResponse>();

    admins.forEach((admin) => {
      if (admin.tenant_id && !adminByTenantId.has(admin.tenant_id)) {
        adminByTenantId.set(admin.tenant_id, admin);
      }
    });

    return [...tenants]
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((tenant) => ({
        tenant,
        admin: adminByTenantId.get(tenant.id) || null,
      }));
  }, [admins, tenants]);

  const assignedCount = useMemo(
    () => rows.filter((row) => row.admin).length,
    [rows]
  );

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#0F1117]">
        <div className="text-white">Loading tenant admins...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white">Tenant Admins</h1>
            <p className="mt-1 text-gray-400">
              Super admin view of the admin responsible for each company in the group.
            </p>
          </div>

          <Link
            href={routes.superadminTenants}
            className="inline-flex items-center gap-2 rounded-lg bg-[#6C63FF] px-4 py-2 text-white transition-colors hover:bg-[#5a52d4]"
          >
            <UserPlus className="h-4 w-4" />
            Manage Companies
          </Link>
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-[#2A2D3E] bg-[#1A1D27] px-5 py-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Total Companies</p>
            <p className="mt-2 text-3xl font-semibold text-white">{rows.length}</p>
          </div>
          <div className="rounded-2xl border border-[#2A2D3E] bg-[#1A1D27] px-5 py-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Admins Assigned</p>
            <p className="mt-2 text-3xl font-semibold text-white">{assignedCount}</p>
          </div>
          <div className="rounded-2xl border border-[#2A2D3E] bg-[#1A1D27] px-5 py-4">
            <p className="text-xs uppercase tracking-wide text-gray-500">Without Admin</p>
            <p className="mt-2 text-3xl font-semibold text-white">{rows.length - assignedCount}</p>
          </div>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-2xl border border-[#2A2D3E] bg-[#1A1D27] p-12 text-center">
            <p className="text-gray-400">No companies found yet.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[#2A2D3E] bg-[#1A1D27]">
            <table className="w-full min-w-[980px]">
              <thead className="bg-[#0F1117]">
                <tr className="border-b border-[#2A2D3E]">
                  <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Company</th>
                  <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Tenant Admin</th>
                  <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Email</th>
                  <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Department</th>
                  <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wide text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ tenant, admin }) => (
                  <tr key={tenant.id} className="border-b border-[#2A2D3E] last:border-b-0 hover:bg-[#202433]">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        {tenant.logo_url ? (
                          <img src={tenant.logo_url} alt="" className="h-9 w-9 rounded-lg object-cover" />
                        ) : (
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#6C63FF]/20">
                            <Building2 className="h-4 w-4 text-[#6C63FF]" />
                          </div>
                        )}
                        <div>
                          <p className="font-medium text-white">{tenant.name}</p>
                          <p className="text-xs text-gray-500">{tenant.email_domain || tenant.slug}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {admin ? (
                        <div className="inline-flex items-center gap-2 text-sm text-gray-200">
                          <Shield className="h-4 w-4 text-[#6C63FF]" />
                          {admin.first_name} {admin.last_name}
                        </div>
                      ) : (
                        <span className="text-sm text-gray-500">No admin assigned</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-300">
                      {admin ? (
                        <div className="inline-flex items-center gap-2">
                          <Mail className="h-4 w-4 text-gray-500" />
                          {admin.email}
                        </div>
                      ) : (
                        "-"
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-300">
                      {admin?.department || "-"}
                    </td>
                    <td className="px-6 py-4">
                      {admin ? (
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            statusStyles[admin.status] || "bg-gray-500/20 text-gray-300"
                          }`}
                        >
                          {admin.status}
                        </span>
                      ) : (
                        <span className="inline-flex rounded-full bg-gray-500/20 px-2.5 py-1 text-xs font-medium text-gray-300">
                          unassigned
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-end gap-2">
                        <Link
                          href={routes.superadminTenantDetail(tenant.id)}
                          className="rounded-lg border border-[#3A3D4E] px-3 py-1.5 text-sm text-gray-200 transition-colors hover:bg-[#2A2D3E] hover:text-white"
                        >
                          View Company
                        </Link>
                        <Link
                          href={routes.superadminTenantDetail(tenant.id)}
                          className="rounded-lg bg-[#6C63FF] px-3 py-1.5 text-sm text-white transition-colors hover:bg-[#5a52d4]"
                        >
                          {admin ? "Manage Admin" : "Assign Admin"}
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
