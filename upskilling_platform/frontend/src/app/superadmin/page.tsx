"use client";

import { Suspense, useEffect, useState } from "react";
import { getDashboardStats, getPlatformAlerts, getPlatformSettings, DashboardStatsResponse, PlatformAlert, TenantResponse, getCourses } from "../lib/api";
import { getTenants } from "../lib/api";
import { GettingStartedChecklist } from "../components/superadmin/GettingStartedChecklist";
import { routes } from "../lib/routes";
import Link from "next/link";
import {
  Building2,
  Users,
  BookOpen,
  Plus,
  UserPlus,
  BarChart3,
  Settings,
  AlertTriangle,
  CheckCircle,
  Info,
  ChevronRight,
} from "lucide-react";

function SuperAdminDashboardContent() {
  const [stats, setStats] = useState<DashboardStatsResponse | null>(null);
  const [tenants, setTenants] = useState<TenantResponse[]>([]);
  const [alerts, setAlerts] = useState<PlatformAlert[]>([]);
  const [courseStats, setCourseStats] = useState({ total: 0, published: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showChecklist, setShowChecklist] = useState(false);

  useEffect(() => {
    async function loadData() {
      try {
        const [statsData, tenantsData, alertsData, settingsData, coursesData] = await Promise.all([
          getDashboardStats(),
          getTenants(1, 100),
          getPlatformAlerts(),
          getPlatformSettings(),
          getCourses({ page: 1, page_size: 1 }),
        ]);
        
        setStats(statsData);
        setTenants(tenantsData.tenants || []);
        setAlerts(alertsData.alerts || []);
        setCourseStats({
          total: coursesData.total || 0,
          published: 0,
        });
        setShowChecklist(settingsData.superadmin_onboarded === false);
        setError(null);
      } catch (err: any) {
        console.error("Failed to load dashboard data:", err?.message || err);
        setError("Failed to load dashboard data. Please refresh the page.");
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  useEffect(() => {
    async function loadPublishedCourses() {
      try {
        const publishedCourses = await getCourses({ page: 1, page_size: 1, is_published: true });
        setCourseStats((current) => ({ ...current, published: publishedCourses.total || 0 }));
      } catch (err) {
        console.error("Failed to load published course count:", err);
      }
    }

    void loadPublishedCourses();
  }, []);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,250,248,0.94),rgba(232,244,248,0.9))] shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
        <div className="text-sm font-medium text-slate-700">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-7xl">
        <div className="rounded-3xl border border-red-200 bg-red-50 p-5 text-sm text-red-700 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            {error}
        </div>
      </div>
    );
  }

  const quickActions = [
    { label: "Create Tenant", href: "/superadmin/tenants/new", icon: Plus },
    { label: "Assign Admin", href: "/superadmin/users", icon: UserPlus },
    { label: "Analytics", href: "/superadmin/analytics", icon: BarChart3 },
    { label: "Settings", href: "/superadmin/settings", icon: Settings },
  ];

  return (
    <div className="mx-auto max-w-7xl">
        {showChecklist && (
          <div className="mb-8">
            <GettingStartedChecklist />
          </div>
        )}

        {/* Stats Cards Row */}
        <div className="mb-8 flex justify-center">
          <div className="grid w-full max-w-6xl grid-cols-1 gap-4 md:grid-cols-3">
            <Link
              href={routes.superadminTenants}
              className="group relative block overflow-hidden rounded-3xl border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_42%),linear-gradient(180deg,_rgba(255,255,255,0.96)_0%,_rgba(240,251,247,0.92)_100%)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] transition-all hover:-translate-y-1 hover:border-emerald-300/70"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-700">Total Tenants</p>
                  <p className="mt-3 font-mono text-5xl font-bold tracking-tight text-slate-950">
                    {stats?.tenants.total || 0}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#10B981]/12 ring-1 ring-[#10B981]/12">
                  <Building2 className="h-5 w-5 text-emerald-700" />
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <span className="inline-flex items-center rounded-full bg-[#10B981]/12 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {stats?.tenants.active || 0} active
                </span>
                <span className="text-sm font-medium text-slate-700 transition-colors group-hover:text-slate-950">
                  Open
                </span>
              </div>
            </Link>

            <Link
              href={routes.superadminUsers}
              className="group relative block overflow-hidden rounded-3xl border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.12),_transparent_40%),linear-gradient(180deg,_rgba(255,255,255,0.96)_0%,_rgba(241,252,244,0.92)_100%)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] transition-all hover:-translate-y-1 hover:border-green-300/70"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-700">Total Users</p>
                  <p className="mt-3 font-mono text-5xl font-bold tracking-tight text-slate-950">
                    {stats?.users.total || 0}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#22C55E]/12 ring-1 ring-[#22C55E]/12">
                  <Users className="h-5 w-5 text-green-700" />
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <span className="inline-flex items-center rounded-full bg-[#22C55E]/12 px-3 py-1 text-xs font-semibold text-green-700">
                  {stats?.users.active || 0} active
                </span>
                <span className="text-sm font-medium text-slate-700 transition-colors group-hover:text-slate-950">
                  Open
                </span>
              </div>
            </Link>

            <Link
              href={routes.superadminCourses}
              className="group relative block overflow-hidden rounded-3xl border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.14),_transparent_42%),linear-gradient(180deg,_rgba(255,255,255,0.96)_0%,_rgba(255,249,235,0.92)_100%)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)] transition-all hover:-translate-y-1 hover:border-amber-300/70"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-sm font-medium text-slate-700">Total Courses</p>
                  <p className="mt-3 font-mono text-5xl font-bold tracking-tight text-slate-950">
                    {courseStats.total}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#F59E0B]/12 ring-1 ring-[#F59E0B]/12">
                  <BookOpen className="h-5 w-5 text-amber-700" />
                </div>
              </div>
              <div className="mt-5 flex items-center justify-between">
                <span className="inline-flex items-center rounded-full bg-[#F59E0B]/12 px-3 py-1 text-xs font-semibold text-amber-700">
                  {courseStats.published} published
                </span>
                <span className="text-sm font-medium text-slate-700 transition-colors group-hover:text-slate-950">
                  Open
                </span>
              </div>
            </Link>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Tenant Activity Table - spans 2 columns */}
          <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] shadow-[0_20px_50px_rgba(15,23,42,0.08)] lg:col-span-2">
            <div className="flex items-center justify-between border-b border-slate-200 p-5">
              <h3 className="text-lg font-semibold text-slate-950">Tenant Activity</h3>
              <Link href="/superadmin/tenants" className="text-sm font-medium text-emerald-700 transition-colors hover:text-slate-950">
                View all
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-200 bg-[linear-gradient(180deg,rgba(244,250,252,0.95),rgba(237,247,248,0.9))]">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Tenant</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Users</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Admin</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Entra ID</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700"></th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.slice(0, 5).map((tenant) => (
                    <tr key={tenant.id} className="border-b border-slate-200 transition-colors hover:bg-slate-50/80">
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-3">
                          {tenant.logo_url ? (
                            <img src={tenant.logo_url} alt="" className="w-8 h-8 rounded-lg object-cover" />
                          ) : (
                            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#10B981]/15">
                              <Building2 className="h-4 w-4 text-emerald-700" />
                            </div>
                          )}
                          <span className="font-medium text-slate-950">{tenant.name}</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-slate-700">{tenant.user_count || 0}</td>
                      <td className="px-5 py-4">
                        <span className={`text-sm font-medium ${tenant.admin_assigned ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {tenant.admin_assigned ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`text-sm font-medium ${tenant.entra_id_config ? 'text-emerald-700' : 'text-amber-700'}`}>
                          {tenant.entra_id_config ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                          tenant.status === 'active' ? 'bg-[#10B981]/15 text-emerald-700' :
                          tenant.status === 'suspended' ? 'bg-[#EF4444]/15 text-red-700' :
                          'bg-[#F59E0B]/15 text-amber-700'
                        }`}>
                          {tenant.status}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <Link 
                          href={`/superadmin/tenants/${tenant.id}`}
                          className="text-slate-500 transition-colors hover:text-slate-950"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="space-y-6">
            {/* Quick Actions */}
            <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <div className="border-b border-slate-200 p-5">
                <h3 className="text-lg font-semibold text-slate-950">Quick Actions</h3>
              </div>
              <div className="p-3 grid grid-cols-1 gap-2">
                {quickActions.map((action) => (
                  <Link
                    key={action.label}
                    href={action.href}
                    className="group flex items-center gap-3 rounded-2xl border border-transparent bg-slate-50/90 p-4 transition-colors hover:border-slate-200 hover:bg-white"
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#10B981]/12 transition-colors group-hover:bg-[#10B981]/18">
                      <action.icon className="h-5 w-5 text-emerald-700" />
                    </div>
                    <span className="text-sm font-medium text-slate-900">{action.label}</span>
                    <ChevronRight className="ml-auto h-4 w-4 text-slate-600" />
                  </Link>
                ))}
              </div>
            </div>

            {/* Platform Alerts */}
            <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
              <div className="border-b border-slate-200 p-5">
                <h3 className="text-lg font-semibold text-slate-950">Platform Alerts</h3>
              </div>
              <div className="p-3 space-y-2">
                {alerts.length === 0 ? (
                  <div className="flex items-center gap-2 p-3 text-sm text-slate-600">
                    <CheckCircle className="h-4 w-4 text-emerald-700" />
                    No alerts
                  </div>
                ) : (
                  alerts.map((alert, index) => (
                    <Link
                      key={index}
                      href={alert.action_url || "#"}
                      className={`flex items-center gap-2 rounded-2xl p-3 transition-colors ${
                        alert.type === 'warning' ? 'bg-[#F59E0B]/10 hover:bg-[#F59E0B]/18' : 'bg-[#10B981]/10 hover:bg-[#10B981]/18'
                      }`}
                    >
                      {alert.type === 'warning' ? (
                        <AlertTriangle className="h-4 w-4 text-amber-700" />
                      ) : (
                        <Info className="h-4 w-4 text-emerald-700" />
                      )}
                      <span className="flex-1 text-sm font-medium text-slate-700">{alert.message}</span>
                      <ChevronRight className="h-4 w-4 text-slate-600" />
                    </Link>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
    </div>
  );
}

export default function SuperAdminDashboard() {
  return (
    <Suspense fallback={<div className="rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,250,248,0.94),rgba(232,244,248,0.9))] p-8 text-center text-slate-700 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">Loading...</div>}>
      <SuperAdminDashboardContent />
    </Suspense>
  );
}
