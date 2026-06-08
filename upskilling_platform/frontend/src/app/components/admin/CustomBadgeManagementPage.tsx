"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Award,
  BadgeCheck,
  CheckCircle2,
  Loader2,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
} from "lucide-react";

import { useAuth } from "@/app/context/AuthContext";
import {
  createCustomBadge,
  CustomBadgePayload,
  CustomBadgeResponse,
  deleteCustomBadge,
  getCustomBadges,
  updateCustomBadge,
} from "@/app/lib/api";
import { cn } from "@/app/lib/utils";

type PageMode = "admin" | "team-manager";

type BadgeFormState = CustomBadgePayload & {
  is_active: boolean;
};

const emptyForm: BadgeFormState = {
  name: "",
  description: "",
  icon: "award",
  tier: "bronze",
  scope_type: "tenant",
  scope_id: "",
  condition_type: "manual_award",
  condition_value: null,
  auto_award: true,
  requires_approval: false,
  is_active: true,
};

const allScopes = [
  { value: "tenant", label: "Company-wide" },
  { value: "team", label: "Team" },
  { value: "challenge", label: "Challenge" },
  { value: "course", label: "Course" },
  { value: "category", label: "Course category" },
  { value: "skill", label: "Skill" },
  { value: "learning_path", label: "Learning path" },
];

const conditions = [
  { value: "manual_award", label: "Manual award" },
  { value: "challenge_completed", label: "Challenge completed" },
  { value: "challenge_won", label: "Challenge won" },
  { value: "challenge_fast_finish", label: "Challenge finished early" },
  { value: "course_completed", label: "Course completed" },
  { value: "course_category_completed", label: "Course category completed" },
  { value: "learning_path_completed", label: "Learning path completed" },
  { value: "quiz_score", label: "Quiz score reached" },
  { value: "skill_validated", label: "Skill validated" },
  { value: "team_participation", label: "Team participation" },
  { value: "streak_days", label: "Learning streak days" },
];

const tiers = ["bronze", "silver", "gold", "platinum"];
const icons = ["award", "badge", "trophy", "star", "sparkles", "shield"];

function scopesForRole(role?: string | null) {
  if (role === "TeamManager") {
    return allScopes.filter((scope) => ["tenant", "team", "challenge"].includes(scope.value));
  }
  if (role === "LearningExpert") {
    return allScopes.filter((scope) =>
      ["tenant", "course", "category", "skill", "learning_path"].includes(scope.value)
    );
  }
  return allScopes;
}

function conditionLabel(value: string) {
  return conditions.find((condition) => condition.value === value)?.label || value;
}

function scopeLabel(value: string) {
  return allScopes.find((scope) => scope.value === value)?.label || value;
}

function badgeToForm(badge: CustomBadgeResponse): BadgeFormState {
  return {
    name: badge.name,
    description: badge.description || "",
    icon: badge.icon || "award",
    tier: badge.tier,
    scope_type: badge.scope_type,
    scope_id: badge.scope_id || "",
    condition_type: badge.condition_type,
    condition_value: badge.condition_value ?? null,
    auto_award: badge.auto_award,
    requires_approval: badge.requires_approval,
    is_active: badge.is_active,
  };
}

function buildPayload(form: BadgeFormState): CustomBadgePayload & { is_active?: boolean } {
  return {
    name: form.name.trim(),
    description: form.description?.trim() || null,
    icon: form.icon || "award",
    tier: form.tier,
    scope_type: form.scope_type,
    scope_id: form.scope_id?.trim() || null,
    condition_type: form.condition_type,
    condition_value: form.condition_value,
    auto_award: form.auto_award,
    requires_approval: form.requires_approval,
    is_active: form.is_active,
  };
}

