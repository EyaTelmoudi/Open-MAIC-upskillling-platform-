'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Loader2 } from 'lucide-react';

import { CourseManagementNav } from '@/app/admin/courses/course-management-nav';
import { AdminShell } from '@/app/components/layout/AdminShell';
import { Button } from '@/app/components/ui/Button';
import { Card, CardContent } from '@/app/components/ui/Card';
import { useAuth } from '@/app/context/AuthContext';
import { routes } from '@/app/lib/routes';
import { canAccessCourseAuthoring } from '@/app/admin/ai-course-studio/permissions';

type DraftStatus = 'generating' | 'draft' | 'approved' | 'finalized';

type DraftSummary = {
  draftId: string;
  title: string;
  status: DraftStatus;
  scenesCount: number;
};

export default function CourseGeneratedDraftReviewPickerPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState('');
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !canAccessCourseAuthoring(user?.role)) {
      router.replace(routes.adminCourses);
    }
  }, [isLoading, router, user?.role]);

  useEffect(() => {
    if (!isLoading && !canAccessCourseAuthoring(user?.role)) {
      return;
    }

    async function loadDrafts() {
      setLoadingDrafts(true);
      setError(null);
      try {
        const response = await fetch('/api/ai-course-builder/drafts', { cache: 'no-store' });
        const data = (await response.json()) as {
          success?: boolean;
          drafts?: DraftSummary[];
          error?: string;
        };

        if (!response.ok || !data.success) {
          throw new Error(data.error || 'Failed to load finalized courses');
        }

        setDrafts((data.drafts || []).filter((draft) => draft.status === 'finalized'));
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : 'Failed to load finalized courses',
        );
      } finally {
        setLoadingDrafts(false);
      }
    }

    void loadDrafts();
  }, [isLoading, user?.role]);

  const openSelectedFinalReview = () => {
    if (!selectedDraftId) {
      return;
    }
    router.push(routes.adminCourseGeneratedDraftReview(selectedDraftId));
  };

  if (!isLoading && !canAccessCourseAuthoring(user?.role)) {
    return null;
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <CourseManagementNav />

        <section className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <div className="max-w-3xl">
            <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-700">
              Final Course Preview
            </p>
            <h1 className="mt-3 text-2xl font-semibold text-slate-950">
              Choose a finalized course here
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Select a finalized AI-generated course to open its final platform preview.
            </p>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          ) : null}

          <Card className="mt-6 rounded-2xl border border-slate-200 bg-slate-50/80 shadow-none">
            <CardContent className="p-5">
              {loadingDrafts ? (
                <div className="inline-flex items-center gap-2 text-sm text-slate-600">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading finalized courses...
                </div>
              ) : (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                  <div className="space-y-2">
                    <label className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-600">
                      Select Finalized Course
                    </label>
                    <select
                      value={selectedDraftId}
                      onChange={(event) => setSelectedDraftId(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900"
                    >
                      <option value="">Choose a finalized course</option>
                      {drafts.map((draft) => (
                        <option key={draft.draftId} value={draft.draftId}>
                          {draft.title} ({draft.scenesCount} scenes, finalized)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-end">
                    <Button onClick={openSelectedFinalReview} disabled={!selectedDraftId}>
                      <ArrowRight className="h-4 w-4" />
                      Open Final Course Preview
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {!loadingDrafts && drafts.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-5 text-sm text-slate-500">
              No finalized courses are available yet.
            </div>
          ) : null}
        </section>
      </div>
    </AdminShell>
  );
}
