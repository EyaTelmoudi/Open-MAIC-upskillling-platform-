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
import { formatDateForUser } from "@/app/lib/user-date-format";
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
  platformCourseId?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
};

function formatDate(value?: string, timezone?: string | null) {
  return formatDateForUser(value, timezone);
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
        <AiCourseStudioNav currentDraftId={draftId} />

        <section className="overflow-hidden rounded-3xl border border-[#2A5B4A] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.22),_transparent_32%),radial-gradient(circle_at_76%_18%,_rgba(59,130,246,0.18),_transparent_26%),linear-gradient(135deg,_#102E2D_0%,_#132A3A_48%,_#0F172A_100%)] p-6 text-white shadow-[0_26px_70px_rgba(0,0,0,0.22)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-sm text-emerald-100">
              <ShieldCheck className="h-4 w-4 text-emerald-300" />
              LearningExpert-only animated revision step
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-white">Final Course Review</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-200">
              Review the fully animated OpenMAIC course in your platform workspace, then approve it
              into the platform catalog so authorized teams can see it and enroll learners.
            </p>
          </div>
        </div>
        </section>

        {pageError ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {pageError}
          </div>
        ) : null}

        <div className="space-y-6">
          <Card className="border border-emerald-200 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_30%),linear-gradient(180deg,rgba(255,255,255,0.99),rgba(236,253,245,0.96))] text-slate-900 shadow-[0_18px_40px_rgba(15,23,42,0.10)]">
            <CardContent className="pt-6">
              {loadingPage ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading final review workspace
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div className="space-y-2">
                    <div className="text-sm font-medium text-slate-950">
                      {course?.stage.name || draft?.stage.name || "Finalized course"}
                    </div>
                    <div className="text-sm text-slate-600">
                      Approved scenes: {approvedScenesCount}/{draft?.editableScenes.length ?? 0}
                    </div>
                    <div className="text-xs text-slate-500">
                      Finalized by OpenMAIC: {formatDate(draft?.updatedAt, user?.timezone)}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge
                      variant={reviewRecord?.status === "draft_saved" ? "default" : "outline"}
                    >
                      {reviewRecord?.status === "draft_saved" ? "saved to platform" : "pending review"}
                    </Badge>
                    {reviewRecord?.platformCourseId ? (
                      <Button
                        variant="outline"
                        className="border-emerald-300 bg-white text-emerald-800 hover:bg-emerald-50 hover:text-emerald-900"
                        onClick={() => router.push(routes.courses)}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                        Open Platform Course
                      </Button>
                    ) : null}
                    <Button
                      onClick={() => void saveAsPlatformDraft()}
                      disabled={savingDraft || reviewRecord?.status === "draft_saved"}
                      className="text-white"
                    >
                      {savingDraft ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Saving Draft
                        </>
                      ) : (
                        <>
                          <Save className="h-4 w-4" />
                          Final Approval: Save Course to Platform
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="overflow-hidden border border-sky-200 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.14),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.99),rgba(239,246,255,0.97))] text-slate-900 shadow-[0_18px_40px_rgba(15,23,42,0.10)]">
            <CardHeader className="border-b border-sky-200 bg-[linear-gradient(135deg,rgba(14,165,233,0.16),rgba(16,185,129,0.12))]">
              <CardTitle className="text-slate-950">Animated course preview</CardTitle>
              <CardDescription className="text-slate-600">
                Native platform review of the finalized OpenMAIC course, without iframe or CSP
                dependency.
              </CardDescription>
            </CardHeader>
            <CardContent className="pt-8">
              {loadingPage ? (
                <div className="flex min-h-[720px] items-center justify-center rounded-3xl border border-dashed border-border bg-slate-50 text-sm text-slate-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparing animated review preview
                </div>
              ) : course ? (
                <PlatformFinalCourseReviewer course={course} timezone={user?.timezone} />
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
