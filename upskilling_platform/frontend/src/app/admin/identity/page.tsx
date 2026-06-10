"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, RefreshCw, Shield, Users } from "lucide-react";

import { AdminShell } from "@/app/components/layout/AdminShell";
import {
  getSyncStatus,
  triggerManualSync,
  type SyncStatusResponse,
} from "@/app/lib/api";
import { routes } from "@/app/lib/routes";
import { useAuth } from "@/app/context/AuthContext";
import { formatDateForUser } from "@/app/lib/user-date-format";

export default function IdentityPage() {
  const { user } = useAuth();
  const [syncStatus, setSyncStatus] = useState<SyncStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    void loadSyncStatus();
  }, []);

  async function loadSyncStatus() {
    try {
      const status = await getSyncStatus();
      setSyncStatus(status);
    } catch (error) {
      console.error("Failed to load sync status:", error);
    } finally {
      setLoading(false);
    }
  }

  async function handleManualSync() {
    setSyncing(true);
    try {
      await triggerManualSync();
      await loadSyncStatus();
    } catch (error) {
      console.error("Failed to trigger sync:", error);
    } finally {
      setSyncing(false);
    }
  }

  function formatDate(dateStr?: string | null) {
    if (!dateStr) return "Never";
    return formatDateForUser(dateStr, user?.timezone);
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <section className="rounded-3xl border border-[#223246] bg-[radial-gradient(circle_at_top_right,_rgba(34,197,94,0.12),_transparent_35%),linear-gradient(180deg,_#101927_0%,_#0C141F_100%)] p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-[#7EA1C6]">
                Identity Operations
              </p>
              <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white">
                Company access control
              </h2>
              <p className="mt-3 max-w-3xl text-sm leading-6 text-[#93A9C5]">
                Monitor Azure Entra ID synchronization, keep access provisioning healthy, and jump directly into company user administration.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <Link
                href={routes.adminUsers}
                className="inline-flex items-center gap-2 rounded-2xl border border-[#2C3B50] bg-[#101927] px-4 py-3 text-sm font-medium text-[#D7E1F0] transition-colors hover:border-[#0EA5E9]/30 hover:bg-[#142131]"
              >
                <Users className="h-4 w-4 text-[#86DEFF]" />
                Open User Admin
              </Link>
              <button
                onClick={handleManualSync}
                disabled={syncing}
                className="inline-flex items-center gap-2 rounded-2xl bg-[#0EA5E9] px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#0284C7] disabled:cursor-not-allowed disabled:bg-[#225A77]"
              >
                <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
                {syncing ? "Running Sync..." : "Trigger Manual Sync"}
              </button>
            </div>
          </div>
        </section>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {[
            {
              label: "Sync Status",
              value: loading ? "Loading..." : syncStatus?.last_sync_status || "Not synced",
              accent: "text-white",
            },
            {
              label: "Last Sync",
              value: loading ? "..." : formatDate(syncStatus?.last_sync),
              accent: "text-white",
            },
            {
              label: "Synced Today",
              value: loading ? "..." : String(syncStatus?.total_synced_today || 0),
              accent: "text-[#86F5B1]",
            },
            {
              label: "Control Scope",
              value: "Tenant Access",
              accent: "text-[#86DEFF]",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-3xl border border-[#223246] bg-[linear-gradient(180deg,#101927_0%,#0D1622_100%)] p-6"
            >
              <p className="text-sm font-medium text-[#9AAECB]">{item.label}</p>
              <p className={`mt-3 text-3xl font-semibold ${item.accent}`}>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.2fr_1fr]">
          <div className="rounded-3xl border border-[#223246] bg-[#101927] p-6">
            <h3 className="text-lg font-semibold text-white">Identity priorities</h3>
            <div className="mt-5 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-[#233247] bg-[#0D1622] p-4">
                <div className="flex items-center gap-3">
                  <Shield className="h-5 w-5 text-[#86DEFF]" />
                  <p className="text-sm font-semibold text-white">Directory Health</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#8FA4BE]">
                  Keep Azure Entra ID synchronization current so provisioning and role visibility stay reliable.
                </p>
              </div>
              <div className="rounded-2xl border border-[#233247] bg-[#0D1622] p-4">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-[#86DEFF]" />
                  <p className="text-sm font-semibold text-white">User Governance</p>
                </div>
                <p className="mt-3 text-sm leading-6 text-[#8FA4BE]">
                  Invite users, review access state, and manage departments from the company user workspace.
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-3xl border border-[#223246] bg-[#101927] p-6">
            <h3 className="text-lg font-semibold text-white">Operational Links</h3>
            <div className="mt-5 space-y-3">
              {[
                {
                  title: "User Administration",
                  description: "Manage user accounts, roles, and departments.",
                  href: routes.adminUsers,
                },
                {
                  title: "Workspace Overview",
                  description: "Return to the admin landing page and company operations view.",
                  href: routes.dashboard,
                },
              ].map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="flex items-center gap-3 rounded-2xl border border-[#233247] bg-[#0D1622] px-4 py-4 transition-colors hover:border-[#0EA5E9]/30 hover:bg-[#112131]"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-white">{item.title}</p>
                    <p className="mt-1 text-sm text-[#8FA4BE]">{item.description}</p>
                  </div>
                  <ArrowRight className="ml-auto h-4 w-4 text-[#6F839D]" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
