"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { 
  getPlatformSettings, 
  updateGeneralSettings, 
  updateSecuritySettings, 
  resetPlatform,
  getTenants,
  updateTenant,
  testEntraConnection,
  PlatformSettings,
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
  Lock,
  Bell,
} from "lucide-react";

type TabId = "general" | "security" | "entra" | "danger";

interface Tab {
  id: TabId;
  label: string;
  icon: typeof Settings;
}

const tabs: Tab[] = [
  { id: "general", label: "General", icon: Building2 },
  { id: "security", label: "Security", icon: Shield },
  { id: "entra", label: "Entra ID", icon: Key },
  { id: "danger", label: "Danger Zone", icon: AlertTriangle },
];

const DEFAULT_GENERAL_SETTINGS = {
  platform_name: "",
  group_website: "",
  platform_language: "",
  default_timezone: "",
};

const DEFAULT_SECURITY_SETTINGS = {
  mfa_required_for_superadmin: true,
  mfa_required_for_tenant_admins: true,
  security_alerts: {
    failed_login_spikes: true,
    admin_account_changes: true,
    password_reset_events: true,
    tenant_status_changes: true,
  },
};

export default function SuperAdminSettingsPage() {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>("general");
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
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
  const [securityForm, setSecurityForm] = useState({
    ...DEFAULT_SECURITY_SETTINGS,
  });
  const [tenants, setTenants] = useState<TenantResponse[]>([]);
  const [selectedTenantId, setSelectedTenantId] = useState("");
  const [entraForm, setEntraForm] = useState({
    entra_client_id: "",
    entra_tenant_id: "",
    entra_redirect_uris: "",
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
      entra_redirect_uris: (tenant.entra_redirect_uris || []).join("\n"),
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
        setSecurityForm(DEFAULT_SECURITY_SETTINGS);
        setError("Authentication is required to load live platform settings.");
        setLoading(false);
        return;
      }
      
      // Try to load settings, but handle 401 gracefully
      try {
        const data = await getPlatformSettings();
        setSettings(data);
      
      setGeneralForm({
        platform_name: data.general.platform_name || DEFAULT_GENERAL_SETTINGS.platform_name,
        group_website: data.general.group_website || DEFAULT_GENERAL_SETTINGS.group_website,
        platform_language: data.general.platform_language || DEFAULT_GENERAL_SETTINGS.platform_language,
        default_timezone: data.general.default_timezone || DEFAULT_GENERAL_SETTINGS.default_timezone,
      });
      
      setSecurityForm({
        mfa_required_for_superadmin:
          data.security.mfa_required_for_superadmin ??
          DEFAULT_SECURITY_SETTINGS.mfa_required_for_superadmin,
        mfa_required_for_tenant_admins:
          data.security.mfa_required_for_tenant_admins ??
          DEFAULT_SECURITY_SETTINGS.mfa_required_for_tenant_admins,
        security_alerts: {
          failed_login_spikes:
            data.security.security_alerts?.failed_login_spikes ??
            DEFAULT_SECURITY_SETTINGS.security_alerts.failed_login_spikes,
          admin_account_changes:
            data.security.security_alerts?.admin_account_changes ??
            DEFAULT_SECURITY_SETTINGS.security_alerts.admin_account_changes,
          password_reset_events:
            data.security.security_alerts?.password_reset_events ??
            DEFAULT_SECURITY_SETTINGS.security_alerts.password_reset_events,
          tenant_status_changes:
            data.security.security_alerts?.tenant_status_changes ??
            DEFAULT_SECURITY_SETTINGS.security_alerts.tenant_status_changes,
        },
      });
      
      setError(null);
      } catch (apiError: any) {
        setGeneralForm(DEFAULT_GENERAL_SETTINGS);
        setSecurityForm(DEFAULT_SECURITY_SETTINGS);
        setError(apiError?.message || "Failed to load live platform settings.");
      } finally {
        setLoading(false);
      }
    } catch (err: any) {
      setGeneralForm(DEFAULT_GENERAL_SETTINGS);
      setSecurityForm(DEFAULT_SECURITY_SETTINGS);
      setError(err?.message || "Failed to load live platform settings.");
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
        case "security":
          await updateSecuritySettings(securityForm);
          break;
      }
      
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.message || "Failed to save settings");
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
    } catch (err: any) {
      setError(err?.message || "Failed to reset platform");
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
        entra_redirect_uris: entraForm.entra_redirect_uris
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
      });

      setTenants((current) =>
        current.map((tenant) =>
          tenant.id === updatedTenant.id ? { ...tenant, ...updatedTenant } : tenant
        )
      );
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setError(err?.message || "Failed to save Entra ID settings");
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
    } catch (err: any) {
      setError(err?.message || "Failed to test Entra ID settings");
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
        <div className="mb-6 flex gap-1 border-b border-slate-200">
          {tabs.map((tab) => {
            const IconComponent = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  activeTab === tab.id
                    ? "border-[#10B981] text-emerald-700"
                    : "border-transparent text-slate-500 hover:text-slate-800"
                }`}
              >
                <IconComponent className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
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

          {activeTab === "security" && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-emerald-100 p-3 text-emerald-700">
                    <Lock className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">MFA Policy</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Enforce stronger access rules for privileged accounts at platform level.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/90 p-4">
                    <input
                      type="checkbox"
                      checked={Boolean(securityForm.mfa_required_for_superadmin)}
                      onChange={(e) =>
                        setSecurityForm({
                          ...securityForm,
                          mfa_required_for_superadmin: e.target.checked,
                        })
                      }
                      className="mt-1 h-5 w-5 rounded border-slate-300 bg-white text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Require MFA for Super Admin</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Applies to the platform-level account that manages all tenants.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/90 p-4">
                    <input
                      type="checkbox"
                      checked={Boolean(securityForm.mfa_required_for_tenant_admins)}
                      onChange={(e) =>
                        setSecurityForm({
                          ...securityForm,
                          mfa_required_for_tenant_admins: e.target.checked,
                        })
                      }
                      className="mt-1 h-5 w-5 rounded border-slate-300 bg-white text-emerald-600 focus:ring-emerald-500"
                    />
                    <div>
                      <p className="text-sm font-medium text-slate-900">Require MFA for Tenant Admins</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Covers company admins who can manage users inside their own tenant.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="rounded-xl bg-sky-100 p-3 text-sky-700">
                    <Bell className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">Security Alerts</h3>
                    <p className="mt-1 text-sm text-slate-600">
                      Choose which platform-level security events should be flagged for review.
                    </p>
                  </div>
                </div>

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                  {[
                    {
                      key: "failed_login_spikes",
                      label: "Failed Login Spikes",
                      description: "Surface suspicious bursts of failed sign-in attempts.",
                    },
                    {
                      key: "admin_account_changes",
                      label: "Admin Account Changes",
                      description: "Track admin creation, invitations, and privilege-sensitive edits.",
                    },
                    {
                      key: "password_reset_events",
                      label: "Password Reset Events",
                      description: "Flag sensitive password reset operations for privileged users.",
                    },
                    {
                      key: "tenant_status_changes",
                      label: "Tenant Status Changes",
                      description: "Watch tenant suspension and reactivation events across the platform.",
                    },
                  ].map((item) => (
                    <label
                      key={item.key}
                      className="flex items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/90 p-4"
                    >
                      <input
                        type="checkbox"
                        checked={Boolean(
                          securityForm.security_alerts[
                            item.key as keyof typeof securityForm.security_alerts
                          ]
                        )}
                        onChange={(e) =>
                          setSecurityForm({
                            ...securityForm,
                            security_alerts: {
                              ...securityForm.security_alerts,
                              [item.key]: e.target.checked,
                            },
                          })
                        }
                        className="mt-1 h-5 w-5 rounded border-slate-300 bg-white text-emerald-600 focus:ring-emerald-500"
                      />
                      <div>
                        <p className="text-sm font-medium text-slate-900">{item.label}</p>
                        <p className="mt-1 text-xs text-slate-500">{item.description}</p>
                      </div>
                    </label>
                  ))}
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
                          entra_redirect_uris: (tenant.entra_redirect_uris || []).join("\n"),
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

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-600">
                  Redirect URIs
                </label>
                <textarea
                  value={entraForm.entra_redirect_uris}
                  onChange={(e) =>
                    setEntraForm({ ...entraForm, entra_redirect_uris: e.target.value })
                  }
                  rows={5}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  placeholder={"One redirect URI per line\nhttp://localhost:3000/auth/callback"}
                />
                <p className="mt-2 text-xs text-slate-500">
                  Each company can keep its own list of Azure redirect URIs. Save updates only affects the selected company.
                </p>
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
          {["general", "security"].includes(activeTab) && (
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

