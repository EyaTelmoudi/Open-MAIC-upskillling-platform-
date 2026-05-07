"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  CheckCircle2,
  FilePenLine,
  Loader2,
  MessageSquareText,
  Save,
  Sparkles,
  X,
} from "lucide-react";

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

type DraftStatus = "generating" | "draft" | "approved" | "finalized";
type SceneDraftStatus = "generating" | "draft" | "approved";
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
  linkedElementId?: string;
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

type AssistantMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

function isSlideTextBlock(block: EditableBlock): block is EditableSlideTextBlock {
  return block.type === "slide_text";
}

function isScriptBlock(block: EditableBlock): block is EditableScriptBlock {
  return block.type === "script";
}

function tokenizeForMatching(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .map((part) => part.trim())
    .filter((part) => part.length > 2);
}

function buildSlideScriptMap(blocks: EditableBlock[]) {
  const slideBlocks = blocks.filter(isSlideTextBlock);
  const scriptBlocks = blocks.filter(isScriptBlock);
  const scriptMap = new Map<string, EditableScriptBlock[]>();

  slideBlocks.forEach((block) => {
    scriptMap.set(block.id, []);
  });

  const slideBlockByElementId = new Map(slideBlocks.map((block) => [block.elementId, block]));
  const unassignedScripts: EditableScriptBlock[] = [];

  scriptBlocks.forEach((scriptBlock) => {
    const linkedBlock = scriptBlock.linkedElementId
      ? slideBlockByElementId.get(scriptBlock.linkedElementId)
      : undefined;

    if (linkedBlock) {
      scriptMap.set(linkedBlock.id, [...(scriptMap.get(linkedBlock.id) || []), scriptBlock]);
      return;
    }

    unassignedScripts.push(scriptBlock);
  });

  if (unassignedScripts.length > 0 && slideBlocks.length > 0) {
    unassignedScripts.forEach((scriptBlock, index) => {
      const scriptTokens = new Set(tokenizeForMatching(scriptBlock.text));
      let bestBlock = slideBlocks[0];
      let bestScore = -1;

      slideBlocks.forEach((slideBlock) => {
        const blockTokens = tokenizeForMatching(slideBlock.plainText);
        const overlap = blockTokens.filter((token) => scriptTokens.has(token)).length;
        if (overlap > bestScore) {
          bestScore = overlap;
          bestBlock = slideBlock;
        }
      });

      const fallbackBlock =
        bestScore > 0 ? bestBlock : slideBlocks[Math.min(index, slideBlocks.length - 1)];
      scriptMap.set(fallbackBlock.id, [...(scriptMap.get(fallbackBlock.id) || []), scriptBlock]);
    });
  }

  return scriptMap;
}

