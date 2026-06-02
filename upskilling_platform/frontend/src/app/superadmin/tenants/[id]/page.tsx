"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Building2,
  CheckCircle2,
  ChevronRight,
  Mail,
  Save,
  Shield,
  Trash2,
  User,
  Users,
} from "lucide-react";

import { CompaniesManagementNav } from "../CompaniesManagementNav";
import { SetupProgress } from "@/app/components/ui/SetupProgress";
import { Input } from "@/app/components/ui/Input";
import {
  api,
  createAdminDirect,
  getTenant,
  getTenantAdmin,
  getTenantProgress,
  resetTenantAdminPassword,
  testEntraConnection,
  unassignTenantAdmin,
  updateTenantAdminStatus,
  updateTenant,
  type CreateAdminRequest,
  type TenantAdminResponse,
  type TenantResponse,
  type TenantSetupProgress,
  type UpdateTenantRequest,
} from "@/app/lib/api";
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

export default function TenantDetail() {
  const router = useRouter();
  const params = useParams();
  const tenantId = params.id as string;

  const [tenant, setTenant] = useState<TenantResponse | null>(null);
  const [progress, setProgress] = useState<TenantSetupProgress | null>(null);
  const [admin, setAdmin] = useState<TenantAdminResponse | null>(null);
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [form, setForm] = useState<UpdateTenantRequest>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [unassigning, setUnassigning] = useState(false);
  const [updatingAdminStatus, setUpdatingAdminStatus] = useState(false);
  const [resettingAdminPassword, setResettingAdminPassword] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{ email: string; password: string } | null>(null);
  const [adminActionMessage, setAdminActionMessage] = useState<string | null>(null);
  const [adminActionError, setAdminActionError] = useState<string | null>(null);
  const [adminForm, setAdminForm] = useState<CreateAdminRequest>({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    tenant_id: tenantId,
  });

  useEffect(() => {
    async function loadTenant() {
      try {
        const [tenantData, progressData, adminData] = await Promise.all([
          getTenant(tenantId),
          getTenantProgress(tenantId),
          getTenantAdmin(tenantId),
        ]);
        const usersResponse = await api.get<{ users: CompanyUser[] }>("/api/v1/identity/users/?page=1&page_size=100");

        setTenant(tenantData);
        setProgress(progressData);
        setAdmin(adminData);
        setCompanyUsers((usersResponse.users || []).filter((user) => user.tenant_id === tenantId));
        setForm({
          name: tenantData.name,
          email_domain: tenantData.email_domain,
          logo_url: tenantData.logo_url,
          entra_client_id: tenantData.entra_client_id,
          entra_tenant_id: tenantData.entra_tenant_id,
          seat_limit: tenantData.seat_limit,
        });
        setAdminForm((current) => ({ ...current, tenant_id: tenantId }));
      } catch (error) {
        console.error("Failed to load tenant:", error);
        router.push(routes.superadminTenants);
      } finally {
        setLoading(false);
      }
    }

    if (tenantId) {
      void loadTenant();
    }
  }, [router, tenantId]);

  async function handleSave() {
    setSaving(true);
    setSaveMessage(null);
    setSaveError(null);
    try {
      const updatedTenant = await updateTenant(tenantId, form);
      setTenant(updatedTenant);
      setForm({
        name: updatedTenant.name,
        email_domain: updatedTenant.email_domain,
        logo_url: updatedTenant.logo_url,
        entra_client_id: updatedTenant.entra_client_id,
        entra_tenant_id: updatedTenant.entra_tenant_id,
        seat_limit: updatedTenant.seat_limit,
      });
      setProgress(await getTenantProgress(tenantId));
      setSaveMessage("Company information updated.");
    } catch (error) {
      console.error("Failed to update tenant:", error);
      setSaveError(error instanceof Error ? error.message : "Failed to update company information.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTestConnection() {
    if (!form.entra_tenant_id) {
      setTestResult({ success: false, message: "Please provide a Tenant ID first" });
      return;
    }

    setTesting(true);
    setTestResult(null);
    try {
      const result = await testEntraConnection(tenantId);
      setTestResult(result);
    } catch (error) {
      setTestResult({
        success: false,
        message: error instanceof Error ? error.message : "Failed to test connection",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleUnassignAdmin() {
    if (!admin || !confirm(`Are you sure you want to remove ${admin.first_name} ${admin.last_name} as admin?`)) {
      return;
    }

    setUnassigning(true);
    setAdminActionMessage(null);
    setAdminActionError(null);
    try {
      await unassignTenantAdmin(admin.id);
      setAdmin(null);
      setProgress(await getTenantProgress(tenantId));
      setAdminActionMessage("Company admin removed.");
    } catch (error) {
      console.error("Failed to unassign admin:", error);
      setAdminActionError(error instanceof Error ? error.message : "Failed to remove company admin.");
    } finally {
      setUnassigning(false);
    }
  }

  async function handleAdminStatusChange() {
    if (!admin) return;
    const nextStatus = admin.status === "active" ? "suspended" : "active";
    setUpdatingAdminStatus(true);
    setAdminActionMessage(null);
    setAdminActionError(null);
    try {
      const updatedAdmin = await updateTenantAdminStatus(
        admin.id,
        nextStatus,
        nextStatus === "suspended" ? "Suspended from company detail page" : "Reactivated from company detail page"
      );
      setAdmin(updatedAdmin);
      setAdminActionMessage(nextStatus === "suspended" ? "Company admin suspended." : "Company admin reactivated.");
    } catch (error) {
      console.error("Failed to update admin status:", error);
      setAdminActionError(error instanceof Error ? error.message : "Failed to update admin status.");
    } finally {
      setUpdatingAdminStatus(false);
    }
  }

  async function handleResetAdminPassword() {
    if (!admin || !confirm(`Reset password for ${admin.email}?`)) return;
    setResettingAdminPassword(true);
    setAdminActionMessage(null);
    setAdminActionError(null);
    try {
      const result = await resetTenantAdminPassword(admin.id);
      setCreatedCredentials({ email: result.email, password: result.tempPassword });
      setAdminActionMessage("Temporary admin password generated.");
    } catch (error) {
      console.error("Failed to reset admin password:", error);
      setAdminActionError(error instanceof Error ? error.message : "Failed to reset admin password.");
    } finally {
      setResettingAdminPassword(false);
    }
  }

  async function handleCreateAdmin() {
    setCreatingAdmin(true);
    try {
      const response = await createAdminDirect(adminForm);
      setCreatedCredentials(response.login_credentials);
      setAdminForm({
        first_name: "",
        last_name: "",
        email: "",
        password: "",
        tenant_id: tenantId,
      });
      setShowCreateAdmin(false);
      setAdmin(await getTenantAdmin(tenantId));
    } catch (error) {
      console.error("Failed to create admin:", error);
    } finally {
      setCreatingAdmin(false);
    }
  }

  if (loading || !tenant) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,250,248,0.94),rgba(232,244,248,0.9))] shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
        <div className="text-sm font-medium text-slate-700">Loading company...</div>
      </div>
    );
  }

  const activeUsers = companyUsers.filter((user) => user.status === "active").length;
  const pendingUsers = companyUsers.length - activeUsers;

  return (
    <div className="mx-auto w-full max-w-7xl">
      <CompaniesManagementNav
        editHref={routes.superadminTenantDetail(tenantId)}
        editLabel={tenant.name}
      />

      <section className="mb-6 overflow-hidden rounded-[28px] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.14),_transparent_34%),linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] sm:p-7">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-emerald-100 text-lg font-bold text-emerald-700 ring-1 ring-emerald-200/70">
              {tenant.logo_url ? (
                <img src={tenant.logo_url} alt="" className="h-full w-full object-cover" />
              ) : (
                tenant.name.charAt(0)
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                Company Workspace
              </p>
              <h1 className="mt-2 truncate text-3xl font-semibold tracking-tight text-slate-950">
                {tenant.name}
              </h1>
              <p className="mt-1 text-sm text-slate-600">
                Review governance, admin ownership, identity, users, and tenant settings.
              </p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:min-w-[420px]">
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Status</p>
              <p className="mt-1 font-semibold capitalize text-slate-950">{tenant.status}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Users</p>
              <p className="mt-1 font-semibold text-slate-950">{companyUsers.length}</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Seats</p>
              <p className="mt-1 font-semibold text-slate-950">{tenant.seat_limit || "Unlimited"}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mb-6 rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
        <div className="mb-5 flex items-center gap-3 border-b border-slate-200 pb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Company Details</h2>
            <p className="text-sm text-slate-600">Current company identity and governance data.</p>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <DetailItem label="Company Name" value={tenant.name} />
          <DetailItem label="Slug" value={tenant.slug} />
          <DetailItem label="Email Domain" value={tenant.email_domain || "Not configured"} />
          <DetailItem label="Logo URL" value={tenant.logo_url || "Not configured"} />
          <DetailItem label="Azure Client ID" value={tenant.entra_client_id || "Not configured"} />
          <DetailItem label="Azure Tenant ID" value={tenant.entra_tenant_id || "Not configured"} />
          <DetailItem label="Created" value={new Date(tenant.created_at).toLocaleDateString()} />
          <DetailItem label="Last Updated" value={new Date(tenant.updated_at).toLocaleDateString()} />
        </div>
      </section>

      {progress ? <SetupProgress progress={progress} tenantId={tenantId} /> : null}

      <section className="mt-6 space-y-6 rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-2 font-semibold text-slate-950">
            <Shield className="h-5 w-5 text-emerald-700" />
            Company Admin
          </h2>
          {admin ? (
            <div className="flex flex-wrap justify-end gap-2">
              <button
                onClick={handleResetAdminPassword}
                disabled={resettingAdminPassword}
                className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
              >
                {resettingAdminPassword ? "Resetting..." : "Reset Password"}
              </button>
              <button
                onClick={handleAdminStatusChange}
                disabled={updatingAdminStatus}
                className="rounded-xl border border-amber-200 bg-white px-3 py-1.5 text-sm font-medium text-amber-700 transition-colors hover:bg-amber-50 disabled:opacity-50"
              >
                {updatingAdminStatus
                  ? "Updating..."
                  : admin.status === "active"
                    ? "Suspend"
                    : "Reactivate"}
              </button>
              <button
                onClick={handleUnassignAdmin}
                disabled={unassigning}
                className="flex items-center gap-2 rounded-xl border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                {unassigning ? "Removing..." : "Remove"}
              </button>
            </div>
          ) : null}
        </div>

        {adminActionMessage ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
            {adminActionMessage}
          </p>
        ) : null}
        {adminActionError ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {adminActionError}
          </p>
        ) : null}

        {admin ? (
          <div className="flex items-center gap-4 rounded-2xl border border-slate-200 bg-white/80 p-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100">
              <span className="text-lg font-bold text-emerald-700">
                {admin.first_name[0]}{admin.last_name[0]}
              </span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-slate-950">{admin.first_name} {admin.last_name}</p>
              <p className="flex items-center gap-1 text-sm text-slate-600">
                <Mail className="h-3 w-3" />
                {admin.email}
              </p>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
              admin.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
            }`}>
              {admin.status}
            </span>
          </div>
        ) : (
          <div className="rounded-2xl border border-slate-200 bg-white/80 p-6">
            <p className="mb-4 text-center text-sm text-slate-600">No admin assigned yet</p>
            {!showCreateAdmin ? (
              <div className="flex flex-col justify-center gap-3 sm:flex-row">
                <Link
                  href="/superadmin/admins/assign"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
                >
                  <User className="h-4 w-4" />
                  Assign Existing Admin
                </Link>
                <button
                  onClick={() => setShowCreateAdmin(true)}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white shadow-[0_14px_30px_rgba(16,185,129,0.22)] transition-colors hover:bg-emerald-700"
                >
                  <Shield className="h-4 w-4" />
                  Create Admin Directly
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <h3 className="font-medium text-slate-950">Create New Admin Account</h3>
                <div className="grid gap-4 sm:grid-cols-2">
                  <LabeledInput label="First Name" value={adminForm.first_name} onChange={(value) => setAdminForm({ ...adminForm, first_name: value })} />
                  <LabeledInput label="Last Name" value={adminForm.last_name} onChange={(value) => setAdminForm({ ...adminForm, last_name: value })} />
                </div>
                <LabeledInput label="Email" type="email" value={adminForm.email} onChange={(value) => setAdminForm({ ...adminForm, email: value })} />
                <LabeledInput label="Password" type="password" value={adminForm.password} onChange={(value) => setAdminForm({ ...adminForm, password: value })} />
                <div className="flex gap-3">
                  <button
                    onClick={() => setShowCreateAdmin(false)}
                    className="flex-1 rounded-xl border border-slate-200 bg-white px-4 py-2 font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleCreateAdmin}
                    disabled={creatingAdmin}
                    className="flex-1 rounded-xl bg-emerald-600 px-4 py-2 font-medium text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                  >
                    {creatingAdmin ? "Creating..." : "Create Admin"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {createdCredentials ? (
        <section className="mt-6 rounded-[28px] border border-emerald-200 bg-emerald-50 p-6 shadow-[0_16px_40px_rgba(15,23,42,0.06)]">
          <h2 className="mb-2 font-semibold text-emerald-700">Admin Created Successfully</h2>
          <div className="space-y-1 text-slate-950">
            <div><strong>Email:</strong> {createdCredentials.email}</div>
            <div><strong>Password:</strong> {createdCredentials.password}</div>
          </div>
          <p className="mt-2 text-sm text-slate-600">The admin can now log in using these credentials at /login.</p>
          <button
            onClick={() => setCreatedCredentials(null)}
            className="mt-3 rounded-lg bg-slate-900 px-3 py-1 text-sm font-medium text-white transition-colors hover:bg-slate-700"
          >
            Dismiss
          </button>
        </section>
      ) : null}

      <Link
        href={`${routes.superadminUsers}?tenant=${tenantId}`}
        className="mt-6 block rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)] transition-colors hover:border-emerald-300"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-5 w-5 text-emerald-700" />
              <h2 className="font-semibold text-slate-950">Company Users</h2>
            </div>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              Open the dedicated users page to review the full directory for this company with search and filtering.
            </p>
          </div>
          <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-slate-400" />
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <MetricCard label="Total Users" value={companyUsers.length} />
          <MetricCard label="Active" value={activeUsers} />
          <MetricCard label="Pending" value={pendingUsers} />
        </div>
      </Link>

      <section className="mt-6 space-y-6 rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
        <div className="flex items-center gap-3 border-b border-slate-200 pb-5">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
            <Building2 className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Company Settings</h2>
            <p className="text-sm text-slate-600">Update identity, login domain, seats, and Entra configuration.</p>
          </div>
        </div>

        <LabeledInput label="Company Name" value={form.name || ""} onChange={(value) => setForm({ ...form, name: value })} />
        <div>
          <LabeledInput
            label="Email Domain"
            value={form.email_domain || ""}
            placeholder="company.com"
            onChange={(value) => setForm({ ...form, email_domain: value.toLowerCase().replace(/^@/, "") })}
          />
          <p className="mt-1 text-xs text-slate-500">Domain used to automatically assign users to this company.</p>
        </div>
        <LabeledInput label="Logo URL" value={form.logo_url || ""} onChange={(value) => setForm({ ...form, logo_url: value })} />

        <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
          <h3 className="mb-4 font-semibold text-slate-950">Azure Entra ID Configuration</h3>
          <div className="space-y-4">
            <LabeledInput label="Client ID" value={form.entra_client_id || ""} onChange={(value) => setForm({ ...form, entra_client_id: value })} />
            <LabeledInput label="Tenant ID" value={form.entra_tenant_id || ""} onChange={(value) => setForm({ ...form, entra_tenant_id: value })} />
            <button
              onClick={handleTestConnection}
              disabled={testing}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950 disabled:bg-slate-100 disabled:text-slate-400"
            >
              {testing ? "Testing..." : "Test Connection"}
            </button>
            {testResult ? (
              <div className={`rounded-xl border p-3 text-sm ${
                testResult.success
                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                  : "border-red-200 bg-red-50 text-red-700"
              }`}>
                {testResult.message}
              </div>
            ) : null}
          </div>
        </div>

        <LabeledInput
          label="Seat Limit"
          type="number"
          value={form.seat_limit ? String(form.seat_limit) : ""}
          placeholder="Unlimited"
          onChange={(value) => setForm({ ...form, seat_limit: parseInt(value) || undefined })}
        />

        <div className="flex flex-col-reverse gap-3 border-t border-slate-200 pt-5 sm:flex-row sm:justify-end">
          <div className="min-w-0 flex-1">
            {saveMessage ? (
              <p className="inline-flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                {saveMessage}
              </p>
            ) : null}
            {saveError ? (
              <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {saveError}
              </p>
            ) : null}
          </div>
          <button
            onClick={() => router.push(routes.superadminTenants)}
            className="rounded-xl border border-slate-200 bg-white px-6 py-2.5 font-medium text-slate-700 transition-colors hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-2.5 font-medium text-white shadow-[0_14px_30px_rgba(16,185,129,0.24)] transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            {saving ? "Saving..." : "Save Changes"}
          </button>
        </div>
      </section>
    </div>
  );
}

function LabeledInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <div>
      <label className="text-sm font-medium text-slate-700">{label}</label>
      <Input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-slate-900 placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
      />
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{value}</p>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</p>
      <p className="mt-2 truncate text-sm font-semibold text-slate-950" title={value}>
        {value}
      </p>
    </div>
  );
}
