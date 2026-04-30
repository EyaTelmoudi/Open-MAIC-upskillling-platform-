"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
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
import { AiCourseStudioNav } from "../ai-course-studio-nav";

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

type GenerationResponse = {
  draftId: string;
  draftStatus: string;
  submissionId: string;
  outputDir: string;
  outputDirRelative: string;
  classroomId: string;
  classroomUrl: string;
  scenesCount: number;
  stage: {
    name?: string;
    languageDirective?: string;
  };
  scenes: Array<{
    id: string;
    title: string;
    type: string;
    order: number;
  }>;
};

type ProgressState = {
  step: string;
  progress: number;
  message: string;
  scenesGenerated?: number;
  totalScenes?: number;
};

type FinalizeResponse = {
  success?: boolean;
  error?: string;
  draft: LearningExpertDraft;
  finalCoursePathRelative: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

function statusVariant(status: DraftStatus | SceneDraftStatus) {
  if (status === "approved" || status === "finalized") {
    return "default" as const;
  }
  return "outline" as const;
}

function plainTextPreview(block: EditableBlock) {
  switch (block.type) {
    case "slide_text":
      return block.plainText;
    case "script":
      return block.text;
    case "interactive_instruction":
      return block.text;
    case "quiz_question":
      return block.question;
    default:
      return "";
  }
}

export default function AiCourseBuilderPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  const [prompt, setPrompt] = useState("");
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [result, setResult] = useState<GenerationResponse | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draft, setDraft] = useState<LearningExpertDraft | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [enableImageGeneration, setEnableImageGeneration] = useState(false);
  const [enableVideoGeneration, setEnableVideoGeneration] = useState(false);
  const [enableTTS, setEnableTTS] = useState(false);
  const [agentMode, setAgentMode] = useState<"default" | "generate">("default");
  const [finalPath, setFinalPath] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && user?.role !== "LearningExpert") {
      router.replace(routes.adminCourses);
    }
  }, [isLoading, router, user?.role]);

  const selectedScene = useMemo(
    () => draft?.editableScenes.find((scene) => scene.sceneId === selectedSceneId) ?? null,
    [draft, selectedSceneId],
  );

  const approvedScenesCount =
    draft?.editableScenes.filter((scene) => scene.status === "approved").length ?? 0;

  const loadDrafts = async () => {
    const response = await fetch("/api/ai-course-builder/drafts", { cache: "no-store" });
    const data = (await response.json()) as {
      success?: boolean;
      drafts?: DraftSummary[];
      error?: string;
    };
    if (!response.ok || !data.success) {
      throw new Error(data.error || "Failed to load drafts");
    }
    setDrafts(data.drafts || []);
  };

  const loadDraft = async (draftId: string) => {
    const response = await fetch(`/api/ai-course-builder/drafts/${draftId}`, {
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
    setFinalPath(null);
  };

  useEffect(() => {
    void loadDrafts().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : "Failed to load drafts");
    });
  }, []);

  const updateScene = (updater: (scene: EditableSceneDraft) => EditableSceneDraft) => {
    setDraft((current) => {
      if (!current || !selectedSceneId) {
        return current;
      }
      return {
        ...current,
        editableScenes: current.editableScenes.map((scene) =>
          scene.sceneId === selectedSceneId ? updater(scene) : scene,
        ),
      };
    });
  };

  const persistCurrentDraft = async (): Promise<LearningExpertDraft> => {
    if (!draft) {
      throw new Error("No draft loaded");
    }

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
      await loadDrafts();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Failed to save draft");
    } finally {
      setSaving(false);
    }
  };

  const approveScene = async (approved: boolean) => {
    if (!draft || !selectedScene) return;
    setError(null);
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
      await loadDrafts();
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
    setError(null);
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
      await loadDrafts();
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
      await loadDrafts();
      router.push(routes.adminAiCourseReview(data.draft.draftId));
    } catch (finalizeError) {
      setError(
        finalizeError instanceof Error ? finalizeError.message : "Failed to finalize course",
      );
    } finally {
      setFinalizing(false);
    }
  };

  const handleGenerate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!pdfFile) {
      setError("Attach a PDF file before starting generation.");
      return;
    }

    if (!prompt.trim()) {
      setError("Write the learning expert prompt before starting generation.");
      return;
    }

    setLoading(true);
    setError(null);
    setProgress({
      step: "queued",
      progress: 0,
      message: "Waiting for OpenMAIC to accept the generation request.",
    });
    setResult(null);
    setDraft(null);
    setFinalPath(null);

    try {
      const formData = new FormData();
      formData.append("pdf", pdfFile);
      formData.append("requirement", prompt.trim());
      formData.append("enableWebSearch", String(enableWebSearch));
      formData.append("enableImageGeneration", String(enableImageGeneration));
      formData.append("enableVideoGeneration", String(enableVideoGeneration));
      formData.append("enableTTS", String(enableTTS));
      formData.append("agentMode", agentMode);

      const response = await fetch("/api/ai-course-builder/generate", {
        method: "POST",
        body: formData,
      });

      if (!response.body) {
        throw new Error("The platform did not receive a readable progress stream.");
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let doneReceived = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;

          const eventData = JSON.parse(trimmed) as
            | {
                type: "progress";
                step: string;
                progress: number;
                message: string;
                scenesGenerated?: number;
                totalScenes?: number;
              }
            | { type: "done"; data: GenerationResponse & { success: boolean } }
            | { type: "error"; error: string };

          if (eventData.type === "progress") {
            setProgress({
              step: eventData.step,
              progress: eventData.progress,
              message: eventData.message,
              scenesGenerated: eventData.scenesGenerated,
              totalScenes: eventData.totalScenes,
            });
          } else if (eventData.type === "done") {
            doneReceived = true;
            setProgress({
              step: "completed",
              progress: 100,
              message: "OpenMAIC finished the course draft successfully.",
            });
            setResult(eventData.data);
            await loadDraft(eventData.data.draftId);
            await loadDrafts();
          } else {
            throw new Error(eventData.error || "Generation failed");
          }
        }
      }

      if (!response.ok && !doneReceived) {
        throw new Error("Generation failed before completion.");
      }
    } catch (generateError) {
      setError(
        generateError instanceof Error ? generateError.message : "Failed to generate course",
      );
      setProgress(null);
    } finally {
      setLoading(false);
    }
  };

  if (!isLoading && user?.role !== "LearningExpert") {
    return null;
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <AiCourseStudioNav />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-sm text-slate-600">
              <Sparkles className="h-4 w-4 text-primary" />
              Native LearningExpert workflow inside your platform
            </div>
            <h2 className="mt-2 text-2xl font-semibold text-slate-950">AI Course Builder</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">
              Upload a PDF, write the expert brief, watch OpenMAIC generate the draft live, then
              edit slides, quizzes, and interactive instructions without leaving the platform.
            </p>
          </div>
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.96fr_1.04fr]">
          <div className="space-y-6">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Course inputs</CardTitle>
                <CardDescription>
                  Send both the source PDF and your learning expert prompt to OpenMAIC.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-5" onSubmit={handleGenerate}>
                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900" htmlFor="course-pdf">
                      PDF source file
                    </label>
                    <Input
                      id="course-pdf"
                      type="file"
                      accept="application/pdf"
                      onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900" htmlFor="course-prompt">
                      Learning expert prompt
                    </label>
                    <Textarea
                      id="course-prompt"
                      value={prompt}
                      onChange={(event) => setPrompt(event.target.value)}
                      className="min-h-[180px]"
                      placeholder="Example: Build a practical beginner course on Generative AI and LLMs from this PDF. Use clear English, add quizzes after each major concept, and prepare teacher-friendly narration."
                    />
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    <label className="flex items-center justify-between rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm">
                      <span>Enable web search</span>
                      <input
                        type="checkbox"
                        checked={enableWebSearch}
                        onChange={(event) => setEnableWebSearch(event.target.checked)}
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm">
                      <span>Generate images</span>
                      <input
                        type="checkbox"
                        checked={enableImageGeneration}
                        onChange={(event) => setEnableImageGeneration(event.target.checked)}
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm">
                      <span>Generate videos</span>
                      <input
                        type="checkbox"
                        checked={enableVideoGeneration}
                        onChange={(event) => setEnableVideoGeneration(event.target.checked)}
                      />
                    </label>
                    <label className="flex items-center justify-between rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm">
                      <span>Generate TTS audio</span>
                      <input
                        type="checkbox"
                        checked={enableTTS}
                        onChange={(event) => setEnableTTS(event.target.checked)}
                      />
                    </label>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium text-slate-900" htmlFor="agent-mode">
                      Agent mode
                    </label>
                    <select
                      id="agent-mode"
                      value={agentMode}
                      onChange={(event) =>
                        setAgentMode(event.target.value === "generate" ? "generate" : "default")
                      }
                      className="flex h-10 w-full rounded-[10px] border border-border bg-card px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="default">Use default classroom agents</option>
                      <option value="generate">Generate custom agents</option>
                    </select>
                  </div>

                  <Button type="submit" disabled={loading}>
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Generating
                      </>
                    ) : (
                      <>
                        <FileText className="h-4 w-4" />
                        Generate Draft Course
                      </>
                    )}
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border-slate-800 bg-slate-950 text-white shadow-sm">
              <CardHeader>
                <CardTitle>OpenMAIC run status</CardTitle>
                <CardDescription className="text-slate-300">
                  Watch the generation pipeline live so you know whether OpenMAIC is still working
                  or has failed.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {error ? (
                  <div className="rounded-2xl border border-red-500/40 bg-red-500/10 px-4 py-3 text-sm text-red-100">
                    {error}
                  </div>
                ) : null}

                {progress ? (
                  <div className="space-y-4 rounded-3xl border border-white/10 bg-white/5 p-5">
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-slate-300">
                      <span>{progress.step.replace(/_/g, " ")}</span>
                      <span>{progress.progress}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-sky-400 transition-all duration-500"
                        style={{ width: `${Math.max(4, progress.progress)}%` }}
                      />
                    </div>
                    <p className="text-sm leading-6 text-slate-100">{progress.message}</p>
                    {typeof progress.scenesGenerated === "number" ? (
                      <p className="text-xs uppercase tracking-[0.14em] text-slate-300">
                        Scenes generated: {progress.scenesGenerated}
                        {typeof progress.totalScenes === "number"
                          ? ` / ${progress.totalScenes}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-3xl border border-dashed border-white/15 bg-white/5 px-5 py-6 text-sm text-slate-300">
                    No active run. Start a generation request or load an existing draft below.
                  </div>
                )}

                {result ? (
                  <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5">
                    <div className="flex items-center gap-2 text-sm font-medium text-emerald-200">
                      <CheckCircle2 className="h-4 w-4" />
                      OpenMAIC draft created
                    </div>
                    <p className="mt-2 text-sm text-emerald-50">
                      {result.stage.name || "Generated course"} with {result.scenesCount} scenes.
                    </p>
                  </div>
                ) : null}
              </CardContent>
            </Card>

            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Saved drafts</CardTitle>
                <CardDescription>
                  Reload an existing OpenMAIC draft into the editor.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {drafts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-border bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    No drafts saved yet.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {drafts.map((item) => (
                      <button
                        key={item.draftId}
                        type="button"
                        onClick={() => void loadDraft(item.draftId).catch((loadError) => {
                          setError(
                            loadError instanceof Error
                              ? loadError.message
                              : "Failed to load draft",
                          );
                        })}
                        className="w-full rounded-2xl border border-border bg-white px-4 py-4 text-left transition hover:border-primary/40 hover:bg-slate-50"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-medium text-slate-950">{item.title}</div>
                            <div className="mt-1 text-xs text-slate-500">
                              {item.scenesCount} scenes • {item.approvedScenesCount} approved
                            </div>
                          </div>
                          <Badge variant={statusVariant(item.status)}>{item.status}</Badge>
                        </div>
                        <div className="mt-3 text-xs text-slate-500">
                          Updated {formatDate(item.updatedAt)}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="shadow-sm">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <CardTitle>Editable content section</CardTitle>
                    <CardDescription>
                      Review generated slides, quizzes, and interactive scenes in your platform and
                      edit them before approval.
                    </CardDescription>
                  </div>
                  {draft ? (
                    <Badge variant={statusVariant(draft.status)}>{draft.status}</Badge>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent>
                {!draft ? (
                  <div className="rounded-3xl border border-dashed border-border bg-slate-50 px-5 py-10 text-sm text-slate-500">
                    Generate a course or load a saved draft to start editing.
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-border bg-slate-50 p-5">
                      <div>
                        <h3 className="text-lg font-semibold text-slate-950">
                          {draft.stage.name || "Generated course draft"}
                        </h3>
                        <p className="mt-2 text-sm text-slate-600">
                          Draft status: {draft.status}. Approved scenes: {approvedScenesCount}/
                          {draft.editableScenes.length}
                        </p>
                        {finalPath ? (
                          <p className="mt-2 text-xs text-slate-500">
                            Final course saved to {finalPath}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-3">
                        <Button variant="outline" onClick={() => void saveDraftChanges()} disabled={saving}>
                          {saving ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Saving
                            </>
                          ) : (
                            "Save draft"
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => void approveLesson(draft.status !== "approved")}
                        >
                          {draft.status === "approved" ? "Unapprove lesson" : "Approve lesson"}
                        </Button>
                        <Button onClick={() => void finalizeCourse()} disabled={finalizing}>
                          {finalizing ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              Finalizing
                            </>
                          ) : (
                            "Generate final course"
                          )}
                        </Button>
                      </div>
                    </div>

                    <div className="grid gap-6 xl:grid-cols-[0.4fr_0.6fr]">
                      <aside className="space-y-3">
                        {draft.editableScenes.map((scene) => (
                          <button
                            key={scene.sceneId}
                            type="button"
                            onClick={() => setSelectedSceneId(scene.sceneId)}
                            className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                              selectedSceneId === scene.sceneId
                                ? "border-primary bg-primary/5"
                                : "border-border bg-white hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                                {scene.type}
                              </div>
                              <Badge variant={statusVariant(scene.status)}>{scene.status}</Badge>
                            </div>
                            <div className="mt-2 font-medium text-slate-950">
                              {scene.order}. {scene.title}
                            </div>
                          </button>
                        ))}
                      </aside>

                      <div>
                        {selectedScene ? (
                          <div className="space-y-6">
                            <Card className="bg-slate-50">
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
                                      className="mt-3 h-12 text-lg font-semibold"
                                    />
                                  </div>
                                  <Button
                                    variant="outline"
                                    onClick={() =>
                                      void approveScene(selectedScene.status !== "approved")
                                    }
                                  >
                                    {selectedScene.status === "approved"
                                      ? "Unapprove scene"
                                      : "Approve scene"}
                                  </Button>
                                </div>
                              </CardContent>
                            </Card>

                            <div className="grid gap-6 2xl:grid-cols-[0.98fr_1.02fr]">
                              <div className="space-y-4">
                                {selectedScene.blocks.map((block, blockIndex) => (
                                  <Card key={block.id}>
                                    <CardContent className="p-5">
                                      {block.type === "slide_text" ? (
                                        <div className="space-y-3">
                                          <div className="text-sm font-semibold text-slate-900">
                                            {block.label}
                                          </div>
                                          <Textarea
                                            value={block.plainText}
                                            className="min-h-[140px]"
                                            onChange={(event) =>
                                              updateScene((scene) => ({
                                                ...scene,
                                                blocks: scene.blocks.map((candidate) =>
                                                  candidate.id === block.id
                                                    ? {
                                                        ...candidate,
                                                        plainText: event.target.value,
                                                      }
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
                                            className="min-h-[120px]"
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
                                            className="min-h-[100px]"
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
                                                  onChange={(event) =>
                                                    updateScene((scene) => ({
                                                      ...scene,
                                                      blocks: scene.blocks.map((candidate) =>
                                                        candidate.id === block.id &&
                                                        candidate.type === "quiz_question"
                                                          ? {
                                                              ...candidate,
                                                              options: candidate.options.map(
                                                                (item, idx) =>
                                                                  idx === optionIndex
                                                                    ? {
                                                                        ...item,
                                                                        label:
                                                                          event.target.value,
                                                                      }
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
                                              className="min-h-[100px]"
                                              onChange={(event) =>
                                                updateScene((scene) => ({
                                                  ...scene,
                                                  blocks: scene.blocks.map((candidate) =>
                                                    candidate.id === block.id
                                                      ? {
                                                          ...candidate,
                                                          explanation: event.target.value,
                                                        }
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
                                            className="min-h-[140px]"
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
                              </div>

                              <div className="space-y-4">
                                <Card>
                                  <CardHeader>
                                    <CardTitle>Platform preview</CardTitle>
                                    <CardDescription>
                                      This is how the generated content is exposed inside your own
                                      platform page instead of the OpenMAIC classroom template.
                                    </CardDescription>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="rounded-3xl border border-border bg-slate-50 p-5">
                                      <h3 className="text-xl font-semibold text-slate-950">
                                        {selectedScene.title}
                                      </h3>
                                      <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                                        {selectedScene.blocks
                                          .filter(
                                            (block) =>
                                              block.type === "slide_text" ||
                                              block.type === "interactive_instruction",
                                          )
                                          .map((block) => (
                                            <div
                                              key={`preview_${block.id}`}
                                              className="rounded-2xl border border-border bg-white p-4"
                                            >
                                              <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                                                {block.type}
                                              </div>
                                              <p className="mt-2 whitespace-pre-wrap">
                                                {plainTextPreview(block)}
                                              </p>
                                            </div>
                                          ))}

                                        {selectedScene.type === "quiz" ? (
                                          <div className="space-y-3">
                                            {selectedScene.blocks
                                              .filter(
                                                (
                                                  block,
                                                ): block is EditableQuizQuestionBlock =>
                                                  block.type === "quiz_question",
                                              )
                                              .map((question, index) => (
                                                <div
                                                  key={`quiz_preview_${question.id}`}
                                                  className="rounded-2xl border border-border bg-white p-4"
                                                >
                                                  <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                                                    Question {index + 1}
                                                  </div>
                                                  <p className="mt-2 font-medium text-slate-900">
                                                    {question.question}
                                                  </p>
                                                  <ul className="mt-3 space-y-2">
                                                    {question.options.map((option) => (
                                                      <li key={option.value}>
                                                        {option.value}. {option.label}
                                                      </li>
                                                    ))}
                                                  </ul>
                                                  <p className="mt-3 text-xs text-slate-500">
                                                    Correct answer:{" "}
                                                    {question.correctAnswer.join(", ") || "-"}
                                                  </p>
                                                </div>
                                              ))}
                                          </div>
                                        ) : null}
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>

                                <Card>
                                  <CardHeader>
                                    <CardTitle>Teacher script preview</CardTitle>
                                    <CardDescription>
                                      Narration segments that can later drive voice or lesson-video
                                      rendering.
                                    </CardDescription>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="space-y-3">
                                      {selectedScene.blocks
                                        .filter(
                                          (block): block is EditableScriptBlock =>
                                            block.type === "script",
                                        )
                                        .map((block, index) => (
                                          <div
                                            key={`script_preview_${block.id}`}
                                            className="rounded-2xl border border-border bg-slate-50 p-4 text-sm leading-6 text-slate-700"
                                          >
                                            <div className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                                              Speech {index + 1}
                                            </div>
                                            {block.text}
                                          </div>
                                        ))}
                                      {selectedScene.blocks.every(
                                        (block) => block.type !== "script",
                                      ) ? (
                                        <div className="rounded-2xl border border-dashed border-border bg-slate-50 px-4 py-5 text-sm text-slate-500">
                                          No teacher script blocks in this scene.
                                        </div>
                                      ) : null}
                                    </div>
                                  </CardContent>
                                </Card>

                                {selectedScene.type === "interactive" &&
                                selectedScene.readonlyHtml ? (
                                  <Card>
                                    <CardHeader>
                                      <CardTitle>Raw interactive HTML</CardTitle>
                                      <CardDescription>
                                        V1 keeps generated interactive HTML read-only while the
                                        instruction text stays editable.
                                      </CardDescription>
                                    </CardHeader>
                                    <CardContent>
                                      <Textarea
                                        readOnly
                                        value={selectedScene.readonlyHtml}
                                        className="min-h-[260px] text-xs leading-5"
                                      />
                                    </CardContent>
                                  </Card>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="rounded-3xl border border-dashed border-border bg-slate-50 px-5 py-10 text-sm text-slate-500">
                            Select a generated scene to review and edit it.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
