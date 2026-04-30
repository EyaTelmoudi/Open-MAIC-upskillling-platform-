"use client";

import { useEffect, useState } from "react";
import { routes } from "../../../lib/routes";
import { api, getTenant, getTenantProgress, updateTenant, testEntraConnection, createAdminDirect, TenantResponse, UpdateTenantRequest, TenantSetupProgress, getTenantAdmin, unassignTenantAdmin, TenantAdminResponse, CreateAdminRequest } from "../../../lib/api";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { SetupProgress } from "../../../components/ui/SetupProgress";
import { Input } from "../../../components/ui/Input";
import { User, Mail, Shield, Trash2, Users, ChevronRight } from "lucide-react";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<UpdateTenantRequest>({});
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [unassigning, setUnassigning] = useState(false);
  const [showCreateAdmin, setShowCreateAdmin] = useState(false);
  const [adminForm, setAdminForm] = useState<CreateAdminRequest>({
    first_name: "",
    last_name: "",
    email: "",
    password: "",
    tenant_id: tenantId
  });
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [createdCredentials, setCreatedCredentials] = useState<{email: string, password: string} | null>(null);
  const [companyUsers, setCompanyUsers] = useState<CompanyUser[]>([]);

  useEffect(() => {
    async function loadTenant() {
      try {
        const [tenantData, progressData, adminData] = await Promise.all([
          getTenant(tenantId),
          getTenantProgress(tenantId),
          getTenantAdmin(tenantId)
        ]);
        const usersResponse = await api.get<{ users: CompanyUser[] }>("/api/v1/identity/users/?page=1&page_size=100");
        setTenant(tenantData);
        setProgress(progressData);
        setAdmin(adminData);
        setCompanyUsers(
          (usersResponse.users || []).filter((user) => user.tenant_id === tenantId)
        );
        setForm({
          name: tenantData.name,
          email_domain: tenantData.email_domain,
          logo_url: tenantData.logo_url,
          entra_client_id: tenantData.entra_client_id,
          entra_tenant_id: tenantData.entra_tenant_id,
          seat_limit: tenantData.seat_limit,
        });
        setAdminForm(prev => ({ ...prev, tenant_id: tenantId }));
      } catch (error) {
        console.error("Failed to load tenant:", error);
        router.push(routes.superadminTenants);
      } finally {
        setLoading(false);
      }
    }
    if (tenantId) loadTenant();
  }, [tenantId, router]);

  async function handleSave() {
    setSaving(true);
    try {
      await updateTenant(tenantId, form);
      router.push(routes.superadminTenants);
    } catch (error) {
      console.error("Failed to update tenant:", error);
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
    } catch (error: any) {
      setTestResult({ success: false, message: error.message || "Failed to test connection" });
    } finally {
      setTesting(false);
    }
  }

  async function handleUnassignAdmin() {
    if (!admin || !confirm(`Are you sure you want to remove ${admin.first_name} ${admin.last_name} as admin?`)) {
      return;
    }

    setUnassigning(true);
    try {
      await unassignTenantAdmin(admin.id);
      setAdmin(null);
    } catch (error) {
      console.error("Failed to unassign admin:", error);
    } finally {
      setUnassigning(false);
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
        tenant_id: tenantId
      });
      setShowCreateAdmin(false);
      // Reload admin data
      const adminData = await getTenantAdmin(tenantId);
      setAdmin(adminData);
    } catch (error) {
      console.error("Failed to create admin:", error);
    } finally {
      setCreatingAdmin(false);
    }
  }

  if (loading || !tenant) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-[#0F1117]">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0F1117] p-8">
      <div className="max-w-3xl mx-auto">
        <Link href={routes.superadminTenants} className="text-gray-400 hover:text-white text-sm mb-4 inline-block">
          ← Back to Companies
        </Link>
        
        <h1 className="text-3xl font-bold text-white mb-8">Edit Company</h1>

        {progress && <SetupProgress progress={progress} tenantId={tenantId} />}

        {/* Admin Section */}
        <div className="bg-[#1A1D27] rounded-2xl border border-[#2A2D3E] p-6 space-y-6 mt-6">
          <div className="flex items-center justify-between">
            <h3 className="text-white font-semibold flex items-center gap-2">
              <Shield className="w-5 h-5 text-[#6C63FF]" />
              Company Admin
            </h3>
            {admin && (
              <button
                onClick={handleUnassignAdmin}
                disabled={unassigning}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm text-red-400 hover:bg-red-500/10 border border-red-500/20"
              >
                <Trash2 className="w-4 h-4" />
                {unassigning ? "Removing..." : "Remove"}
              </button>
            )}
          </div>
          
          {admin ? (
            <div className="flex items-center gap-4 p-4 bg-[#0F1117] rounded-xl">
              <div className="w-12 h-12 rounded-full bg-[#6C63FF]/20 flex items-center justify-center">
                <span className="text-[#6C63FF] font-bold text-lg">
                  {admin.first_name[0]}{admin.last_name[0]}
                </span>
              </div>
              <div className="flex-1">
                <p className="text-white font-medium">{admin.first_name} {admin.last_name}</p>
                <p className="text-gray-400 text-sm flex items-center gap-1">
                  <Mail className="w-3 h-3" />
                  {admin.email}
                </p>
              </div>
              <div className="text-right">
                <span className={`px-2 py-1 rounded-full text-xs ${
                  admin.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {admin.status}
                </span>
              </div>
            </div>
          ) : (
            <div className="p-6 bg-[#0F1117] rounded-xl">
              <p className="text-gray-400 mb-4 text-center">No admin assigned yet</p>

              {!showCreateAdmin ? (
                <div className="flex gap-3 justify-center">
                  <Link
                    href="/superadmin/admins/assign"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border border-[#2A2D3E] text-gray-300 hover:text-white"
                  >
                    <User className="w-4 h-4" />
                    Assign Existing Admin
                  </Link>
                  <button
                    onClick={() => setShowCreateAdmin(true)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#6C63FF] text-white hover:bg-[#5a52d4]"
                  >
                    <Shield className="w-4 h-4" />
                    Create Admin Directly
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <h4 className="text-white font-medium">Create New Admin Account</h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-gray-400 text-sm">First Name</label>
                      <input
                        type="text"
                        value={adminForm.first_name}
                        onChange={(e) => setAdminForm({ ...adminForm, first_name: e.target.value })}
                        className="w-full bg-[#1A1D27] border border-[#2A2D3E] rounded-lg px-4 py-2 text-white mt-1"
                      />
                    </div>
                    <div>
                      <label className="text-gray-400 text-sm">Last Name</label>
                      <input
                        type="text"
                        value={adminForm.last_name}
                        onChange={(e) => setAdminForm({ ...adminForm, last_name: e.target.value })}
                        className="w-full bg-[#1A1D27] border border-[#2A2D3E] rounded-lg px-4 py-2 text-white mt-1"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-gray-400 text-sm">Email</label>
                    <input
                      type="email"
                      value={adminForm.email}
                      onChange={(e) => setAdminForm({ ...adminForm, email: e.target.value })}
                      className="w-full bg-[#1A1D27] border border-[#2A2D3E] rounded-lg px-4 py-2 text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-gray-400 text-sm">Password</label>
                    <Input
                      type="password"
                      value={adminForm.password}
                      onChange={(e) => setAdminForm({ ...adminForm, password: e.target.value })}
                      className="w-full bg-[#1A1D27] border border-[#2A2D3E] rounded-lg px-4 py-2 text-white mt-1"
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => setShowCreateAdmin(false)}
                      className="flex-1 px-4 py-2 rounded-lg border border-[#2A2D3E] text-gray-300 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCreateAdmin}
                      disabled={creatingAdmin}
                      className="flex-1 px-4 py-2 rounded-lg bg-[#6C63FF] text-white hover:bg-[#5a52d4] disabled:opacity-50"
                    >
                      {creatingAdmin ? "Creating..." : "Create Admin"}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {createdCredentials && (
          <div className="bg-[#1A1D27] rounded-2xl border border-[#2A2D3E] p-6 mt-6">
            <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
              <h3 className="text-green-400 font-semibold mb-2">Admin Created Successfully!</h3>
              <div className="text-white space-y-1">
                <div><strong>Email:</strong> {createdCredentials.email}</div>
                <div><strong>Password:</strong> {createdCredentials.password}</div>
              </div>
              <div className="text-gray-400 text-sm mt-2">
                The admin can now log in using these credentials at /login
              </div>
              <button
                onClick={() => setCreatedCredentials(null)}
                className="mt-3 px-3 py-1 rounded text-sm bg-gray-600 hover:bg-gray-500"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        <Link
          href={`${routes.superadminUsers}?tenant=${tenantId}`}
          className="mt-6 block rounded-2xl border border-[#2A2D3E] bg-[#1A1D27] p-6 transition-colors hover:border-[#6C63FF]/40 hover:bg-[#202433]"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="mb-3 flex items-center gap-2">
                <Users className="h-5 w-5 text-[#6C63FF]" />
                <h3 className="text-white font-semibold">Company Users</h3>
              </div>
              <p className="max-w-xl text-sm text-gray-400">
                Open the dedicated users page to review the full directory for this company with better organization, search, and filtering.
              </p>
            </div>
            <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-gray-500" />
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-[#2A2D3E] bg-[#0F1117] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Total Users</p>
              <p className="mt-2 text-2xl font-semibold text-white">{companyUsers.length}</p>
            </div>
            <div className="rounded-xl border border-[#2A2D3E] bg-[#0F1117] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Active</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {companyUsers.filter((user) => user.status === "active").length}
              </p>
            </div>
            <div className="rounded-xl border border-[#2A2D3E] bg-[#0F1117] px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">Pending</p>
              <p className="mt-2 text-2xl font-semibold text-white">
                {companyUsers.filter((user) => user.status !== "active").length}
              </p>
            </div>
          </div>
        </Link>

        <div className="bg-[#1A1D27] rounded-2xl border border-[#2A2D3E] p-6 space-y-6 mt-6">
          <div>
            <label className="text-gray-400 text-sm">Company Name</label>
            <input
              type="text"
              value={form.name || ""}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-4 py-2 text-white mt-1"
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm">Email Domain</label>
            <input
              type="text"
              value={form.email_domain || ""}
              onChange={(e) => setForm({ ...form, email_domain: e.target.value.toLowerCase().replace(/^@/, '') })}
              placeholder="company.com"
              className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-4 py-2 text-white mt-1"
            />
            <p className="text-xs text-gray-500 mt-1">Domain used to automatically assign users to this company (e.g., "company.com")</p>
          </div>

          <div>
            <label className="text-gray-400 text-sm">Logo URL</label>
            <input
              type="text"
              value={form.logo_url || ""}
              onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
              className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-4 py-2 text-white mt-1"
            />
          </div>

          <div className="border-t border-[#2A2D3E] pt-6">
            <h3 className="text-white font-semibold mb-4">Azure Entra ID Configuration</h3>
            <div className="space-y-4">
              <div>
                <label className="text-gray-400 text-sm">Client ID</label>
                <input
                  type="text"
                  value={form.entra_client_id || ""}
                  onChange={(e) => setForm({ ...form, entra_client_id: e.target.value })}
                  className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-4 py-2 text-white mt-1"
                />
              </div>
              <div>
                <label className="text-gray-400 text-sm">Tenant ID</label>
                <input
                  type="text"
                  value={form.entra_tenant_id || ""}
                  onChange={(e) => setForm({ ...form, entra_tenant_id: e.target.value })}
                  className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-4 py-2 text-white mt-1"
                />
              </div>
              <div className="pt-2">
                <button
                  onClick={handleTestConnection}
                  disabled={testing}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border ${
                    testing 
                      ? "bg-gray-800 border-gray-700 text-gray-500" 
                      : "bg-[#2A2D3E] border-[#3A3D4E] text-white hover:bg-[#3A3D4E]"
                  }`}
                >
                  {testing ? "Testing..." : "Test Connection"}
                </button>
                
                {testResult && (
                  <div className={`mt-3 p-3 rounded-lg text-sm ${
                    testResult.success 
                      ? "bg-green-500/10 border border-green-500/20 text-green-400" 
                      : "bg-red-500/10 border border-red-500/20 text-red-400"
                  }`}>
                    {testResult.message}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div>
            <label className="text-gray-400 text-sm">Seat Limit</label>
            <input
              type="number"
              value={form.seat_limit || ""}
              onChange={(e) => setForm({ ...form, seat_limit: parseInt(e.target.value) || undefined })}
              placeholder="Unlimited"
              className="w-full bg-[#0F1117] border border-[#2A2D3E] rounded-lg px-4 py-2 text-white mt-1"
            />
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={() => router.push(routes.superadminTenants)}
              className="flex-1 px-4 py-2 rounded-lg border border-[#2A2D3E] text-gray-300 hover:text-white"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex-1 px-4 py-2 rounded-lg bg-[#6C63FF] text-white hover:bg-[#5a52d4] disabled:opacity-50"
            >
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
