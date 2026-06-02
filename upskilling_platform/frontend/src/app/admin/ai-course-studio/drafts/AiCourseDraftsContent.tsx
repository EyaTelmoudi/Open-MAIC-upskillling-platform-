'use client';

import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Archive, CheckCircle2, Clock3, Loader2, Trash2 } from 'lucide-react';

import { Badge } from '@/app/components/ui/Badge';
import { Button } from '@/app/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/Card';
import { useAuth } from '@/app/context/AuthContext';
import { formatDateForUser } from '@/app/lib/user-date-format';
import { routes } from '@/app/lib/routes';
import { AiCourseStudioNav } from '../ai-course-studio-nav';
import { canAccessCourseAuthoring } from '../permissions';

type DraftStatus = 'draft' | 'approved' | 'finalized';

type DraftSummary = {
  draftId: string;
  submissionId: string;
  classroomId: string;
  outputDirRelative: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: DraftStatus;
  scenesCount: number;
  approvedScenesCount: number;
};

function formatDate(value: string, timezone?: string | null) {
  return formatDateForUser(value, timezone);
}

function statusVariant(status: DraftStatus) {
  if (status === 'finalized' || status === 'approved') {
    return 'default' as const;
  }
  return 'outline' as const;
}

export function AiCourseDraftsContent({
  navigation = <AiCourseStudioNav />,
  editorHref = routes.adminAiCourseEditor,
}: {
  navigation?: ReactNode;
  editorHref?: (draftId: string) => string;
}) {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [deletingDraftId, setDeletingDraftId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !canAccessCourseAuthoring(user?.role)) {
      router.replace(routes.adminCourses);
    }
  }, [isLoading, router, user?.role]);

  const loadDrafts = async () => {
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
        throw new Error(data.error || 'Failed to load saved drafts');
      }

      setDrafts(data.drafts || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load saved drafts');
    } finally {
      setLoadingDrafts(false);
    }
  };

  useEffect(() => {
    if (!isLoading && !canAccessCourseAuthoring(user?.role)) {
      return;
    }

    void loadDrafts();
  }, [isLoading, user?.role]);

  const deleteDraft = async (draftId: string, title: string) => {
    const confirmed = window.confirm(
      `Delete the generated draft "${title}"?\n\nThis will remove the saved draft and its related generated assets.`,
    );

    if (!confirmed) {
      return;
    }

    setDeletingDraftId(draftId);
    setError(null);

    try {
      const response = await fetch(`/api/ai-course-builder/drafts/${draftId}`, {
        method: 'DELETE',
      });
      const data = (await response.json()) as {
        success?: boolean;
        deleted?: boolean;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to delete generated draft');
      }

      setDrafts((current) => current.filter((draft) => draft.draftId !== draftId));
    } catch (deleteError) {
      setError(
        deleteError instanceof Error ? deleteError.message : 'Failed to delete generated draft',
      );
    } finally {
      setDeletingDraftId(null);
    }
  };

  if (!isLoading && !canAccessCourseAuthoring(user?.role)) {
    return null;
  }

  return (
    <div className="space-y-6">
      {navigation}

      <section className="overflow-hidden rounded-3xl border border-[#2A5B4A] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.22),_transparent_32%),radial-gradient(circle_at_76%_18%,_rgba(59,130,246,0.2),_transparent_26%),linear-gradient(135deg,_#102E2D_0%,_#132A3A_48%,_#0F172A_100%)] p-6 text-white shadow-[0_26px_70px_rgba(0,0,0,0.24)]">
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100">
            <Archive className="h-4 w-4 text-emerald-200" />
            Dedicated drafts workspace
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight text-white">
            Generated Drafts
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
            Review every generated course draft in one place, then reopen any draft directly in the
            AI Course Builder for editing, approval, or finalization.
          </p>
        </div>
      </section>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      <Card className="border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(242,248,251,0.96))] shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
        <CardHeader>
          <CardTitle className="text-slate-950">Saved drafts</CardTitle>
          <CardDescription className="text-slate-600">
            These are the generated course drafts currently available in your platform workflow.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingDrafts ? (
            <div className="flex items-center gap-2 rounded-2xl border border-dashed border-border bg-slate-50 px-4 py-5 text-sm text-slate-500">
              <Clock3 className="h-4 w-4" />
              Loading drafts
            </div>
          ) : drafts.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border bg-slate-50 px-4 py-5 text-sm text-slate-500">
              No generated drafts found yet.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {drafts.map((draft) => (
                <Card
                  key={draft.draftId}
                  className="overflow-hidden border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,250,251,0.96))] shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="text-lg font-semibold text-slate-950">{draft.title}</div>
                        <div className="mt-2 text-sm text-slate-600">
                          {draft.scenesCount} scenes • {draft.approvedScenesCount} approved
                        </div>
                      </div>
                      <Badge variant={statusVariant(draft.status)}>{draft.status}</Badge>
                    </div>

                    <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-4">
                      <div className="space-y-2 text-sm text-slate-600">
                        <div>
                          <span className="font-medium text-slate-800">Updated:</span>{' '}
                          {formatDate(draft.updatedAt, user?.timezone)}
                        </div>
                        <div className="break-all text-xs leading-6 text-slate-500">
                          <span className="font-semibold uppercase tracking-[0.12em] text-slate-400">
                            Submission ID
                          </span>
                          <div className="mt-1 text-sm text-slate-600">{draft.submissionId}</div>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <Link href={editorHref(draft.draftId)}>
                        <Button className="bg-primary text-white hover:bg-primary-light">
                          Open in Editor
                        </Button>
                      </Link>
                      {draft.status === 'finalized' ? (
                        <Link href={routes.adminAiCourseReview(draft.draftId)}>
                          <Button
                            variant="outline"
                            className="border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100"
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Open Final Review
                          </Button>
                        </Link>
                      ) : null}
                      <Button
                        type="button"
                        variant="outline"
                        className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
                        disabled={deletingDraftId === draft.draftId}
                        onClick={() => void deleteDraft(draft.draftId, draft.title)}
                      >
                        {deletingDraftId === draft.draftId ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Deleting
                          </>
                        ) : (
                          <>
                            <Trash2 className="h-4 w-4" />
                            Delete Draft
                          </>
                        )}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
