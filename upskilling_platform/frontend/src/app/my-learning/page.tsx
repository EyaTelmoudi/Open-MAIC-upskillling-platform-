"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/app/components/layout/AppShell";
import { useAuth } from "@/app/context/AuthContext";
import { useGamificationRealtime } from "@/app/hooks/useGamificationRealtime";
import {
  getCourseById,
  getEnrollments,
  type CourseDetailResponse,
  type EnrollmentResponse,
} from "@/app/lib/api";
import { routes } from "@/app/lib/routes";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  Loader2,
  PlayCircle,
} from "lucide-react";

interface CourseProgressItem {
  enrollment: EnrollmentResponse;
  course: CourseDetailResponse | null;
}

export default function MyLearningPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [courseProgressItems, setCourseProgressItems] = useState<CourseProgressItem[]>([]);

  const loadMyLearning = useCallback(async () => {
    if (!user) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const enrollmentData = await getEnrollments(user.id).catch(() => []);
      const courseIds = Array.from(
        new Set(enrollmentData.map((item) => item.course_id).filter(Boolean))
      );
      const courseDetails = await Promise.all(
        courseIds.map(async (courseId) => {
          try {
            return await getCourseById(courseId);
          } catch {
            return null;
          }
        })
      );
      const courseMap = new Map(
        courseDetails
          .filter((course): course is CourseDetailResponse => Boolean(course))
          .map((course) => [course.id, course])
      );

      setCourseProgressItems(
        enrollmentData.map((enrollment) => ({
          enrollment,
          course: courseMap.get(enrollment.course_id) ?? null,
        }))
      );
    } catch (loadError) {
      console.error("Failed to load my learning:", loadError);
      setError("Failed to load your learning workspace right now.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadMyLearning();
  }, [loadMyLearning]);

  useGamificationRealtime(user?.id, Boolean(user), () => {
    loadMyLearning();
  });

  const activeCourseItems = useMemo(
    () =>
      courseProgressItems.filter(
        (item) =>
          item.enrollment.status === "in_progress" ||
          item.enrollment.status === "active" ||
          item.enrollment.status === "enrolled"
      ),
    [courseProgressItems]
  );
  const completedCourseItems = useMemo(
    () =>
      courseProgressItems.filter((item) => item.enrollment.status === "completed"),
    [courseProgressItems]
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-[1440px] space-y-6">
        <section className="overflow-hidden rounded-[30px] border border-white/70 bg-[radial-gradient(circle_at_top_left,rgba(14,163,122,0.18),transparent_30%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.16),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(242,165,27,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.92),rgba(245,250,251,0.95))] px-6 py-7 shadow-[0_20px_50px_rgba(15,23,42,0.08)] sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary/75">
                My Learning
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950 sm:text-[2.25rem]">
                Keep your real enrolled learning in one focused place.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:text-base">
                Review the courses you are actively following and the ones you already completed, then open any course directly from here.
              </p>
            </div>
            <div className="grid min-w-[280px] grid-cols-2 gap-3 rounded-[28px] border border-white/70 bg-white/70 p-4 shadow-[0_16px_36px_rgba(14,163,122,0.08)] backdrop-blur">
              <div className="rounded-2xl bg-sky-50/90 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Active courses
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {activeCourseItems.length}
                </p>
              </div>
              <div className="rounded-2xl bg-emerald-50/90 px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Completed courses
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-950">
                  {completedCourseItems.length}
                </p>
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-[28px] border border-white/70 bg-white/80 shadow-sm">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="rounded-[28px] border border-red-200 bg-red-50/90 px-6 py-10 text-center text-sm font-medium text-red-700">
            {error}
          </div>
        ) : (
          <section className="grid gap-6 xl:grid-cols-2">
            <div className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.06)] backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                    <PlayCircle className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">
                      Currently learning
                    </h2>
                    <p className="text-sm text-slate-600">
                      Courses you are actively enrolled in right now.
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                  {activeCourseItems.length}
                </span>
              </div>
              <div className="mt-5 space-y-3">
                {activeCourseItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    No active course enrollment yet.
                  </div>
                ) : (
                  activeCourseItems.map((item) => (
                    <Link
                      key={item.enrollment.id}
                      href={routes.courseDetail(item.enrollment.course_id)}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4 transition-colors hover:border-primary/25 hover:bg-primary/5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {item.course?.title ?? "Course"}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {item.course?.category ?? "Learning course"} • {item.course?.difficulty ?? "Level not set"}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          Enrolled on {new Date(item.enrollment.enrolled_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                          In progress
                        </span>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>

            <div className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.06)] backdrop-blur">
              <div className="flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">
                      Completed courses
                    </h2>
                    <p className="text-sm text-slate-600">
                      Courses you already finished successfully.
                    </p>
                  </div>
                </div>
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                  {completedCourseItems.length}
                </span>
              </div>
              <div className="mt-5 space-y-3">
                {completedCourseItems.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                    No completed course yet.
                  </div>
                ) : (
                  completedCourseItems.map((item) => (
                    <Link
                      key={item.enrollment.id}
                      href={routes.courseDetail(item.enrollment.course_id)}
                      className="flex items-center justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-4 transition-colors hover:border-primary/25 hover:bg-primary/5"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-950">
                          {item.course?.title ?? "Course"}
                        </p>
                        <p className="mt-1 truncate text-xs text-slate-500">
                          {item.course?.category ?? "Learning course"} • {item.course?.difficulty ?? "Level not set"}
                        </p>
                        <p className="mt-2 text-xs text-slate-500">
                          Completed on{" "}
                          {item.enrollment.completed_at
                            ? new Date(item.enrollment.completed_at).toLocaleDateString()
                            : "date unavailable"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                          Completed
                        </span>
                        <ArrowRight className="h-4 w-4 text-slate-400" />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </div>
          </section>
        )}

        {!loading && !error && courseProgressItems.length === 0 && (
          <div className="rounded-[28px] border border-dashed border-slate-200 bg-white/70 px-6 py-10 text-center shadow-sm">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-3xl bg-emerald-100 text-emerald-700">
              <BookOpen className="h-6 w-6" />
            </div>
            <h2 className="mt-4 text-lg font-semibold text-slate-950">
              No learning activity yet
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Start a course from the catalog and it will appear here automatically.
            </p>
            <Link
              href={routes.courses}
              className="mt-5 inline-flex items-center justify-center rounded-2xl bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-light"
            >
              Browse courses
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
