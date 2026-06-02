'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Bot, BookOpen, Loader2 } from 'lucide-react';

import { canAccessCourseAuthoring } from '@/app/admin/ai-course-studio/permissions';
import { CourseManagementNav } from '@/app/admin/courses/course-management-nav';
import { AdminShell } from '@/app/components/layout/AdminShell';
import { Button } from '@/app/components/ui/Button';
import { useAuth } from '@/app/context/AuthContext';
import { getCourses, type Course } from '@/app/lib/api';
import { routes } from '@/app/lib/routes';

type CourseSource = 'traditional' | 'ai';

type AdminCourse = Course & {
  thumbnail?: string | null;
  rating?: number | null;
  created_at?: string;
};

function getCourseOrigin(course: Pick<Course, 'category' | 'description'>): CourseSource {
  const category = (course.category || '').trim().toLowerCase();
  const description = (course.description || '').trim().toLowerCase();

  if (
    category === 'ai generated' ||
    description.includes('ai-generated course draft') ||
    description.includes('openmaic')
  ) {
    return 'ai';
  }

  return 'traditional';
}

export default function AdminCourseEditorWorkspacePage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [courseSource, setCourseSource] = useState<CourseSource>('traditional');
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState('');
  const [selectedAiCourseId, setSelectedAiCourseId] = useState('');
  const [loadingCourses, setLoadingCourses] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const canUseAiWorkflow = canAccessCourseAuthoring(user?.role);
  const traditionalCourses = courses.filter((course) => getCourseOrigin(course) === 'traditional');
  const aiGeneratedCourses = courses.filter((course) => getCourseOrigin(course) === 'ai');

  useEffect(() => {
    async function loadCourses() {
      setLoadingCourses(true);
      try {
        setError(null);
        const response = await getCourses({ page: 1, page_size: 100 });
        setCourses(response.items);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load courses.');
      } finally {
        setLoadingCourses(false);
      }
    }

    void loadCourses();
  }, []);

  useEffect(() => {
    if (authLoading) {
      return;
    }

    if (!canUseAiWorkflow && courseSource === 'ai') {
      setCourseSource('traditional');
    }
  }, [authLoading, canUseAiWorkflow, courseSource]);

  const openSelectedCourseEditor = () => {
    if (courseSource === 'traditional') {
      if (!selectedCourseId) {
        return;
      }
      router.push(`${routes.adminCourseDetail(selectedCourseId)}?edit=1`);
      return;
    }

    if (!selectedAiCourseId) {
      return;
    }
    router.push(`${routes.adminCourseDetail(selectedAiCourseId)}?edit=1`);
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <CourseManagementNav />

        <section className="overflow-hidden rounded-3xl border border-[#2A5B4A] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.22),_transparent_32%),radial-gradient(circle_at_76%_18%,_rgba(59,130,246,0.2),_transparent_26%),linear-gradient(135deg,_#102E2D_0%,_#132A3A_48%,_#0F172A_100%)] p-6 text-white shadow-[0_26px_70px_rgba(0,0,0,0.24)]">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100">
              Admin and Learning Expert
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-white">
              Course Editor Workspace
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
              Select a traditional course or an AI-generated course from the platform catalog to
              open the appropriate editor.
            </p>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-300/30 bg-red-500/15 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <button
              type="button"
              onClick={() => setCourseSource('traditional')}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                courseSource === 'traditional'
                  ? 'border-white/20 bg-white/16 text-white shadow-[0_12px_28px_rgba(0,0,0,0.16)]'
                  : 'border-white/10 bg-white/8 text-slate-200 hover:bg-white/12'
              }`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    courseSource === 'traditional'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-white/10 text-slate-200'
                  }`}
                >
                  <BookOpen className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">Traditional Courses</div>
                  <div className="text-xs text-slate-300">Open the traditional editor</div>
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                if (canUseAiWorkflow) {
                  setCourseSource('ai');
                }
              }}
              disabled={!canUseAiWorkflow}
              className={`rounded-2xl border px-4 py-4 text-left transition ${
                courseSource === 'ai'
                  ? 'border-white/20 bg-white/16 text-white shadow-[0_12px_28px_rgba(0,0,0,0.16)]'
                  : 'border-white/10 bg-white/8 text-slate-200 hover:bg-white/12'
              } disabled:cursor-not-allowed disabled:opacity-60`}
            >
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-10 w-10 items-center justify-center rounded-xl ${
                    courseSource === 'ai' ? 'bg-sky-100 text-sky-700' : 'bg-white/10 text-slate-200'
                  }`}
                >
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">AI-Generated Courses</div>
                  <div className="text-xs text-slate-300">Choose an AI-generated course to edit</div>
                </div>
              </div>
            </button>
          </div>

          <div className="mt-6 rounded-2xl border border-white/12 bg-white/10 p-5 backdrop-blur-sm">
            {courseSource === 'traditional' && loadingCourses ? (
              <div className="inline-flex items-center gap-2 text-sm text-slate-200">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading courses...
              </div>
            ) : courseSource === 'traditional' ? (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                    Select Traditional Course
                  </label>
                  <select
                    value={selectedCourseId}
                    onChange={(event) => setSelectedCourseId(event.target.value)}
                    className="w-full rounded-xl border border-white/20 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm"
                  >
                    <option value="">Choose a course from the catalog</option>
                    {traditionalCourses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <Button onClick={openSelectedCourseEditor} disabled={!selectedCourseId}>
                    <ArrowRight className="h-4 w-4" />
                    Open Traditional Editor
                  </Button>
                </div>
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                    Select AI-Generated Course
                  </label>
                  <select
                    value={selectedAiCourseId}
                    onChange={(event) => setSelectedAiCourseId(event.target.value)}
                    className="w-full rounded-xl border border-white/20 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm"
                  >
                    <option value="">Choose an AI-generated course from the catalog</option>
                    {aiGeneratedCourses.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <Button onClick={openSelectedCourseEditor} disabled={!selectedAiCourseId}>
                    <ArrowRight className="h-4 w-4" />
                    Open AI-Generated Course Editor
                  </Button>
                </div>
              </div>
            )}
          </div>

          {courseSource === 'traditional' && !loadingCourses && traditionalCourses.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-white/20 bg-white/10 px-4 py-5 text-sm text-slate-200">
              No traditional courses are available yet.
            </div>
          ) : null}

          {courseSource === 'ai' && !loadingCourses && aiGeneratedCourses.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-white/20 bg-white/10 px-4 py-5 text-sm text-slate-200">
              No AI-generated courses are available yet.
            </div>
          ) : null}
        </section>
      </div>
    </AdminShell>
  );
}
