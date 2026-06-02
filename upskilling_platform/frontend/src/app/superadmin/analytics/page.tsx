"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  Activity,
  BarChart3,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  Clock3,
  ShieldCheck,
  TriangleAlert,
  Users,
} from "lucide-react";
import {
  getCrossTenantAnalytics,
  type AnalyticsResponse,
  type TenantStats,
} from "../../lib/api";
import { routes } from "../../lib/routes";

function formatNumber(value: number) {
  return new Intl.NumberFormat().format(value);
}

function getStatusBadge(status: string) {
  if (status === "active") {
    return "bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200";
  }

  if (status === "suspended") {
    return "bg-red-100 text-red-700 ring-1 ring-red-200";
  }

  return "bg-amber-100 text-amber-700 ring-1 ring-amber-200";
}

function getSeatTone(percent: number, seatLimit: number) {
  if (!seatLimit) return "text-slate-500";
  if (percent >= 100) return "text-red-700";
  if (percent >= 80) return "text-amber-700";
  return "text-emerald-700";
}

function widthPercent(value: number) {
  return `${Math.min(Math.max(value, 0), 100)}%`;
}

function getTenantCompletionRate(tenant: Partial<TenantStats>) {
  return typeof tenant.completion_rate === "number" ? tenant.completion_rate : 0;
}

function getTenantSeatUsagePercent(tenant: Partial<TenantStats>) {
  return typeof tenant.seat_usage_percent === "number" ? tenant.seat_usage_percent : 0;
}

function getTenantAdminCount(tenant: Partial<TenantStats>) {
  return typeof tenant.admin_count === "number" ? tenant.admin_count : 0;
}

function getTenantPublishedCourses(tenant: Partial<TenantStats>) {
  return typeof tenant.published_courses === "number" ? tenant.published_courses : 0;
}

function getTenantEnrollmentCount(tenant: Partial<TenantStats>) {
  return typeof tenant.enrollment_count === "number" ? tenant.enrollment_count : 0;
}

function getTenantPendingUsers(tenant: Partial<TenantStats>) {
  return typeof tenant.pending_users === "number" ? tenant.pending_users : 0;
}

function isTenantEntraConfigured(tenant: Partial<TenantStats>) {
  return tenant.entra_configured === true;
}

function getPlatformPendingTenants(data: AnalyticsResponse) {
  return typeof data.platform_overview.pending_tenants === "number"
    ? data.platform_overview.pending_tenants
    : 0;
}

function getPlatformNewUsersInPeriod(data: AnalyticsResponse) {
  return typeof data.platform_overview.new_users_in_period === "number"
    ? data.platform_overview.new_users_in_period
    : 0;
}

function getPlatformPublishedCourses(data: AnalyticsResponse) {
  return typeof data.platform_overview.published_courses === "number"
    ? data.platform_overview.published_courses
    : 0;
}

function getLearningCompletedEnrollments(data: AnalyticsResponse) {
  return typeof data.learning_metrics.completed_enrollments === "number"
    ? data.learning_metrics.completed_enrollments
    : 0;
}

function getGovernanceValue(
  data: AnalyticsResponse,
  key:
    | "tenants_with_admin"
    | "tenants_without_admin"
    | "tenants_with_entra"
    | "tenants_without_entra"
    | "seat_limit_reached"
    | "near_capacity_tenants"
    | "unlimited_seat_tenants"
) {
  const metrics = data.governance_metrics;
  if (!metrics || typeof metrics[key] !== "number") {
    return 0;
  }
  return metrics[key];
}

