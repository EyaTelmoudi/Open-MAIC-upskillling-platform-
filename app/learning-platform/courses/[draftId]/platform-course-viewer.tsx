'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FinalizedCoursePackage } from '@/lib/learing-expert-agent/types';
import type { Scene } from '@/lib/types/stage';
import type { SpeechAction } from '@/lib/types/action';
import { SceneRenderer } from '@/components/stage/scene-renderer';
import { SceneProvider } from '@/lib/contexts/scene-context';
import { useStageStore } from '@/lib/store/stage';
import { useCanvasStore } from '@/lib/store/canvas';
import { createAudioPlayer } from '@/lib/utils/audio-player';

function stripHtml(value: string): string {
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function sceneSummary(scene: Scene): string {
  if (scene.type === 'slide' && scene.content.type === 'slide') {
    const text = scene.content.canvas.elements
      .filter((element) => element.type === 'text' && 'content' in element)
      .map((element) => stripHtml(String(element.content || '')))
      .filter(Boolean)
      .join(' ');
    return text.slice(0, 120) || 'Slide lesson';
  }

  if (scene.type === 'quiz' && scene.content.type === 'quiz') {
    return `${scene.content.questions.length} question${scene.content.questions.length === 1 ? '' : 's'}`;
  }

  if (scene.type === 'interactive') {
    return 'Interactive practice';
  }

  return scene.title;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function speechDurationMs(action: SpeechAction): number {
  const words = action.text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(9000, Math.max(2200, words * 260));
}

function AnimatedSlidePreview({
  scene,
  activeSpeech,
  isPlaying,
  onReplay,
}: {
  scene: Scene;
  activeSpeech: string | null;
  isPlaying: boolean;
  onReplay: () => void;
}) {
  const setStage = useStageStore((state) => state.setStage);
  const setScenes = useStageStore((state) => state.setScenes);
  const setCurrentSceneId = useStageStore((state) => state.setCurrentSceneId);
  const resetCanvasState = useCanvasStore((state) => state.resetCanvasState);

  useEffect(() => {
    setStage({
      id: scene.stageId,
      name: scene.title,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      languageDirective: undefined,
      style: 'interactive',
    });
    setScenes([scene]);
    setCurrentSceneId(scene.id);
    resetCanvasState();
  }, [resetCanvasState, scene, setCurrentSceneId, setScenes, setStage]);

  return (
    <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
      <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
        <div>
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Animated Slide Preview
          </div>
          <div className="mt-1 text-sm text-slate-500">
            This uses the real OpenMAIC slide renderer inside your platform page.
          </div>
        </div>
        <button
          type="button"
          onClick={onReplay}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
        >
          Replay animation
        </button>
      </div>

      <div className="bg-slate-100 px-5 py-5">
        <div className="mx-auto aspect-[16/9] w-full max-w-5xl overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <SceneProvider>
            <SceneRenderer scene={scene} mode="playback" />
          </SceneProvider>
        </div>
      </div>

      <div className="border-t border-slate-200 bg-slate-950 px-6 py-4 text-slate-100">
        <div className="flex items-center justify-between gap-4">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
            Live Narration
          </div>
          <div className="text-[11px] text-slate-400">{isPlaying ? 'Playing' : 'Ready'}</div>
        </div>
        <div className="mt-3 min-h-16 rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm leading-7 text-slate-200">
          {activeSpeech || 'The animated teacher script will appear here while the slide plays.'}
        </div>
      </div>
    </section>
  );
}

function renderSlide(scene: Scene) {
  return null;
}

function renderSlideDetails(
  scene: Scene,
  activeSpeech: string | null,
  isPlaying: boolean,
  onReplay: () => void,
) {
  if (scene.content.type !== 'slide') return null;

  const textElements = scene.content.canvas.elements.filter(
    (element) => element.type === 'text' && 'content' in element,
  );

  return (
    <div className="space-y-5">
      <AnimatedSlidePreview
        scene={scene}
        activeSpeech={activeSpeech}
        isPlaying={isPlaying}
        onReplay={onReplay}
      />
      {textElements.map((element) => (
        <section
          key={element.id}
          className="rounded-3xl border border-slate-200 bg-white px-6 py-5 shadow-sm"
        >
          <div
            className="prose prose-slate max-w-none text-sm leading-7"
            dangerouslySetInnerHTML={{ __html: String(element.content || '') }}
          />
        </section>
      ))}
    </div>
  );
}

function renderQuiz(scene: Scene) {
  if (scene.content.type !== 'quiz') return null;

  return (
    <div className="space-y-5">
      {scene.content.questions.map((question, index) => (
        <article
          key={question.id}
          className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"
        >
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Question {index + 1}
          </div>
          <h3 className="mt-2 text-lg font-semibold text-slate-950">{question.question}</h3>
          <div className="mt-4 space-y-3">
            {(question.options || []).map((option) => {
              const isCorrect = (question.answer || []).includes(option.value);
              return (
                <div
                  key={option.value}
                  className={`rounded-2xl border px-4 py-3 text-sm ${
                    isCorrect
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                  }`}
                >
                  <span className="font-semibold">{option.value}.</span> {option.label}
                </div>
              );
            })}
          </div>
          {question.analysis ? (
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
              <span className="font-semibold text-slate-900">Explanation:</span> {question.analysis}
            </div>
          ) : null}
        </article>
      ))}
    </div>
  );
}

function renderInteractive(scene: Scene) {
  if (scene.content.type !== 'interactive') return null;

  return (
    <div className="space-y-5">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
          Interactive Lesson
        </div>
        <h3 className="mt-2 text-lg font-semibold text-slate-950">{scene.title}</h3>
        {scene.actions?.some((action) => action.type === 'speech') ? (
          <div className="mt-4 space-y-3">
            {scene.actions
              ?.filter((action) => action.type === 'speech')
              .map((action) => (
                <div
                  key={action.id}
                  className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700"
                >
                  {action.text}
                </div>
              ))}
          </div>
        ) : null}
      </section>

      {scene.content.html ? (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-6 py-4 text-sm font-semibold text-slate-900">
            Embedded Demo Preview
          </div>
          <iframe
            title={scene.title}
            srcDoc={scene.content.html}
            className="h-[520px] w-full bg-white"
            sandbox="allow-scripts allow-same-origin"
          />
        </section>
      ) : null}
    </div>
  );
}

function renderNarration(scene: Scene) {
  const speech = (scene.actions || []).filter((action): action is SpeechAction => action.type === 'speech');
  if (speech.length === 0) return null;

  return (
    <section className="rounded-3xl border border-slate-200 bg-slate-950 p-6 text-slate-100 shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-300">
        Teacher Script
      </div>
      <div className="mt-4 space-y-3 text-sm leading-7 text-slate-200">
        {speech.map((action, index) => (
          <p key={action.id}>
            <span className="mr-2 rounded-full border border-slate-700 px-2 py-0.5 text-[11px] font-semibold text-slate-300">
              {index + 1}
            </span>
            {action.text}
          </p>
        ))}
      </div>
    </section>
  );
}

export function PlatformCourseViewer({ course }: { course: FinalizedCoursePackage }) {
  const orderedScenes = useMemo(
    () => course.scenes.slice().sort((a, b) => a.order - b.order),
    [course.scenes],
  );
  const [selectedSceneId, setSelectedSceneId] = useState<string>(orderedScenes[0]?.id || '');
  const [playbackState, setPlaybackState] = useState<'idle' | 'playing' | 'paused'>('idle');
  const [activeSpeech, setActiveSpeech] = useState<string | null>(null);
  const audioPlayerRef = useRef(createAudioPlayer());
  const speechUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const playbackTokenRef = useRef(0);
  const playbackStateRef = useRef<'idle' | 'playing' | 'paused'>('idle');
  const selectedSceneIdRef = useRef(selectedSceneId);

  const selectedScene = useMemo(
    () => orderedScenes.find((scene) => scene.id === selectedSceneId) || orderedScenes[0] || null,
    [orderedScenes, selectedSceneId],
  );

  const selectedSceneIndex = useMemo(
    () => orderedScenes.findIndex((scene) => scene.id === selectedSceneId),
    [orderedScenes, selectedSceneId],
  );

  useEffect(() => {
    playbackStateRef.current = playbackState;
  }, [playbackState]);

  useEffect(() => {
    selectedSceneIdRef.current = selectedSceneId;
  }, [selectedSceneId]);

  const clearSpeech = useCallback(() => {
    setActiveSpeech(null);
    speechUtteranceRef.current = null;
  }, []);

  const stopCurrentSpeech = useCallback(() => {
    audioPlayerRef.current.stop();
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    clearSpeech();
  }, [clearSpeech]);

  const pauseCurrentSpeech = useCallback(() => {
    audioPlayerRef.current.pause();
    if (typeof window !== 'undefined' && window.speechSynthesis?.speaking) {
      window.speechSynthesis.pause();
    }
  }, []);

  const resumeCurrentSpeech = useCallback(() => {
    audioPlayerRef.current.resume();
    if (typeof window !== 'undefined' && window.speechSynthesis?.paused) {
      window.speechSynthesis.resume();
    }
  }, []);

  const clearVisuals = useCallback(() => {
    useCanvasStore.getState().clearAllEffects();
  }, []);

  const waitWhilePaused = useCallback(async (token: number) => {
    while (playbackStateRef.current === 'paused' && playbackTokenRef.current === token) {
      await wait(120);
    }
    return playbackTokenRef.current === token;
  }, []);

  const pausableDelay = useCallback(
    async (ms: number, token: number) => {
      const startedAt = Date.now();
      while (Date.now() - startedAt < ms) {
        if (playbackTokenRef.current !== token) return false;
        const ok = await waitWhilePaused(token);
        if (!ok) return false;
        await wait(120);
      }
      return playbackTokenRef.current === token;
    },
    [waitWhilePaused],
  );

  const speakWithBrowserVoice = useCallback(
    async (text: string, token: number) => {
      if (typeof window === 'undefined' || !window.speechSynthesis) {
        return pausableDelay(Math.max(1800, Math.min(9000, text.split(/\s+/).length * 260)), token);
      }

      return new Promise<boolean>((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        speechUtteranceRef.current = utterance;
        utterance.onend = () => resolve(playbackTokenRef.current === token);
        utterance.onerror = () => resolve(playbackTokenRef.current === token);
        window.speechSynthesis.speak(utterance);
      });
    },
    [pausableDelay],
  );

  const playSpeechAction = useCallback(
    async (action: SpeechAction, token: number) => {
      setActiveSpeech(action.text);

      const hasGeneratedAudio = Boolean(action.audioUrl || action.audioId);
      if (hasGeneratedAudio) {
        try {
          const started = await audioPlayerRef.current.play(action.audioId || '', action.audioUrl);
          if (started) {
            while (playbackTokenRef.current === token && audioPlayerRef.current.hasActiveAudio()) {
              const ok = await waitWhilePaused(token);
              if (!ok) return false;
              await wait(120);
            }
            return playbackTokenRef.current === token;
          }
        } catch {
          // Fall back to browser TTS below
        }
      }

      return speakWithBrowserVoice(action.text, token);
    },
    [speakWithBrowserVoice, waitWhilePaused],
  );

  const runSceneActions = useCallback(
    async (scene: Scene, token: number) => {
      clearVisuals();
      clearSpeech();
      await wait(250);

      for (const action of scene.actions || []) {
        if (playbackTokenRef.current !== token) return false;
        const ok = await waitWhilePaused(token);
        if (!ok) return false;

        if (action.type === 'spotlight') {
          useCanvasStore.getState().setSpotlight(action.elementId, {
            dimness: action.dimOpacity ?? 0.6,
          });
          const continued = await pausableDelay(1800, token);
          if (!continued) return false;
          continue;
        }

        if (action.type === 'laser') {
          useCanvasStore.getState().setLaser(action.elementId, {
            color: action.color ?? '#ff3b30',
          });
          const continued = await pausableDelay(1400, token);
          useCanvasStore.getState().clearLaser();
          if (!continued) return false;
          continue;
        }

        if (action.type === 'speech') {
          const continued = await playSpeechAction(action, token);
          if (!continued) return false;
          continue;
        }
      }

      clearVisuals();
      clearSpeech();
      return pausableDelay(700, token);
    },
    [clearSpeech, clearVisuals, pausableDelay, playSpeechAction, waitWhilePaused],
  );

  const stopPlayback = useCallback(() => {
    playbackTokenRef.current += 1;
    setPlaybackState('idle');
    stopCurrentSpeech();
    clearVisuals();
  }, [clearVisuals, stopCurrentSpeech]);

  const startPlaybackFrom = useCallback(
    async (sceneId: string) => {
      const token = ++playbackTokenRef.current;
      setPlaybackState('playing');

      const startIndex = orderedScenes.findIndex((scene) => scene.id === sceneId);
      const firstIndex = startIndex >= 0 ? startIndex : 0;

      for (let index = firstIndex; index < orderedScenes.length; index++) {
        if (playbackTokenRef.current !== token) return;
        setSelectedSceneId(orderedScenes[index].id);
        await wait(180);

        const completed = await runSceneActions(orderedScenes[index], token);
        if (!completed || playbackTokenRef.current !== token) return;
      }

      if (playbackTokenRef.current === token) {
        setPlaybackState('idle');
        clearVisuals();
        clearSpeech();
      }
    },
    [clearSpeech, clearVisuals, orderedScenes, runSceneActions],
  );

  const handlePlayPause = useCallback(() => {
    if (!selectedScene) return;

    if (playbackStateRef.current === 'playing') {
      setPlaybackState('paused');
      pauseCurrentSpeech();
      return;
    }

    if (playbackStateRef.current === 'paused') {
      setPlaybackState('playing');
      resumeCurrentSpeech();
      return;
    }

    void startPlaybackFrom(selectedScene.id);
  }, [pauseCurrentSpeech, resumeCurrentSpeech, selectedScene, startPlaybackFrom]);

  const handleSceneSelection = useCallback(
    (sceneId: string) => {
      stopPlayback();
      setSelectedSceneId(sceneId);
    },
    [stopPlayback],
  );

  const handleNext = useCallback(() => {
    const nextIndex = Math.min(orderedScenes.length - 1, selectedSceneIndex + 1);
    stopPlayback();
    setSelectedSceneId(orderedScenes[nextIndex]?.id || orderedScenes[0]?.id || '');
  }, [orderedScenes, selectedSceneIndex, stopPlayback]);

  const handlePrevious = useCallback(() => {
    const prevIndex = Math.max(0, selectedSceneIndex - 1);
    stopPlayback();
    setSelectedSceneId(orderedScenes[prevIndex]?.id || orderedScenes[0]?.id || '');
  }, [orderedScenes, selectedSceneIndex, stopPlayback]);

  const handleReplayCurrent = useCallback(() => {
    if (!selectedScene) return;
    stopPlayback();
    void startPlaybackFrom(selectedScene.id);
  }, [selectedScene, startPlaybackFrom, stopPlayback]);

  useEffect(() => {
    return () => {
      stopPlayback();
      audioPlayerRef.current.destroy();
    };
  }, [stopPlayback]);

  if (!selectedScene) {
    return <div className="text-sm text-slate-500">No scenes were found in this finalized course.</div>;
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,_#f8fafc_0%,_#e2e8f0_100%)] text-slate-900">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 py-10">
        <section className="overflow-hidden rounded-[32px] border border-slate-200 bg-[linear-gradient(135deg,_#0f172a_0%,_#1e293b_45%,_#0ea5e9_100%)] p-8 text-white shadow-[0_30px_100px_rgba(15,23,42,0.24)]">
          <div className="inline-flex rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-sky-100">
            Learning Platform Preview
          </div>
          <h1 className="mt-4 max-w-4xl text-4xl font-semibold tracking-tight">
            {course.stage.name}
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-6 text-slate-100/85">
            This page shows how your platform can present the finalized OpenMAIC output without
            using the native classroom template. The data source is the approved final course JSON.
          </p>
          <div className="mt-6 flex flex-wrap gap-3 text-xs text-sky-100/90">
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
              {orderedScenes.length} lesson scenes
            </span>
            <span className="rounded-full border border-white/15 bg-white/10 px-3 py-1">
              Generated {new Date(course.generatedAt).toLocaleString()}
            </span>
          </div>
            <div className="mt-6 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={handlePrevious}
                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
              >
                Previous lesson
              </button>
              <button
                type="button"
                onClick={handlePlayPause}
                className="rounded-xl bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-100"
              >
                {playbackState === 'playing'
                  ? 'Pause'
                  : playbackState === 'paused'
                    ? 'Resume'
                    : 'Play full lesson'}
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="rounded-xl border border-white/15 bg-white/10 px-4 py-2 text-sm font-medium text-white transition hover:bg-white/15"
              >
                Next lesson
              </button>
            </div>
        </section>

        <section className="grid gap-8 xl:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="rounded-[28px] border border-slate-200 bg-white/95 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
            <div className="mb-4 text-sm font-semibold text-slate-950">Course Lessons</div>
            <div className="space-y-2">
              {orderedScenes.map((scene) => (
                  <button
                    key={scene.id}
                    type="button"
                    onClick={() => handleSceneSelection(scene.id)}
                    className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                      selectedScene.id === scene.id
                        ? 'border-sky-300 bg-sky-50'
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                        {scene.type}
                      </span>
                      <span className="text-xs text-slate-400">{scene.order}</span>
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900">{scene.title}</div>
                    <div className="mt-1 text-xs leading-5 text-slate-500">{sceneSummary(scene)}</div>
                  </button>
                ))}
            </div>
          </aside>

          <main className="space-y-6">
            <section className="rounded-[28px] border border-slate-200 bg-white/95 p-6 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Current Lesson
              </div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                {selectedScene.title}
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                This is a platform-style lesson presentation built from the finalized course data,
                separate from OpenMAIC’s native classroom player.
              </p>
              <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  State: {playbackState}
                </span>
                <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                  Lesson {selectedSceneIndex + 1} / {orderedScenes.length}
                </span>
              </div>
            </section>

            {selectedScene.type === 'slide'
              ? renderSlideDetails(selectedScene, activeSpeech, playbackState === 'playing', handleReplayCurrent)
              : null}
            {selectedScene.type === 'quiz' ? renderQuiz(selectedScene) : null}
            {selectedScene.type === 'interactive' ? renderInteractive(selectedScene) : null}
            {renderNarration(selectedScene)}
          </main>
        </section>
      </div>
    </div>
  );
}
