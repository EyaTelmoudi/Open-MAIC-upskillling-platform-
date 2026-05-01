"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, FilePenLine, Loader2, Save } from "lucide-react";

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
import { Input } from "@/app/components/ui/Input";
import { Textarea } from "@/app/components/ui/Textarea";
import { useAuth } from "@/app/context/AuthContext";
import { routes } from "@/app/lib/routes";
import { AiCourseStudioNav } from "../../../ai-course-studio-nav";

type DraftStatus = "draft" | "approved" | "finalized";
type SceneDraftStatus = "draft" | "approved";
type SceneType = "slide" | "quiz" | "interactive" | string;

type EditableSlideTextBlock = {
  id: string;
  type: "slide_text";
  elementId: string;
  label: string;
  html: string;
  plainText: string;
};

type EditableScriptBlock = {
  id: string;
  type: "script";
  actionId: string;
  text: string;
};

type EditableQuizQuestionBlock = {
  id: string;
  type: "quiz_question";
  questionId: string;
  question: string;
  explanation: string;
  correctAnswer: string[];
  options: Array<{
    value: string;
    label: string;
  }>;
};

type EditableInteractiveInstructionBlock = {
  id: string;
  type: "interactive_instruction";
  text: string;
};

type EditableBlock =
  | EditableSlideTextBlock
  | EditableScriptBlock
  | EditableQuizQuestionBlock
  | EditableInteractiveInstructionBlock;

type EditableSceneDraft = {
  sceneId: string;
  sourceSceneId: string;
  order: number;
  type: SceneType;
  title: string;
  status: SceneDraftStatus;
  blocks: EditableBlock[];
  previewHtml?: string;
  readonlyHtml?: string;
};

type LearningExpertDraft = {
  draftId: string;
  submissionId: string;
  classroomId: string;
  outputDir: string;
  outputDirRelative: string;
  createdAt: string;
  updatedAt: string;
  status: DraftStatus;
  stage: {
    id?: string;
    name?: string;
    languageDirective?: string;
  };
  editableScenes: EditableSceneDraft[];
};

type FinalizeResponse = {
  success?: boolean;
  error?: string;
  draft: LearningExpertDraft;
  finalCoursePathRelative: string;
};

function statusVariant(status: DraftStatus | SceneDraftStatus) {
  if (status === "approved" || status === "finalized") return "default" as const;
  return "outline" as const;
}

const editorFieldClassName =
  "bg-white text-slate-900 placeholder:text-slate-400 border-slate-300";

