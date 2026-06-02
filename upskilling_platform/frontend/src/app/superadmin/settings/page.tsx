"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { 
  getPlatformSettings, 
  updateGeneralSettings, 
  resetPlatform,
  getTenants,
  updateTenant,
  testEntraConnection,
  TenantResponse,
} from "../../lib/api";
import { 
  Settings,
  Shield,
  AlertTriangle,
  Save,
  Loader2,
  Building2,
  Key,
  Trash2,
  Check,
} from "lucide-react";

type TabId = "general" | "entra" | "danger";

interface Tab {
  id: TabId;
  label: string;
  icon: typeof Settings;
}

const tabs: Tab[] = [
  { id: "general", label: "General", icon: Building2 },
  { id: "entra", label: "Entra ID", icon: Key },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

const DEFAULT_GENERAL_SETTINGS = {
  platform_name: "",
  group_website: "",
  platform_language: "",
  default_timezone: "",
};

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export default function SuperAdminSettingsPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form states
  const [generalForm, setGeneralForm] = useState({
    platform_name: DEFAULT_GENERAL_SETTINGS.platform_name,
    group_website: DEFAULT_GENERAL_SETTINGS.group_website,
    platform_language: DEFAULT_GENERAL_SETTINGS.platform_language,
    default_timezone: "Africa/Tunis",
  });
  const [tenants, setTenants] = useState<TenantResponse[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [entraForm, setEntraForm] = useState({
    entra_client_id: "",
    entra_tenant_id: "",
  });
  const [entraSaving, setEntraSaving] = useState(false);
  const [entraTesting, setEntraTesting] = useState(false);
  const [entraTestMessage, setEntraTestMessage] = useState<string | null>(null);

  useEffect(() => {
    loadSettings();
    loadTenants();
  }, []);

  useEffect(() => {
    const tab = searchParams.get("tab");
    const tenant = searchParams.get("tenant");

    if (tab && tabs.some((item) => item.id === tab)) {
      setActiveTab(tab as TabId);
    }

    if (tenant) {
      setSelectedTenantId(tenant);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!tenants.length) {
      return;
    }

    const queryTenant = searchParams.get("tenant");
    const fallbackTenantId = queryTenant || selectedTenantId || tenants[0].id;
    const tenant = tenants.find((item) => item.id === fallbackTenantId) || tenants[0];

    setSelectedTenantId(tenant.id);
    setEntraForm({
      entra_client_id: tenant.entra_client_id || "",
      entra_tenant_id: tenant.entra_tenant_id || "",
    });
  }, [tenants, selectedTenantId, searchParams]);

  const selectedTenant =
    tenants.find((tenant) => tenant.id === selectedTenantId) || null;

  const loadTenants = async () => {
    try {
      const data = await getTenants(1, 100);
      setTenants(data.tenants || []);
    } catch (err) {
      console.error("Failed to load tenants", err);
    }
  };

  const loadSettings = async () => {
    try {
      setLoading(true);
      
        // Check if we have a token before making the request
      const token = typeof window !== 'undefined' 
        ? localStorage.getItem("access_token") || document.cookie.match(/(?:^|;\s*)access_token=([^;]+)/)?.[1]
        : null;
      
      if (!token) {
        setGeneralForm(DEFAULT_GENERAL_SETTINGS);
        setError("Authentication is required to load live platform settings.");
        setLoading(false);
        return;
      }
      
      // Try to load settings, but handle 401 gracefully
      try {
        const data = await getPlatformSettings();
      
      setGeneralForm({
        platform_name: data.general.platform_name || DEFAULT_GENERAL_SETTINGS.platform_name,
        group_website: data.general.group_website || DEFAULT_GENERAL_SETTINGS.group_website,
        platform_language: data.general.platform_language || DEFAULT_GENERAL_SETTINGS.platform_language,
        default_timezone: data.general.default_timezone || DEFAULT_GENERAL_SETTINGS.default_timezone,
      });
      
      setError(null);
      } catch (apiError) {
        setGeneralForm(DEFAULT_GENERAL_SETTINGS);
        setError(getErrorMessage(apiError, "Failed to load live platform settings."));
      } finally {
        setLoading(false);
      }
    } catch (err) {
      setGeneralForm(DEFAULT_GENERAL_SETTINGS);
      setError(getErrorMessage(err, "Failed to load live platform settings."));
      setLoading(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSaved(false);
      setError(null);

      switch (activeTab) {
        case "general":
          await updateGeneralSettings(generalForm);
          break;
      }
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save settings"));
    } finally {
      setSaving(false);
    }
  };

  const handleReset = async () => {
    if (!confirm("Are you sure you want to reset the platform? This will require running the setup wizard again.")) return;
    try {
      setSaving(true);
      await resetPlatform();
      window.location.href = "/setup";
    } catch (err) {
      setError(getErrorMessage(err, "Failed to reset platform"));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEntraSettings = async () => {
    if (!selectedTenant) {
      setError("Select a company before saving Entra ID settings.");
      return;
    }

    try {
      setEntraSaving(true);
      setSaved(false);
      setError(null);
      setEntraTestMessage(null);

      const updatedTenant = await updateTenant(selectedTenant.id, {
        entra_client_id: entraForm.entra_client_id.trim(),
        entra_tenant_id: entraForm.entra_tenant_id.trim(),
      });

      setTenants((current) =>
        current.map((tenant) =>
          tenant.id === updatedTenant.id ? { ...tenant, ...updatedTenant } : tenant
        )
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to save Entra ID settings"));
    } finally {
      setEntraSaving(false);
    }
  };

  const handleTestEntraSettings = async () => {
    if (!selectedTenant) {
      setError("Select a company before testing Entra ID settings.");
      return;
    }

    try {
      setEntraTesting(true);
      setError(null);
      const result = await testEntraConnection(selectedTenant.id);
      setEntraTestMessage(result.message);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to test Entra ID settings"));
      setEntraTestMessage(null);
    } finally {
      setEntraTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(240,249,255,0.92)_100%)] shadow-[0_18px_45px_rgba(15,23,42,0.08)]">
        <Loader2 className="w-8 h-8 animate-spin text-[#10B981]" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
        {/* Tabs */}
        <div className="mb-6 rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
          <div className="grid gap-3 md:grid-cols-3">
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-w-0 items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
                  isActive
                    ? "bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(59,130,246,0.1))] text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
                }`}
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                    isActive ? "bg-white text-emerald-700" : "bg-slate-100 text-slate-600"
                  }`}
                >
                  <IconComponent className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">{tab.label}</span>
                  <span className="mt-1 block truncate text-xs text-slate-500">
                    {tab.id === "general"
                      ? "Platform defaults"
                      : tab.id === "entra"
                        ? "Tenant identity"
                        : "Reset controls"}
                  </span>
                </span>
              </button>
            );
          })}
          </div>
        </div>

        {/* Error/Success Messages */}
        {error && (
          <div className="mb-6 rounded-2xl border border-red-500 bg-red-500/10 p-4 text-red-400">
            {error}
          </div>
        )}
        
        {saved && (
          <div className="mb-6 flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
            <Check className="w-4 h-4" />
            Settings saved successfully!
          </div>
        )}

        {/* Tab Content */}
        <div className="rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.97)_0%,rgba(248,250,252,0.96)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          {activeTab === "general" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    Organization Group Name
                  </label>
                  <input
                    type="text"
                    value={generalForm.platform_name}
                    onChange={(e) => setGeneralForm({ ...generalForm, platform_name: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    Organization Website
                  </label>
                  <input
                    type="text"
                    value={generalForm.group_website}
                    onChange={(e) => setGeneralForm({ ...generalForm, group_website: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                    placeholder="https://your-group-website.com"
                  />
                </div>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    Timezone
                  </label>
                  <select
                    value={generalForm.default_timezone}
                    onChange={(e) => setGeneralForm({ ...generalForm, default_timezone: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  >
                    <optgroup label="Africa">
                      <option value="Africa/Cairo">Africa/Cairo (GMT+2)</option>
                      <option value="Africa/Lagos">Africa/Lagos (GMT+1)</option>
                      <option value="Africa/Johannesburg">Africa/Johannesburg (GMT+2)</option>
                      <option value="Africa/Nairobi">Africa/Nairobi (GMT+3)</option>
                      <option value="Africa/Tunis">Africa/Tunis (GMT+1)</option>
                    </optgroup>
                    <optgroup label="America">
                      <option value="America/Anchorage">America/Anchorage (GMT-9)</option>
                      <option value="America/Chicago">America/Chicago (GMT-6)</option>
                      <option value="America/Denver">America/Denver (GMT-7)</option>
                      <option value="America/Halifax">America/Halifax (GMT-4)</option>
                      <option value="America/Los_Angeles">America/Los_Angeles (GMT-8)</option>
                      <option value="America/Mexico_City">America/Mexico_City (GMT-6)</option>
                      <option value="America/New_York">America/New_York (GMT-5)</option>
                      <option value="America/Phoenix">America/Phoenix (GMT-7)</option>
                      <option value="America/Sao_Paulo">America/Sao_Paulo (GMT-3)</option>
                      <option value="America/Toronto">America/Toronto (GMT-5)</option>
                      <option value="America/Vancouver">America/Vancouver (GMT-8)</option>
                    </optgroup>
                    <optgroup label="Asia">
                      <option value="Asia/Baghdad">Asia/Baghdad (GMT+3)</option>
                      <option value="Asia/Bangkok">Asia/Bangkok (GMT+7)</option>
                      <option value="Asia/Dhaka">Asia/Dhaka (GMT+6)</option>
                      <option value="Asia/Dubai">Asia/Dubai (GMT+4)</option>
                      <option value="Asia/Ho_Chi_Minh">Asia/Ho_Chi_Minh (GMT+7)</option>
                      <option value="Asia/Hong_Kong">Asia/Hong_Kong (GMT+8)</option>
                      <option value="Asia/Jakarta">Asia/Jakarta (GMT+7)</option>
                      <option value="Asia/Jerusalem">Asia/Jerusalem (GMT+2)</option>
                      <option value="Asia/Karachi">Asia/Karachi (GMT+5)</option>
                      <option value="Asia/Kolkata">Asia/Kolkata (GMT+5:30)</option>
                      <option value="Asia/Kuala_Lumpur">Asia/Kuala_Lumpur (GMT+8)</option>
                      <option value="Asia/Manila">Asia/Manila (GMT+8)</option>
                      <option value="Asia/Riyadh">Asia/Riyadh (GMT+3)</option>
                      <option value="Asia/Seoul">Asia/Seoul (GMT+9)</option>
                      <option value="Asia/Shanghai">Asia/Shanghai (GMT+8)</option>
                      <option value="Asia/Singapore">Asia/Singapore (GMT+8)</option>
                      <option value="Asia/Taipei">Asia/Taipei (GMT+8)</option>
                      <option value="Asia/Tehran">Asia/Tehran (GMT+3:30)</option>
                      <option value="Asia/Tokyo">Asia/Tokyo (GMT+9)</option>
                    </optgroup>
                    <optgroup label="Europe">
                      <option value="Europe/Amsterdam">Europe/Amsterdam (GMT+1)</option>
                      <option value="Europe/Athens">Europe/Athens (GMT+2)</option>
                      <option value="Europe/Belgrade">Europe/Belgrade (GMT+1)</option>
                      <option value="Europe/Berlin">Europe/Berlin (GMT+1)</option>
                      <option value="Europe/Brussels">Europe/Brussels (GMT+1)</option>
                      <option value="Europe/Bucharest">Europe/Bucharest (GMT+2)</option>
                      <option value="Europe/Budapest">Europe/Budapest (GMT+1)</option>
                      <option value="Europe/Copenhagen">Europe/Copenhagen (GMT+1)</option>
                      <option value="Europe/Dublin">Europe/Dublin (GMT+0)</option>
                      <option value="Europe/Helsinki">Europe/Helsinki (GMT+2)</option>
                      <option value="Europe/Istanbul">Europe/Istanbul (GMT+3)</option>
                      <option value="Europe/Kyiv">Europe/Kyiv (GMT+2)</option>
                      <option value="Europe/Lisbon">Europe/Lisbon (GMT+0)</option>
                      <option value="Europe/London">Europe/London (GMT+0)</option>
                      <option value="Europe/Madrid">Europe/Madrid (GMT+1)</option>
                      <option value="Europe/Moscow">Europe/Moscow (GMT+3)</option>
                      <option value="Europe/Oslo">Europe/Oslo (GMT+1)</option>
                      <option value="Europe/Paris">Europe/Paris (GMT+1)</option>
                      <option value="Europe/Prague">Europe/Prague (GMT+1)</option>
                      <option value="Europe/Riga">Europe/Riga (GMT+2)</option>
                      <option value="Europe/Rome">Europe/Rome (GMT+1)</option>
                      <option value="Europe/Stockholm">Europe/Stockholm (GMT+1)</option>
                      <option value="Europe/Tallinn">Europe/Tallinn (GMT+2)</option>
                      <option value="Europe/Vienna">Europe/Vienna (GMT+1)</option>
                      <option value="Europe/Vilnius">Europe/Vilnius (GMT+2)</option>
                      <option value="Europe/Warsaw">Europe/Warsaw (GMT+1)</option>
                      <option value="Europe/Zurich">Europe/Zurich (GMT+1)</option>
                    </optgroup>
                    <optgroup label="Oceania">
                      <option value="Australia/Adelaide">Australia/Adelaide (GMT+9:30)</option>
                      <option value="Australia/Brisbane">Australia/Brisbane (GMT+10)</option>
                      <option value="Australia/Darwin">Australia/Darwin (GMT+9:30)</option>
                      <option value="Australia/Melbourne">Australia/Melbourne (GMT+10)</option>
                      <option value="Australia/Perth">Australia/Perth (GMT+8)</option>
                      <option value="Australia/Sydney">Australia/Sydney (GMT+10)</option>
                      <option value="Pacific/Auckland">Pacific/Auckland (GMT+12)</option>
                      <option value="Pacific/Fiji">Pacific/Fiji (GMT+12)</option>
                      <option value="Pacific/Guam">Pacific/Guam (GMT+10)</option>
                      <option value="Pacific/Honolulu">Pacific/Honolulu (GMT-10)</option>
                    </optgroup>
                  </select>
                </div>
                </div>
              </div>
          )}

          {activeTab === "entra" && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Tenant-scoped Azure Entra ID</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Configure Azure Entra ID separately for each company. The credentials below apply only to the selected tenant.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    Company
                  </label>
                  <select
                    value={selectedTenantId}
                    onChange={(e) => {
                      const tenant = tenants.find((item) => item.id === e.target.value);
                      setSelectedTenantId(e.target.value);
                      setEntraTestMessage(null);
                      if (tenant) {
                        setEntraForm({
                          entra_client_id: tenant.entra_client_id || "",
                          entra_tenant_id: tenant.entra_tenant_id || "",
                        });
                      }
                    }}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  >
                    {tenants.length === 0 && <option value="">No companies found</option>}
                    {tenants.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50/90 px-4 py-3">
                  <p className="text-xs uppercase tracking-wide text-slate-500">Configuration Status</p>
                  <div className="mt-2 flex items-center gap-3">
                    <span
                      className={`inline-flex rounded-full px-3 py-1 text-xs font-medium ${
                        selectedTenant?.entra_id_config || selectedTenant?.entra_configured
                          ? "bg-[#00D4AA]/20 text-[#00D4AA]"
                          : "bg-[#FFD700]/20 text-[#FFD700]"
                      }`}
                    >
                      {selectedTenant?.entra_id_config || selectedTenant?.entra_configured
                        ? "Configured"
                        : "Not configured"}
                    </span>
                    <span className="text-sm text-slate-600">
                      {selectedTenant?.email_domain || "No company email domain set"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    Entra Client ID
                  </label>
                  <input
                    type="text"
                    value={entraForm.entra_client_id}
                    onChange={(e) =>
                      setEntraForm({ ...entraForm, entra_client_id: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                    placeholder="Application (client) ID"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-600">
                    Entra Tenant ID
                  </label>
                  <input
                    type="text"
                    value={entraForm.entra_tenant_id}
                    onChange={(e) =>
                      setEntraForm({ ...entraForm, entra_tenant_id: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                    placeholder="Directory (tenant) ID"
                  />
                </div>
              </div>

              {entraTestMessage && (
                <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-700">
                  {entraTestMessage}
                </div>
              )}

              <div className="flex flex-wrap gap-3 border-t border-slate-200 pt-6">
                <button
                  onClick={handleSaveEntraSettings}
                  disabled={entraSaving || !selectedTenant}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
                >
                  {entraSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
                  Save Tenant Entra Settings
                </button>
                <button
                  onClick={handleTestEntraSettings}
                  disabled={entraTesting || !selectedTenant}
                  className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50"
                >
                  {entraTesting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Shield className="h-5 w-5" />}
                  Test Connection
                </button>
                {selectedTenant && (
                  <Link
                    href={`/superadmin/tenants/${selectedTenant.id}`}
                    className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900"
                  >
                    Open Tenant Page
                  </Link>
                )}
              </div>
            </div>
          )}

          {activeTab === "danger" && (
            <div className="space-y-6">
              <div className="rounded-2xl border-2 border-red-200 bg-red-50/80 p-6">
                <h3 className="mb-4 text-lg font-semibold text-red-700">Danger Zone</h3>
                <p className="mb-6 text-slate-600">
                  These actions are irreversible. Please proceed with caution.
                </p>
                
                <div className="space-y-4">
                  <button
                    onClick={handleReset}
                    className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-white transition-colors hover:bg-red-700"
                  >
                    <Trash2 className="w-5 h-5" />
                    Reset Platform
                  </button>
                </div>
                
                <p className="mt-4 text-xs text-slate-500">
                  Warning: This will reset the platform to initial setup state. All tenants, users, and data will be preserved but setup wizard will need to be run again.
                </p>
              </div>
            </div>
          )}

          {/* Save Button */}
          {activeTab === "general" && (
            <div className="mt-6 border-t border-slate-200 pt-6">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-xl bg-emerald-600 px-6 py-3 text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {saving ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    Save Changes
                  </>
                )}
              </button>
            </div>
          )}
        </div>
    </div>
  );
}

