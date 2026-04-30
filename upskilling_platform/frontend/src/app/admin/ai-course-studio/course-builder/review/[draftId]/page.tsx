"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Loader2, Save, ShieldCheck } from "lucide-react";

import { AdminShell } from "@/app/components/layout/AdminShell";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/app/components/ui/Card";
import { useAuth } from "@/app/context/AuthContext";
import { routes } from "@/app/lib/routes";
import { AiCourseStudioNav } from "../../../ai-course-studio-nav";
import {
  PlatformFinalCourseReviewer,
  type ReviewerFinalizedCourse,
} from "./platform-final-course-reviewer";

type LearningExpertDraft = {
  draftId: string;
  status: "draft" | "approved" | "finalized";
  createdAt: string;
  updatedAt: string;
  stage: {
    name?: string;
  };
  editableScenes: Array<{
    sceneId: string;
    status: "draft" | "approved";
  }>;
};

type ReviewRecord = {
  draftId: string;
  status: "pending_review" | "draft_saved";
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
};

function formatDate(value?: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function AiCourseReviewPage() {
  const params = useParams<{ draftId: string }>();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const draftId = params?.draftId;

  const [draft, setDraft] = useState<LearningExpertDraft | null>(null);
  const [reviewRecord, setReviewRecord] = useState<ReviewRecord | null>(null);
  const [course, setCourse] = useState<ReviewerFinalizedCourse | null>(null);
  const [pageError, setPageError] = useState<string | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [savingDraft, setSavingDraft] = useState(false);

  useEffect(() => {
    if (!isLoading && user?.role !== "LearningExpert") {
      router.replace(routes.adminCourses);
    }
  }, [isLoading, router, user?.role]);

  useEffect(() => {
    if (!draftId || !user || user.role !== "LearningExpert") {
      return;
    }

    const loadPage = async () => {
      setLoadingPage(true);
      setPageError(null);
      try {
        const [draftResponse, reviewResponse, courseResponse] = await Promise.all([
          fetch(`/api/ai-course-builder/drafts/${draftId}`, { cache: "no-store" }),
          fetch(`/api/ai-course-builder/review-status/${draftId}`, { cache: "no-store" }),
          fetch(`/api/ai-course-builder/drafts/${draftId}/final-course`, {
            cache: "no-store",
          }),
        ]);

        const draftData = (await draftResponse.json()) as {
          success?: boolean;
          draft?: LearningExpertDraft;
          error?: string;
        };
        const reviewData = (await reviewResponse.json()) as {
          success?: boolean;
          record?: ReviewRecord;
          error?: string;
        };
        const courseData = (await courseResponse.json()) as {
          success?: boolean;
          course?: ReviewerFinalizedCourse;
          error?: string;
        };

        if (!draftResponse.ok || !draftData.success || !draftData.draft) {
          throw new Error(draftData.error || "Failed to load finalized draft");
        }
        if (!reviewResponse.ok || !reviewData.success || !reviewData.record) {
          throw new Error(reviewData.error || "Failed to load review status");
        }
        if (!courseResponse.ok || !courseData.success || !courseData.course) {
          throw new Error(courseData.error || "Failed to load finalized course preview");
        }

        setDraft(draftData.draft);
        setReviewRecord(reviewData.record);
        setCourse(courseData.course);
      } catch (error) {
        setPageError(
          error instanceof Error ? error.message : "Failed to load the review workspace",
        );
      } finally {
        setLoadingPage(false);
      }
    };

    void loadPage();
  }, [draftId, router, user]);

  const approvedScenesCount = useMemo(
    () => draft?.editableScenes.filter((scene) => scene.status === "approved").length ?? 0,
    [draft],
  );

  const saveAsPlatformDraft = async () => {
    if (!draftId || !user) return;
    setSavingDraft(true);
    setPageError(null);
    try {
      const response = await fetch(`/api/ai-course-builder/review-status/${draftId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          approvedBy:
            [user.first_name, user.last_name].filter(Boolean).join(" ") || user.email,
        }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        record?: ReviewRecord;
        error?: string;
      };
      if (!response.ok || !data.success || !data.record) {
        throw new Error(data.error || "Failed to save the course as a platform draft");
      }
      setReviewRecord(data.record);
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to save the course as a platform draft",
      );
    } finally {
      setSavingDraft(false);
    }
  };

  if (!isLoading && user?.role !== "LearningExpert") {
    return null;
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <AiCourseStudioNav />

        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <ShieldCheck className="h-4 w-4 text-primary" />
              LearningExpert-only animated revision step
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">Final Course Review</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Review the fully animated OpenMAIC course in your platform workspace, then save it as
              a draft that can be published later for learners.
            </p>
          </div>
        </div>

        {pageError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        ) : null}

        <div className="grid gap-6 xl:grid-cols-[0.36fr_0.64fr]">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Revision status</CardTitle>
                <CardDescription>
                  The finalized course stays in a protected review state until you save it as a
                  platform draft.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingPage ? (
                  <div className="flex items-center gap-2 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading final review workspace
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="rounded-2xl border border-border bg-slate-50 p-4">
                      <div className="text-sm font-medium text-slate-950">
                        {course?.stage.name || draft?.stage.name || "Finalized course"}
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        Approved scenes: {approvedScenesCount}/{draft?.editableScenes.length ?? 0}
                      </div>
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-border bg-white p-4">
                      <div>
                        <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                          Platform review state
                        </div>
                        <div className="mt-2">
                          <Badge
                            variant={
                              reviewRecord?.status === "draft_saved" ? "default" : "outline"
                            }
                          >
                            {reviewRecord?.status === "draft_saved"
                              ? "draft saved"
                              : "pending review"}
                          </Badge>
                        </div>
                      </div>
                      {reviewRecord?.status === "draft_saved" ? (
                        <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                      ) : null}
                    </div>
                    <div className="rounded-2xl border border-border bg-white p-4 text-sm text-slate-600">
                      <div>Finalized by OpenMAIC: {formatDate(draft?.updatedAt)}</div>
                      <div className="mt-2">
                        Draft saved for future publishing: {formatDate(reviewRecord?.approvedAt)}
                      </div>
                      <div className="mt-2">
                        Approved by: {reviewRecord?.approvedBy || "-"}
                      </div>
                    </div>
                    <Button onClick={() => void saveAsPlatformDraft()} disabled={savingDraft}>
                      {savingDraft ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving Draft
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          Final Approval: Save As Platform Draft
                        </>
                      )}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden">
            <CardHeader>
              <CardTitle>Animated course preview</CardTitle>
              <CardDescription>
                Native platform review of the finalized OpenMAIC course, without iframe or CSP
                dependency.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loadingPage ? (
                <div className="flex min-h-[720px] items-center justify-center rounded-3xl border border-dashed border-border bg-slate-50 text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparing animated review preview
                </div>
              ) : course ? (
                <PlatformFinalCourseReviewer course={course} />
              ) : (
                <div className="rounded-3xl border border-dashed border-border bg-slate-50 px-5 py-10 text-sm text-slate-500">
                  No finalized course preview is available yet.
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
