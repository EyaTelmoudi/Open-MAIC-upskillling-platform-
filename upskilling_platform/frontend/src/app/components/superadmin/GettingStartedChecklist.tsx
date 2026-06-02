"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Loader2 } from "lucide-react";
import { api } from "@/app/lib/api";
import { routes } from "@/app/lib/routes";

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  auto_checked: boolean;
  completed: boolean;
  action_url: string | null;
}

interface ChecklistState {
  items: ChecklistItem[];
  completed_count: number;
  total_count: number;
}

export function GettingStartedChecklist() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [checklist, setChecklist] = useState<ChecklistState | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchChecklist();
  }, []);

  const fetchChecklist = async () => {
    try {
      setLoading(true);
      const data = await api.get<ChecklistState>("/api/v1/superadmin/checklist");
      setChecklist(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load checklist");
    } finally {
      setLoading(false);
    }
  };

  const markComplete = async (itemId: string) => {
    try {
      const data = await api.put<ChecklistState>("/api/v1/superadmin/checklist", {
        item_id: itemId,
      });
      setChecklist(data);
    } catch (err) {
      console.error("Failed to update checklist:", err);
    }
  };

  const handleItemClick = (item: ChecklistItem) => {
    if (item.completed || item.auto_checked) return;

    const actionUrl =
      item.id === "tenant_admins_assigned"
        ? routes.superadminUsers
        : item.id === "entra_id_configured"
          ? `${routes.superadminSettings}?tab=entra`
        : item.id === "first_users_invited"
          ? routes.superadminUsers
        : item.action_url;

    if (actionUrl) {
      router.push(actionUrl);
    } else {
      markComplete(item.id);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-red-500/10 border border-red-500 text-red-500">
        {error}
      </div>
    );
  }

  if (!checklist) return null;

  const completionPercentage =
    checklist.total_count > 0
      ? Math.round((checklist.completed_count / checklist.total_count) * 100)
      : 0;

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
      <div className="border-b border-slate-200 p-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-950">
            Getting Started
          </h3>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
              {checklist.completed_count}/{checklist.total_count}
            </span>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#4F46E5] via-[#38BDF8] to-[#FBBF24] transition-all duration-500"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
      </div>

      <div className="p-2">
        {checklist.items.map((item) => (
          <button
            key={item.id}
            onClick={() => handleItemClick(item)}
            disabled={item.completed || item.auto_checked}
            className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
              item.completed || item.auto_checked
                ? "opacity-60 cursor-default"
                : "cursor-pointer hover:bg-slate-50"
            }`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center ${
                item.completed || item.auto_checked
                  ? "bg-[#FBBF24] text-[#111827]"
                  : "border-2 border-slate-300 bg-white"
              }`}
            >
              {(item.completed || item.auto_checked) && (
                <Check className="w-4 h-4" />
              )}
            </div>
            <div className="flex-1 text-left">
              <p
                className={`font-medium ${
                  item.completed || item.auto_checked
                    ? "text-[#FBBF24]"
                    : "text-slate-950"
                }`}
              >
                {item.title}
              </p>
              <p className="text-sm text-slate-600">{item.description}</p>
            </div>
            {!item.completed && !item.auto_checked && item.action_url && (
              <ChevronRight className="h-5 w-5 text-slate-500" />
            )}
          </button>
        ))}
      </div>
    </div>
  );
}

export function GettingStartedChecklistMini() {
  const router = useRouter();
  const [checklist, setChecklist] = useState<ChecklistState | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChecklist();
  }, []);

  const fetchChecklist = async () => {
    try {
      const data = await api.get<ChecklistState>("/api/v1/superadmin/checklist");
      setChecklist(data);
    } catch (err) {
      console.error("Failed to fetch checklist:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5">
        <Loader2 className="h-4 w-4 animate-spin text-primary" />
        <span className="text-sm text-primary">Loading...</span>
      </div>
    );
  }

  if (!checklist) return null;

  const isComplete = checklist.completed_count === checklist.total_count;

  if (isComplete) return null;

  return (
    <button
      onClick={() => router.push("/superadmin")}
      className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 transition-colors hover:bg-primary/15"
    >
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#4F46E5]">
        <span className="text-xs font-bold text-white">
          {checklist.completed_count}
        </span>
      </span>
      <span className="text-sm font-medium text-primary">Setup</span>
      <ChevronRight className="h-4 w-4 text-primary" />
    </button>
  );
}
