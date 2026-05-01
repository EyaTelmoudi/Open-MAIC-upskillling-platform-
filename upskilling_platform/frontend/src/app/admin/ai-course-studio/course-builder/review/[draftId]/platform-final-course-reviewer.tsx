"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, SkipBack, SkipForward, Volume2 } from "lucide-react";
import { formatDateForUser } from "@/app/lib/user-date-format";

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
  canvas: {
    elements: Array<SlideTextElement | { id: string; type: string; content?: string }>;
  };
};

type QuizContent = {
  type: "quiz";
  questions: Array<{
    id: string;
    question: string;
    options?: Array<{ value: string; label: string }>;
    answer?: string[];
    analysis?: string;
  }>;
};

type InteractiveContent = {
  type: "interactive";
  html?: string;
};

type GenericContent = {
  type: string;
};

type Scene = {
  id: string;
  title: string;
  type: string;
  order: number;
  actions?: SceneAction[];
  content: SlideContent | QuizContent | InteractiveContent | GenericContent;
};

export type ReviewerFinalizedCourse = {
  id: string;
  stage: { name?: string };
  scenes: Scene[];
  generatedAt: string;
};

function isSlideContent(content: Scene["content"]): content is SlideContent {
  return content.type === "slide";
}

function isQuizContent(content: Scene["content"]): content is QuizContent {
  return content.type === "quiz";
}

function isInteractiveContent(content: Scene["content"]): content is InteractiveContent {
  return content.type === "interactive";
}

