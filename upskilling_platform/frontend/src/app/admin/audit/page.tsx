"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Filter, ShieldCheck } from "lucide-react";

import { AdminShell } from "@/app/components/layout/AdminShell";
import { useAuth } from "@/app/context/AuthContext";
import { getIdentityAuditLogs, type IdentityAuditLog } from "@/app/lib/api";
import { formatDateForUser } from "@/app/lib/user-date-format";

const PAGE_SIZE = 20;

const ACTION_INFO: Record<string, { label: string; description: string; tone: string }> = {
  "user.create": {
    label: "User Created",
    description: "A company user account was created.",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  "user.update": {
    label: "User Updated",
    description: "A user profile, role, department, or status was edited.",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  "user.delete": {
    label: "User Deleted",
    description: "A company user account was permanently removed.",
    tone: "border-red-200 bg-red-50 text-red-700",
  },
  role_changed: {
    label: "Role Changed",
    description: "A user's company role was changed.",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  status_changed: {
    label: "Status Changed",
    description: "A user's account status was changed.",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
  access_revoked: {
    label: "Access Revoked",
    description: "A user's company access was revoked.",
    tone: "border-red-200 bg-red-50 text-red-700",
  },
  email_confirmed: {
    label: "Email Confirmed",
    description: "A user email or identity email change was confirmed.",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  email_kept: {
    label: "Email Kept",
    description: "A user kept the existing platform email after a mismatch.",
    tone: "border-sky-200 bg-sky-50 text-sky-700",
  },
  email_mismatch_suppressed: {
    label: "Email Mismatch Suppressed",
    description: "An identity email mismatch was reviewed and suppressed.",
    tone: "border-amber-200 bg-amber-50 text-amber-700",
  },
};

const KNOWN_ACTIONS = Object.keys(ACTION_INFO).sort();

function formatDate(dateString: string, timezone?: string | null) {
  return formatDateForUser(dateString, timezone);
}

function formatActionLabel(action: string) {
  return action
    .replace(/[._]/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getActionInfo(action: string) {
  return (
    ACTION_INFO[action] || {
      label: formatActionLabel(action),
      description: "A company identity audit action was recorded.",
      tone: "border-slate-200 bg-slate-50 text-slate-700",
    }
  );
}

function normalizeDetails(details?: string | null) {
  if (!details) return null;
  try {
    return JSON.parse(details) as Record<string, unknown>;
  } catch {
    return { details };
  }
}

function renderDetails(details?: string | null) {
  const normalized = normalizeDetails(details);
  if (!normalized || Object.keys(normalized).length === 0) {
    return <span className="text-slate-500">No details</span>;
  }

  return (
    <details className="group max-w-md">
      <summary className="cursor-pointer text-sm font-medium text-emerald-700 marker:hidden hover:text-emerald-800">
        View details
      </summary>
      <pre className="mt-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700 whitespace-pre-wrap break-words">
        {JSON.stringify(normalized, null, 2)}
      </pre>
    </details>
  );
}

export default function AdminAuditPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<IdentityAuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [actionFilter, setActionFilter] = useState("");
  const [availableActions, setAvailableActions] = useState<string[]>(KNOWN_ACTIONS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canViewAudit = user?.role === "Admin" || user?.role === "SuperAdmin";

  const loadLogs = useCallback(async () => {
    if (!canViewAudit) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await getIdentityAuditLogs(
        page,
        PAGE_SIZE,
        actionFilter || undefined
      );
      setLogs(response.logs || []);
      setTotal(response.total || 0);
      setAvailableActions((current) =>
        Array.from(new Set([...current, ...(response.logs || []).map((log) => log.action)])).sort()
      );
    } catch (loadError) {
      setLogs([]);
      setTotal(0);
      setError(loadError instanceof Error ? loadError.message : "Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  }, [actionFilter, canViewAudit, page]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const resultsStart = total === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const resultsEnd = Math.min(page * PAGE_SIZE, total);

  const visibleActions = useMemo(
    () => availableActions.filter((action) => ACTION_INFO[action] || logs.some((log) => log.action === action)),
    [availableActions, logs]
  );

  if (!canViewAudit) {
    return (
      <AdminShell>
        <div className="mx-auto max-w-7xl rounded-3xl border border-amber-200 bg-amber-50 p-6 text-amber-800">
          Company audit logs are available to company admins only.
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="mx-auto max-w-7xl">
        {error && (
          <div className="mb-6 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="mb-8 rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] p-6 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
          <div className="mb-5 flex items-center gap-3">
            <span className="rounded-2xl bg-emerald-100 p-2 text-emerald-700">
              <Filter className="h-4 w-4" />
            </span>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Audit Filters</h2>
              <p className="text-sm text-slate-600">
                Filter company-scoped identity actions by action type.
              </p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
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
                <option value="">All Actions</option>
                {visibleActions.map((action) => (
                  <option key={action} value={action}>
                    {getActionInfo(action).label}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <button
                onClick={() => {
                  setActionFilter("");
                  setPage(1);
                }}
                disabled={!actionFilter}
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
                <h2 className="text-lg font-semibold text-slate-950">Company Activity Trail</h2>
                <p className="text-sm text-slate-600">
                  Identity, role, status, and access changes scoped to your company.
                </p>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px] border-collapse text-left">
              <thead>
                <tr className="border-b border-slate-200 bg-[linear-gradient(180deg,rgba(244,250,252,0.95),rgba(237,247,248,0.9))]">
                  <th className="px-6 py-4 text-sm font-semibold text-slate-700">Timestamp</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-700">Action</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-700">Actor</th>
                  <th className="px-6 py-4 text-sm font-semibold text-slate-700">Target User</th>
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
                        <td className="px-6 py-4 text-sm text-slate-700">{formatDate(log.created_at, user?.timezone)}</td>
                        <td className="px-6 py-4">
                          <div className="flex max-w-[320px] flex-col gap-2">
                            <span className={`inline-flex w-fit rounded-md border px-2 py-1 text-xs font-semibold ${actionInfo.tone}`}>
                              {actionInfo.label}
                            </span>
                            <p className="text-xs leading-5 text-slate-600">{actionInfo.description}</p>
                            <span className="font-mono text-[11px] text-slate-500">{log.action}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700">
                          {log.actor_email || "Unknown actor"}
                        </td>
                        <td className="px-6 py-4 text-sm text-slate-700">
                          {log.target_email || log.target_user_id || log.user_id || "Unknown target"}
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
                      No company audit logs found.
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
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-all hover:bg-slate-50 disabled:opacity-30"
                >
                  Previous
                </button>
                <button
                  disabled={page >= totalPages}
                  onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition-all hover:bg-slate-50 disabled:opacity-30"
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
