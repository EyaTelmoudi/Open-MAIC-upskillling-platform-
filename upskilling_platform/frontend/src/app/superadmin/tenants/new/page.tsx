"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTenant, type CreateTenantRequest } from "@/app/lib/api";
import { routes } from "@/app/lib/routes";
import { Plus } from "lucide-react";

export default function CreateTenantPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<CreateTenantRequest>({
    name: "",
    slug: "",
    email_domain: "",
    logo_url: "",
    seat_limit: undefined as number | undefined,
    entra_client_id: "",
    entra_tenant_id: "",
  });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await createTenant(form);
      router.push(routes.superadminTenants);
    } catch (err: any) {
      setError(err.message || "Failed to create tenant");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl p-8">
      <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
        <div className="flex items-center gap-3 mb-6">
          <div className="rounded-xl bg-emerald-100 p-2">
            <Plus className="h-6 w-6 text-emerald-700" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-950">Create New Company</h1>
            <p className="text-sm text-slate-600">Add a new company to the platform</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Company Name *
              </label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400"
                placeholder="e.g., Acme Corporation"
                required
              />
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Slug *
              </label>
              <input
                type="text"
                value={form.slug}
                onChange={(e) => setForm({ ...form, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400"
                placeholder="e.g., acme-corporation"
                required
              />
              <p className="mt-1 text-xs text-slate-500">URL-friendly identifier (lowercase, hyphens)</p>
            </div>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Email Domain
            </label>
            <input
              type="text"
              value={form.email_domain}
              onChange={(e) => setForm({ ...form, email_domain: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400"
              placeholder="e.g., company.com"
            />
            <p className="mt-1 text-xs text-slate-500">Company domain for auto-detection on login (e.g., @company.com)</p>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Logo URL
            </label>
            <input
              type="url"
              value={form.logo_url}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400"
              placeholder="https://your-company.com/logo.png"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-700">
              Seat Limit
            </label>
            <input
              type="number"
              value={form.seat_limit || ""}
              onChange={(e) => setForm({ ...form, seat_limit: e.target.value ? parseInt(e.target.value) : undefined })}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400"
              placeholder="Leave empty for unlimited"
              min="1"
            />
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="mb-4 text-lg font-medium text-slate-950">Azure Entra ID Configuration (Optional)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Client ID
                </label>
                <input
                  type="text"
                  value={form.entra_client_id}
                  onChange={(e) => setForm({ ...form, entra_client_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400"
                  placeholder="Azure Client ID"
                />
              </div>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Tenant ID
                </label>
                <input
                  type="text"
                  value={form.entra_tenant_id}
                  onChange={(e) => setForm({ ...form, entra_tenant_id: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:outline-none focus:ring-2 focus:ring-emerald-100 focus:border-emerald-400"
                  placeholder="Azure Tenant ID"
                />
              </div>
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl bg-emerald-600 px-6 py-2.5 font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? "Creating..." : "Create Company"}
            </button>
            <button
              type="button"
              onClick={() => router.push(routes.superadminTenants)}
              className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