export default function AiCourseDraftEditorPage() {
  const params = useParams<{ draftId: string }>();
  const router = useRouter();
  const { user, isLoading } = useAuth();
  const draftId = params?.draftId;

  const [draft, setDraft] = useState<LearningExpertDraft | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finalPath, setFinalPath] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user?.role !== "LearningExpert") {
      router.replace(routes.adminCourses);
    }
  }, [isLoading, router, user?.role]);

  const loadDraft = async (targetDraftId: string) => {
    const response = await fetch(`/api/ai-course-builder/drafts/${targetDraftId}`, {
      cache: "no-store",
    });
    const data = (await response.json()) as {
      success?: boolean;
      draft?: LearningExpertDraft;
      error?: string;
    };
    if (!response.ok || !data.success || !data.draft) {
      throw new Error(data.error || "Failed to load draft");
    }
    setDraft(data.draft);
    setSelectedSceneId(data.draft.editableScenes[0]?.sceneId ?? null);
  };

  useEffect(() => {
    if (!draftId || !user || user.role !== "LearningExpert") return;
    void loadDraft(draftId).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Failed to load draft");
    });
  }, [draftId, user]);

  const selectedScene = useMemo(
    () => draft?.editableScenes.find((scene) => scene.sceneId === selectedSceneId) ?? null,
    [draft, selectedSceneId],
  );

  const approvedScenesCount =
    draft?.editableScenes.filter((scene) => scene.status === "approved").length ?? 0;

  const updateScene = (updater: (scene: EditableSceneDraft) => EditableSceneDraft) => {
    setDraft((current) => {
      if (!current || !selectedSceneId) return current;
      return {
        ...current,
        editableScenes: current.editableScenes.map((scene) =>
          scene.sceneId === selectedSceneId ? updater(scene) : scene,
        ),
      };
    });
  };

  const persistCurrentDraft = async (): Promise<LearningExpertDraft> => {
    if (!draft) throw new Error("No draft loaded");

    const response = await fetch(`/api/ai-course-builder/drafts/${draft.draftId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ draft }),
    });
    const data = (await response.json()) as {
      success?: boolean;
      draft?: LearningExpertDraft;
      error?: string;
    };
    if (!response.ok || !data.success || !data.draft) {
      throw new Error(data.error || "Failed to save draft");
    }
    setDraft(data.draft);
    return data.draft;
  };

  const saveDraftChanges = async () => {
    setSaving(true);
    setError(null);
    try {
      await persistCurrentDraft();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  const approveScene = async (approved: boolean) => {
    if (!draft || !selectedScene) return;
    try {
      const persistedDraft = await persistCurrentDraft();
      const response = await fetch(
        `/api/ai-course-builder/drafts/${persistedDraft.draftId}/approve-scene`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sceneId: selectedScene.sceneId, approved }),
        },
      );
      const data = (await response.json()) as {
        success?: boolean;
        draft?: LearningExpertDraft;
        error?: string;
      };
      if (!response.ok || !data.success || !data.draft) {
        throw new Error(data.error || "Failed to update scene approval");
      }
      setDraft(data.draft);
    } catch (approveError) {
      setError(
        approveError instanceof Error
          ? approveError.message
          : "Failed to update scene approval",
      );
    }
  };

  const approveLesson = async (approved: boolean) => {
    if (!draft) return;
    try {
      const persistedDraft = await persistCurrentDraft();
      const response = await fetch(
        `/api/ai-course-builder/drafts/${persistedDraft.draftId}/approve-lesson`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ approved }),
        },
      );
      const data = (await response.json()) as {
        success?: boolean;
        draft?: LearningExpertDraft;
        error?: string;
      };
      if (!response.ok || !data.success || !data.draft) {
        throw new Error(data.error || "Failed to update lesson approval");
      }
      setDraft(data.draft);
    } catch (approveError) {
      setError(
        approveError instanceof Error
          ? approveError.message
          : "Failed to update lesson approval",
      );
    }
  };

  const finalizeCourse = async () => {
    if (!draft) return;
    setFinalizing(true);
    setError(null);
    try {
      const persistedDraft = await persistCurrentDraft();
      const response = await fetch(
        `/api/ai-course-builder/drafts/${persistedDraft.draftId}/finalize`,
        { method: "POST" },
      );
      const data = (await response.json()) as FinalizeResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.error || "Failed to finalize course");
      }
      setDraft(data.draft);
      setFinalPath(data.finalCoursePathRelative);
      router.push(routes.adminAiCourseReview(data.draft.draftId));
    } catch (finalizeError) {
      setError(
        finalizeError instanceof Error ? finalizeError.message : "Failed to finalize course",
      );
    } finally {
      setFinalizing(false);
    }
  };

  if (!isLoading && user?.role !== "LearningExpert") return null;

  return (
    <AdminShell>
      <div className="space-y-6 text-slate-900">
        <AiCourseStudioNav currentDraftId={draftId} />

        <div className="space-y-6">
          <Card className="border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,250,251,0.96))] text-slate-900 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
              <CardHeader>
                <div className="flex items-center gap-2 text-sm text-slate-600">
                  <FilePenLine className="h-4 w-4 text-primary" />
                  Dedicated editing workspace
                </div>
                <CardTitle className="text-slate-950">Course Editor</CardTitle>
                <CardDescription className="text-slate-600">
                  Edit the generated course scene by scene in a cleaner workspace built for learning
                  expert review.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                  </div>
                ) : null}

                {draft ? (
                  <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="text-lg font-semibold text-slate-950">
                        {draft.stage.name || "Generated draft"}
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        {draft.editableScenes.length} scenes • {approvedScenesCount} approved
                      </div>
                      {finalPath ? (
                        <div className="mt-2 text-xs text-slate-500">
                          Final package: {finalPath}
                        </div>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap gap-3 lg:justify-end">
                      <Button onClick={() => void saveDraftChanges()} disabled={saving}>
                        {saving ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Saving
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4" />
                            Save draft
                          </>
                        )}
                      </Button>
                      <Button onClick={() => void finalizeCourse()} disabled={finalizing}>
                        {finalizing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Finalizing
                          </>
                        ) : (
                          <>
                            <CheckCircle2 className="h-4 w-4" />
                            Generate final course
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-border bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    Loading selected draft.
                  </div>
                )}
              </CardContent>
            </Card>

          <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)]">
            <aside className="xl:sticky xl:top-[108px] xl:h-[calc(100vh-140px)] xl:self-start">
              <Card className="border border-slate-200 bg-white text-slate-900 shadow-sm">
                <CardHeader>
                  <CardTitle className="text-slate-950">Course scenes</CardTitle>
                  <CardDescription className="text-slate-600">
                    Select the part of the generated course you want to revise now.
                  </CardDescription>
                </CardHeader>
                <CardContent className="h-full">
                  <div className="max-h-[calc(100vh-260px)] space-y-3 overflow-y-auto pr-1 xl:max-h-[calc(100vh-250px)]">
                    {draft?.editableScenes.map((scene) => (
                      <button
                        key={scene.sceneId}
                        type="button"
                        onClick={() => setSelectedSceneId(scene.sceneId)}
                        className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                          selectedSceneId === scene.sceneId
                            ? "border-emerald-300 bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(59,130,246,0.08))] shadow-[0_12px_28px_rgba(15,23,42,0.08)]"
                            : "border-border bg-white hover:border-slate-300 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div
                            className={`mt-1 h-12 w-1.5 rounded-full transition ${
                              selectedSceneId === scene.sceneId ? "bg-emerald-500" : "bg-transparent"
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                                  {scene.type}
                                </div>
                                {selectedSceneId === scene.sceneId ? (
                                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                                    Selected
                                  </span>
                                ) : null}
                              </div>
                              <Badge variant={statusVariant(scene.status)}>{scene.status}</Badge>
                            </div>
                            <div className="mt-2 font-medium text-slate-950">
                              {scene.order}. {scene.title}
                            </div>
                          </div>
                        </div>
                      </button>
                    )) || (
                      <div className="rounded-2xl border border-dashed border-border bg-slate-50 px-4 py-5 text-sm text-slate-500">
                        No scenes available.
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </aside>

            <div className="min-w-0 space-y-6">
              {selectedScene ? (
                <>
                  <Card className="border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,252,0.96))] text-slate-900 shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-primary">
                            {selectedScene.type}
                          </div>
                          <Input
                            value={selectedScene.title}
                            onChange={(event) =>
                              updateScene((scene) => ({
                                ...scene,
                                title: event.target.value,
                              }))
                            }
                            className={`mt-3 h-12 text-lg font-semibold ${editorFieldClassName}`}
                          />
                        </div>
                        <Button
                          variant="outline"
                          className="border-slate-300 bg-white text-slate-900 hover:bg-slate-50"
                          onClick={() => void approveScene(selectedScene.status !== "approved")}
                        >
                          {selectedScene.status === "approved" ? "Unapprove scene" : "Approve scene"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-4">
                    {selectedScene.blocks.map((block, blockIndex) => (
                      <Card key={block.id} className="border border-slate-200 bg-white text-slate-900 shadow-sm">
                        <CardContent className="p-5">
                          {block.type === "slide_text" ? (
                            <div className="space-y-3">
                              <div className="text-sm font-semibold text-slate-900">
                                {block.label}
                              </div>
                              <Textarea
                                value={block.plainText}
                                className={`min-h-[160px] ${editorFieldClassName}`}
                                onChange={(event) =>
                                  updateScene((scene) => ({
                                    ...scene,
                                    blocks: scene.blocks.map((candidate) =>
                                      candidate.id === block.id
                                        ? { ...candidate, plainText: event.target.value }
                                        : candidate,
                                    ),
                                  }))
                                }
                              />
                            </div>
                          ) : null}

                          {block.type === "script" ? (
                            <div className="space-y-3">
                              <div className="text-sm font-semibold text-slate-900">
                                Teacher script {blockIndex + 1}
                              </div>
                              <Textarea
                                value={block.text}
                                className={`min-h-[130px] ${editorFieldClassName}`}
                                onChange={(event) =>
                                  updateScene((scene) => ({
                                    ...scene,
                                    blocks: scene.blocks.map((candidate) =>
                                      candidate.id === block.id
                                        ? { ...candidate, text: event.target.value }
                                        : candidate,
                                    ),
                                  }))
                                }
                              />
                            </div>
                          ) : null}

                          {block.type === "quiz_question" ? (
                            <div className="space-y-4">
                              <div className="text-sm font-semibold text-slate-900">
                                Quiz question {blockIndex + 1}
                              </div>
                              <Textarea
                                value={block.question}
                                className={`min-h-[110px] ${editorFieldClassName}`}
                                onChange={(event) =>
                                  updateScene((scene) => ({
                                    ...scene,
                                    blocks: scene.blocks.map((candidate) =>
                                      candidate.id === block.id
                                        ? { ...candidate, question: event.target.value }
                                        : candidate,
                                    ),
                                  }))
                                }
                              />
                              <div className="grid gap-3">
                                {block.options.map((option, optionIndex) => (
                                  <div
                                    key={`${block.id}_${option.value}`}
                                    className="rounded-2xl border border-border bg-slate-50 p-3"
                                  >
                                    <div className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                                      Option {option.value}
                                    </div>
                                    <Input
                                      value={option.label}
                                      className={editorFieldClassName}
                                      onChange={(event) =>
                                        updateScene((scene) => ({
                                          ...scene,
                                          blocks: scene.blocks.map((candidate) =>
                                            candidate.id === block.id &&
                                            candidate.type === "quiz_question"
                                              ? {
                                                  ...candidate,
                                                  options: candidate.options.map((item, idx) =>
                                                    idx === optionIndex
                                                      ? { ...item, label: event.target.value }
                                                      : item,
                                                  ),
                                                }
                                              : candidate,
                                          ),
                                        }))
                                      }
                                    />
                                  </div>
                                ))}
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs uppercase tracking-[0.14em] text-slate-500">
                                  Correct answer values
                                </label>
                                <Input
                                  value={block.correctAnswer.join(",")}
                                  className={editorFieldClassName}
                                  onChange={(event) =>
                                    updateScene((scene) => ({
                                      ...scene,
                                      blocks: scene.blocks.map((candidate) =>
                                        candidate.id === block.id
                                          ? {
                                              ...candidate,
                                              correctAnswer: event.target.value
                                                .split(",")
                                                .map((value) => value.trim())
                                                .filter(Boolean),
                                            }
                                          : candidate,
                                      ),
                                    }))
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs uppercase tracking-[0.14em] text-slate-500">
                                  Explanation
                                </label>
                                <Textarea
                                  value={block.explanation}
                                  className={`min-h-[110px] ${editorFieldClassName}`}
                                  onChange={(event) =>
                                    updateScene((scene) => ({
                                      ...scene,
                                      blocks: scene.blocks.map((candidate) =>
                                        candidate.id === block.id
                                          ? { ...candidate, explanation: event.target.value }
                                          : candidate,
                                      ),
                                    }))
                                  }
                                />
                              </div>
                            </div>
                          ) : null}

                          {block.type === "interactive_instruction" ? (
                            <div className="space-y-3">
                              <div className="text-sm font-semibold text-slate-900">
                                Interactive instructions
                              </div>
                              <Textarea
                                value={block.text}
                                className={`min-h-[160px] ${editorFieldClassName}`}
                                onChange={(event) =>
                                  updateScene((scene) => ({
                                    ...scene,
                                    blocks: scene.blocks.map((candidate) =>
                                      candidate.id === block.id
                                        ? { ...candidate, text: event.target.value }
                                        : candidate,
                                    ),
                                  }))
                                }
                              />
                            </div>
                          ) : null}
                        </CardContent>
                      </Card>
                    ))}
                  {selectedScene.type === "interactive" && selectedScene.readonlyHtml ? (
                    <Card className="border border-slate-200 bg-white text-slate-900 shadow-sm">
                      <CardHeader>
                        <CardTitle className="text-slate-950">Generated interactive HTML</CardTitle>
                        <CardDescription className="text-slate-600">
                          Raw HTML stays read-only here while instruction text remains editable.
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <Textarea
                          readOnly
                          value={selectedScene.readonlyHtml}
                          className={`min-h-[260px] text-xs leading-5 ${editorFieldClassName}`}
                        />
                      </CardContent>
                    </Card>
                  ) : null}
                </div>
                </>
              ) : (
                <Card className="border border-slate-200 bg-white text-slate-900 shadow-sm">
                  <CardContent className="p-8 text-sm text-slate-500">
                    Select a scene from the left sidebar to start editing the generated course.
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
