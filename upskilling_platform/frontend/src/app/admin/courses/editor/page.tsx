"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

import { CourseManagementNav } from "@/app/admin/courses/course-management-nav";
import { AdminShell } from "@/app/components/layout/AdminShell";
import { Button } from "@/app/components/ui/Button";
import { getCourses, type Course } from "@/app/lib/api";
import { routes } from "@/app/lib/routes";

type AdminCourse = Course & {
  thumbnail?: string | null;
  rating?: number | null;
  created_at?: string;
};

export default function AdminCourseEditorWorkspacePage() {
  const router = useRouter();
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadCourses() {
      try {
        setError(null);
        const response = await getCourses({ page: 1, page_size: 100 });
        setCourses(response.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load courses.");
      } finally {
        setLoading(false);
      }
    }

    void loadCourses();
  }, []);

  const openSelectedCourseEditor = () => {
    if (!selectedCourseId) {
      return;
    }
    router.push(`${routes.adminCourseDetail(selectedCourseId)}?edit=1`);
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <CourseManagementNav />

        <section className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
              Course Editor Workspace
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-950">Choose a course to edit</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Select a course here to open its editing view. This keeps selection inside the page content instead of the workspace navigation.
            </p>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
            {loading ? (
              <div className="inline-flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading courses...
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                    Select Course
                  </label>
                  <select
                    value={selectedCourseId}
                    onChange={(event) => setSelectedCourseId(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                  >
                    <option value="">Choose a course from the catalog</option>
                    {courses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <Button onClick={openSelectedCourseEditor} disabled={!selectedCourseId}>
                    <ArrowRight className="h-4 w-4" />
                    Open Course Editor
                  </Button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
