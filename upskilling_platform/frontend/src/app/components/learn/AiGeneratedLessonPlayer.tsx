"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";

type LessonInput = {
  id: string;
  title: string;
  duration: number;
  content: string | null;
};

type SpeechAction = {
  id: string;
  type: "speech";
  text: string;
  audioUrl?: string;
};

type SceneAction =
  | SpeechAction
  | { id: string; type: string; elementId?: string };

type SlideTextElement = {
  id: string;
  type: "text";
  content?: string;
};

type SlideContent = {
  type: "slide";
  canvas?: {
    elements?: Array<SlideTextElement | { id: string; type: string; content?: string }>;
  };
};

type QuizQuestion = {
  id: string;
  question: string;
  options?: Array<{ value: string; label: string }>;
  answer?: string[];
  analysis?: string;
};

type QuizContent = {
  type: "quiz";
  questions?: QuizQuestion[];
};

type InteractiveContent = {
  type: "interactive";
  html?: string;
};

type GenericContent = {
  type: string;
};

type SceneContent = SlideContent | QuizContent | InteractiveContent | GenericContent;

type ParsedScene = {
  id: string;
  title: string;
  type: string;
  duration: number;
  order: number;
  actions: SceneAction[];
  content: SceneContent;
};

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function speechDuration(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(9000, Math.max(2200, words * 260));
}

function decodeHtmlEntities(value: string) {
  if (typeof window === "undefined") {
    return value
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'");
  }

  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function normalizeAudioUrl(audioUrl?: string) {
  const raw = String(audioUrl || "").trim();
  if (!raw) {
    return "";
  }

  if (typeof window === "undefined") {
    return raw;
  }

  try {
    const resolved = new URL(raw, window.location.origin);
    if (resolved.pathname.includes("/api/classroom-media/")) {
      return `${window.location.origin}${resolved.pathname}${resolved.search}`;
    }
    return resolved.toString();
  } catch {
    return raw;
  }
}

function isSlideContent(content: SceneContent): content is SlideContent {
  return content.type === "slide";
}

function isQuizContent(content: SceneContent): content is QuizContent {
  return content.type === "quiz";
}

function isInteractiveContent(content: SceneContent): content is InteractiveContent {
  return content.type === "interactive";
}

function parseSlideBlocks(scene: ParsedScene) {
  if (!isSlideContent(scene.content)) {
    return [];
  }

  return (scene.content.canvas?.elements || [])
    .filter(
      (
        element: SlideTextElement | { id: string; type: string; content?: string }
      ): element is SlideTextElement => element.type === "text"
    )
    .map((element) => ({
      id: element.id,
      html: String(element.content || ""),
      text: decodeHtmlEntities(stripHtml(String(element.content || ""))),
    }))
    .filter((block) => block.text.length > 0);
}

function extractLooseMatches(source: string, pattern: RegExp) {
  return Array.from(source.matchAll(pattern))
    .map((match) => decodeHtmlEntities(stripHtml(match[1] || "")))
    .filter(Boolean);
}

function parseLooseSceneLesson(lesson: LessonInput, order: number): ParsedScene | null {
  if (!lesson.content) {
    return null;
  }

  const source = lesson.content;
  const sceneType =
    source.match(/"content"\s*:\s*\{\s*"type"\s*:\s*"([^"]+)"/)?.[1] ||
    source.match(/"type"\s*:\s*"([^"]+)"/)?.[1] ||
    "lesson";

  const speechTexts = extractLooseMatches(
    source,
    /"text"\s*:\s*"([\s\S]*?)"\s*,\s*"type"\s*:\s*"speech"/g
  );

  const slideTexts = extractLooseMatches(
    source,
    /"content"\s*:\s*"([\s\S]*?)"\s*,\s*"defaultColor"/g
  );

  const interactiveHtmlMatch = source.match(/"html"\s*:\s*"([\s\S]*?)"\s*,\s*"type"\s*:\s*"interactive"/);
  const interactiveHtml = interactiveHtmlMatch ? decodeHtmlEntities(interactiveHtmlMatch[1]) : undefined;

  if (speechTexts.length === 0 && slideTexts.length === 0 && !interactiveHtml && !source.includes('"questions"')) {
    return null;
  }

  const content: SceneContent =
    sceneType === "slide"
      ? {
          type: "slide",
          canvas: {
            elements: slideTexts.map((text, index) => ({
              id: `${lesson.id}-slide-${index}`,
              type: "text",
              content: text,
            })),
          },
        }
      : sceneType === "interactive"
        ? {
            type: "interactive",
            html: interactiveHtml,
          }
        : sceneType === "quiz"
          ? {
              type: "quiz",
              questions: [],
            }
          : {
              type: sceneType,
            };

  return {
    id: lesson.id,
    title: lesson.title,
    type: sceneType,
    duration: lesson.duration,
    order,
    actions: speechTexts.map((text, index) => ({
      id: `${lesson.id}-speech-${index}`,
      type: "speech" as const,
      text,
    })),
    content,
  };
}