function stripHtml(value: string) {
  return value.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function parseSlideBlocks(scene: Scene) {
  if (!isSlideContent(scene.content)) return [];
  return scene.content.canvas.elements
    .filter((element: SlideTextElement | { id: string; type: string; content?: string }): element is SlideTextElement => element.type === "text")
    .map((element) => ({
      id: element.id,
      html: String(element.content || ""),
      text: stripHtml(String(element.content || "")),
    }))
    .filter((element: { id: string; html: string; text: string }) => element.text.length > 0);
}

function sceneSummary(scene: Scene) {
  if (isSlideContent(scene.content)) {
    return parseSlideBlocks(scene)
      .map((block: { text: string }) => block.text)
      .join(" ")
      .slice(0, 120);
  }
  if (isQuizContent(scene.content)) {
    return `${scene.content.questions.length} question${scene.content.questions.length === 1 ? "" : "s"}`;
  }
  if (isInteractiveContent(scene.content)) {
    return "Interactive practice";
  }
  return scene.title;
}

function wait(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

function speechDuration(text: string) {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.min(9000, Math.max(2200, words * 260));
}

export function PlatformFinalCourseReviewer({
  course,
  timezone,
}: {
  course: ReviewerFinalizedCourse;
  timezone?: string | null;
}) {
  const orderedScenes = useMemo(
    () => course.scenes.slice().sort((a, b) => a.order - b.order),
    [course.scenes],
  );
  const [selectedSceneId, setSelectedSceneId] = useState(orderedScenes[0]?.id || "");
  const [playbackState, setPlaybackState] = useState<"idle" | "playing" | "paused">("idle");
  const [activeSpeech, setActiveSpeech] = useState<string | null>(null);
  const [highlightedBlockIndex, setHighlightedBlockIndex] = useState<number>(-1);
  const playbackTokenRef = useRef(0);
  const playbackStateRef = useRef<"idle" | "playing" | "paused">("idle");

  useEffect(() => {
    playbackStateRef.current = playbackState;
  }, [playbackState]);

  const selectedScene = useMemo(
    () => orderedScenes.find((scene) => scene.id === selectedSceneId) || orderedScenes[0] || null,
    [orderedScenes, selectedSceneId],
  );

  const selectedSceneIndex = useMemo(
    () => orderedScenes.findIndex((scene) => scene.id === selectedSceneId),
    [orderedScenes, selectedSceneId],
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
    async (scene: Scene, token: number) => {
      const slideBlocks = parseSlideBlocks(scene);
      const speechActions = (scene.actions || []).filter(
        (action): action is SpeechAction => action.type === "speech",
      );

      if (scene.type === "slide") {
        setHighlightedBlockIndex(slideBlocks.length > 0 ? 0 : -1);
      } else {
        setHighlightedBlockIndex(-1);
      }

      const totalSteps = Math.max(speechActions.length, slideBlocks.length, 1);

      for (let index = 0; index < totalSteps; index++) {
        if (playbackTokenRef.current !== token) return false;
        const canContinue = await waitWhilePaused(token);
        if (!canContinue) return false;

        if (scene.type === "slide" && slideBlocks[index]) {
          setHighlightedBlockIndex(index);
        }

        if (speechActions[index]) {
          const spoken = await speakText(speechActions[index].text, token);
          if (!spoken) return false;
        } else {
          await wait(1200);
        }
      }

      setActiveSpeech(null);
      return true;
    },
    [speakText, waitWhilePaused],
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

      const startIndex = orderedScenes.findIndex((scene) => scene.id === sceneId);
      const fromIndex = startIndex >= 0 ? startIndex : 0;

      for (let index = fromIndex; index < orderedScenes.length; index++) {
        if (playbackTokenRef.current !== token) return;
        setSelectedSceneId(orderedScenes[index].id);
        const completed = await playScene(orderedScenes[index], token);
        if (!completed || playbackTokenRef.current !== token) return;
        await wait(700);
      }

      if (playbackTokenRef.current === token) {
        setPlaybackState("idle");
        setHighlightedBlockIndex(-1);
        cancelSpeech();
      }
    },
    [cancelSpeech, orderedScenes, playScene],
  );

  const handlePlayPause = useCallback(() => {
    if (!selectedScene) return;

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

  const handleSelectScene = useCallback(
    (sceneId: string) => {
      stopPlayback();
      setSelectedSceneId(sceneId);
    },
    [stopPlayback],
  );

  const handlePrevious = useCallback(() => {
    const previousIndex = Math.max(0, selectedSceneIndex - 1);
    stopPlayback();
    setSelectedSceneId(orderedScenes[previousIndex]?.id || orderedScenes[0]?.id || "");
  }, [orderedScenes, selectedSceneIndex, stopPlayback]);

  const handleNext = useCallback(() => {
    const nextIndex = Math.min(orderedScenes.length - 1, selectedSceneIndex + 1);
    stopPlayback();
    setSelectedSceneId(orderedScenes[nextIndex]?.id || orderedScenes[0]?.id || "");
  }, [orderedScenes, selectedSceneIndex, stopPlayback]);

  useEffect(() => {
    return () => {
      stopPlayback();
    };
  }, [stopPlayback]);

  if (!selectedScene) {
    return (
      <div className="rounded-3xl border border-dashed border-border bg-slate-50 px-5 py-10 text-sm text-slate-500">
        No finalized scenes were found for this course.
      </div>
    );
  }

  const slideBlocks = parseSlideBlocks(selectedScene);
  const speechBlocks = (selectedScene.actions || []).filter(
    (action): action is SpeechAction => action.type === "speech",
  );
  const playbackControls = (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={handlePrevious}
        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
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
            {playbackState === "paused" ? "Resume" : "Play full lesson"}
          </>
        )}
      </button>
      <button
        type="button"
        onClick={handleNext}
        className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-900 transition hover:bg-slate-50"
      >
        Next
        <SkipForward className="ml-2 inline h-4 w-4" />
      </button>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-8 xl:grid-cols-[280px_minmax(0,1fr)] xl:items-start">
        <aside className="rounded-3xl border border-emerald-200 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.16),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.99),rgba(240,253,250,0.96))] p-4 shadow-[0_14px_36px_rgba(15,23,42,0.10)]">
          <div className="mb-3 text-sm font-semibold text-slate-950">Course lessons</div>
          <div className="space-y-2">
            {orderedScenes.map((scene) => (
              <button
                key={scene.id}
                type="button"
                onClick={() => handleSelectScene(scene.id)}
                className={`w-full rounded-2xl border px-4 py-3 text-left transition ${
                  scene.id === selectedScene.id
                    ? "border-emerald-400 bg-[linear-gradient(135deg,rgba(16,185,129,0.22),rgba(59,130,246,0.14))] shadow-[0_12px_28px_rgba(16,185,129,0.18)]"
                    : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                }`}
              >
                <div className="text-sm font-semibold text-slate-900">{scene.title}</div>
              </button>
            ))}
          </div>
        </aside>

        <main className="space-y-8">
          <section className="rounded-3xl border border-sky-200 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.99),rgba(239,246,255,0.96))] p-6 shadow-[0_14px_36px_rgba(15,23,42,0.10)]">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
              Current lesson
            </div>
            <h4 className="mt-2 text-2xl font-semibold text-slate-950">{selectedScene.title}</h4>
            <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                State: {playbackState}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                Lesson {selectedSceneIndex + 1} / {orderedScenes.length}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">
                Generated {formatDateForUser(course.generatedAt, timezone)}
              </span>
            </div>
          </section>

          {isInteractiveContent(selectedScene.content) ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
              <div className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                Lesson playback
              </div>
              {playbackControls}
            </section>
          ) : null}

          {isSlideContent(selectedScene.content) ? (
            <section className="overflow-hidden rounded-3xl border border-sky-200 bg-white text-slate-900 shadow-[0_14px_36px_rgba(15,23,42,0.10)]">
              <div className="bg-[linear-gradient(180deg,rgba(224,242,254,0.58),rgba(236,253,245,0.38),rgba(248,250,252,0.96))] px-5 py-5">
                <div className="mx-auto flex aspect-[16/9] w-full max-w-5xl flex-col justify-center gap-4 rounded-[24px] border border-slate-200 bg-white p-10 shadow-sm">
                  {slideBlocks.map((block: { id: string; html: string; text: string }, index: number) => {
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
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  <Volume2 className="h-4 w-4" />
                  Live narration
                </div>
                <div className="mt-3 min-h-16 rounded-2xl border border-sky-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(239,246,255,0.92))] px-4 py-3 text-sm leading-7 text-slate-700">
                  {activeSpeech || "Press play to review the slide animation and narration."}
                </div>
                <div className="mt-4 border-t border-slate-200 pt-4">
                  {playbackControls}
                </div>
              </div>
            </section>
          ) : null}

          {isQuizContent(selectedScene.content) ? (
            <div className="space-y-4">
              {selectedScene.content.questions.map((question: QuizContent["questions"][number], index: number) => (
                <section
                  key={question.id}
                  className="rounded-3xl border border-amber-200 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.16),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.99),rgba(255,251,235,0.95))] p-6 shadow-[0_14px_36px_rgba(15,23,42,0.10)]"
                >
                  <div className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                    Question {index + 1}
                  </div>
                  <h5 className="mt-2 text-lg font-semibold text-slate-950">{question.question}</h5>
                  <div className="mt-4 space-y-3">
                    {(question.options || []).map((option: { value: string; label: string }) => {
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
                      <span className="font-semibold text-slate-900">Explanation:</span>{" "}
                      {question.analysis}
                    </div>
                  ) : null}
                </section>
              ))}
            </div>
          ) : null}

          {isInteractiveContent(selectedScene.content) ? (
            <section className="overflow-hidden rounded-3xl border border-violet-200 bg-white shadow-[0_14px_36px_rgba(15,23,42,0.10)]">
              <div className="border-b border-violet-200 bg-[linear-gradient(135deg,rgba(14,165,233,0.16),rgba(168,85,247,0.14))] px-6 py-4">
                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700">
                  Interactive lesson
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  HTML demo preview generated by OpenMAIC.
                </div>
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
                  No interactive HTML was generated for this scene.
                </div>
              )}
            </section>
          ) : null}

          {speechBlocks.length > 0 && !isQuizContent(selectedScene.content) ? (
            <section className="rounded-3xl border border-emerald-200 bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.14),transparent_22%),linear-gradient(180deg,rgba(255,255,255,0.99),rgba(240,253,250,0.96))] p-6 text-slate-900 shadow-[0_14px_36px_rgba(15,23,42,0.10)]">
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
    </div>
  );
}
