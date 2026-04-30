'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import type {
  DraftSummary,
  EditableBlock,
  EditableInteractiveInstructionBlock,
  EditableQuizQuestionBlock,
  EditableSceneDraft,
  EditableScriptBlock,
  EditableSlideTextBlock,
  LearningExpertDraft,
} from '@/lib/learing-expert-agent/types';

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
  draft: LearningExpertDraft;
  finalCoursePathRelative: string;
  classroomUrl?: string;
  platformUrl?: string;
};

function statusBadge(status: string): string {
  if (status === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  if (status === 'finalized') return 'border-violet-200 bg-violet-50 text-violet-700';
  return 'border-amber-200 bg-amber-50 text-amber-700';
}

function plainTextPreview(block: EditableBlock): string {
  switch (block.type) {
    case 'slide_text':
      return block.plainText;
    case 'script':
      return block.text;
    case 'interactive_instruction':
      return block.text;
    case 'quiz_question':
      return block.question;
    default:
      return '';
  }
}

export default function LearningExpertAgentPage() {
  const [requirement, setRequirement] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [enableWebSearch, setEnableWebSearch] = useState(false);
  const [enableImageGeneration, setEnableImageGeneration] = useState(false);
  const [enableVideoGeneration, setEnableVideoGeneration] = useState(false);
  const [enableTTS, setEnableTTS] = useState(false);
  const [agentMode, setAgentMode] = useState<'default' | 'generate'>('default');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<GenerationResponse | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draft, setDraft] = useState<LearningExpertDraft | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [finalPath, setFinalPath] = useState<string | null>(null);
  const [finalClassroomUrl, setFinalClassroomUrl] = useState<string | null>(null);
  const router = useRouter();

  const selectedScene = useMemo(
    () => draft?.editableScenes.find((scene) => scene.sceneId === selectedSceneId) || null,
    [draft, selectedSceneId],
  );

  const approvedScenesCount = draft?.editableScenes.filter((scene) => scene.status === 'approved')
    .length;

  const loadDrafts = async () => {
    const response = await fetch('/api/learing-expert-agent/drafts');
    const data = await response.json();
    if (response.ok && data.success) {
      setDrafts(data.drafts);
    }
  };

  const loadDraft = async (draftId: string) => {
    const response = await fetch(`/api/learing-expert-agent/drafts/${draftId}`);
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to load draft');
    }
    setDraft(data.draft);
    setSelectedSceneId(data.draft.editableScenes[0]?.sceneId || null);
    setFinalPath(null);
    setFinalClassroomUrl(null);
  };

  useEffect(() => {
    void loadDrafts();
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!pdfFile) {
      setError('Please attach a PDF file before sending the request.');
      return;
    }

    if (!requirement.trim()) {
      setError('Please describe what course OpenMAIC should build from the PDF.');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setDraft(null);
    setFinalPath(null);
    setFinalClassroomUrl(null);
    setProgress({
      step: 'queued',
      progress: 0,
      message: 'Waiting for the server to accept the request',
    });

    try {
      const formData = new FormData();
      formData.append('pdf', pdfFile);
      formData.append('requirement', requirement.trim());
      formData.append('enableWebSearch', String(enableWebSearch));
      formData.append('enableImageGeneration', String(enableImageGeneration));
      formData.append('enableVideoGeneration', String(enableVideoGeneration));
      formData.append('enableTTS', String(enableTTS));
      formData.append('agentMode', agentMode);

      const response = await fetch('/api/learing-expert-agent/generate', {
        method: 'POST',
        body: formData,
      });

      if (!response.body) {
        throw new Error('The server did not return a readable progress stream');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let doneReceived = false;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          const event = JSON.parse(trimmed) as
            | {
                type: 'progress';
                step: string;
                progress: number;
                message: string;
                scenesGenerated?: number;
                totalScenes?: number;
              }
            | { type: 'done'; data: GenerationResponse & { success: boolean } }
            | { type: 'error'; error: string };

          if (event.type === 'progress') {
            setProgress({
              step: event.step,
              progress: event.progress,
              message: event.message,
              scenesGenerated: event.scenesGenerated,
              totalScenes: event.totalScenes,
            });
          } else if (event.type === 'done') {
            doneReceived = true;
            setProgress({
              step: 'done',
              progress: 100,
              message: 'OpenMAIC finished the generation successfully',
            });
            setResult(event.data);
            await loadDraft(event.data.draftId);
            await loadDrafts();
          } else if (event.type === 'error') {
            throw new Error(event.error || 'Generation failed');
          }
        }
      }

      if (!response.ok && !doneReceived) {
        throw new Error('Generation failed before completion');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
      setProgress(null);
    } finally {
      setLoading(false);
    }
  };

  const updateScene = (updater: (scene: EditableSceneDraft) => EditableSceneDraft) => {
    setDraft((current) => {
      if (!current || !selectedScene) return current;
      return {
        ...current,
        editableScenes: current.editableScenes.map((scene) =>
          scene.sceneId === selectedScene.sceneId ? updater(scene) : scene,
        ),
      };
    });
  };

  const saveDraftChanges = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/learing-expert-agent/drafts/${draft.draftId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to save draft');
      }
      setDraft(data.draft);
      await loadDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save draft');
    } finally {
      setSaving(false);
    }
  };

  const persistCurrentDraft = async (): Promise<LearningExpertDraft> => {
    if (!draft) {
      throw new Error('No draft loaded');
    }

    const response = await fetch(`/api/learing-expert-agent/drafts/${draft.draftId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft }),
    });
    const data = await response.json();
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to save draft');
    }

    setDraft(data.draft);
    return data.draft as LearningExpertDraft;
  };

  const approveScene = async (approved: boolean) => {
    if (!draft || !selectedScene) return;
    try {
      const persistedDraft = await persistCurrentDraft();
      const response = await fetch(
        `/api/learing-expert-agent/drafts/${persistedDraft.draftId}/approve-scene`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sceneId: selectedScene.sceneId, approved }),
        },
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update scene approval');
      }
      setDraft(data.draft);
      await loadDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update scene approval');
    }
  };

  const approveLesson = async (approved: boolean) => {
    if (!draft) return;
    try {
      const persistedDraft = await persistCurrentDraft();
      const response = await fetch(
        `/api/learing-expert-agent/drafts/${persistedDraft.draftId}/approve-lesson`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved }),
        },
      );
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to update lesson approval');
      }
      setDraft(data.draft);
      await loadDrafts();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update lesson approval');
    }
  };

  const finalizeCourse = async () => {
    if (!draft) return;
    setFinalizing(true);
    setError(null);
    try {
      const persistedDraft = await persistCurrentDraft();
      const response = await fetch(
        `/api/learing-expert-agent/drafts/${persistedDraft.draftId}/finalize`,
        {
          method: 'POST',
        },
      );
      const data = (await response.json()) as FinalizeResponse & {
        success?: boolean;
        error?: string;
      };
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to finalize the course');
      }
      setDraft(data.draft);
      setFinalPath(data.finalCoursePathRelative);
      setFinalClassroomUrl(data.platformUrl || `/learning-platform/courses/${data.draft.draftId}`);
      await loadDrafts();
      router.push(data.platformUrl || `/learning-platform/courses/${data.draft.draftId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to finalize the course');
    } finally {
      setFinalizing(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-[radial-gradient(circle_at_top,_rgba(14,165,233,0.16),_transparent_32%),linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] px-4 py-10 text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8">
        <section className="rounded-[28px] border border-white/60 bg-white/80 p-8 shadow-[0_24px_80px_rgba(15,23,42,0.12)] backdrop-blur">
          <p className="mb-3 inline-flex rounded-full border border-sky-200 bg-sky-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-700">
            Learning Expert Agent
          </p>
          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight text-slate-950">
            Generate a draft course with OpenMAIC, edit each scene, approve it, then export the
            final course package.
          </h1>
          <p className="mt-4 max-w-4xl text-sm leading-6 text-slate-600">
            This V1 editor persists OpenMAIC output on the server, transforms scenes into editable
            blocks, lets the learning expert update slide text, script text, quiz content, and
            interactive instructions, then produces a final approved course JSON on demand.
          </p>
        </section>

        <section className="grid gap-8 xl:grid-cols-[0.92fr_1.08fr]">
          <div className="space-y-8">
            <section className="rounded-[28px] border border-slate-200 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <h2 className="text-2xl font-semibold text-slate-950">1. Generate a draft</h2>
              <p className="mt-2 text-sm text-slate-600">
                Upload a PDF, send it to OpenMAIC, and automatically create a server-stored draft
                ready for expert editing.
              </p>

              <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-800" htmlFor="pdf">
                    Course PDF
                  </label>
                  <input
                    id="pdf"
                    type="file"
                    accept="application/pdf"
                    onChange={(event) => setPdfFile(event.target.files?.[0] ?? null)}
                    className="block w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-700 file:mr-4 file:rounded-xl file:border-0 file:bg-sky-600 file:px-4 file:py-2 file:text-sm file:font-medium file:text-white hover:file:bg-sky-700"
                  />
                </div>

                <div>
                  <label
                    className="mb-2 block text-sm font-medium text-slate-800"
                    htmlFor="requirement"
                  >
                    Learning expert request
                  </label>
                  <textarea
                    id="requirement"
                    value={requirement}
                    onChange={(event) => setRequirement(event.target.value)}
                    placeholder="Example: Build a beginner Generative AI and LLM course from this PDF. Keep the sequence practical, include quizzes after each concept block, and maintain a clear teacher-led narration."
                    className="min-h-40 w-full rounded-3xl border border-slate-300 bg-white px-4 py-4 text-sm leading-6 text-slate-900 outline-none transition focus:border-sky-500"
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span>Enable web search</span>
                    <input
                      type="checkbox"
                      checked={enableWebSearch}
                      onChange={(event) => setEnableWebSearch(event.target.checked)}
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span>Generate images</span>
                    <input
                      type="checkbox"
                      checked={enableImageGeneration}
                      onChange={(event) => setEnableImageGeneration(event.target.checked)}
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span>Generate videos</span>
                    <input
                      type="checkbox"
                      checked={enableVideoGeneration}
                      onChange={(event) => setEnableVideoGeneration(event.target.checked)}
                    />
                  </label>
                  <label className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm">
                    <span>Generate TTS audio</span>
                    <input
                      type="checkbox"
                      checked={enableTTS}
                      onChange={(event) => setEnableTTS(event.target.checked)}
                    />
                  </label>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-800" htmlFor="mode">
                    Agent mode
                  </label>
                  <select
                    id="mode"
                    value={agentMode}
                    onChange={(event) =>
                      setAgentMode(event.target.value === 'generate' ? 'generate' : 'default')
                    }
                    className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900"
                  >
                    <option value="default">Use the default classroom agents</option>
                    <option value="generate">Ask OpenMAIC to generate custom agents</option>
                  </select>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="inline-flex items-center rounded-2xl bg-slate-950 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-400"
                >
                  {loading ? 'Generating with OpenMAIC...' : 'Generate draft course'}
                </button>
              </form>
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-slate-950 p-8 text-slate-100 shadow-[0_20px_60px_rgba(15,23,42,0.18)]">
              <h2 className="text-2xl font-semibold">OpenMAIC run status</h2>
              <p className="mt-2 text-sm text-slate-300">
                Watch the generation pipeline live so you know whether OpenMAIC is still working or
                has failed.
              </p>

              {error ? (
                <div className="mt-6 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-100">
                  {error}
                </div>
              ) : null}

              {loading || progress ? (
                <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-slate-200">
                  <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-slate-300">
                    <span>{progress?.step.replace(/_/g, ' ') || 'queued'}</span>
                    <span>{progress?.progress ?? 0}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-white/10">
                    <div
                      className="h-full rounded-full bg-sky-400 transition-all duration-500"
                      style={{ width: `${Math.max(4, progress?.progress ?? 0)}%` }}
                    />
                  </div>
                  <p className="mt-3 text-sm text-slate-100">
                    {progress?.message || 'Waiting for the generation stream'}
                  </p>
                  {typeof progress?.scenesGenerated === 'number' ? (
                    <p className="mt-1 text-xs text-slate-400">
                      Scenes generated: {progress.scenesGenerated}
                      {typeof progress.totalScenes === 'number'
                        ? ` / ${progress.totalScenes}`
                        : ''}
                    </p>
                  ) : null}
                </div>
              ) : (
                <div className="mt-6 rounded-3xl border border-dashed border-white/15 bg-white/5 p-5 text-sm text-slate-300">
                  No active run. Start a generation request or load an existing draft below.
                </div>
              )}

              {result ? (
                <div className="mt-6 rounded-3xl border border-emerald-400/30 bg-emerald-400/10 p-5">
                  <div className="text-sm font-semibold text-emerald-200">
                    Draft created successfully
                  </div>
                  <div className="mt-3 space-y-2 text-xs text-emerald-50/90">
                    <p>
                      <span className="font-semibold">Draft ID:</span>{' '}
                      <span className="font-mono">{result.draftId}</span>
                    </p>
                    <p>
                      <span className="font-semibold">Output folder:</span>{' '}
                      <span className="font-mono">{result.outputDirRelative}</span>
                    </p>
                    <p>
                      <span className="font-semibold">Classroom URL:</span>{' '}
                      <a className="underline" href={result.classroomUrl}>
                        {result.classroomUrl}
                      </a>
                    </p>
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-[28px] border border-slate-200 bg-white/90 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
              <h2 className="text-2xl font-semibold text-slate-950">2. Load a saved draft</h2>
              <p className="mt-2 text-sm text-slate-600">
                Existing drafts are stored on the server. Load one to continue editing.
              </p>
              <div className="mt-6 space-y-3">
                {drafts.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm text-slate-500">
                    No draft has been generated yet.
                  </div>
                ) : (
                  drafts.map((item) => (
                    <button
                      key={item.draftId}
                      type="button"
                      onClick={() => void loadDraft(item.draftId)}
                      className="flex w-full items-start justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-left transition hover:border-sky-300 hover:bg-sky-50"
                    >
                      <div>
                        <div className="text-sm font-semibold text-slate-900">{item.title}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.outputDirRelative}</div>
                      </div>
                      <div
                        className={`rounded-full border px-3 py-1 text-[11px] font-medium ${statusBadge(item.status)}`}
                      >
                        {item.status} · {item.approvedScenesCount}/{item.scenesCount}
                      </div>
                    </button>
                  ))
                )}
              </div>
            </section>
          </div>

          <section className="rounded-[28px] border border-slate-200 bg-white/95 p-8 shadow-[0_20px_60px_rgba(15,23,42,0.08)]">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-2xl font-semibold text-slate-950">3. Edit the draft</h2>
                <p className="mt-2 max-w-2xl text-sm text-slate-600">
                  V1 editing supports slide title/text, teacher script text, quiz questions and
                  answers, plus interactive scene title and instructions.
                </p>
              </div>
              {draft ? (
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void saveDraftChanges()}
                    disabled={saving}
                    className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50 disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save draft'}
                  </button>
                  <button
                    type="button"
                    onClick={() => void approveLesson(true)}
                    className="rounded-2xl border border-emerald-300 bg-emerald-50 px-4 py-2 text-sm font-medium text-emerald-700 transition hover:bg-emerald-100"
                  >
                    Approve lesson
                  </button>
                  <button
                    type="button"
                    onClick={() => void finalizeCourse()}
                    disabled={finalizing}
                    className="rounded-2xl bg-slate-950 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-50"
                  >
                    {finalizing ? 'Generating final course...' : 'Generate final course'}
                  </button>
                </div>
              ) : null}
            </div>

            {!draft ? (
              <div className="mt-8 rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
                Generate a draft or load an existing one to start editing.
              </div>
            ) : (
              <div className="mt-8 grid gap-8 xl:grid-cols-[280px_minmax(0,1fr)]">
                <aside className="space-y-4">
                  <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                    <div className="text-sm font-semibold text-slate-900">{draft.stage.name}</div>
                    <div className="mt-2 text-xs text-slate-500">
                      Draft status: <span className="font-medium">{draft.status}</span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      Approved scenes: {approvedScenesCount}/{draft.editableScenes.length}
                    </div>
                    {finalPath ? (
                      <div className="mt-3 rounded-2xl border border-violet-200 bg-violet-50 p-3 text-xs text-violet-700">
                        <div>
                          Final course saved to <span className="font-mono">{finalPath}</span>
                        </div>
                        {finalClassroomUrl ? (
                          <a
                            href={finalClassroomUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-3 inline-flex rounded-xl border border-violet-300 bg-white px-3 py-1.5 font-medium text-violet-700 transition hover:bg-violet-100"
                          >
                            Open final course
                          </a>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  <div className="space-y-2">
                    {draft.editableScenes
                      .slice()
                      .sort((a, b) => a.order - b.order)
                      .map((scene) => (
                        <button
                          key={scene.sceneId}
                          type="button"
                          onClick={() => setSelectedSceneId(scene.sceneId)}
                          className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                            selectedSceneId === scene.sceneId
                              ? 'border-sky-400 bg-sky-50'
                              : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-xs uppercase tracking-[0.18em] text-sky-700">
                              {scene.type}
                            </span>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusBadge(scene.status)}`}
                            >
                              {scene.status}
                            </span>
                          </div>
                          <div className="mt-2 text-sm font-medium text-slate-900">
                            {scene.order}. {scene.title}
                          </div>
                        </button>
                      ))}
                  </div>
                </aside>

                <div>
                  {selectedScene ? (
                    <div className="space-y-6">
                      <section className="rounded-3xl border border-slate-200 bg-slate-50 p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                          <div>
                            <div className="text-xs uppercase tracking-[0.18em] text-sky-700">
                              {selectedScene.type}
                            </div>
                            <input
                              value={selectedScene.title}
                              onChange={(event) =>
                                updateScene((scene) => ({
                                  ...scene,
                                  title: event.target.value,
                                }))
                              }
                              className="mt-2 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xl font-semibold text-slate-950"
                            />
                          </div>
                          <div className="flex gap-3">
                            <button
                              type="button"
                              onClick={() => void approveScene(selectedScene.status !== 'approved')}
                              className="rounded-2xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-white"
                            >
                              {selectedScene.status === 'approved'
                                ? 'Unapprove scene'
                                : 'Approve scene'}
                            </button>
                          </div>
                        </div>
                      </section>

                      <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                        <div className="space-y-6">
                          {selectedScene.blocks.map((block, blockIndex) => (
                            <article
                              key={block.id}
                              className="rounded-3xl border border-slate-200 bg-white p-5"
                            >
                              {block.type === 'slide_text' ? (
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">
                                    {block.label}
                                  </div>
                                  <textarea
                                    value={block.plainText}
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
                                    className="mt-3 min-h-32 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900"
                                  />
                                </div>
                              ) : null}

                              {block.type === 'script' ? (
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">
                                    Script segment {blockIndex + 1}
                                  </div>
                                  <textarea
                                    value={block.text}
                                    onChange={(event) =>
                                      updateScene((scene) => ({
                                        ...scene,
                                        blocks: scene.blocks.map((candidate) =>
                                          candidate.id === block.id
                                            ? {
                                                ...candidate,
                                                text: event.target.value,
                                              }
                                            : candidate,
                                        ),
                                      }))
                                    }
                                    className="mt-3 min-h-28 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900"
                                  />
                                </div>
                              ) : null}

                              {block.type === 'quiz_question' ? (
                                <div className="space-y-4">
                                  <div className="text-sm font-semibold text-slate-900">
                                    Quiz question {blockIndex + 1}
                                  </div>
                                  <textarea
                                    value={block.question}
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
                                    className="min-h-24 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900"
                                  />
                                  <div className="grid gap-3">
                                    {block.options.map((option, optionIndex) => (
                                      <div
                                        key={`${block.id}_${option.value}`}
                                        className="rounded-2xl border border-slate-200 bg-slate-50 p-3"
                                      >
                                        <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                          Option {option.value}
                                        </div>
                                        <input
                                          value={option.label}
                                          onChange={(event) =>
                                            updateScene((scene) => ({
                                              ...scene,
                                              blocks: scene.blocks.map((candidate) =>
                                                candidate.id === block.id &&
                                                candidate.type === 'quiz_question'
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
                                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                        />
                                      </div>
                                    ))}
                                  </div>
                                  <div>
                                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                      Correct answer values
                                    </div>
                                    <input
                                      value={block.correctAnswer.join(',')}
                                      onChange={(event) =>
                                        updateScene((scene) => ({
                                          ...scene,
                                          blocks: scene.blocks.map((candidate) =>
                                            candidate.id === block.id
                                              ? {
                                                  ...candidate,
                                                  correctAnswer: event.target.value
                                                    .split(',')
                                                    .map((value) => value.trim())
                                                    .filter(Boolean),
                                                }
                                              : candidate,
                                          ),
                                        }))
                                      }
                                      className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900"
                                    />
                                  </div>
                                  <div>
                                    <div className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                      Explanation
                                    </div>
                                    <textarea
                                      value={block.explanation}
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
                                      className="min-h-24 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900"
                                    />
                                  </div>
                                </div>
                              ) : null}

                              {block.type === 'interactive_instruction' ? (
                                <div>
                                  <div className="text-sm font-semibold text-slate-900">
                                    Interactive instructions
                                  </div>
                                  <textarea
                                    value={block.text}
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
                                    className="mt-3 min-h-32 w-full rounded-2xl border border-slate-300 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-900"
                                  />
                                </div>
                              ) : null}
                            </article>
                          ))}
                        </div>

                        <div className="space-y-6">
                          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                            <div className="text-sm font-semibold text-slate-900">Preview</div>
                            <div className="mt-4 rounded-3xl border border-slate-200 bg-white p-5">
                              <h3 className="text-xl font-semibold text-slate-950">
                                {selectedScene.title}
                              </h3>
                              <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
                                {selectedScene.blocks
                                  .filter(
                                    (block) =>
                                      block.type === 'slide_text' ||
                                      block.type === 'interactive_instruction',
                                  )
                                  .map((block) => (
                                    <div
                                      key={`preview_${block.id}`}
                                      className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                    >
                                      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                                        {block.type}
                                      </div>
                                      <p className="mt-2 whitespace-pre-wrap text-slate-700">
                                        {plainTextPreview(block)}
                                      </p>
                                    </div>
                                  ))}

                                {selectedScene.type === 'quiz' ? (
                                  <div className="space-y-3">
                                    {selectedScene.blocks
                                      .filter(
                                        (block): block is EditableQuizQuestionBlock =>
                                          block.type === 'quiz_question',
                                      )
                                      .map((question, index) => (
                                        <div
                                          key={`preview_${question.id}`}
                                          className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                                        >
                                          <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                                            Question {index + 1}
                                          </div>
                                          <p className="mt-2 font-medium text-slate-900">
                                            {question.question}
                                          </p>
                                          <ul className="mt-3 space-y-2 text-sm text-slate-700">
                                            {question.options.map((option) => (
                                              <li key={option.value}>
                                                {option.value}. {option.label}
                                              </li>
                                            ))}
                                          </ul>
                                          <p className="mt-3 text-xs text-slate-500">
                                            Correct answer: {question.correctAnswer.join(', ') || '—'}
                                          </p>
                                        </div>
                                      ))}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </section>

                          <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                            <div className="text-sm font-semibold text-slate-900">
                              Teacher script preview
                            </div>
                            <div className="mt-4 space-y-3">
                              {selectedScene.blocks
                                .filter(
                                  (block): block is EditableScriptBlock => block.type === 'script',
                                )
                                .map((block, index) => (
                                  <div
                                    key={`script_preview_${block.id}`}
                                    className="rounded-2xl border border-slate-200 bg-white p-4 text-sm leading-6 text-slate-700"
                                  >
                                    <div className="mb-2 text-xs uppercase tracking-[0.14em] text-slate-500">
                                      Speech {index + 1}
                                    </div>
                                    {block.text}
                                  </div>
                                ))}
                            </div>
                          </section>

                          {selectedScene.type === 'interactive' && selectedScene.readonlyHtml ? (
                            <section className="rounded-3xl border border-slate-200 bg-slate-50 p-5">
                              <div className="text-sm font-semibold text-slate-900">
                                Raw interactive HTML
                              </div>
                              <textarea
                                readOnly
                                value={selectedScene.readonlyHtml}
                                className="mt-4 min-h-56 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-xs leading-5 text-slate-700"
                              />
                            </section>
                          ) : null}
                        </div>
                      </section>
                    </div>
                  ) : (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-8 text-sm text-slate-500">
                      Select a scene from the left to edit it.
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>
        </section>
      </div>
    </main>
  );
}