export default function SuperAdminAnalytics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AnalyticsResponse | null>(null);

  useEffect(() => {
    void loadAnalytics();
  }, []);

  async function loadAnalytics() {
    try {
      setLoading(true);
      setError(null);
      const result = await getCrossTenantAnalytics("all");
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load analytics");
      setData(null);
      console.error("Failed to load analytics:", err);
    } finally {
      setLoading(false);
    }
  }

  const topTenants = data?.tenant_stats.slice(0, 6) ?? [];
  const riskTenants =
    data?.tenant_stats.filter(
      (tenant) =>
        tenant.status !== "active" ||
        getTenantAdminCount(tenant) === 0 ||
        !isTenantEntraConfigured(tenant) ||
        (tenant.seat_limit > 0 && getTenantSeatUsagePercent(tenant) >= 80)
    ) ?? [];

  return (
    <div className="mx-auto max-w-7xl">
        {loading && (
          <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,250,248,0.94),rgba(232,244,248,0.9))] p-16 text-center text-slate-700 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
            Loading analytics...
          </div>
        )}

        {error && !loading && (
          <div className="rounded-[28px] border border-red-200 bg-red-50 p-6 text-red-700 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <div className="space-y-6">
            <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(243,249,251,0.94))] p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-slate-700">Total Tenants</p>
                    <p className="mt-3 text-4xl font-semibold text-slate-950">
                      {formatNumber(data.platform_overview.total_tenants)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-primary/10 p-3 text-primary">
                    <Building2 className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-4 text-sm text-slate-600">
                  {formatNumber(data.platform_overview.active_tenants)} active,{" "}
                  {formatNumber(getPlatformPendingTenants(data))} pending
                </p>
              </div>

              <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(243,249,251,0.94))] p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-slate-700">Platform Users</p>
                    <p className="mt-3 text-4xl font-semibold text-slate-950">
                      {formatNumber(data.platform_overview.total_users)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-emerald-100 p-3 text-emerald-700">
                    <Users className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-4 text-sm text-slate-600">
                  {formatNumber(data.platform_overview.active_users)} active,{" "}
                  {formatNumber(getPlatformNewUsersInPeriod(data))} added in period
                </p>
              </div>

              <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(243,249,251,0.94))] p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-slate-700">Learning Activity</p>
                    <p className="mt-3 text-4xl font-semibold text-slate-950">
                      {formatNumber(data.learning_metrics.total_enrollments)}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-amber-100 p-3 text-amber-700">
                    <BookOpen className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-4 text-sm text-slate-600">
                  {formatNumber(getLearningCompletedEnrollments(data))} completed,{" "}
                  {data.learning_metrics.completion_rate.toFixed(1)}% completion
                </p>
              </div>

              <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(243,249,251,0.94))] p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm text-slate-700">Published Courses</p>
                    <p className="mt-3 text-4xl font-semibold text-slate-950">
                      {formatNumber(getPlatformPublishedCourses(data))}
                    </p>
                  </div>
                  <div className="rounded-2xl bg-sky-100 p-3 text-sky-700">
                    <BarChart3 className="h-5 w-5" />
                  </div>
                </div>
                <p className="mt-4 text-sm text-slate-600">
                  {formatNumber(data.learning_metrics.active_learners)} active learners in selected period
                </p>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]">
              <div className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                <div className="mb-5 flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-950">Tenant Performance</h2>
                    <p className="mt-1 text-sm text-slate-600">
                      Operational health, adoption, capacity, and learning throughput by tenant.
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  {topTenants.length > 0 ? (
                    topTenants.map((tenant: TenantStats) => (
                      <div
                        key={tenant.id}
                        className="rounded-2xl border border-slate-200 bg-white/85 p-4"
                      >
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                          <div>
                            <div className="flex items-center gap-3">
                              <h3 className="text-base font-semibold text-slate-950">{tenant.name}</h3>
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStatusBadge(
                                  tenant.status || "pending"
                                )}`}
                              >
                                {tenant.status || "pending"}
                              </span>
                              {isTenantEntraConfigured(tenant) ? (
                                <span className="rounded-full bg-sky-100 px-2.5 py-1 text-xs font-medium text-sky-700 ring-1 ring-sky-200">
                                  Entra ready
                                </span>
                              ) : (
                                <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                                  Entra missing
                                </span>
                              )}
                            </div>
                            <div className="mt-3 flex flex-wrap gap-3 text-sm text-slate-600">
                              <span>{formatNumber(tenant.total_users)} users</span>
                              <span>{formatNumber(tenant.active_users)} active</span>
                              <span>{formatNumber(getTenantPendingUsers(tenant))} pending</span>
                              <span>{formatNumber(getTenantAdminCount(tenant))} admins</span>
                              <span>{formatNumber(getTenantPublishedCourses(tenant))} courses</span>
                              <span>{formatNumber(getTenantEnrollmentCount(tenant))} enrollments</span>
                            </div>
                          </div>

                          <div className="grid min-w-[280px] grid-cols-2 gap-3">
                            <div className="rounded-2xl bg-slate-50 p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">
                                Completion
                              </p>
                              <p className="mt-2 text-2xl font-semibold text-slate-950">
                                {getTenantCompletionRate(tenant).toFixed(1)}%
                              </p>
                              <div className="mt-3 h-2 rounded-full bg-slate-200">
                                <div
                                  className="h-2 rounded-full bg-gradient-to-r from-emerald-600 to-sky-500"
                                  style={{ width: widthPercent(getTenantCompletionRate(tenant)) }}
                                />
                              </div>
                            </div>

                            <div className="rounded-2xl bg-slate-50 p-3">
                              <p className="text-xs uppercase tracking-wide text-slate-500">
                                Seat Usage
                              </p>
                              <p className={`mt-2 text-2xl font-semibold ${getSeatTone(getTenantSeatUsagePercent(tenant), tenant.seat_limit)}`}>
                                {tenant.seat_limit > 0
                                  ? `${getTenantSeatUsagePercent(tenant).toFixed(1)}%`
                                  : "Unlimited"}
                              </p>
                              <p className="mt-2 text-xs text-slate-500">
                                {tenant.seat_limit > 0
                                  ? `${formatNumber(tenant.total_users)} / ${formatNumber(tenant.seat_limit)} seats`
                                  : "No seat cap configured"}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center text-slate-500">
                      No tenant analytics available.
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                  <div className="mb-4 flex items-center gap-3">
                    <ShieldCheck className="h-5 w-5 text-primary" />
                    <h2 className="text-xl font-semibold text-slate-950">Governance Health</h2>
                  </div>
                  <div className="space-y-3">
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-600">Tenants With Admin</p>
                      <p className="mt-2 text-3xl font-semibold text-slate-950">
                        {formatNumber(getGovernanceValue(data, "tenants_with_admin"))}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-600">Tenants Missing Admin</p>
                      <p className="mt-2 text-3xl font-semibold text-amber-700">
                        {formatNumber(getGovernanceValue(data, "tenants_without_admin"))}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-600">Tenants Missing Entra</p>
                      <p className="mt-2 text-3xl font-semibold text-amber-700">
                        {formatNumber(getGovernanceValue(data, "tenants_without_entra"))}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-slate-50 p-4">
                      <p className="text-sm text-slate-600">Seat Capacity Risks</p>
                      <p className="mt-2 text-3xl font-semibold text-red-700">
                        {formatNumber(
                          getGovernanceValue(data, "seat_limit_reached") +
                            getGovernanceValue(data, "near_capacity_tenants")
                        )}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                  <div className="mb-4 flex items-center gap-3">
                    <TriangleAlert className="h-5 w-5 text-amber-700" />
                    <h2 className="text-xl font-semibold text-slate-950">Attention Needed</h2>
                  </div>
                  <div className="space-y-3">
                    {riskTenants.length > 0 ? (
                      riskTenants.slice(0, 5).map((tenant) => (
                        <Link
                          key={tenant.id}
                          href={routes.superadminTenantDetail(tenant.id)}
                          className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4 transition-colors hover:bg-white"
                        >
                          <div className="mt-1 rounded-xl bg-amber-100 p-2 text-amber-700">
                            <Clock3 className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-950">{tenant.name}</p>
                            <p className="mt-1 text-xs text-slate-600">
                              {getTenantAdminCount(tenant) === 0
                                ? "No admin assigned"
                                : !isTenantEntraConfigured(tenant)
                                  ? "Azure Entra not configured"
                                  : tenant.seat_limit > 0 && getTenantSeatUsagePercent(tenant) >= 100
                                    ? "Seat limit reached"
                                    : tenant.seat_limit > 0 && getTenantSeatUsagePercent(tenant) >= 80
                                      ? "Approaching seat limit"
                                      : `Status: ${tenant.status || "pending"}`}
                            </p>
                          </div>
                          <ChevronRight className="h-4 w-4 shrink-0 text-slate-500" />
                        </Link>
                      ))
                    ) : (
                      <div className="rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-700 ring-1 ring-emerald-200">
                        All monitored tenants look healthy right now.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                <div className="mb-5 flex items-center gap-3">
                  <Activity className="h-5 w-5 text-emerald-700" />
                  <h2 className="text-xl font-semibold text-slate-950">Role Distribution</h2>
                </div>
                <div className="space-y-4">
                  {Object.entries(data.role_distribution)
                    .sort(([, left], [, right]) => right - left)
                    .map(([role, count]) => {
                      const share =
                        data.platform_overview.total_users > 0
                          ? (count / data.platform_overview.total_users) * 100
                          : 0;

                      return (
                        <div key={role}>
                          <div className="mb-2 flex items-center justify-between">
                            <span className="text-sm text-slate-700">{role}</span>
                            <span className="text-sm font-medium text-slate-950">
                              {formatNumber(count)}
                            </span>
                          </div>
                          <div className="h-2 rounded-full bg-slate-200">
                            <div
                              className="h-2 rounded-full bg-gradient-to-r from-emerald-600 to-sky-500"
                              style={{ width: widthPercent(share) }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

              <div className="rounded-[30px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] p-6 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
                <div className="mb-5 flex items-center gap-3">
                  <CheckCircle2 className="h-5 w-5 text-sky-700" />
                  <h2 className="text-xl font-semibold text-slate-950">Status Distribution</h2>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  {Object.entries(data.status_distribution)
                    .sort(([, left], [, right]) => right - left)
                    .map(([status, count]) => (
                      <div
                        key={status}
                        className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                      >
                        <p className="text-xs uppercase tracking-wide text-slate-500">{status}</p>
                        <p className="mt-2 text-3xl font-semibold text-slate-950">
                          {formatNumber(count)}
                        </p>
                      </div>
                    ))}
                </div>
              </div>
            </section>
          </div>
        )}
    </div>
  );
}
