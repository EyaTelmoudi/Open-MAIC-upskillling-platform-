"use client";

import { TenantSetupProgress } from "../../lib/api";
import Link from "next/link";

interface SetupProgressProps {
  progress: TenantSetupProgress;
  tenantId: string;
}

export function SetupProgress({ progress, tenantId }: SetupProgressProps) {
  const getStepIcon = (status: string) => {
    if (status === "completed") {
      return (
        <div className="w-8 h-8 rounded-full bg-green-500/20 flex items-center justify-center">
          <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
      );
    }
    if (status === "pending") {
      return (
        <div className="w-8 h-8 rounded-full bg-yellow-500/20 flex items-center justify-center">
          <svg className="w-5 h-5 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
      );
    }
    return (
      <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
        <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </div>
    );
  };

  const getStepHref = (key: string) => {
    switch (key) {
      case "azure_entra_id":
        return `/superadmin/settings?tab=entra&tenant=${tenantId}`;
      case "tenant_admin":
        return `/superadmin/admins?tenantId=${tenantId}`;
      case "seat_limit":
        return `/superadmin/tenants/${tenantId}`;
      case "first_users":
        return `/admin/users?tenantId=${tenantId}`;
      default:
        return "#";
    }
  };

  const getHealthColor = (percentage: number) => {
    if (percentage >= 75) return "text-green-500";
    if (percentage >= 50) return "text-yellow-500";
    return "text-red-500";
  };

  const getProgressBarColor = (percentage: number) => {
    if (percentage >= 75) return "bg-green-500";
    if (percentage >= 50) return "bg-yellow-500";
    return "bg-red-500";
  };

  return (
    <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-950">Setup Progress</h2>
        <div className="flex items-center gap-3">
          <span className={`text-2xl font-bold ${getHealthColor(progress.completion_percentage)}`}>
            {progress.completion_percentage}%
          </span>
          <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-200">
            <div
              className={`h-full ${getProgressBarColor(progress.completion_percentage)} transition-all duration-300`}
              style={{ width: `${progress.completion_percentage}%` }}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {progress.steps.map((step) => (
          <div
            key={step.key}
            className={`flex items-center gap-4 rounded-2xl border p-4 ${
              step.status === "completed"
                ? "border-emerald-200 bg-emerald-50"
                : step.status === "pending"
                ? "border-amber-200 bg-amber-50"
                : "border-red-200 bg-red-50"
            }`}
          >
            {getStepIcon(step.status)}
            <div className="flex-1">
              <p className="font-medium text-slate-950">{step.label}</p>
              <p className="text-sm text-slate-600">
                {step.value || (step.status === "not_configured" ? "Not configured" : "Pending")}
              </p>
            </div>
            {step.status !== "completed" && (
              <Link
                href={getStepHref(step.key)}
                className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
              >
                Configure
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
