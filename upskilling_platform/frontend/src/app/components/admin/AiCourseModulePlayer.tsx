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
};

type SceneAction = SpeechAction | { id: string; type: string };

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
      actions?: Array<{ id?: string; type?: string; text?: string; content?: string }>;
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
        type: (action.type || "speech") as SceneAction["type"],
        ...(action.type === "speech"
          ? { text: decodeHtmlEntities(action.text || action.content || "") }
          : {}),
      })) as SceneAction[],
      content: parsed.content || { type: parsed.type || "lesson" },
    };
  } catch {
    return parseLooseSceneLesson(lesson, order);
  }
}

export function AiCourseModulePlayer({
  lessons,
}: {
  lessons: LessonInput[];
}) {
  const scenes = useMemo(
    () =>
      lessons
        .map((lesson, index) => parseSceneLesson(lesson, index + 1))
        .filter((scene): scene is ParsedScene => scene !== null),
    [lessons]
  );

  const [selectedSceneId, setSelectedSceneId] = useState(scenes[0]?.id || "");
  const [playbackState, setPlaybackState] = useState<"idle" | "playing" | "paused">("idle");
  const [activeSpeech, setActiveSpeech] = useState<string | null>(null);
  const [highlightedBlockIndex, setHighlightedBlockIndex] = useState<number>(-1);
  const playbackTokenRef = useRef(0);
  const playbackStateRef = useRef<"idle" | "playing" | "paused">("idle");

  useEffect(() => {
    playbackStateRef.current = playbackState;
  }, [playbackState]);

  useEffect(() => {
    if (!selectedSceneId && scenes[0]) {
      setSelectedSceneId(scenes[0].id);
    }
  }, [scenes, selectedSceneId]);

  const selectedScene = useMemo(
    () => scenes.find((scene) => scene.id === selectedSceneId) || scenes[0] || null,
    [scenes, selectedSceneId]
  );

  const selectedSceneIndex = useMemo(
    () => scenes.findIndex((scene) => scene.id === selectedSceneId),
    [scenes, selectedSceneId]
  );

  const speakText = useCallback(async (text: string, token: number) => {
    setActiveSpeech(text);

    if (typeof window === "undefined" || !window.speechSynthesis) {
      await wait(speechDuration(text));
      return playbackTokenRef.current === token;
    }

    return new Promise<boolean>((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.onend = () => resolve(playbackTokenRef.current === token);
      utterance.onerror = () => resolve(playbackTokenRef.current === token);
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    });
  }, []);

  const cancelSpeech = useCallback(() => {
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
    setActiveSpeech(null);
  }, []);

  const waitWhilePaused = useCallback(async (token: number) => {
    while (playbackStateRef.current === "paused" && playbackTokenRef.current === token) {
      await wait(120);
    }
    return playbackTokenRef.current === token;
  }, []);

  const playScene = useCallback(
    async (scene: ParsedScene, token: number) => {
      const slideBlocks = parseSlideBlocks(scene);
      const speechActions = scene.actions.filter(
        (action): action is SpeechAction => action.type === "speech"
      );

      if (scene.type === "slide") {
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

        if (scene.type === "slide" && slideBlocks[index]) {
          setHighlightedBlockIndex(index);
        }

        if (speechActions[index]) {
          const spoken = await speakText(speechActions[index].text, token);
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

  const startPlaybackFrom = useCallback(
    async (sceneId: string) => {
      const token = ++playbackTokenRef.current;
      setPlaybackState("playing");

      const startIndex = scenes.findIndex((scene) => scene.id === sceneId);
      const fromIndex = startIndex >= 0 ? startIndex : 0;

      for (let index = fromIndex; index < scenes.length; index++) {
        if (playbackTokenRef.current !== token) {
          return;
        }

        setSelectedSceneId(scenes[index].id);
        const completed = await playScene(scenes[index], token);
        if (!completed || playbackTokenRef.current !== token) {
          return;
        }

        await wait(700);
      }

      if (playbackTokenRef.current === token) {
        setPlaybackState("idle");
        setHighlightedBlockIndex(-1);
        cancelSpeech();
      }
    },
    [cancelSpeech, playScene, scenes]
  );

  const handlePlayPause = useCallback(() => {
    if (!selectedScene) {
      return;
    }

    if (playbackStateRef.current === "playing") {
      setPlaybackState("paused");
      if (typeof window !== "undefined" && window.speechSynthesis?.speaking) {
        window.speechSynthesis.pause();
      }
      return;
    }

    if (playbackStateRef.current === "paused") {
      setPlaybackState("playing");
      if (typeof window !== "undefined" && window.speechSynthesis?.paused) {
        window.speechSynthesis.resume();
      }
      return;
    }

    void startPlaybackFrom(selectedScene.id);
  }, [selectedScene, startPlaybackFrom]);

  const handlePrevious = useCallback(() => {
    const previousIndex = Math.max(0, selectedSceneIndex - 1);
    stopPlayback();
    setSelectedSceneId(scenes[previousIndex]?.id || scenes[0]?.id || "");
  }, [scenes, selectedSceneIndex, stopPlayback]);

  const handleNext = useCallback(() => {
    const nextIndex = Math.min(scenes.length - 1, selectedSceneIndex + 1);
    stopPlayback();
    setSelectedSceneId(scenes[nextIndex]?.id || scenes[0]?.id || "");
  }, [scenes, selectedSceneIndex, stopPlayback]);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  if (!selectedScene) {
    return (
      <div className="rounded-2xl border border-dashed border-border bg-background px-4 py-5 text-sm text-text-secondary">
        No playable AI lessons were found in this module.
      </div>
    );
  }

  const slideBlocks = parseSlideBlocks(selectedScene);
  const speechBlocks = selectedScene.actions.filter(
    (action): action is SpeechAction => action.type === "speech"
  );
  const quizQuestions = isQuizContent(selectedScene.content) ? selectedScene.content.questions || [] : [];
  const playbackControls = (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={handlePrevious}
        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
      >
        <SkipBack className="mr-2 inline h-4 w-4" />
        Previous lesson
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
        onClick={handleNext}
        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
      >
        Next lesson
        <SkipForward className="ml-2 inline h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="grid gap-6 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
      <aside className="rounded-3xl border border-emerald-200 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.99),rgba(240,253,250,0.96))] p-4 shadow-sm">
        <div className="mb-3 text-sm font-semibold text-slate-950">Course lessons</div>
        <div className="space-y-2">
          {scenes.map((scene, index) => (
            <button
              key={scene.id}
              type="button"
              onClick={() => {
                stopPlayback();
                setSelectedSceneId(scene.id);
              }}
              className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                scene.id === selectedScene.id
                  ? "border-emerald-400 bg-[linear-gradient(135deg,rgba(16,185,129,0.22),rgba(59,130,246,0.14))] shadow-[0_12px_28px_rgba(16,185,129,0.18)]"
                  : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
              }`}
            >
              <div className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                Lesson {index + 1}
              </div>
              <div className="mt-1 text-sm font-semibold text-slate-900">{scene.title}</div>
              <div className="mt-1 text-xs text-slate-500">{scene.duration} min</div>
            </button>
          ))}
        </div>
      </aside>

      <main className="space-y-6">
        <section className="rounded-3xl border border-sky-200 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.99),rgba(239,246,255,0.96))] p-6 shadow-sm">
          <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
            Learner preview
          </div>
          <h4 className="mt-2 text-2xl font-semibold text-slate-950">{selectedScene.title}</h4>
          <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              State: {playbackState}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              Lesson {selectedSceneIndex + 1} / {scenes.length}
            </span>
            <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
              {selectedScene.duration} min
            </span>
          </div>
        </section>

        {isSlideContent(selectedScene.content) ? (
          <section className="overflow-hidden rounded-3xl border border-sky-200 bg-white text-slate-900 shadow-sm">
            <div className="bg-[linear-gradient(180deg,rgba(224,242,254,0.58),rgba(236,253,245,0.38),rgba(248,250,252,0.96))] px-5 py-5">
              <div className="mx-auto flex aspect-[16/9] w-full max-w-5xl flex-col justify-center gap-4 rounded-[24px] border border-slate-200 bg-white p-10 shadow-sm">
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
                          : "border-slate-200 bg-slate-50"
                      } ${isVisible ? "opacity-100" : "opacity-30"}`}
                    >
                      <div
                        className="prose prose-slate max-w-none text-sm leading-7"
                        dangerouslySetInnerHTML={{ __html: block.html }}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="border-t border-slate-200 bg-slate-50 px-6 py-4 text-slate-900">
              <div className="mb-4">{playbackControls}</div>
              <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                <Volume2 className="h-4 w-4" />
                Live narration
              </div>
              <div className="mt-3 min-h-16 rounded-2xl border border-sky-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,255,0.92))] px-4 py-3 text-sm leading-7 text-slate-700">
                {activeSpeech || "Press play to review the slide animation and narration."}
              </div>
            </div>
          </section>
        ) : null}

        {isQuizContent(selectedScene.content) ? (
          <div className="space-y-4">
            {quizQuestions.map((question, index) => (
              <section
                key={question.id || `${selectedScene.id}-question-${index}`}
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
        ) : null}

        {isInteractiveContent(selectedScene.content) ? (
          <section className="overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-sm">
            <div className="border-b border-violet-200 bg-[linear-gradient(135deg,rgba(14,165,233,0.16),rgba(168,85,247,0.14))] px-6 py-4">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Interactive lesson
              </div>
              <div className="mt-1 text-sm text-slate-500">Preview the generated interactive activity.</div>
            </div>
            {selectedScene.content.html ? (
              <iframe
                title={selectedScene.title}
                srcDoc={selectedScene.content.html}
                className="h-[560px] w-full bg-white"
                sandbox="allow-scripts allow-same-origin"
              />
            ) : (
              <div className="px-6 py-10 text-sm text-slate-500">
                No interactive HTML was generated for this lesson.
              </div>
            )}
          </section>
        ) : null}

        {speechBlocks.length > 0 && !isQuizContent(selectedScene.content) ? (
          <section className="rounded-3xl border border-emerald-200 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.99),rgba(240,253,250,0.96))] p-6 text-slate-900 shadow-sm">
            {!isSlideContent(selectedScene.content) ? (
              <div className="mb-5">{playbackControls}</div>
            ) : null}
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
              Teacher script
            </div>
            <div className="mt-4 space-y-3 text-sm leading-7 text-slate-700">
              {speechBlocks.map((speech, index) => (
                <p key={speech.id} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <span className="mr-2 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                    {index + 1}
                  </span>
                  {speech.text}
                </p>
              ))}
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
}