export function CustomBadgeManagementPage({ mode }: { mode: PageMode }) {
  const { user } = useAuth();
  const [badges, setBadges] = useState<CustomBadgeResponse[]>([]);
  const [form, setForm] = useState<BadgeFormState>(emptyForm);
  const [editingBadgeId, setEditingBadgeId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const availableScopes = useMemo(() => scopesForRole(user?.role), [user?.role]);
  const activeCount = badges.filter((badge) => badge.is_active).length;

  useEffect(() => {
    let cancelled = false;

    async function loadBadges() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await getCustomBadges(true);
        if (!cancelled) {
          setBadges(response.badges);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load badges");
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    loadBadges();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (availableScopes.some((scope) => scope.value === form.scope_type)) {
      return;
    }
    setForm((current) => ({ ...current, scope_type: availableScopes[0]?.value || "tenant" }));
  }, [availableScopes, form.scope_type]);

  function resetForm() {
    setEditingBadgeId(null);
    setForm({ ...emptyForm, scope_type: availableScopes[0]?.value || "tenant" });
    setSuccess(null);
    setError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = buildPayload(form);
      if (editingBadgeId) {
        const updated = await updateCustomBadge(editingBadgeId, payload);
        setBadges((current) => current.map((badge) => (badge.id === updated.id ? updated : badge)));
        setSuccess("Badge updated.");
      } else {
        const created = await createCustomBadge(payload);
        setBadges((current) => [created, ...current]);
        setSuccess("Badge created.");
      }
      resetForm();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Unable to save badge");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleDeactivate(badgeId: string) {
    setError(null);
    setSuccess(null);
    try {
      await deleteCustomBadge(badgeId);
      setBadges((current) =>
        current.map((badge) => (badge.id === badgeId ? { ...badge, is_active: false } : badge))
      );
      if (editingBadgeId === badgeId) {
        resetForm();
      }
      setSuccess("Badge deactivated.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Unable to deactivate badge");
    }
  }

  const pageCopy =
    mode === "team-manager"
      ? "Create tenant-isolated badges for team challenges, sprint learning, and manager recognition."
      : "Create tenant-isolated badges for learning paths, skills, courses, teams, and challenges.";

  return (
    <div className="space-y-6">
      <section className="overflow-hidden rounded-[28px] border border-white/45 bg-[linear-gradient(135deg,#062F3A_0%,#0B6B61_48%,#F2A51B_125%)] text-white shadow-[0_28px_70px_rgba(15,23,42,0.18)]">
        <div className="grid gap-6 px-6 py-7 lg:grid-cols-[1fr_320px] lg:items-center lg:px-8">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full border border-white/18 bg-white/12 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50">
              <ShieldCheck className="h-3.5 w-3.5" />
              Badge management
            </div>
            <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
              Learning badge definitions
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-emerald-50/88">
              {pageCopy}
            </p>
            <p className="mt-3 text-sm font-medium text-amber-100">
              Visible only inside {user?.tenant_name || "your company"}.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/16 bg-white/12 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50/80">
                Active badges
              </p>
              <p className="mt-2 font-mono text-3xl font-semibold">{activeCount}</p>
            </div>
            <div className="rounded-2xl border border-white/16 bg-white/12 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-50/80">
                Total drafts
              </p>
              <p className="mt-2 font-mono text-3xl font-semibold">{badges.length}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <section className="rounded-[24px] border border-slate-200/80 bg-white/82 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold text-slate-950">Company badges</h2>
              <p className="mt-1 text-sm text-slate-600">
                These badge definitions are stored with your company tenant only.
              </p>
            </div>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center justify-center gap-2 rounded-2xl bg-slate-950 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800"
            >
              <Plus className="h-4 w-4" />
              New badge
            </button>
          </div>

          {error ? (
            <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {error}
            </div>
          ) : null}
          {success ? (
            <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700">
              {success}
            </div>
          ) : null}

          <div className="mt-5 space-y-3">
            {isLoading ? (
              <div className="flex min-h-[220px] items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 text-slate-500">
                <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                Loading badges
              </div>
            ) : badges.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50/70 p-8 text-center">
                <Award className="mx-auto h-10 w-10 text-emerald-600" />
                <h3 className="mt-3 text-base font-semibold text-slate-950">No custom badges yet</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Create the first badge definition for your company workspace.
                </p>
              </div>
            ) : (
              badges.map((badge) => (
                <article
                  key={badge.id}
                  className={cn(
                    "rounded-2xl border bg-white p-4 shadow-sm transition",
                    badge.is_active ? "border-slate-200" : "border-slate-200 opacity-65"
                  )}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex min-w-0 gap-3">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(14,163,122,0.14),rgba(242,165,27,0.16))] text-emerald-700">
                        <BadgeCheck className="h-6 w-6" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h3 className="text-base font-semibold text-slate-950">{badge.name}</h3>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold capitalize text-slate-700">
                            {badge.tier}
                          </span>
                          <span
                            className={cn(
                              "rounded-full px-2.5 py-1 text-xs font-semibold",
                              badge.is_active
                                ? "bg-emerald-50 text-emerald-700"
                                : "bg-slate-100 text-slate-500"
                            )}
                          >
                            {badge.is_active ? "Active" : "Inactive"}
                          </span>
                        </div>
                        <p className="mt-2 text-sm leading-6 text-slate-600">
                          {badge.description || "No description added."}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium text-slate-600">
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                            {scopeLabel(badge.scope_type)}
                          </span>
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                            {conditionLabel(badge.condition_type)}
                          </span>
                          {badge.condition_value !== null && badge.condition_value !== undefined ? (
                            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                              Value {badge.condition_value}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingBadgeId(badge.id);
                          setForm(badgeToForm(badge));
                          setSuccess(null);
                          setError(null);
                        }}
                        className="inline-flex items-center justify-center rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Edit
                      </button>
                      {badge.is_active ? (
                        <button
                          type="button"
                          onClick={() => handleDeactivate(badge.id)}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-red-100 text-red-600 transition hover:bg-red-50"
                          aria-label="Deactivate badge"
                          title="Deactivate badge"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      ) : null}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <aside className="rounded-[24px] border border-slate-200/80 bg-white/88 p-5 shadow-[0_18px_48px_rgba(15,23,42,0.08)]">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                {editingBadgeId ? "Edit badge" : "Create badge"}
              </h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">
                Define the recognition rule and the scope where this badge can be awarded.
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            <label className="block">
              <span className="text-sm font-semibold text-slate-800">Badge name</span>
              <input
                value={form.name}
                onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                required
                maxLength={120}
                className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                placeholder="Team Challenge Winner"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-slate-800">Description</span>
              <textarea
                value={form.description || ""}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                rows={3}
                className="mt-2 w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                placeholder="Awarded when a learner completes the team challenge before the deadline."
              />
            </label>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Tier</span>
                <select
                  value={form.tier}
                  onChange={(event) => setForm((current) => ({ ...current, tier: event.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                >
                  {tiers.map((tier) => (
                    <option key={tier} value={tier}>
                      {tier}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Icon</span>
                <select
                  value={form.icon || "award"}
                  onChange={(event) => setForm((current) => ({ ...current, icon: event.target.value }))}
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                >
                  {icons.map((icon) => (
                    <option key={icon} value={icon}>
                      {icon}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Scope</span>
                <select
                  value={form.scope_type}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scope_type: event.target.value }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                >
                  {availableScopes.map((scope) => (
                    <option key={scope.value} value={scope.value}>
                      {scope.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Scope ID</span>
                <input
                  value={form.scope_id || ""}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, scope_id: event.target.value }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  placeholder="Optional UUID"
                />
              </label>
            </div>

            <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Award rule</span>
                <select
                  value={form.condition_type}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, condition_type: event.target.value }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                >
                  {conditions.map((condition) => (
                    <option key={condition.value} value={condition.value}>
                      {condition.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-slate-800">Value</span>
                <input
                  type="number"
                  min={0}
                  value={form.condition_value ?? ""}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      condition_value: event.target.value === "" ? null : Number(event.target.value),
                    }))
                  }
                  className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-950 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-100"
                  placeholder="90"
                />
              </label>
            </div>

            <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.auto_award}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, auto_award: event.target.checked }))
                  }
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">Automatic award</span>
                  <span className="block text-xs leading-5 text-slate-600">
                    The platform can grant the badge when the rule is matched.
                  </span>
                </span>
              </label>
              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={form.requires_approval}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, requires_approval: event.target.checked }))
                  }
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                />
                <span>
                  <span className="block text-sm font-semibold text-slate-800">Requires approval</span>
                  <span className="block text-xs leading-5 text-slate-600">
                    A manager or learning expert must confirm the attribution.
                  </span>
                </span>
              </label>
              {editingBadgeId ? (
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={form.is_active}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, is_active: event.target.checked }))
                    }
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="block text-sm font-semibold text-slate-800">Active badge</span>
                </label>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={isSaving}
              className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0EA37A,#14B8A6)] px-4 py-3 text-sm font-semibold text-white shadow-[0_16px_32px_rgba(14,163,122,0.22)] transition hover:brightness-105 disabled:cursor-not-allowed disabled:opacity-65"
            >
              {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {editingBadgeId ? "Save badge" : "Create badge"}
            </button>
          </form>

          <div className="mt-5 rounded-2xl border border-emerald-100 bg-emerald-50/80 p-4 text-sm leading-6 text-emerald-900">
            <div className="flex items-center gap-2 font-semibold">
              <CheckCircle2 className="h-4 w-4" />
              Isolation enforced
            </div>
            <p className="mt-1">
              The backend stores every badge with the current company tenant and filters reads and edits by that tenant.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
