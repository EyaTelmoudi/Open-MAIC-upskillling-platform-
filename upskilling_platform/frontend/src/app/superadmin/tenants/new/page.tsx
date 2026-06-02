"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTenant, type CreateTenantRequest } from "@/app/lib/api";
import { routes } from "@/app/lib/routes";
import { Building2, CheckCircle2, KeyRound, Plus, ShieldCheck, UsersRound } from "lucide-react";
import { CompaniesManagementNav } from "../CompaniesManagementNav";

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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tenant");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl">
      <CompaniesManagementNav />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] sm:p-7">
          <div className="mb-7 flex flex-col gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-emerald-100 p-3 ring-1 ring-emerald-200/70">
                <Plus className="h-6 w-6 text-emerald-700" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-950">Create New Company</h1>
                <p className="mt-1 text-sm text-slate-600">Add a new company to the platform</p>
              </div>
            </div>
            <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <Building2 className="h-3.5 w-3.5" />
              Tenant setup
            </span>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-7">
            <div className="grid gap-4 md:grid-cols-2">
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

            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Email Domain
                </label>
                <input
                  type="text"
                  value={form.email_domain}
                  onChange={(e) => setForm({ ...form, email_domain: e.target.value })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  placeholder="e.g., company.com"
                />
                <p className="mt-1 text-xs text-slate-500">Used for login auto-detection.</p>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-700">
                  Seat Limit
                </label>
                <input
                  type="number"
                  value={form.seat_limit || ""}
                  onChange={(e) => setForm({ ...form, seat_limit: e.target.value ? parseInt(e.target.value) : undefined })}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  placeholder="Leave empty for unlimited"
                  min="1"
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-sm font-medium text-slate-700">
                Logo URL
              </label>
              <input
                type="url"
                value={form.logo_url}
                onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                placeholder="https://your-company.com/logo.png"
              />
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
              <h3 className="mb-4 flex items-center gap-2 text-lg font-medium text-slate-950">
                <KeyRound className="h-5 w-5 text-emerald-700" />
                Azure Entra ID Configuration
              </h3>
              <div className="grid gap-4 md:grid-cols-2">
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

            <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={() => router.push(routes.superadminTenants)}
                className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="rounded-xl bg-emerald-600 px-6 py-2.5 font-medium text-white shadow-[0_14px_30px_rgba(16,185,129,0.24)] transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? "Creating..." : "Create Company"}
              </button>
            </div>
          </form>
        </div>

        <aside className="space-y-4">
          <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(240,251,247,0.94)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200/70">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h2 className="mt-5 text-lg font-semibold text-slate-950">Company workspace setup</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Create the tenant first, then assign an admin, configure identity, and invite users from the governance workspace.
            </p>
            <div className="mt-5 space-y-3">
              {[
                "Create tenant record",
                "Set capacity and domain",
                "Connect Entra ID when ready",
              ].map((item) => (
                <div key={item} className="flex items-center gap-3 text-sm font-medium text-slate-700">
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200/80 bg-white/90 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                <UsersRound className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-slate-950">Next step</h3>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  After creation, assign a tenant admin so the company can manage its own users and learning operations.
                </p>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
