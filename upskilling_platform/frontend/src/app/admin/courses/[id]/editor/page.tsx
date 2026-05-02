"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { AdminShell } from "@/app/components/layout/AdminShell";
import { CourseManagementNav } from "@/app/admin/courses/course-management-nav";
import { getAICourseDraftByPlatformCourseId, getCourseById } from "@/app/lib/api";
import { routes } from "@/app/lib/routes";

function isAiGeneratedCourse(course: { category?: string | null; description?: string | null }) {
  const category = String(course.category || "").toLowerCase();
  const description = String(course.description || "").toLowerCase();
  return category.includes("ai") || description.includes("ai-generated");
}

export default function AdminCourseEditorRedirectPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const courseId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const [error, setError] = useState<string | null>(null);
  const [courseTitle, setCourseTitle] = useState("");
  const [editorMessage, setEditorMessage] = useState("Opening course editor...");

  useEffect(() => {
    async function resolveEditorRoute() {
      if (!courseId) {
        setError("Missing course id.");
        return;
      }

      try {
        const course = await getCourseById(courseId);
        setCourseTitle(course.title);

        if (isAiGeneratedCourse(course)) {
          setEditorMessage("Edit generated draft in the AI Course Studio.");
          const draft = await getAICourseDraftByPlatformCourseId(courseId, course.title);
          router.replace(routes.adminAiCourseEditor(draft.draftId));
          return;
        }

        setEditorMessage("Open the Course Editor in the Course Management workspace.");
        router.replace(`${routes.adminCourseDetail(courseId)}?edit=1`);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to open the correct course editor."
        );
      }
    }

    void resolveEditorRoute();
  }, [courseId, router]);

  return (
    <AdminShell>
      <div className="space-y-6">
        <CourseManagementNav currentCourseId={courseId} />
        <div className="rounded-3xl border border-slate-200 bg-white/95 p-8 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
              Course Editor
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-950">
              {courseTitle || "Opening course editor"}
            </h1>
            {!error ? (
              <p className="mt-2 text-sm leading-6 text-slate-600">{editorMessage}</p>
            ) : null}
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          ) : (
            <div className="mt-6 inline-flex items-center gap-2 text-sm text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Redirecting...
            </div>
          )}
        </div>
      </div>
    </AdminShell>
  );
}
