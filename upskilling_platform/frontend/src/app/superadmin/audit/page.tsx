"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Download,
  Filter,
  ShieldCheck,
} from "lucide-react";

import {
  getIdentityAuditLogs,
  getPlatformAuditFilterOptions,
  getPlatformAuditLogs,
  type IdentityAuditLog,
  type PlatformAuditLog,
} from "../../lib/api";

const PAGE_SIZE = 20;
const AUDIT_FETCH_LIMIT = 100;

type AuditLogRow = {
  id: string;
  source: "platform" | "identity";
  action: string;
  actor_email?: string | null;
  target_type?: string | null;
  target_id?: string | null;
  target_email?: string | null;
  details?: Record<string, unknown> | string | null;
  ip_address?: string | null;
  created_at: string;
};

const ACTION_INFO: Record<
  string,
  {
    label: string;
    description: string;
    category: string;
    tone: string;
  }
> = {
  "tenant.create": {
    label: "Company Created",
    description: "A new company workspace was added to the platform.",
    category: "Company",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  "tenant.update": {
    label: "Company Updated",
    description: "Company profile, limits, domain, logo, or configuration was changed.",
    category: "Company",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  "tenant.suspend": {
    label: "Company Suspended",
    description: "A company workspace was suspended or disabled.",
    category: "Company",
    tone: "border-red-200 bg-red-50 text-red-700",
  },
  "tenant.activate": {
    label: "Company Activated",
    description: "A suspended or pending company was activated.",
    category: "Company",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  admin_created: {
    label: "Admin Created",
    description: "A tenant admin account was created directly with login credentials.",
    category: "Admin",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  admin_invited: {
    label: "Admin Invited",
    description: "A tenant admin invitation was sent or registered.",
    category: "Admin",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  "admin.invite": {
    label: "Admin Invited",
    description: "A tenant admin invitation was sent or registered.",
    category: "Admin",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  "admin.status_changed": {
    label: "Admin Status Changed",
    description: "A tenant admin was suspended, reactivated, or had access changed.",
    category: "Admin",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  "admin.password_reset": {
    label: "Admin Password Reset",
    description: "A tenant admin local password was reset.",
    category: "Admin",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  "settings.update.general": {
    label: "General Settings Updated",
    description: "General platform configuration was changed.",
    category: "Settings",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  "settings.update.security": {
    label: "Security Settings Updated",
    description: "Platform security controls or requirements were changed.",
    category: "Settings",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  "settings.update.notifications": {
    label: "Notification Settings Updated",
    description: "Platform notification preferences were changed.",
    category: "Settings",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  "settings.update.ai": {
    label: "AI Settings Updated",
    description: "AI-related platform configuration was changed.",
    category: "Settings",
    tone: "border-violet-200 bg-violet-50 text-violet-700",
  },
  "user.create": {
    label: "User Created",
    description: "A platform user account was created.",
    category: "User",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  "user.update": {
    label: "User Updated",
    description: "A user profile, role, department, or status was edited.",
    category: "User",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  "user.delete": {
    label: "User Deleted",
    description: "A platform user account was permanently removed.",
    category: "User",
    tone: "border-red-200 bg-red-50 text-red-700",
  },
  role_changed: {
    label: "Role Changed",
    description: "A user's platform role was changed.",
    category: "User",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  status_changed: {
    label: "Status Changed",
    description: "A user's account status was changed.",
    category: "User",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  access_revoked: {
    label: "Access Revoked",
    description: "A user's platform access was revoked.",
    category: "User",
    tone: "border-red-200 bg-red-50 text-red-700",
  },
  email_confirmed: {
    label: "Email Confirmed",
    description: "A user's email change or identity email was confirmed.",
    category: "Identity",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  email_kept: {
    label: "Email Kept",
    description: "A user kept the existing platform email after a mismatch.",
    category: "Identity",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  email_mismatch_suppressed: {
    label: "Email Mismatch Suppressed",
    description: "An identity email mismatch was reviewed and suppressed.",
    category: "Identity",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
};

const KNOWN_AUDIT_ACTIONS = Object.keys(ACTION_INFO).sort();

function getActionInfo(action: string) {
  return (
    ACTION_INFO[action] || {
      label: formatActionLabel(action),
      description: "A platform administrative action was recorded.",
      category: "Platform",
      tone: "border-slate-200 bg-slate-50 text-slate-700",
    }
  );
}

function formatDate(dateString: string) {
  return new Date(dateString).toLocaleString();
}

function formatActionLabel(action: string) {
  return action
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatTargetLabel(targetType?: string | null, targetId?: string | null) {
  if (!targetType && !targetId) return "Platform";
  if (!targetId) return targetType || "Platform";

  const shortId = targetId.length > 12 ? `${targetId.slice(0, 12)}...` : targetId;
  return `${targetType || "Record"} - ${shortId}`;
}

function normalizeDetails(details?: Record<string, unknown> | string | null) {
  if (!details) return null;
  if (typeof details !== "string") return details;
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return { details };
  }
}

function renderDetails(details?: Record<string, unknown> | string | null) {
  const normalizedDetails = normalizeDetails(details);

  if (!normalizedDetails || Object.keys(normalizedDetails).length === 0) {
    return <span className="text-slate-500">No details</span>;
  }

  return (
    <details className="group max-w-md">
      <summary className="cursor-pointer text-sm font-medium text-emerald-700 marker:hidden hover:text-emerald-800">
        View details
      </summary>
      <pre className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 whitespace-pre-wrap break-words">
        {JSON.stringify(normalizedDetails, null, 2)}
      </pre>
    </details>
  );
}

function normalizePlatformLog(log: PlatformAuditLog): AuditLogRow {
  return {
    id: `platform-${log.id}`,
    source: "platform",
    action: log.action,
    actor_email: log.actor_email,
    target_type: log.target_type,
    target_id: log.target_id,
    details: log.details,
    ip_address: log.ip_address,
    created_at: log.created_at,
  };
}

function normalizeIdentityLog(log: IdentityAuditLog): AuditLogRow {
  return {
    id: `identity-${log.id}`,
    source: "identity",
    action: log.action,
    actor_email: log.actor_email,
    target_type: "user",
    target_id: log.target_user_id || log.user_id,
    target_email: log.target_email,
    details: log.details,
    ip_address: log.ip_address,
    created_at: log.created_at,
  };
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function detailsToText(details: Record<string, unknown> | null) {
  if (!details || Object.keys(details).length === 0) {
    return "No details";
  }

  return Object.entries(details)
    .map(([key, value]) => {
      if (value && typeof value === "object") {
        return `${key}: ${JSON.stringify(value)}`;
      }
      return `${key}: ${String(value ?? "")}`;
    })
    .join("\n");
}

function downloadAuditExcel(rows: AuditLogRow[]) {
  const generatedAt = new Date().toISOString();
  const platformCount = rows.filter((row) => row.source === "platform").length;
  const identityCount = rows.filter((row) => row.source === "identity").length;
  const recordRows = rows
    .map((row, index) => {
      const actionInfo = getActionInfo(row.action);
      const details = normalizeDetails(row.details);
      return `
        <tr>
          <td>${index + 1}</td>
          <td>${escapeHtml(formatDate(row.created_at))}</td>
          <td>${escapeHtml(row.source)}</td>
          <td>${escapeHtml(actionInfo.label)}</td>
          <td>${escapeHtml(actionInfo.category)}</td>
          <td>${escapeHtml(actionInfo.description)}</td>
          <td>${escapeHtml(row.action)}</td>
          <td>${escapeHtml(row.actor_email || "Unknown actor")}</td>
          <td>${escapeHtml(row.target_email || formatTargetLabel(row.target_type, row.target_id))}</td>
          <td>${escapeHtml(row.ip_address || "N/A")}</td>
          <td class="details">${escapeHtml(detailsToText(details)).replace(/\n/g, "<br />")}</td>
        </tr>`;
    })
    .join("");
  const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    body { font-family: Arial, sans-serif; color: #0f172a; }
    h1 { color: #064e3b; margin-bottom: 4px; }
    .meta { color: #475569; margin-bottom: 18px; }
    .summary td { border: 1px solid #cbd5e1; padding: 8px 12px; font-weight: 600; }
    table { border-collapse: collapse; width: 100%; }
    th { background: #d1fae5; color: #064e3b; border: 1px solid #94a3b8; padding: 9px; text-align: left; }
    td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: top; }
    tr:nth-child(even) td { background: #f8fafc; }
    .details { white-space: normal; min-width: 260px; }
  </style>
</head>
<body>
  <h1>Super Admin Audit Trail</h1>
  <div class="meta">Generated at ${escapeHtml(formatDate(generatedAt))}</div>
  <table class="summary">
    <tr>
      <td>Total Records</td><td>${rows.length}</td>
      <td>Platform Records</td><td>${platformCount}</td>
      <td>Identity Records</td><td>${identityCount}</td>
    </tr>
  </table>
  <br />
  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Timestamp</th>
        <th>Source</th>
        <th>Action</th>
        <th>Category</th>
        <th>Meaning</th>
        <th>Action Code</th>
        <th>Actor</th>
        <th>Target</th>
        <th>IP Address</th>
        <th>Details</th>
      </tr>
    </thead>
    <tbody>${recordRows}</tbody>
  </table>
</body>
</html>`;

  const blob = new Blob([html], {
    type: "application/vnd.ms-excel;charset=utf-8",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `audit_logs_${new Date().toISOString().split("T")[0]}.xls`;
  document.body.appendChild(link);
  link.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(link);
}

export default function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [actionFilter, setActionFilter] = useState("");
  const [targetTypeFilter, setTargetTypeFilter] = useState("");
  const [availableActions, setAvailableActions] = useState<string[]>(KNOWN_AUDIT_ACTIONS);
  const [availableTargetTypes, setAvailableTargetTypes] = useState<string[]>([]);
  const [exportLoading, setExportLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadFilterOptions = useCallback(async () => {
    try {
      const [options, identityLogs] = await Promise.all([
        getPlatformAuditFilterOptions(),
        getIdentityAuditLogs(1, AUDIT_FETCH_LIMIT),
      ]);
      const identityRows = identityLogs.logs.map(normalizeIdentityLog);
      setAvailableActions(
        Array.from(
          new Set([
            ...KNOWN_AUDIT_ACTIONS,
            ...options.actions,
            ...identityRows.map((row) => row.action),
          ])
        ).sort()
      );
      setAvailableTargetTypes(
        Array.from(
          new Set([...options.target_types, ...identityRows.map((row) => row.target_type || "platform")])
        ).sort()
      );
    } catch (error) {
      console.error("Failed to fetch audit filter options", error);
    }
  }, []);

  const loadAuditRows = useCallback(async () => {
    const shouldLoadIdentity = !targetTypeFilter || targetTypeFilter === "user";
    const [platformResult, identityResult] = await Promise.allSettled([
      getPlatformAuditLogs(
        1,
        AUDIT_FETCH_LIMIT,
        actionFilter || undefined,
        targetTypeFilter || undefined
      ),
      shouldLoadIdentity
        ? getIdentityAuditLogs(1, AUDIT_FETCH_LIMIT, actionFilter || undefined)
        : Promise.resolve({ logs: [], total: 0, page: 1, page_size: AUDIT_FETCH_LIMIT }),
    ]);

    const platformRows =
      platformResult.status === "fulfilled"
        ? platformResult.value.items.map(normalizePlatformLog)
        : [];
    const identityRows =
      identityResult.status === "fulfilled"
        ? identityResult.value.logs.map(normalizeIdentityLog)
        : [];

    if (platformResult.status === "rejected") {
      console.error("Failed to fetch platform audit logs", platformResult.reason);
    }
    if (identityResult.status === "rejected") {
      console.error("Failed to fetch identity audit logs", identityResult.reason);
    }

    return [...platformRows, ...identityRows].sort(
      (left, right) =>
        new Date(right.created_at).getTime() - new Date(left.created_at).getTime()
    );
  }, [actionFilter, targetTypeFilter]);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const token =
        typeof window !== "undefined"
          ? localStorage.getItem("access_token") ||
            document.cookie.match(/(?:^|;\s*)access_token=([^;]+)/)?.[1]
          : null;

      if (!token) {
        setLogs([]);
        setTotal(0);
        setLoadError("You must be signed in as a Super Admin to inspect the audit trail.");
        return;
      }

      const rows = await loadAuditRows();
      setTotal(rows.length);
      setLogs(rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE));
      setAvailableActions((current) =>
        Array.from(new Set([...current, ...rows.map((row) => row.action)])).sort()
      );
      setAvailableTargetTypes((current) =>
        Array.from(new Set([...current, ...rows.map((row) => row.target_type || "platform")])).sort()
      );
    } catch (error) {
      console.error("Failed to fetch audit logs", error);
      setLogs([]);
      setTotal(0);
      setLoadError(error instanceof Error ? error.message : "Failed to fetch audit logs.");
    } finally {
      setLoading(false);
    }
  }, [loadAuditRows, page]);

  useEffect(() => {
    void loadFilterOptions();
  }, [loadFilterOptions]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const handleExport = async () => {
    try {
      setExportLoading(true);
      const rows = await loadAuditRows();
      downloadAuditExcel(rows);
    } catch (error) {
      console.error("Export failed", error);
      setLoadError(error instanceof Error ? error.message : "Failed to export audit logs.");
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
      <div className="mb-6 flex flex-wrap items-center justify-end gap-3">
        <button
          onClick={handleExport}
          disabled={exportLoading}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-5 py-2 font-medium text-white shadow-[0_14px_30px_rgba(16,185,129,0.22)] transition-all hover:bg-emerald-700 disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {exportLoading ? "Exporting..." : "Export"}
        </button>
      </div>

      {loadError && !loading && (
        <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {loadError}
        </div>
      )}

      <div className="mb-8 rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
        <div className="mb-5 flex items-center gap-3">
          <span className="rounded-2xl bg-emerald-100 p-2 text-emerald-700">
            <Filter className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-lg font-semibold text-slate-950">Audit Filters</h2>
            <p className="text-sm text-slate-600">Narrow the trail by action type or target area.</p>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-[1.2fr_1fr_auto]">
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-600">Filter by Action</label>
            <select
              value={actionFilter}
              onChange={(event) => {
                setActionFilter(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">
                {availableActions.length > 0 ? "All Actions" : "No audit actions yet"}
              </option>
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
              onChange={(event) => {
                setTargetTypeFilter(event.target.value);
                setPage(1);
              }}
              className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">
                {availableTargetTypes.length > 0 ? "All Targets" : "No target types yet"}
              </option>
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
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="rounded-2xl bg-emerald-100 p-2 text-emerald-700">
              <ShieldCheck className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Platform Activity Trail</h2>
              <p className="text-sm text-slate-600">
                Recent Super Admin actions, with clear meaning, actor, target, IP address, and details.
              </p>
            </div>
          </div>
        </div>

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
                logs.map((log) => {
                  const actionInfo = getActionInfo(log.action);

                  return (
                    <tr key={log.id} className="transition-colors hover:bg-slate-50/80">
                      <td className="px-6 py-4 text-sm text-slate-700">{formatDate(log.created_at)}</td>
                      <td className="px-6 py-4">
                        <div className="flex max-w-[320px] flex-col gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-semibold ${actionInfo.tone}`}>
                              {actionInfo.label}
                            </span>
                            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600">
                              {actionInfo.category}
                            </span>
                            <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium capitalize text-slate-600">
                              {log.source} audit
                            </span>
                          </div>
                          <p className="text-xs leading-5 text-slate-600">{actionInfo.description}</p>
                          <span className="font-mono text-[11px] text-slate-500">{log.action}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">
                        {log.actor_email || "Unknown actor"}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-600">
                        {log.target_email || formatTargetLabel(log.target_type, log.target_id)}
                      </td>
                      <td className="px-6 py-4 font-mono text-sm text-slate-500">
                        {log.ip_address || "N/A"}
                      </td>
                      <td className="px-6 py-4 text-sm text-slate-700">{renderDetails(log.details)}</td>
                    </tr>
                  );
                })
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

        <div className="flex flex-col gap-4 border-t border-slate-200 bg-slate-50/70 px-6 py-4 md:flex-row md:items-center md:justify-between">
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
                onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-900 transition-all hover:bg-slate-50 disabled:opacity-30"
                aria-label="Previous audit page"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <button
                disabled={page >= totalPages}
                onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                className="rounded-lg border border-slate-200 bg-white p-2 text-slate-900 transition-all hover:bg-slate-50 disabled:opacity-30"
                aria-label="Next audit page"
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
