"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Loader2 } from "lucide-react";

import { AdminShell } from "@/app/components/layout/AdminShell";
import { Button } from "@/app/components/ui/Button";
import { useAuth } from "@/app/context/AuthContext";
import { routes } from "@/app/lib/routes";
import { AiCourseStudioNav } from "../../ai-course-studio-nav";
import { canAccessCourseAuthoring } from "../../permissions";

type DraftStatus = "generating" | "draft" | "approved" | "finalized";

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

export default function AiCourseEditorPickerPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [selectedDraftId, setSelectedDraftId] = useState("");
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
          throw new Error(data.error || "Failed to load generated drafts");
        }

        setDrafts(data.drafts || []);
      } catch (loadError) {
        setError(
          loadError instanceof Error ? loadError.message : "Failed to load generated drafts",
        );
      } finally {
        setLoadingDrafts(false);
      }
    };

    void loadDrafts();
  }, [isLoading, user?.role]);

  const openSelectedDraftEditor = () => {
    if (!selectedDraftId) {
      return;
    }
    router.push(routes.adminAiCourseEditor(selectedDraftId));
  };

  if (!isLoading && !canAccessCourseAuthoring(user?.role)) {
    return null;
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <AiCourseStudioNav />

        <section className="overflow-hidden rounded-3xl border border-[#2A5B4A] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.22),_transparent_32%),radial-gradient(circle_at_76%_18%,_rgba(59,130,246,0.2),_transparent_26%),linear-gradient(135deg,_#102E2D_0%,_#132A3A_48%,_#0F172A_100%)] p-6 text-white shadow-[0_26px_70px_rgba(0,0,0,0.24)]">
          <div className="max-w-3xl">
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-100">
              Course Editor Workspace
            </p>
            <h1 className="mt-2 text-xl font-semibold tracking-tight text-white">
              Choose a generated draft to edit
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-200">
              Select a generated draft here to open its editor view. This keeps selection inside the page content instead of the workspace navigation.
            </p>
          </div>

          {error ? (
            <div className="mt-6 rounded-xl border border-red-300/30 bg-red-500/15 px-4 py-3 text-sm text-red-100">
              {error}
            </div>
          ) : null}

          <div className="mt-6 rounded-2xl border border-white/12 bg-white/10 p-5 backdrop-blur-sm">
            {loadingDrafts ? (
              <div className="inline-flex items-center gap-2 text-sm text-slate-200">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading generated drafts...
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-100">
                    Select Generated Draft
                  </label>
                  <select
                    value={selectedDraftId}
                    onChange={(event) => setSelectedDraftId(event.target.value)}
                    className="w-full rounded-xl border border-white/20 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm"
                  >
                    <option value="">Choose a generated draft</option>
                    {drafts.map((draft) => (
                      <option key={draft.draftId} value={draft.draftId}>
                        {draft.title} ({draft.status}, {draft.scenesCount} scenes)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-end">
                  <Button
                    onClick={openSelectedDraftEditor}
                    disabled={!selectedDraftId}
                    className="bg-white text-slate-950 hover:bg-emerald-50 disabled:bg-white/50 disabled:text-slate-500"
                  >
                    <ArrowRight className="h-4 w-4" />
                    Open Course Editor
                  </Button>
                </div>
              </div>
            )}
          </div>

          {!loadingDrafts && drafts.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-white/20 bg-white/10 px-4 py-5 text-sm text-slate-200">
              No generated drafts are available yet.
            </div>
          ) : null}
        </section>
      </div>
    </AdminShell>
  );
}
