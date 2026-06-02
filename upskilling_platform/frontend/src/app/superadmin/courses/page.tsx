"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BookOpen, Building2, ChevronRight, CircleOff, Plus, Search, Trash2 } from "lucide-react";

import { deleteCourseById, getCourses, getTenants, toggleCoursePublish, type Course, type TenantResponse } from "../../lib/api";
import { routes } from "../../lib/routes";

const PAGE_SIZE = 100;

async function getAllCourses(): Promise<Course[]> {
  const firstPage = await getCourses({ page: 1, page_size: PAGE_SIZE });
  const items = [...(firstPage.items || [])];
  const totalPages = Math.ceil((firstPage.total || 0) / PAGE_SIZE);

  if (totalPages <= 1) {
    return items;
  }

  const remainingPages = await Promise.all(
    Array.from({ length: totalPages - 1 }, (_, index) =>
      getCourses({ page: index + 2, page_size: PAGE_SIZE })
    )
  );

  for (const page of remainingPages) {
    items.push(...(page.items || []));
  }

  return items;
}

export default function SuperAdminCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [tenants, setTenants] = useState<TenantResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tenantFilter, setTenantFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [actionCourseId, setActionCourseId] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setLoading(true);
        const [coursesData, tenantsData] = await Promise.all([
          getAllCourses(),
          getTenants(1, PAGE_SIZE),
        ]);
        setCourses(coursesData || []);
        setTenants(tenantsData.tenants || []);
        setError(null);
      } catch (err: any) {
        console.error("Failed to load super admin courses:", err);
        setError(err?.message || "Failed to load platform courses.");
      } finally {
        setLoading(false);
      }
    }

    loadData();
  }, []);

  async function handleTogglePublish(course: Course) {
    try {
      setActionCourseId(course.id);
      setError(null);
      setSuccess(null);
      const updated = await toggleCoursePublish(course.id);
      setCourses((current) =>
        current.map((item) =>
          item.id === course.id ? { ...item, is_published: updated.is_published } : item
        )
      );
      setSuccess(
        updated.is_published
          ? "Course published successfully. The Course Memory Agent synced the course bank."
          : "Course moved back to draft."
      );
    } catch (err: any) {
      setError(err?.message || "Failed to update publish state.");
    } finally {
      setActionCourseId(null);
    }
  }

  async function handleDeleteCourse(course: Course) {
    const confirmed = window.confirm(`Delete "${course.title}"? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }

    try {
      setActionCourseId(course.id);
      setError(null);
      setSuccess(null);
      await deleteCourseById(course.id);
      setCourses((current) => current.filter((item) => item.id !== course.id));
      setSuccess("Course deleted successfully.");
    } catch (err: any) {
      setError(err?.message || "Failed to delete course.");
    } finally {
      setActionCourseId(null);
    }
  }

  const tenantNameById = useMemo(
    () => Object.fromEntries(tenants.map((tenant) => [tenant.id, tenant.name])),
    [tenants]
  );

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();

    return courses.filter((course) => {
      const tenantName = course.tenant_id ? tenantNameById[course.tenant_id] || "" : "Platform";
      const matchesSearch =
        !query ||
        course.title.toLowerCase().includes(query) ||
        course.category.toLowerCase().includes(query) ||
        course.difficulty.toLowerCase().includes(query) ||
        tenantName.toLowerCase().includes(query);
      const matchesTenant =
        tenantFilter === "all" ||
        (tenantFilter === "platform" ? !course.tenant_id : course.tenant_id === tenantFilter);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "published" ? course.is_published : !course.is_published);

      return matchesSearch && matchesTenant && matchesStatus;
    });
  }, [courses, search, tenantFilter, statusFilter, tenantNameById]);

  const summary = useMemo(() => {
    const published = courses.filter((course) => course.is_published).length;
    const draft = courses.length - published;
    const tenantIds = new Set(courses.map((course) => course.tenant_id).filter(Boolean));

    return {
      total: courses.length,
      published,
      draft,
      companies: tenantIds.size,
    };
  }, [courses]);

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96),rgba(241,250,248,0.94),rgba(232,244,248,0.9))] shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
        <div className="text-sm font-medium text-slate-700">Loading courses...</div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex justify-end">
          <Link
            href={routes.superadminCourseNew}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#10B981] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#0ea371]"
          >
            <Plus className="h-4 w-4" />
            Create Course
          </Link>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-red-500 bg-red-500/10 p-4 text-red-500">
            {error}
          </div>
        )}
        {success && (
          <div className="mb-6 rounded-xl border border-emerald-500 bg-emerald-500/10 p-4 text-emerald-400">
            {success}
          </div>
        )}

        <div className="mb-6 grid gap-4 md:grid-cols-4">
          <div className="rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] px-5 py-4 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-700">Total Courses</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{summary.total}</p>
          </div>
          <div className="rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] px-5 py-4 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-700">Published</p>
            <p className="mt-2 text-3xl font-semibold text-emerald-700">{summary.published}</p>
          </div>
          <div className="rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] px-5 py-4 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-700">Draft</p>
            <p className="mt-2 text-3xl font-semibold text-amber-700">{summary.draft}</p>
          </div>
          <div className="rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] px-5 py-4 shadow-[0_20px_40px_rgba(15,23,42,0.08)]">
            <p className="text-xs uppercase tracking-[0.18em] text-slate-700">Companies</p>
            <p className="mt-2 text-3xl font-semibold text-slate-950">{summary.companies}</p>
          </div>
        </div>

        <div className="mb-6 grid gap-4 rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] p-5 shadow-[0_20px_40px_rgba(15,23,42,0.08)] lg:grid-cols-[minmax(0,1fr)_240px_220px]">
          <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <Search className="h-4 w-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by title, category, difficulty, or company"
              className="w-full bg-transparent text-sm text-slate-900 outline-none placeholder:text-slate-500"
            />
          </label>

          <select
            value={tenantFilter}
            onChange={(e) => setTenantFilter(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
          >
            <option value="all">All companies</option>
            <option value="platform">Platform-wide</option>
            {tenants.map((tenant) => (
              <option key={tenant.id} value={tenant.id}>
                {tenant.name}
              </option>
            ))}
          </select>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
          >
            <option value="all">All statuses</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
        </div>

        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.96)_0%,rgba(243,249,251,0.94)_100%)] shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-amber-700" />
              <h2 className="text-lg font-semibold text-slate-950">All Platform Courses</h2>
            </div>
            <span className="text-sm text-slate-600">
              {filteredCourses.length} result{filteredCourses.length === 1 ? "" : "s"}
            </span>
          </div>

          {filteredCourses.length === 0 ? (
            <div className="px-6 py-14 text-center text-slate-600">
              <CircleOff className="mx-auto mb-4 h-10 w-10 text-slate-400" />
              <p className="text-lg font-medium text-slate-950">No courses found</p>
              <p className="mt-2 text-sm text-slate-500">
                Adjust the filters or create courses inside a tenant workspace first.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px]">
              <thead className="bg-[linear-gradient(180deg,rgba(244,250,252,0.95),rgba(237,247,248,0.9))]">
                  <tr className="border-b border-slate-200">
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Course</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Company</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Category</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Difficulty</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Status</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Duration</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">XP</th>
                    <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-700">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCourses.map((course) => {
                    const tenantName = course.tenant_id
                      ? tenantNameById[course.tenant_id] || "Unknown company"
                      : "Platform-wide";

                    return (
                      <tr key={course.id} className="border-b border-slate-200 last:border-b-0 hover:bg-slate-50/80">
                        <td className="px-5 py-4">
                          <div>
                            <p className="font-medium text-slate-950">{course.title}</p>
                            {course.description && (
                              <p className="mt-1 max-w-xl truncate text-sm text-slate-600">
                                {course.description}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-slate-500" />
                            {tenantName}
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">{course.category}</td>
                        <td className="px-5 py-4 text-sm capitalize text-slate-700">{course.difficulty}</td>
                        <td className="px-5 py-4">
                          <span
                            className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                              course.is_published
                                ? "bg-emerald-100 text-emerald-700"
                                : "bg-amber-100 text-amber-700"
                            }`}
                          >
                            {course.is_published ? "Published" : "Draft"}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-700">{course.duration} min</td>
                        <td className="px-5 py-4 text-sm text-slate-700">{course.xp_reward}</td>
                        <td className="px-5 py-4">
                          <div className="flex flex-wrap items-center gap-2">
                            {(() => {
                              const canPublish =
                                course.is_published || course.memory_retention_status === "completed";
                              const publishBlockedReason =
                                course.memory_retention_status === "failed"
                                  ? course.memory_retention_error || "Course memory retention failed."
                                  : course.memory_retention_status === "processing"
                                    ? "The course is still being retained by Hindsight."
                                    : "The course cannot be published until its memory retention is complete.";
                              return (
                            <button
                              type="button"
                              onClick={() => void handleTogglePublish(course)}
                              disabled={actionCourseId === course.id || !canPublish}
                              title={!canPublish ? publishBlockedReason : undefined}
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {actionCourseId === course.id
                                ? "Working..."
                                : course.is_published
                                  ? "Unpublish"
                                  : "Publish"}
                            </button>
                              );
                            })()}
                            <button
                              type="button"
                              onClick={() => void handleDeleteCourse(course)}
                              disabled={actionCourseId === course.id}
                              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-1.5 text-sm text-red-700 transition-colors hover:bg-red-50 hover:text-red-800 disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              <Trash2 className="h-4 w-4" />
                              Delete
                            </button>
                            <Link
                              href={routes.courseDetail(course.id)}
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
                            >
                              Open
                              <ChevronRight className="h-4 w-4" />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
    </div>
  );
}
