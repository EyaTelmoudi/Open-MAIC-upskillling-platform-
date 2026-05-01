"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Archive, CheckCircle2, Clock3, DownloadCloud, Loader2 } from "lucide-react";

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
import { formatDateForUser } from "@/app/lib/user-date-format";
import { routes } from "@/app/lib/routes";
import { AiCourseStudioNav } from "../ai-course-studio-nav";

type DraftStatus = "draft" | "approved" | "finalized";

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
  if (status === "finalized" || status === "approved") {
    return "default" as const;
  }
  return "outline" as const;
}

export default function AiCourseDraftsPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user?.role !== "LearningExpert") {
      router.replace(routes.adminCourses);
    }
  }, [isLoading, router, user?.role]);

  const loadDrafts = async () => {
    setLoadingDrafts(true);
    setError(null);
    try {
      const response = await fetch("/api/ai-course-builder/drafts", { cache: "no-store" });
      const data = (await response.json()) as {
        success?: boolean;
        drafts?: DraftSummary[];
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to load saved drafts");
      }

      setDrafts(data.drafts || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load saved drafts");
    } finally {
      setLoadingDrafts(false);
    }
  };

  useEffect(() => {
    if (!isLoading && user?.role !== "LearningExpert") {
      return;
    }

    void loadDrafts();
  }, [isLoading, user?.role]);

  const importExistingDrafts = async () => {
    setImporting(true);
    setImportMessage(null);
    setError(null);

    try {
      const response = await fetch("/api/ai-course-builder/drafts", {
        method: "POST",
      });
      const data = (await response.json()) as {
        success?: boolean;
        importedCount?: number;
        totalCount?: number;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to import existing drafts");
      }

      setImportMessage(
        `Imported ${data.importedCount ?? 0} of ${data.totalCount ?? 0} existing OpenMAIC drafts into PostgreSQL.`,
      );
      await loadDrafts();
    } catch (importError) {
      setError(
        importError instanceof Error ? importError.message : "Failed to import existing drafts",
      );
    } finally {
      setImporting(false);
    }
  };

  if (!isLoading && user?.role !== "LearningExpert") {
    return null;
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <AiCourseStudioNav />

        <div>
          <div className="flex items-center gap-2 text-sm text-slate-600">
            <Archive className="h-4 w-4 text-primary" />
            Dedicated drafts workspace
          </div>
          <h2 className="mt-2 text-2xl font-semibold text-slate-950">Generated Drafts</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
            Review every generated course draft in one place, then reopen any draft directly in the
            AI Course Builder for editing, approval, or finalization.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-100"
            onClick={() => void importExistingDrafts()}
            disabled={importing}
          >
            {importing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Importing drafts
              </>
            ) : (
              <>
                <DownloadCloud className="h-4 w-4" />
                Import existing OpenMAIC drafts
              </>
            )}
          </Button>
          {importMessage ? <div className="text-sm text-emerald-700">{importMessage}</div> : null}
        </div>

        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : null}

        <Card className="border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(242,248,251,0.96))] shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <CardTitle className="text-slate-950">Saved drafts</CardTitle>
            <CardDescription className="text-slate-600">
              These are the OpenMAIC-generated course drafts currently available in your platform
              workflow.
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
                            <span className="font-medium text-slate-800">Updated:</span>{" "}
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
                        <Link
                          href={routes.adminAiCourseEditor(draft.draftId)}
                        >
                          <Button className="bg-primary text-white hover:bg-primary-light">
                            Open in Editor
                          </Button>
                        </Link>
                        {draft.status === "finalized" ? (
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
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