function parseSceneLesson(lesson: LessonInput, order: number): ParsedScene | null {
  if (!lesson.content) {
    return null;
  }

  const trimmed = lesson.content.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      id?: string;
      type?: string;
      title?: string;
      actions?: Array<{
        id?: string;
        type?: string;
        text?: string;
        content?: string;
        audioUrl?: string;
        elementId?: string;
      }>;
      content?: SceneContent;
    };

    return {
      id: lesson.id,
      title: parsed.title || lesson.title,
      type: parsed.type || parsed.content?.type || "lesson",
      duration: lesson.duration,
      order,
      actions: (parsed.actions || []).map((action, index) => ({
        id: action.id || `${lesson.id}-action-${index}`,
        type: action.type || "speech",
        ...(action.type === "speech"
          ? {
              text: decodeHtmlEntities(action.text || action.content || ""),
              audioUrl: action.audioUrl,
            }
          : {
              elementId: action.elementId,
            }),
      })) as SceneAction[],
      content: parsed.content || { type: parsed.type || "lesson" },
    };
  } catch {
    return parseLooseSceneLesson(lesson, order);
  }
}

export function parseAiGeneratedLesson(lesson: LessonInput): ParsedScene | null {
  return parseSceneLesson(lesson, 1);
}

export function AiGeneratedLessonPlayer({
  lesson,
  onPrevious,
  onNext,
  onComplete,
  completed = false,
  hideLessonHeader = false,
}: {
  lesson: LessonInput;
  onPrevious?: () => void;
  onNext?: () => void;
  onComplete?: () => void | Promise<void>;
  completed?: boolean;
  hideLessonHeader?: boolean;
}) {
  const scene = useMemo(() => parseAiGeneratedLesson(lesson), [lesson]);
  const [playbackState, setPlaybackState] = useState<"idle" | "playing" | "paused">("idle");
  const [activeSpeech, setActiveSpeech] = useState<string | null>(null);
  const [highlightedBlockIndex, setHighlightedBlockIndex] = useState<number>(-1);
  const playbackTokenRef = useRef(0);
  const playbackStateRef = useRef<"idle" | "playing" | "paused">("idle");
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const completionTriggeredRef = useRef(false);
  const playbackStartedRef = useRef(false);
  const playbackFinishedRef = useRef(false);
  const [completionSaving, setCompletionSaving] = useState(false);

  useEffect(() => {
    completionTriggeredRef.current = completed;
  }, [completed]);

  useEffect(() => {
    playbackStateRef.current = playbackState;
  }, [playbackState]);

  const cancelSpeech = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setActiveSpeech(null);
  }, []);

  const speakText = useCallback(async (action: SpeechAction, token: number) => {
    setActiveSpeech(action.text);

    if (typeof window !== "undefined" && action.audioUrl) {
      return new Promise<boolean>((resolve) => {
        const audio = new Audio(normalizeAudioUrl(action.audioUrl));
        audioRef.current = audio;
        audio.onended = () => resolve(playbackTokenRef.current === token);
        audio.onerror = () => {
          audioRef.current = null;
          if (!window.speechSynthesis) {
            resolve(playbackTokenRef.current === token);
            return;
          }
          const utterance = new SpeechSynthesisUtterance(action.text);
          utterance.onend = () => resolve(playbackTokenRef.current === token);
          utterance.onerror = () => resolve(playbackTokenRef.current === token);
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        };
        void audio.play().catch(() => {
          audioRef.current = null;
          if (!window.speechSynthesis) {
            resolve(playbackTokenRef.current === token);
            return;
          }
          const utterance = new SpeechSynthesisUtterance(action.text);
          utterance.onend = () => resolve(playbackTokenRef.current === token);
          utterance.onerror = () => resolve(playbackTokenRef.current === token);
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        });
      });
    }

    if (typeof window === "undefined" || !window.speechSynthesis) {
      await wait(speechDuration(action.text));
      return playbackTokenRef.current === token;
    }

    return new Promise<boolean>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(action.text);
      utterance.onend = () => resolve(playbackTokenRef.current === token);
      utterance.onerror = () => resolve(playbackTokenRef.current === token);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const waitWhilePaused = useCallback(async (token: number) => {
    while (playbackStateRef.current === "paused" && playbackTokenRef.current === token) {
      await wait(120);
    }
    return playbackTokenRef.current === token;
  }, []);

  const playScene = useCallback(
    async (currentScene: ParsedScene, token: number) => {
      const slideBlocks = parseSlideBlocks(currentScene);
      const speechActions = currentScene.actions.filter(
        (action): action is SpeechAction => action.type === "speech"
      );

      if (speechActions.length === 0) {
        return false;
      }

      if (currentScene.type === "slide") {
        setHighlightedBlockIndex(slideBlocks.length > 0 ? 0 : -1);
      } else {
        setHighlightedBlockIndex(-1);
      }

      const totalSteps = Math.max(speechActions.length, slideBlocks.length, 1);
      for (let index = 0; index < totalSteps; index++) {
        if (playbackTokenRef.current !== token) {
          return false;
        }

        const canContinue = await waitWhilePaused(token);
        if (!canContinue) {
          return false;
        }

        if (currentScene.type === "slide" && slideBlocks[index]) {
          setHighlightedBlockIndex(index);
        }

        if (speechActions[index]) {
          const spoken = await speakText(speechActions[index], token);
          if (!spoken) {
            return false;
          }
        } else {
          await wait(1200);
        }
      }

      setActiveSpeech(null);
      return true;
    },
    [speakText, waitWhilePaused]
  );

  const stopPlayback = useCallback(() => {
    playbackTokenRef.current += 1;
    setPlaybackState("idle");
    setHighlightedBlockIndex(-1);
    cancelSpeech();
  }, [cancelSpeech]);

  const persistCompletion = useCallback(async () => {
    if (!playbackStartedRef.current || !playbackFinishedRef.current) {
      return;
    }
    if (completionTriggeredRef.current || !onComplete) {
      return;
    }

    completionTriggeredRef.current = true;
    setCompletionSaving(true);
    try {
      await onComplete();
    } finally {
      setCompletionSaving(false);
    }
  }, [onComplete]);

  const startPlayback = useCallback(async () => {
    if (!scene) {
      return;
    }
    const token = ++playbackTokenRef.current;
    playbackStartedRef.current = true;
    playbackFinishedRef.current = false;
    setPlaybackState("playing");
    const completed = await playScene(scene, token);
    if (completed && playbackTokenRef.current === token) {
      playbackFinishedRef.current = true;
      setPlaybackState("idle");
      setHighlightedBlockIndex(-1);
      cancelSpeech();
      await persistCompletion();
    }
  }, [cancelSpeech, persistCompletion, playScene, scene]);

  const handlePlayPause = useCallback(() => {
    if (!scene) {
      return;
    }

    if (playbackStateRef.current === "playing") {
      setPlaybackState("paused");
      if (audioRef.current) {
        audioRef.current.pause();
      } else if (typeof window !== "undefined" && window.speechSynthesis?.speaking) {
        window.speechSynthesis.pause();
      }
      return;
    }

    if (playbackStateRef.current === "paused") {
      setPlaybackState("playing");
      if (audioRef.current) {
        void audioRef.current.play().catch(() => null);
      } else if (typeof window !== "undefined" && window.speechSynthesis?.paused) {
        window.speechSynthesis.resume();
      }
      return;
    }

    void startPlayback();
  }, [scene, startPlayback]);

  useEffect(() => {
    playbackStartedRef.current = false;
    playbackFinishedRef.current = false;
    completionTriggeredRef.current = completed;
    return () => {
      stopPlayback();
    };
  }, [completed, lesson.id, stopPlayback]);

  if (!scene) {
    return null;
  }

  const slideBlocks = parseSlideBlocks(scene);
  const speechBlocks = scene.actions.filter(
    (action): action is SpeechAction => action.type === "speech"
  );
  const quizQuestions = isQuizContent(scene.content) ? scene.content.questions || [] : [];

  return (
    <>
      {isSlideContent(scene.content) ? (
        <div className="overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-sm">
          <div className="bg-[linear-gradient(180deg,rgba(224,242,254,0.72),rgba(236,253,245,0.48),rgba(248,250,252,0.98))] px-4 py-5 sm:px-5">
            <div className="mx-auto flex min-h-[360px] w-full max-w-5xl flex-col justify-center gap-4 rounded-[24px] border border-slate-200 bg-white p-6 shadow-[0_16px_40px_rgba(15,23,42,0.10)] sm:p-10">
              {slideBlocks.map((block, index) => {
                const isActive = highlightedBlockIndex === index;
                const isVisible =
                  playbackState === "idle" || highlightedBlockIndex === -1 || index <= highlightedBlockIndex;
                return (
                  <div
                    key={block.id}
                    className={`rounded-3xl border px-5 py-4 transition ${
                      isActive
                        ? "border-sky-400 bg-[linear-gradient(135deg,rgba(14,165,233,0.20),rgba(16,185,129,0.16))] shadow-[0_12px_30px_rgba(14,165,233,0.20)]"
                        : "border-slate-200 bg-slate-50/90"
                    } ${isVisible ? "opacity-100" : "opacity-30"}`}
                  >
                    <div
                      className="prose prose-slate max-w-none text-sm leading-7 text-slate-900 prose-p:text-slate-900 prose-li:text-slate-800 prose-strong:text-slate-950"
                      dangerouslySetInnerHTML={{ __html: block.html }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}

      {isInteractiveContent(scene.content) ? (
        <div className="overflow-hidden rounded-b-3xl border-b border-x border-border bg-card shadow-sm">
          {scene.content.html ? (
            <iframe
              title={scene.title}
              srcDoc={scene.content.html}
              className="h-[560px] w-full bg-white"
              sandbox="allow-scripts allow-same-origin"
            />
          ) : (
            <div className="px-6 py-10 text-sm text-slate-500">
              No interactive HTML was generated for this lesson.
            </div>
          )}
        </div>
      ) : null}

      {isQuizContent(scene.content) ? (
        <div className="rounded-b-3xl border-b border-x border-border bg-card p-6">
          <div className="space-y-4">
            {quizQuestions.map((question, index) => (
              <section
                key={question.id || `${scene.id}-question-${index}`}
                className="rounded-3xl border border-amber-200 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.16),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.99),rgba(255,251,235,0.95))] p-6 shadow-sm"
              >
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Question {index + 1}
                </div>
                <h5 className="mt-2 text-lg font-semibold text-slate-950">{question.question}</h5>
                <div className="mt-4 space-y-3">
                  {(question.options || []).map((option) => {
                    const isCorrect = (question.answer || []).includes(option.value);
                    return (
                      <div
                        key={option.value}
                        className={`rounded-2xl border px-4 py-3 text-sm ${
                          isCorrect
                            ? "border-emerald-300 bg-[linear-gradient(135deg,rgba(16,185,129,0.18),rgba(110,231,183,0.12))] text-emerald-900"
                            : "border-slate-200 bg-slate-50 text-slate-700"
                        }`}
                      >
                        <span className="font-semibold">{option.value}.</span> {option.label}
                      </div>
                    );
                  })}
                </div>
                {question.analysis ? (
                  <div className="mt-4 rounded-2xl border border-amber-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(254,249,195,0.72))] px-4 py-3 text-sm text-slate-700">
                    <span className="font-semibold text-slate-900">Explanation:</span> {question.analysis}
                  </div>
                ) : null}
              </section>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-b-3xl border border-t-0 border-slate-200 bg-white p-6 text-slate-950 shadow-sm">
        {!hideLessonHeader ? (
          <>
            <h1 className="text-2xl font-bold text-slate-950">{scene.title}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm font-medium text-slate-700">
              <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-slate-800">
                {scene.duration} minutes
              </span>
              <span className="rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-slate-800">
                {scene.type}
              </span>
            </div>
          </>
        ) : null}

        {speechBlocks.length > 0 ? (
          <div className={`${hideLessonHeader ? "" : "mt-6"} rounded-3xl border border-emerald-300 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.18),transparent_22%),linear-gradient(180deg,rgba(255,255,255,1),rgba(236,253,245,0.98))] p-5 text-slate-950 shadow-[0_16px_36px_rgba(15,23,42,0.10)] sm:p-6`}>
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                  Lesson playback
                </p>
                <p className="mt-1 text-sm font-medium text-slate-700">
                  Review the narration and move through the course preview.
                </p>
              </div>
              <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={async () => {
                  await persistCompletion();
                  onPrevious?.();
                }}
                disabled={!onPrevious || completionSaving}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
              >
                <SkipBack className="mr-2 inline h-4 w-4" />
                Previous
              </button>
              <button
                type="button"
                onClick={handlePlayPause}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                {playbackState === "playing" ? (
                  <>
                    <Pause className="mr-2 inline h-4 w-4" />
                    Pause
                  </>
                ) : (
                  <>
                    <Play className="mr-2 inline h-4 w-4" />
                    {playbackState === "paused" ? "Resume" : "Play lesson"}
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await persistCompletion();
                  onNext?.();
                }}
                disabled={!onNext || completionSaving}
                className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-950 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:border-slate-200 disabled:bg-slate-100 disabled:text-slate-500"
              >
                Next
                <SkipForward className="ml-2 inline h-4 w-4" />
              </button>
              </div>
              <div className="inline-flex items-center rounded-xl border border-emerald-300 bg-emerald-100 px-4 py-2 text-sm font-semibold text-emerald-950">
                {completionSaving
                  ? "Saving completion..."
                  : completed
                    ? "Lesson completed"
                    : "Completion unlocks after full narration"}
              </div>
            </div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              <Volume2 className="h-4 w-4" />
              Live narration
            </div>
            <div className="mt-3 min-h-16 rounded-2xl border border-emerald-300 bg-white px-4 py-3 text-sm font-medium leading-7 text-slate-900 shadow-inner">
              {activeSpeech || "Press play to review the lesson narration."}
            </div>
          </div>
        ) : null}
      </div>
    </>
  );
}