function statusVariant(status: DraftStatus | SceneDraftStatus) {
  if (status === "generating") return "outline" as const;
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
  const [revising, setRevising] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [finalPath, setFinalPath] = useState<string | null>(null);
  const [assistantInstruction, setAssistantInstruction] = useState("");
  const [assistantOpen, setAssistantOpen] = useState(true);
  const [assistantMessagesByScene, setAssistantMessagesByScene] = useState<
    Record<string, AssistantMessage[]>
  >({});
  const assistantAbortRef = useRef<AbortController | null>(null);

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
    setSelectedSceneId((current) =>
      current && data.draft.editableScenes.some((scene) => scene.sceneId === current)
        ? current
        : data.draft.editableScenes[0]?.sceneId ?? null,
    );
  };

  useEffect(() => {
    if (!draftId || !user || user.role !== "LearningExpert") return;
    void loadDraft(draftId).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Failed to load draft");
    });
  }, [draftId, user]);

  useEffect(() => {
    if (!draftId || !draft || draft.status !== "generating") {
      return;
    }

    const interval = window.setInterval(() => {
      void loadDraft(draftId).catch(() => undefined);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [draft, draftId]);

  const selectedScene = useMemo(
    () => draft?.editableScenes.find((scene) => scene.sceneId === selectedSceneId) ?? null,
    [draft, selectedSceneId],
  );
  const selectedSceneSlideScriptMap = useMemo(
    () => (selectedScene?.type === "slide" ? buildSlideScriptMap(selectedScene.blocks) : new Map()),
    [selectedScene],
  );

  const approvedScenesCount =
    draft?.editableScenes.filter((scene) => scene.status === "approved").length ?? 0;
  const assistantMessages = selectedSceneId ? assistantMessagesByScene[selectedSceneId] || [] : [];
  const selectedSceneGenerating = selectedScene?.status === "generating";

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

  const reviseSelectedSceneWithAi = async () => {
    if (!draft || !selectedScene || !assistantInstruction.trim()) return;

    setRevising(true);
    setError(null);
    const abortController = new AbortController();
    assistantAbortRef.current = abortController;

    const nextUserMessage: AssistantMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: assistantInstruction.trim(),
    };

    try {
      const conversation = [...assistantMessages, nextUserMessage].map((message) => ({
        role: message.role,
        content: message.content,
      }));

      setAssistantMessagesByScene((current) => ({
        ...current,
        [selectedScene.sceneId]: [...(current[selectedScene.sceneId] || []), nextUserMessage],
      }));

      const response = await fetch(
        `/api/ai-course-builder/drafts/${draft.draftId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: abortController.signal,
          body: JSON.stringify({
            sceneId: selectedScene.sceneId,
            instruction: assistantInstruction.trim(),
            conversation,
          }),
        },
      );

      const data = (await response.json()) as {
        success?: boolean;
        error?: string;
        draft?: LearningExpertDraft;
        assistantMessage?: string;
      };

      if (!response.ok || !data.success || !data.draft) {
        throw new Error(data.error || "The AI revision assistant could not revise this scene.");
      }

      setDraft(data.draft);
      setAssistantInstruction("");
      setAssistantMessagesByScene((current) => ({
        ...current,
        [selectedScene.sceneId]: [
          ...(current[selectedScene.sceneId] || []),
          {
            id: `assistant_${Date.now()}`,
            role: "assistant",
            content:
              data.assistantMessage ||
              "I revised the selected scene and saved the updated draft.",
          },
        ],
      }));
    } catch (revisionError) {
      if (revisionError instanceof Error && revisionError.name === "AbortError") {
        setAssistantMessagesByScene((current) => ({
          ...current,
          [selectedScene.sceneId]: (current[selectedScene.sceneId] || []).filter(
            (message) => message.id !== nextUserMessage.id,
          ),
        }));
        setError("The scene assistant was stopped before the revision completed.");
        return;
      }
      setError(
        revisionError instanceof Error
          ? revisionError.message
          : "Failed to revise the selected scene with AI.",
      );
    } finally {
      assistantAbortRef.current = null;
      setRevising(false);
    }
  };

  const stopAssistantRevision = () => {
    assistantAbortRef.current?.abort();
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
                      {draft.status === "generating" ? (
                        <div className="mt-2 text-xs text-amber-700">
                          Ready scenes can be reviewed now. Remaining scenes will appear
                          automatically as generation continues.
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
                      <Button
                        onClick={() => void finalizeCourse()}
                        disabled={finalizing || draft.status === "generating"}
                      >
                        {finalizing ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Finalizing
                          </>
                        ) : draft.status === "generating" ? (
                          "Wait for all scenes to finish"
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

          <div
            className={`grid gap-6 ${
              selectedScene && assistantOpen
                ? "xl:grid-cols-[340px_minmax(0,1fr)_380px] 2xl:grid-cols-[380px_minmax(0,1fr)_400px]"
                : "xl:grid-cols-[340px_minmax(0,1fr)] 2xl:grid-cols-[380px_minmax(0,1fr)]"
            }`}
          >
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

            <div className={`min-w-0 space-y-6 ${assistantOpen ? "pb-[620px] xl:pb-0" : ""}`}>
              {selectedScene ? (
                <>
                  {selectedSceneGenerating ? (
                    <Card className="border border-amber-200 bg-amber-50 text-amber-900 shadow-sm">
                      <CardContent className="p-4 text-sm">
                        This scene is still being generated. You can review other ready scenes now,
                        and this one will refresh automatically when it is complete.
                      </CardContent>
                    </Card>
                  ) : null}
                  <Card className="border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(247,250,252,0.96))] text-slate-900 shadow-sm">
                    <CardContent className="p-6">
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div className="min-w-0 flex-1">
                          <div className="text-xs uppercase tracking-[0.16em] text-primary">
                            {selectedScene.type}
                          </div>
                          <Input
                            value={selectedScene.title}
                            disabled={selectedSceneGenerating}
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
                          disabled={selectedSceneGenerating}
                        >
                          {selectedScene.status === "approved" ? "Unapprove scene" : "Approve scene"}
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <div className="space-y-4">
                    <div className="space-y-4">
                      {selectedScene.blocks
                        .filter(
                          (block) =>
                            !(selectedScene.type === "slide" && block.type === "script"),
                        )
                        .map((block, blockIndex) => (
                        <Card key={block.id} className="border border-slate-200 bg-white text-slate-900 shadow-sm">
                          <CardContent className="p-5">
                            {block.type === "slide_text" ? (
                              <div className="space-y-3">
                                <div className="text-sm font-semibold text-slate-900">
                                  {block.label}
                                </div>
                                <Textarea
                                  value={block.plainText}
                                  disabled={selectedSceneGenerating}
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
                                <div className="rounded-2xl border border-sky-100 bg-sky-50/70 p-4">
                                  <div className="text-xs font-semibold uppercase tracking-[0.14em] text-sky-700">
                                    Related teacher script
                                  </div>
                                  <div className="mt-3 space-y-3">
                                    {(selectedSceneSlideScriptMap.get(block.id) || []).length > 0 ? (
                                      (selectedSceneSlideScriptMap.get(block.id) || []).map(
                                        (scriptBlock, scriptIndex) => (
                                          <div key={scriptBlock.id} className="space-y-2">
                                            <div className="text-xs font-medium text-slate-600">
                                              Script segment {scriptIndex + 1}
                                            </div>
                                            <Textarea
                                              value={scriptBlock.text}
                                              disabled={selectedSceneGenerating}
                                              className={`min-h-[120px] ${editorFieldClassName}`}
                                              onChange={(event) =>
                                                updateScene((scene) => ({
                                                  ...scene,
                                                  blocks: scene.blocks.map((candidate) =>
                                                    candidate.id === scriptBlock.id
                                                      ? { ...candidate, text: event.target.value }
                                                      : candidate,
                                                  ),
                                                }))
                                              }
                                            />
                                          </div>
                                        ),
                                      )
                                    ) : (
                                      <div className="rounded-xl border border-dashed border-sky-200 bg-white px-3 py-4 text-sm text-slate-500">
                                        No teacher script segment is currently linked to this slide block.
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : null}

                            {block.type === "script" && selectedScene.type !== "slide" ? (
                              <div className="space-y-3">
                                <div className="text-sm font-semibold text-slate-900">
                                  Teacher script {blockIndex + 1}
                                </div>
                                <Textarea
                                  value={block.text}
                                  disabled={selectedSceneGenerating}
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
                                  disabled={selectedSceneGenerating}
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
                                        disabled={selectedSceneGenerating}
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
                                    disabled={selectedSceneGenerating}
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
                                    disabled={selectedSceneGenerating}
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
                                  disabled={selectedSceneGenerating}
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
            {selectedScene && assistantOpen ? (
              <aside className="hidden xl:block xl:sticky xl:top-[108px] xl:h-[calc(100vh-140px)] xl:self-start">
                <div className="overflow-hidden rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(239,246,255,0.98))] text-slate-900 shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
                  <div className="flex items-start justify-between gap-4 border-b border-slate-200/90 px-5 py-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-sm font-medium text-sky-700">
                        <Sparkles className="h-4 w-4" />
                        Scene Assistant
                      </div>
                      <div className="mt-2 text-sm text-slate-600">
                        Scene {selectedScene.order} • {selectedScene.type} • {selectedScene.title}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAssistantOpen(false)}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                      aria-label="Close assistant"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex h-[calc(100vh-250px)] min-h-[520px] flex-col">
                    <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                      {assistantMessages.length > 0 ? (
                        assistantMessages.map((message) => (
                          <div
                            key={message.id}
                            className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                              message.role === "user"
                                ? "ml-6 border border-slate-200 bg-white text-slate-700"
                                : "mr-6 border border-sky-100 bg-sky-50 text-slate-800"
                            }`}
                          >
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                              {message.role === "user" ? "Learning expert" : "Assistant"}
                            </div>
                            {message.content}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
                          Ask for a revision on the selected scene. The assistant will only edit this scene and keep the draft structure intact.
                        </div>
                      )}
                    </div>

                    <div className="border-t border-slate-200/90 bg-white/90 px-5 py-4">
                      <Textarea
                        value={assistantInstruction}
                        onChange={(event) => setAssistantInstruction(event.target.value)}
                        placeholder="Tell the assistant how the selected scene should be improved."
                        className={`min-h-[120px] resize-none ${editorFieldClassName}`}
                      />
                      <div className="mt-3 flex items-center justify-between gap-3">
                        <div className="text-xs text-slate-500">
                          The assistant uses the current selected scene as context.
                        </div>
                        <div className="flex items-center gap-2">
                          {revising ? (
                            <Button
                              variant="outline"
                              onClick={stopAssistantRevision}
                              className="border-red-200 bg-white text-red-700 hover:bg-red-50"
                            >
                              <X className="h-4 w-4" />
                              Stop
                            </Button>
                          ) : null}
                          <Button
                            onClick={() => void reviseSelectedSceneWithAi()}
                            disabled={revising || !assistantInstruction.trim() || selectedSceneGenerating}
                          >
                            {revising ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Revising
                              </>
                            ) : (
                              <>
                                <Sparkles className="h-4 w-4" />
                                Send
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </aside>
            ) : null}
          </div>
        </div>
      </div>
      {selectedScene ? (
        <div className="pointer-events-none fixed bottom-6 right-6 z-40 flex max-w-[calc(100vw-2rem)] items-end justify-end xl:hidden">
          {assistantOpen ? (
            <div className="pointer-events-auto w-[380px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-[26px] border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.99),rgba(239,246,255,0.98))] text-slate-900 shadow-[0_24px_60px_rgba(15,23,42,0.20)]">
              <div className="flex items-start justify-between gap-4 border-b border-slate-200/90 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium text-sky-700">
                    <Sparkles className="h-4 w-4" />
                    Scene Assistant
                  </div>
                  <div className="mt-2 text-sm text-slate-600">
                    Scene {selectedScene.order} • {selectedScene.type} • {selectedScene.title}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAssistantOpen(false)}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-900"
                  aria-label="Close assistant"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex h-[560px] flex-col">
                <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
                  {assistantMessages.length > 0 ? (
                    assistantMessages.map((message) => (
                      <div
                        key={message.id}
                        className={`rounded-2xl px-4 py-3 text-sm leading-6 ${
                          message.role === "user"
                            ? "ml-6 border border-slate-200 bg-white text-slate-700"
                            : "mr-6 border border-sky-100 bg-sky-50 text-slate-800"
                        }`}
                      >
                        <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                          {message.role === "user" ? "Learning expert" : "Assistant"}
                        </div>
                        {message.content}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-5 text-sm text-slate-500">
                      Ask for a revision on the selected scene. The assistant will only edit this scene and keep the draft structure intact.
                    </div>
                  )}
                </div>

                <div className="border-t border-slate-200/90 bg-white/90 px-5 py-4">
                  <Textarea
                    value={assistantInstruction}
                    onChange={(event) => setAssistantInstruction(event.target.value)}
                    placeholder="Tell the assistant how the selected scene should be improved."
                    className={`min-h-[120px] resize-none ${editorFieldClassName}`}
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-slate-500">
                      The assistant uses the current selected scene as context.
                    </div>
                    <div className="flex items-center gap-2">
                      {revising ? (
                        <Button
                          variant="outline"
                          onClick={stopAssistantRevision}
                          className="border-red-200 bg-white text-red-700 hover:bg-red-50"
                        >
                          <X className="h-4 w-4" />
                          Stop
                        </Button>
                      ) : null}
                      <Button
                        onClick={() => void reviseSelectedSceneWithAi()}
                        disabled={revising || !assistantInstruction.trim() || selectedSceneGenerating}
                      >
                        {revising ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Revising
                          </>
                        ) : (
                          <>
                            <Sparkles className="h-4 w-4" />
                            Send
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAssistantOpen(true)}
              className="pointer-events-auto inline-flex items-center gap-3 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-[0_18px_40px_rgba(15,23,42,0.18)] transition hover:border-sky-300 hover:bg-sky-50"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-sky-100 text-sky-700">
                <MessageSquareText className="h-4 w-4" />
              </span>
              Open scene assistant
            </button>
          )}
        </div>
      ) : null}
    </AdminShell>
  );
}
