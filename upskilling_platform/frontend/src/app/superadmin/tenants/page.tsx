"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { routes } from "../../lib/routes";
import {
  deleteTenant,
  getTenants,
  type TenantResponse,
} from "../../lib/api";

export default function SuperAdminTenants() {
  const router = useRouter();
  const [tenants, setTenants] = useState<TenantResponse[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadTenants() {
    try {
      const data = await getTenants(1, 50);
      setTenants(data.tenants || []);
    } catch (loadError) {
      console.error("Failed to load tenants:", loadError);
      router.push(routes.login);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadTenants();
  }, []);

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to suspend this tenant?")) return;
    try {
      await deleteTenant(id);
      await loadTenants();
    } catch (deleteError) {
      console.error("Failed to delete tenant:", deleteError);
    }
  }

  const statusColors: Record<string, string> = {
    active: "bg-emerald-100 text-emerald-700",
    pending: "bg-amber-100 text-amber-700",
    suspended: "bg-red-100 text-red-700",
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,250,248,0.94),rgba(232,244,248,0.9))] shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
        <div className="text-sm font-medium text-slate-700">Loading...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex justify-end">
          <Link
            href={routes.superadminTenantNew}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#10B981] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#0ea371]"
          >
            <Plus className="h-4 w-4" />
            Add Company
          </Link>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-[linear-gradient(180deg,rgba(244,250,252,0.95),rgba(237,247,248,0.9))]">
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Company</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Slug</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Email Domain</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Status</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Users</th>
                <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Created</th>
                <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tenants.map((tenant) => (
                <tr
                  key={tenant.id}
                  onClick={() => router.push(routes.superadminTenantDetail(tenant.id))}
                  className="cursor-pointer border-b border-slate-200 transition-colors hover:bg-slate-50/80"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {tenant.logo_url ? (
                        <img src={tenant.logo_url} alt="" className="h-8 w-8 rounded-lg" />
                      ) : (
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                          {tenant.name.charAt(0)}
                        </div>
                      )}
                      <span className="font-medium text-slate-950">{tenant.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-slate-700">{tenant.slug}</td>
                  <td className="px-6 py-4 text-slate-700">{tenant.email_domain || "-"}</td>
                  <td className="px-6 py-4">
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${statusColors[tenant.status] || statusColors.pending}`}
                    >
                      {tenant.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-slate-700">{tenant.user_count}</td>
                  <td className="px-6 py-4 text-slate-700">
                    {new Date(tenant.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex justify-end gap-2">
                      <Link
                        href={routes.superadminTenantDetail(tenant.id)}
                        onClick={(event) => event.stopPropagation()}
                        className="rounded px-3 py-1 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 hover:text-emerald-800"
                      >
                        Edit
                      </Link>
                      <button
                        onClick={(event) => {
                          event.stopPropagation();
                          void handleDelete(tenant.id);
                        }}
                        className="rounded px-3 py-1 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 hover:text-red-800"
                      >
                        Suspend
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {tenants.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center italic text-slate-600">
                    No companies found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
    </div>
  );
}
