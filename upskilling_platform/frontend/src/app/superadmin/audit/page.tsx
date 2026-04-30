"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  exportPlatformAuditLogs,
  getPlatformAuditLogs,
  type PlatformAuditLog,
} from "../../lib/api";
import { routes } from "../../lib/routes";

const PAGE_SIZE = 20;
const FALLBACK_ACTIONS = [
  "tenant.create",
  "tenant.update",
  "tenant.suspend",
  "admin.invite",
  "admin_created",
  "admin_invited",
  "settings.update.general",
  "settings.update.security",
  "settings.update.notifications",
  "settings.update.ai",
];
const FALLBACK_TARGET_TYPES = ["tenant", "user", "settings"];

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString();
}

function formatActionLabel(action: string) {
  return action
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTargetLabel(targetType?: string | null, targetId?: string | null) {
  if (!targetType && !targetId) {
    return "Platform";
  }

  if (!targetId) {
    return targetType || "Platform";
  }

  const shortId = targetId.length > 12 ? `${targetId.slice(0, 12)}...` : targetId;
  return `${targetType || "Record"} • ${shortId}`;
}

function renderDetails(details?: Record<string, unknown> | null) {
  if (!details || Object.keys(details).length === 0) {
    return <span className="text-slate-500">No details</span>;
  }

  return (
    <details className="group max-w-md">
      <summary className="cursor-pointer text-sm text-primary marker:hidden hover:text-primary-light">
        View details
      </summary>
      <pre className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 whitespace-pre-wrap break-words">
        {JSON.stringify(details, null, 2)}
      </pre>
    </details>
  );
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<PlatformAuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [availableActions, setAvailableActions] = useState<string[]>([]);
  const [availableTargetTypes, setAvailableTargetTypes] = useState<string[]>([]);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    void fetchLogs();
  }, [page, actionFilter, targetTypeFilter]);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("access_token") ||
            document.cookie.match(/(?:^|;\s*)access_token=([^;]+)/)?.[1]
          : null;

      if (!token) {
        setLogs([]);
        setTotal(0);
        return;
      }

      const response = await getPlatformAuditLogs(
        page,
        PAGE_SIZE,
        actionFilter || undefined,
        targetTypeFilter || undefined
      );
      setLogs(response.items);
      setTotal(response.total);

      if (page === 1) {
        const actionsFromLogs = response.items
          .map((item) => item.action)
          .filter(Boolean);
        const targetTypesFromLogs = response.items
          .map((item) => item.target_type)
          .filter((value): value is string => Boolean(value));

        setAvailableActions((current) => {
          const merged = new Set([
            ...FALLBACK_ACTIONS,
            ...actionsFromLogs,
            ...current,
          ]);
          return Array.from(merged).sort();
        });

        setAvailableTargetTypes((current) => {
          const merged = new Set([
            ...FALLBACK_TARGET_TYPES,
            ...targetTypesFromLogs,
            ...current,
          ]);
          return Array.from(merged).sort();
        });
      }
    } catch (error) {
      console.error("Failed to fetch audit logs", error);
      setLogs([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      setExportLoading(true);
      const blob = await exportPlatformAuditLogs(
        actionFilter || undefined,
        targetTypeFilter || undefined
      );
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit_logs_${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(link);
    } catch (error) {
      console.error("Export failed", error);
      alert("Failed to export audit logs. Please try again.");
    } finally {
      setExportLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const hasFilters = Boolean(actionFilter || targetTypeFilter);
  const resultsStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const resultsEnd = Math.min(page * PAGE_SIZE, total);

  return (
    <div className="mx-auto max-w-7xl font-[family-name:var(--font-geist-sans)]">
      <div className="mb-8 flex items-start justify-end gap-3">
          <button
            onClick={() => {
              void fetchLogs();
            }}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-900 transition-all hover:bg-slate-50"
          >
            Refresh
          </button>
          <button
            onClick={handleExport}
            disabled={exportLoading}
            className="rounded-xl bg-[#6C63FF] px-5 py-2 font-medium text-white transition-all hover:bg-[#5a52d4] disabled:opacity-50"
          >
            {exportLoading ? "Exporting..." : "Export CSV"}
          </button>
      </div>

      <div className="mb-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] p-5 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
          <p className="text-sm text-slate-600">Total Audit Records</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{total}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] p-5 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
          <p className="text-sm text-slate-600">Available Actions</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{availableActions.length}</p>
        </div>
        <div className="rounded-2xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] p-5 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
          <p className="text-sm text-slate-600">Target Types</p>
          <p className="mt-2 text-3xl font-semibold text-slate-950">{availableTargetTypes.length}</p>
        </div>
      </div>

      <div className="mb-8 rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_auto]">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600">Filter by Action</label>
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Actions</option>
              {availableActions.map((action) => (
                <option key={action} value={action}>
                  {formatActionLabel(action)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600">Filter by Target</label>
            <select
              value={targetTypeFilter}
              onChange={(e) => {
                setTargetTypeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="">All Targets</option>
              {availableTargetTypes.map((targetType) => (
                <option key={targetType} value={targetType}>
                  {formatActionLabel(targetType)}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={() => {
                setActionFilter("");
                setTargetTypeFilter("");
                setPage(1);
              }}
              disabled={!hasFilters}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-900 transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Clear Filters
            </button>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-[linear-gradient(180deg,rgba(244,250,252,0.95),rgba(237,247,248,0.9))]">
                <th className="px-6 py-4 text-sm font-semibold text-slate-700">Timestamp</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700">Action</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700">Actor</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700">Target</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700">IP Address</th>
                <th className="px-6 py-4 text-sm font-semibold text-slate-700">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading ? (
                [...Array(5)].map((_, index) => (
                  <tr key={index} className="animate-pulse">
                    <td colSpan={6} className="px-6 py-8">
                      <div className="h-4 w-full rounded bg-slate-200" />
                    </td>
                  </tr>
                ))
              ) : logs.length > 0 ? (
                logs.map((log) => (
                  <tr key={log.id} className="transition-colors hover:bg-slate-50/80">
                    <td className="px-6 py-4 text-sm text-slate-700">{formatDate(log.created_at)}</td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1">
                        <span className="inline-flex w-fit rounded-md border border-primary/20 bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
                          {formatActionLabel(log.action)}
                        </span>
                        <span className="text-xs text-slate-500">{log.action}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">
                      {log.actor_email || "Unknown actor"}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-600">
                      {formatTargetLabel(log.target_type, log.target_id)}
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-slate-500">
                      {log.ip_address || "N/A"}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-700">{renderDetails(log.details)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-slate-500">
                    No audit logs found for the selected filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/70 px-6 py-4">
          <p className="text-sm text-slate-600">
            Showing <span className="text-slate-950">{resultsStart}</span> to{" "}
            <span className="text-slate-950">{resultsEnd}</span> of{" "}
            <span className="text-slate-950">{total}</span> results
          </p>

          <div className="flex items-center gap-3">
            <span className="text-sm text-slate-600">
              Page <span className="text-slate-950">{page}</span> of{" "}
              <span className="text-slate-950">{totalPages}</span>
            </span>
            <div className="flex gap-2">
              <button
                disabled={page === 1}
                onClick={() => setPage((currentPage) => currentPage - 1)}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-900 transition-all hover:bg-slate-50 disabled:opacity-30"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((currentPage) => currentPage + 1)}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-900 transition-all hover:bg-slate-50 disabled:opacity-30"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
