"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Building2, ChevronLeft, ChevronRight, Layers3, Plus } from "lucide-react";

import { createCourse, createCourseModule, getTenants, type TenantResponse } from "../../../lib/api";
import { routes } from "../../../lib/routes";

const categoryOptions = [
  "Technology",
  "Business",
  "Design",
  "Marketing",
  "Finance",
  "HR",
  "Leadership",
  "Programming",
];

const difficultyOptions = ["Beginner", "Intermediate", "Advanced"];

type ModuleDraft = {
  id: string;
  title: string;
  description: string;
};

function createEmptyModule(index: number): ModuleDraft {
  return {
    id: `${Date.now()}-${index}`,
    title: `Module ${index + 1}`,
    description: "",
  };
}

export default function SuperAdminCreateCoursePage() {
  const [tenants, setTenants] = useState<TenantResponse[]>([]);
  const [loadingTenants, setLoadingTenants] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [moduleCount, setModuleCount] = useState(1);
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Technology",
    difficulty: "Beginner",
    duration: 60,
    xp_reward: 100,
    tenant_id: "",
  });
  const [modules, setModules] = useState<ModuleDraft[]>([createEmptyModule(0)]);

  useEffect(() => {
    async function loadTenants() {
      try {
        setLoadingTenants(true);
        const response = await getTenants(1, 100);
        setTenants(response.tenants || []);
      } catch (err: any) {
        setError(err?.message || "Failed to load companies.");
      } finally {
        setLoadingTenants(false);
      }
    }

    loadTenants();
  }, []);

  const canMoveToModules = Boolean(
    form.title.trim() &&
      form.description.trim() &&
      form.category &&
      form.difficulty &&
      form.xp_reward >= 0 &&
      form.tenant_id
  );

  const currentModule = modules[activeModuleIndex];
  const allModulesValid = modules.every(
    (module) => module.title.trim() && module.description.trim()
  );

  function syncModules(nextCount: number) {
    const normalizedCount = Math.max(1, Math.min(20, nextCount));
    setModuleCount(normalizedCount);
    setModules((current) => {
      if (current.length === normalizedCount) {
        return current;
      }
      if (current.length > normalizedCount) {
        return current.slice(0, normalizedCount);
      }

      const additions = Array.from(
        { length: normalizedCount - current.length },
        (_, index) => createEmptyModule(current.length + index)
      );
      return [...current, ...additions];
    });
    setActiveModuleIndex((current) => Math.min(current, normalizedCount - 1));
  }

  function updateModule(index: number, changes: Partial<ModuleDraft>) {
    setModules((current) =>
      current.map((module, moduleIndex) =>
        moduleIndex === index ? { ...module, ...changes } : module
      )
    );
  }

  async function handleCreateCourse() {
    if (!form.title.trim() || !form.tenant_id) {
      setError("Course title and company are required.");
      return;
    }
    if (!allModulesValid) {
      setError("Please complete the title and description for every module.");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);
      const createdCourse = await createCourse({
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        difficulty: form.difficulty,
        duration: Number(form.duration),
        xp_reward: Number(form.xp_reward),
        is_published: false,
        tenant_id: form.tenant_id,
      });

      for (const [index, module] of modules.entries()) {
        await createCourseModule(createdCourse.id, {
          title: module.title.trim(),
          description: module.description.trim() || null,
          order: index + 1,
        });
      }

      setSuccess("Course created successfully for the selected company.");
      setForm({
        title: "",
        description: "",
        category: "Technology",
        difficulty: "Beginner",
        duration: 60,
        xp_reward: 100,
        tenant_id: "",
      });
      setStep(1);
      setModuleCount(1);
      setModules([createEmptyModule(0)]);
      setActiveModuleIndex(0);
    } catch (err: any) {
      setError(err?.message || "Failed to create course.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen p-8">
      <div className="mx-auto max-w-5xl">
        {error && (
          <div className="mb-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
            {success}
          </div>
        )}

        <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              {step === 1 ? <Building2 className="h-5 w-5" /> : <Layers3 className="h-5 w-5" />}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                {step === 1
                  ? "Step 1: Course Basics"
                  : step === 2
                    ? "Step 2: Module Count"
                    : `Step 3: Module Details (${activeModuleIndex + 1}/${modules.length})`}
              </h2>
              <p className="text-sm text-slate-600">
                {step === 1
                  ? "Define the target company and the core learning properties first."
                  : step === 2
                    ? "Choose how many modules this course will contain."
                    : "Fill the modules one by one before creating the course."}
              </p>
            </div>
          </div>

          <div className="mb-6 flex gap-3">
            {[
              { index: 1, label: "Basics" },
              { index: 2, label: "Modules" },
              { index: 3, label: "Details" },
            ].map((item) => (
              <div
                key={item.index}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
                  step === item.index
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px]">
                  {item.index}
                </span>
                {item.label}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Title</span>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                  placeholder="Course title"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Company</span>
                <select
                  value={form.tenant_id}
                  onChange={(e) => setForm((current) => ({ ...current, tenant_id: e.target.value }))}
                  disabled={loadingTenants}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                >
                  <option value="">{loadingTenants ? "Loading companies..." : "Select company"}</option>
                  {tenants.map((tenant) => (
                    <option key={tenant.id} value={tenant.id}>
                      {tenant.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Category</span>
                <select
                  value={form.category}
                  onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                >
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Difficulty</span>
                <select
                  value={form.difficulty}
                  onChange={(e) => setForm((current) => ({ ...current, difficulty: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                >
                  {difficultyOptions.map((difficulty) => (
                    <option key={difficulty} value={difficulty}>
                      {difficulty}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Duration (min)</span>
                <input
                  type="number"
                  min={1}
                  value={form.duration}
                  onChange={(e) => setForm((current) => ({ ...current, duration: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">XP Reward</span>
                <input
                  type="number"
                  min={0}
                  value={form.xp_reward}
                  onChange={(e) => setForm((current) => ({ ...current, xp_reward: Number(e.target.value) }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label className="space-y-2 md:col-span-2 xl:col-span-3">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                  rows={5}
                  placeholder="Course description"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                <p className="text-sm text-slate-700">
                  Define how many modules the course should contain. You will fill each module individually in the next step.
                </p>
                <div className="mt-5 max-w-xs space-y-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Number of Modules</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={moduleCount}
                    onChange={(e) => syncModules(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {modules.map((module, index) => (
                  <div
                    key={module.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <p className="text-sm font-semibold text-slate-900">Module {index + 1}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {module.title.trim() || "Title will be defined in the next step."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && currentModule && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {modules.map((module, index) => (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => setActiveModuleIndex(index)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeModuleIndex === index
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Module {index + 1}
                  </button>
                ))}
              </div>

              <div className="grid gap-4">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Module Title</span>
                  <input
                    type="text"
                    value={currentModule.title}
                    onChange={(e) => updateModule(activeModuleIndex, { title: e.target.value })}
                    placeholder={`Module ${activeModuleIndex + 1} title`}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Module Description</span>
                  <textarea
                    value={currentModule.description}
                    onChange={(e) => updateModule(activeModuleIndex, { description: e.target.value })}
                    rows={5}
                    placeholder="Describe the learning goal and focus of this module."
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
              </div>
            </div>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <Link
              href={routes.superadminCourses}
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Cancel
            </Link>
            {step > 1 && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep((current) => Math.max(1, current - 1));
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
            )}
            {step < 3 ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  if (step === 1) {
                    if (!canMoveToModules) {
                      setError("Please complete the course basics before continuing.");
                      return;
                    }
                    setStep(2);
                    return;
                  }
                  setStep(3);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreateCourse}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {submitting ? "Creating..." : "Create Course"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
