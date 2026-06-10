'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, FileText, FolderOpen, Loader2, Sparkles } from 'lucide-react';

import { Badge } from '@/app/components/ui/Badge';
import { Button } from '@/app/components/ui/Button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/app/components/ui/Card';
import { Input } from '@/app/components/ui/Input';
import { Textarea } from '@/app/components/ui/Textarea';
import { useAuth } from '@/app/context/AuthContext';
import type { TenantResponse } from '@/app/lib/api';
import { routes } from '@/app/lib/routes';
import { formatDateForUser } from '@/app/lib/user-date-format';
import { AiCourseStudioNav } from '../ai-course-studio-nav';
import { canAccessCourseAuthoring } from '../permissions';

type DraftStatus = 'generating' | 'draft' | 'approved' | 'finalized';
type SceneDraftStatus = 'generating' | 'draft' | 'approved';
type SceneType = 'slide' | 'quiz' | 'interactive' | string;

type EditableSlideTextBlock = {
  id: string;
  type: 'slide_text';
  elementId: string;
  label: string;
  html: string;
  plainText: string;
};

type EditableScriptBlock = {
  id: string;
  type: 'script';
  actionId: string;
  text: string;
};

type EditableQuizQuestionBlock = {
  id: string;
  type: 'quiz_question';
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
  type: 'interactive_instruction';
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

type ActiveGenerationRun = {
  runId: string;
  active: boolean;
  status: 'running' | 'completed' | 'failed' | 'cancelled';
  sourcePdfName: string;
  promptPreview: string;
  startedAt: string;
  updatedAt: string;
  progress: ProgressState | null;
  result?: GenerationResponse | null;
  error?: string | null;
};

type FinalizeResponse = {
  success?: boolean;
  error?: string;
  draft: LearningExpertDraft;
  finalCoursePathRelative: string;
};

function formatDate(value: string, timezone?: string | null) {
  return formatDateForUser(value, timezone);
}

function statusVariant(status: DraftStatus | SceneDraftStatus) {
  if (status === 'generating') {
    return 'outline' as const;
  }
  if (status === 'approved' || status === 'finalized') {
    return 'default' as const;
  }
  return 'outline' as const;
}

function plainTextPreview(block: EditableBlock) {
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

const builderWorkflowSteps = [
  {
    step: '1',
    title: 'Prepare the source',
    description: 'Upload the PDF and define the learning goals.',
    className: 'border-emerald-100 bg-white/90',
    badgeClassName: 'bg-emerald-100 text-emerald-700',
  },
  {
    step: '2',
    title: 'Generate the draft',
    description: 'Launch generation and track progress live.',
    className: 'border-sky-100 bg-sky-50/80',
    badgeClassName: 'bg-sky-100 text-sky-700',
  },
  {
    step: '3',
    title: 'Continue the workflow',
    description: 'Open the draft in the editor, revise it, and send it to final review.',
    className: 'border-amber-100 bg-amber-50/80',
    badgeClassName: 'bg-amber-100 text-amber-700',
  },
];

export function AiCourseBuilderContent({
  showNavigation = true,
  superAdminTenantId,
  superAdminTenantOptions = [],
  superAdminTenantLoading = false,
  onSuperAdminTenantChange,
}: {
  showNavigation?: boolean;
  superAdminTenantId?: string;
  superAdminTenantOptions?: TenantResponse[];
  superAdminTenantLoading?: boolean;
  onSuperAdminTenantChange?: (tenantId: string) => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, isLoading } = useAuth();

  const [prompt, setPrompt] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [canceling, setCanceling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<ProgressState | null>(null);
  const [result, setResult] = useState<GenerationResponse | null>(null);
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [draft, setDraft] = useState<LearningExpertDraft | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string | null>(null);
  const [enableTTS] = useState(true);
  const [finalPath, setFinalPath] = useState<string | null>(null);
  const [activeRun, setActiveRun] = useState<ActiveGenerationRun | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const cancelRequestedRef = useRef(false);

  useEffect(() => {
    if (!isLoading && !canAccessCourseAuthoring(user?.role)) {
      router.replace(routes.adminCourses);
    }
  }, [isLoading, router, user?.role]);

  const selectedScene = useMemo(
    () => draft?.editableScenes.find((scene) => scene.sceneId === selectedSceneId) ?? null,
    [draft, selectedSceneId],
  );

  const approvedScenesCount =
    draft?.editableScenes.filter((scene) => scene.status === 'approved').length ?? 0;

  const loadDrafts = async () => {
    const response = await fetch('/api/ai-course-builder/drafts', { cache: 'no-store' });
    const data = (await response.json()) as {
      success?: boolean;
      drafts?: DraftSummary[];
      error?: string;
    };
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to load drafts');
    }
    setDrafts(data.drafts || []);
  };

  const loadDraft = async (
    draftId: string,
    options?: { allowNotReady?: boolean },
  ): Promise<LearningExpertDraft | null> => {
    const response = await fetch(`/api/ai-course-builder/drafts/${draftId}`, {
      cache: 'no-store',
    });
    const data = (await response.json()) as {
      success?: boolean;
      draft?: LearningExpertDraft;
      pending?: boolean;
      error?: string;
    };
    if (
      options?.allowNotReady &&
      (response.status === 404 || response.status === 202 || data.pending)
    ) {
      return null;
    }
    if (!response.ok || !data.success || !data.draft) {
      throw new Error(data.error || 'Failed to load draft');
    }
    const loadedDraft = data.draft;
    setDraft(loadedDraft);
    setSelectedSceneId((current) =>
      current && loadedDraft.editableScenes.some((scene) => scene.sceneId === current)
        ? current
        : (loadedDraft.editableScenes[0]?.sceneId ?? null),
    );
    setFinalPath(null);
    return loadedDraft;
  };

  useEffect(() => {
    void loadDrafts().catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load drafts');
    });
  }, []);

  useEffect(() => {
    const requestedDraftId = searchParams.get('draftId');
    if (!requestedDraftId) {
      return;
    }

    void loadDraft(requestedDraftId).catch((loadError) => {
      setError(loadError instanceof Error ? loadError.message : 'Failed to load draft');
    });
  }, [searchParams]);

  const loadActiveRun = async () => {
    const response = await fetch('/api/ai-course-builder/active-run', { cache: 'no-store' });
    const data = (await response.json()) as {
      success?: boolean;
      run?: ActiveGenerationRun | null;
      error?: string;
    };
    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Failed to load active generation run');
    }
    setActiveRun(data.run || null);

    if (data.run?.active && data.run.progress) {
      setLoading(true);
      setProgress(data.run.progress);
    } else if (data.run?.status === 'completed') {
      setLoading(false);
      setProgress(data.run.progress || null);
      if (data.run.result) {
        setResult(data.run.result);
      }
    } else if (data.run?.status === 'failed') {
      setLoading(false);
      setProgress(data.run.progress || null);
      if (data.run.error) {
        setError(data.run.error);
      }
    } else if (data.run?.status === 'cancelled') {
      setLoading(false);
      setProgress(data.run.progress || null);
      setError(null);
    } else {
      setLoading(false);
      setProgress(null);
    }
  };

  useEffect(() => {
    void loadActiveRun().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!activeRun?.active) {
      return;
    }

    const interval = window.setInterval(() => {
      void loadActiveRun().catch(() => undefined);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [activeRun?.active]);

  useEffect(() => {
    if (!loading || !draft || draft.status !== 'generating') {
      return;
    }

    const interval = window.setInterval(() => {
      void loadDraft(draft.draftId, { allowNotReady: true }).catch(() => undefined);
    }, 3000);

    return () => window.clearInterval(interval);
  }, [draft, loading]);

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
      throw new Error('No draft loaded');
    }

    const response = await fetch(`/api/ai-course-builder/drafts/${draft.draftId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft }),
    });
    const data = (await response.json()) as {
      success?: boolean;
      draft?: LearningExpertDraft;
      error?: string;
    };
    if (!response.ok || !data.success || !data.draft) {
      throw new Error(data.error || 'Failed to save draft');
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
      setError(saveError instanceof Error ? saveError.message : 'Failed to save draft');
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ sceneId: selectedScene.sceneId, approved }),
        },
      );
      const data = (await response.json()) as {
        success?: boolean;
        draft?: LearningExpertDraft;
        error?: string;
      };
      if (!response.ok || !data.success || !data.draft) {
        throw new Error(data.error || 'Failed to update scene approval');
      }
      setDraft(data.draft);
      await loadDrafts();
    } catch (approveError) {
      setError(
        approveError instanceof Error ? approveError.message : 'Failed to update scene approval',
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
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ approved }),
        },
      );
      const data = (await response.json()) as {
        success?: boolean;
        draft?: LearningExpertDraft;
        error?: string;
      };
      if (!response.ok || !data.success || !data.draft) {
        throw new Error(data.error || 'Failed to update lesson approval');
      }
      setDraft(data.draft);
      await loadDrafts();
    } catch (approveError) {
      setError(
        approveError instanceof Error ? approveError.message : 'Failed to update lesson approval',
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
        { method: 'POST' },
      );
      const data = (await response.json()) as FinalizeResponse;
      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to finalize course');
      }
      setDraft(data.draft);
      setFinalPath(data.finalCoursePathRelative);
      await loadDrafts();
      router.push(routes.adminAiCourseReview(data.draft.draftId));
    } catch (finalizeError) {
      setError(
        finalizeError instanceof Error ? finalizeError.message : 'Failed to finalize course',
      );
    } finally {
      setFinalizing(false);
    }
  };

  const handleGenerate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!pdfFile && !prompt.trim()) {
      setError('Provide either a learning expert prompt, a PDF file, or both.');
      return;
    }
    if (user?.role === 'SuperAdmin' && !superAdminTenantId) {
      setError('Please choose the company that will own this generated course.');
      return;
    }

    setLoading(true);
    setError(null);
    setProgress({
      step: 'queued',
      progress: 0,
      message: 'Waiting for OpenMAIC to accept the generation request.',
    });
    setResult(null);
    setDraft(null);
    setFinalPath(null);
    cancelRequestedRef.current = false;

    try {
      const formData = new FormData();
      if (pdfFile) {
        formData.append('pdf', pdfFile);
      }
      formData.append('requirement', prompt.trim());
      formData.append('enableWebSearch', 'true');
      formData.append('enableImageGeneration', 'false');
      formData.append('enableVideoGeneration', 'false');
      formData.append('enableTTS', 'true');
      if (user?.role === 'SuperAdmin' && superAdminTenantId) {
        formData.append('tenantId', superAdminTenantId);
      }

      const controller = new AbortController();
      generationAbortRef.current = controller;

      const response = await fetch('/api/ai-course-builder/generate', {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      });

      if (!response.body) {
        throw new Error('The platform did not receive a readable progress stream.');
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

          let eventData:
            | {
                type: 'progress';
                step: string;
                progress: number;
                message: string;
                scenesGenerated?: number;
                totalScenes?: number;
                draftId?: string;
                classroomId?: string;
              }
            | { type: 'done'; data: GenerationResponse & { success: boolean } }
            | { type: 'error'; error: string };

          try {
            eventData = JSON.parse(trimmed) as
              | {
                  type: 'progress';
                  step: string;
                  progress: number;
                  message: string;
                  scenesGenerated?: number;
                  totalScenes?: number;
                  draftId?: string;
                  classroomId?: string;
                }
              | { type: 'done'; data: GenerationResponse & { success: boolean } }
              | { type: 'error'; error: string };
          } catch {
            if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html')) {
              throw new Error(
                'The platform received an HTML error page instead of generation data. Reload the page and try again.',
              );
            }
            throw new Error('The platform received an invalid generation stream response.');
          }

          if (eventData.type === 'progress') {
            setProgress({
              step: eventData.step,
              progress: eventData.progress,
              message: eventData.message,
              scenesGenerated: eventData.scenesGenerated,
              totalScenes: eventData.totalScenes,
            });
            if (eventData.draftId) {
              void loadDraft(eventData.draftId, { allowNotReady: true }).catch(() => undefined);
            }
          } else if (eventData.type === 'done') {
            doneReceived = true;
            setProgress({
              step: 'completed',
              progress: 100,
              message: 'The course generator agent finished the course draft successfully.',
            });
            setResult(eventData.data);
            await loadDraft(eventData.data.draftId);
            await loadDrafts();
          } else {
            throw new Error(eventData.error || 'Generation failed');
          }
        }
      }

      if (!doneReceived && !cancelRequestedRef.current) {
        throw new Error('Generation failed before completion.');
      }
    } catch (generateError) {
      if (
        cancelRequestedRef.current &&
        generateError instanceof DOMException &&
        generateError.name === 'AbortError'
      ) {
        setError(null);
        return;
      }
      setError(
        generateError instanceof Error ? generateError.message : 'Failed to generate course',
      );
      setProgress(null);
    } finally {
      generationAbortRef.current = null;
      setLoading(false);
    }
  };

  const handleCancelGeneration = async () => {
    setCanceling(true);
    setError(null);
    cancelRequestedRef.current = true;
    generationAbortRef.current?.abort();

    try {
      const response = await fetch('/api/ai-course-builder/cancel', {
        method: 'POST',
      });
      const data = (await response.json()) as {
        success?: boolean;
        cancelled?: boolean;
        error?: string;
      };

      if (!response.ok || !data.success) {
        throw new Error(data.error || 'Failed to cancel the active generation run.');
      }

      setActiveRun(null);
      setLoading(false);
      setProgress(null);
      setResult(null);
      setDraft(null);
      setFinalPath(null);
      await loadActiveRun().catch(() => undefined);
    } catch (cancelError) {
      cancelRequestedRef.current = false;
      setError(
        cancelError instanceof Error
          ? cancelError.message
          : 'Failed to cancel the active generation run.',
      );
    } finally {
      setCanceling(false);
    }
  };

  if (!isLoading && !canAccessCourseAuthoring(user?.role)) {
    return null;
  }

  return (
    <div className="space-y-6">
      {showNavigation ? <AiCourseStudioNav /> : null}

      <section className="overflow-hidden rounded-3xl border border-[#2A5B4A] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.22),_transparent_32%),radial-gradient(circle_at_76%_18%,_rgba(59,130,246,0.2),_transparent_26%),linear-gradient(135deg,_#102E2D_0%,_#132A3A_48%,_#0F172A_100%)] p-6 text-white shadow-[0_26px_70px_rgba(0,0,0,0.28)] sm:p-8">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
          <Sparkles className="h-3.5 w-3.5" />
          Admin and Learning Expert
        </div>
        <div className="mt-5 space-y-6">
          <div className="max-w-4xl">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">AI Course Builder</h2>
            <p className="mt-4 text-sm leading-7 text-slate-200 sm:text-base">
              AI Course Builder helps learning experts upload source material, launch generation,
              and move drafts into review without leaving the platform.
            </p>
            <div className="mt-6 flex flex-wrap gap-3 text-xs font-medium text-emerald-100">
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                AI-assisted course generation
              </span>
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                Live generation tracking
              </span>
              <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                Platform draft persistence
              </span>
            </div>
          </div>

          <div className="rounded-3xl border border-white/10 bg-white/10 p-5 backdrop-blur-sm">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="text-sm font-semibold uppercase tracking-[0.16em] text-emerald-100">
                  Workflow steps
                </div>
                <div className="mt-1 text-sm text-slate-300">From source to review</div>
              </div>
              <div className="hidden h-px flex-1 bg-white/10 lg:block" />
            </div>
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {builderWorkflowSteps.map((item) => (
                <div
                  key={item.step}
                  className={`rounded-3xl border p-5 shadow-sm transition ${item.className}`}
                >
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl text-sm font-semibold ${item.badgeClassName}`}
                  >
                    {item.step}
                  </div>
                  <div className="mt-4 min-w-0">
                    <div className="text-sm font-semibold text-slate-950">{item.title}</div>
                    <p className="mt-2 text-sm leading-6 text-slate-700">{item.description}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="space-y-6">
        <Card className="border-emerald-200 bg-[radial-gradient(circle_at_top_right,_rgba(16,185,129,0.14),_transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.98),rgba(240,253,250,0.96))] text-slate-950 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500 text-sm font-semibold text-white shadow-sm">
                1
              </div>
              <div>
                <CardTitle>Course inputs</CardTitle>
                <CardDescription>
                  Use a prompt, a source PDF, or both. The course generator can work from either
                  input alone, or combine both when available.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={handleGenerate}>
              {user?.role === 'SuperAdmin' ? (
                <div className="space-y-2">
                  <label className="text-sm font-medium text-slate-900" htmlFor="ai-course-tenant">
                    Company Workspace
                  </label>
                  <select
                    id="ai-course-tenant"
                    value={superAdminTenantId || ''}
                    onChange={(event) => onSuperAdminTenantChange?.(event.target.value)}
                    disabled={superAdminTenantLoading}
                    className="w-full rounded-xl border border-emerald-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="">
                      {superAdminTenantLoading
                        ? 'Loading companies...'
                        : 'Choose the company for this generated course'}
                    </option>
                    {superAdminTenantOptions.map((tenant) => (
                      <option key={tenant.id} value={tenant.id}>
                        {tenant.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-slate-500">
                    The generated draft and final course will be stored inside the selected company workspace.
                  </p>
                </div>
              ) : null}

              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-900" htmlFor="course-pdf">
                  PDF source file
                </label>
                <label
                  htmlFor="course-pdf"
                  className="block cursor-pointer rounded-3xl border border-emerald-200 bg-[linear-gradient(180deg,rgba(236,253,245,0.95),rgba(255,255,255,0.98))] p-5 transition hover:border-emerald-300 hover:bg-emerald-50/90"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500 text-white shadow-sm">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-950">
                        {pdfFile ? 'PDF selected' : 'Choose a PDF source if you have one'}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-slate-600">
                        {pdfFile
                          ? pdfFile.name
                          : 'Optional. Upload a PDF when the course should be grounded in source material.'}
                      </p>
                      <div className="mt-3 inline-flex items-center rounded-full border border-emerald-200 bg-white px-3 py-1 text-xs font-medium text-emerald-700">
                        {pdfFile ? 'Change file' : 'Browse PDF'}
                      </div>
                    </div>
                  </div>
                </label>
                <Input
                  id="course-pdf"
                  type="file"
                  accept="application/pdf"
                  className="sr-only"
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
                  className="min-h-[180px] bg-white text-slate-900 placeholder:text-slate-400"
                  placeholder="Optional when a PDF is attached. Example: Build a practical beginner course on Generative AI and LLMs. Use clear English, add quizzes after each major concept, and prepare teacher-friendly narration."
                />
              </div>

              <Button type="submit" disabled={loading || !!activeRun?.active}>
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
              {loading || activeRun?.active ? (
                <Button
                  type="button"
                  variant="outline"
                  className="border-red-200 bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800"
                  disabled={canceling}
                  onClick={() => void handleCancelGeneration()}
                >
                  {canceling ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Stopping
                    </>
                  ) : (
                    'Stop generation'
                  )}
                </Button>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <Card className="border-sky-200 bg-[radial-gradient(circle_at_top_right,_rgba(14,165,233,0.16),_transparent_30%),linear-gradient(180deg,rgba(248,252,255,1),rgba(239,246,255,0.98))] text-slate-950 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500 text-sm font-semibold text-white shadow-sm">
                2
              </div>
              <div>
                <CardTitle className="text-slate-950">Course generation status</CardTitle>
                <CardDescription className="text-slate-600">
                  Watch the generation pipeline live so you know whether the course generator agent
                  is still working or has failed.
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            ) : null}

            {progress ? (
              <div className="space-y-4 rounded-3xl border border-sky-100 bg-white/90 p-5 shadow-sm">
                <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-slate-500">
                  <span>{progress.step.replace(/_/g, ' ')}</span>
                  <span>{progress.progress}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-sky-100">
                  <div
                    className="h-full rounded-full bg-sky-500 transition-all duration-500"
                    style={{ width: `${Math.max(4, progress.progress)}%` }}
                  />
                </div>
                <p className="text-sm leading-6 text-slate-700">{progress.message}</p>
                {typeof progress.scenesGenerated === 'number' ? (
                  <p className="text-xs uppercase tracking-[0.14em] text-slate-500">
                    Scenes generated: {progress.scenesGenerated}
                    {typeof progress.totalScenes === 'number' ? ` / ${progress.totalScenes}` : ''}
                  </p>
                ) : null}
              </div>
            ) : (
              <div className="rounded-3xl border border-dashed border-sky-200 bg-sky-50/80 px-5 py-6 text-sm text-slate-600">
                No active run. Start a generation request or load an existing draft below.
              </div>
            )}

            {result ? (
              <div className="rounded-3xl border border-emerald-200 bg-emerald-50 p-5">
                <div className="flex items-center gap-2 text-sm font-medium text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Course draft created
                </div>
                <p className="mt-2 text-sm text-emerald-700">
                  {result.stage.name || 'Generated course'} with {result.scenesCount} scenes.
                </p>
              </div>
            ) : null}

            <Button
              variant="outline"
              className="border-sky-200 bg-white/90 text-slate-800 hover:bg-sky-50 hover:text-slate-900"
              onClick={() => router.push(routes.adminAiCourseDrafts)}
            >
              <FolderOpen className="h-4 w-4" />
              Open generated drafts
            </Button>
          </CardContent>
        </Card>

        {draft ? (
        <Card className="border-violet-200 bg-[radial-gradient(circle_at_top_right,_rgba(167,139,250,0.22),_transparent_30%),linear-gradient(180deg,rgba(250,245,255,0.98),rgba(245,243,255,0.98))] text-slate-950 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-500 text-sm font-semibold text-white shadow-sm">
                  3
                </div>
                <div>
                  <CardTitle>Current draft workspace</CardTitle>
                  <CardDescription>
                    The latest generated course appears here with direct actions to continue the
                    workflow.
                  </CardDescription>
                </div>
              </div>
              {draft ? <Badge variant={statusVariant(draft.status)}>{draft.status}</Badge> : null}
            </div>
          </CardHeader>
          <CardContent>
              <div className="space-y-5">
                <div className="rounded-3xl border border-violet-100 bg-white/90 p-5 shadow-sm">
                  <h3 className="text-lg font-semibold text-slate-950">
                    {draft.stage.name || 'Generated course draft'}
                  </h3>
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/80 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        Draft status
                      </div>
                      <div className="mt-1 text-sm font-medium text-slate-900">{draft.status}</div>
                    </div>
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/80 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        Approved scenes
                      </div>
                      <div className="mt-1 text-sm font-medium text-slate-900">
                        {approvedScenesCount}/{draft.editableScenes.length}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/80 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        Updated
                      </div>
                      <div className="mt-1 text-sm font-medium text-slate-900">
                        {formatDate(draft.updatedAt, user?.timezone)}
                      </div>
                    </div>
                    <div className="rounded-2xl border border-violet-100 bg-violet-50/80 px-4 py-3">
                      <div className="text-xs uppercase tracking-[0.14em] text-slate-500">
                        Submission ID
                      </div>
                      <div className="mt-1 break-all text-sm font-medium text-slate-900">
                        {draft.submissionId}
                      </div>
                    </div>
                  </div>
                  {finalPath ? (
                    <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                      Final course saved to {finalPath}
                    </div>
                  ) : null}
                  {draft.status === 'generating' ? (
                    <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                      Ready scenes can already be reviewed in the editor. Remaining scenes are still
                      being prepared.
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Button
                    variant="outline"
                    className="border-violet-200 bg-white/90 text-slate-800 hover:bg-violet-50 hover:text-slate-900"
                    onClick={() => router.push(routes.adminAiCourseEditor(draft.draftId))}
                  >
                    Open in Editor
                  </Button>
                  <Button
                    variant="outline"
                    className="border-violet-200 bg-white/90 text-slate-800 hover:bg-violet-50 hover:text-slate-900"
                    onClick={() => router.push(routes.adminAiCourseDrafts)}
                  >
                    Open Draft Library
                  </Button>
                  <Button
                    className="bg-slate-950 text-white hover:bg-slate-800 sm:col-span-2"
                    onClick={() => void finalizeCourse()}
                    disabled={finalizing || draft.status === 'generating'}
                  >
                    {finalizing ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Finalizing
                      </>
                    ) : draft.status === 'generating' ? (
                      'Wait for all scenes to finish'
                    ) : (
                      'Generate final course'
                    )}
                  </Button>
                </div>
              </div>
          </CardContent>
        </Card>
        ) : null}
      </div>
    </div>
  );
}
