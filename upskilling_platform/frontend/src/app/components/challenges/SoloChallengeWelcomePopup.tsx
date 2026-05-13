"use client";

import {
  BrainCircuit,
  CheckCircle2,
  PartyPopper,
  Sparkles,
  Stars,
  Swords,
  Target,
  TimerReset,
  Trophy,
  X,
  XCircle,
  Zap,
} from "lucide-react";

type SoloChallengeQuestion = {
  questionId: string;
  text: string;
  questionType: string;
  displayOrder: number;
  generationMode?: string;
  correctOptionId?: string | null;
  explanation?: string | null;
  options: Array<{
    id: string;
    value: string;
    label: string;
  }>;
};

type SoloChallengeQuiz = {
  courseId?: string | null;
  courseTitle?: string | null;
  lessonId?: string | null;
  lessonTitle?: string | null;
  assessmentId?: string | null;
  source?: string;
  focusMode?: string;
  questionCount?: number;
  questions?: SoloChallengeQuestion[];
};

interface SoloChallengeWelcomePopupProps {
  open: boolean;
  isStarting?: boolean;
  isSubmittingAnswer?: boolean;
  errorMessage?: string | null;
  quiz?: SoloChallengeQuiz | null;
  selectedOptionId?: string | null;
  answerResult?: "correct" | "incorrect" | null;
  awardedXp?: number;
  onClose: () => void;
  onAccept: () => void;
  onSelectOption: (optionId: string) => void;
  onSubmitAnswer: () => void;
  onRetryChallenge: () => void;
  onOpenCoach: () => void;
}

const FLOATING_TOKENS = [
  { icon: Sparkles, left: "8%", top: "18%", delay: "0s", duration: "3.1s" },
  { icon: Target, left: "18%", top: "76%", delay: "0.25s", duration: "3.4s" },
  { icon: TimerReset, left: "78%", top: "16%", delay: "0.15s", duration: "3s" },
  { icon: BrainCircuit, left: "86%", top: "72%", delay: "0.45s", duration: "3.3s" },
] as const;

export function SoloChallengeWelcomePopup({
  open,
  isStarting = false,
  isSubmittingAnswer = false,
  errorMessage = null,
  quiz = null,
  selectedOptionId = null,
  answerResult = null,
  awardedXp = 50,
  onClose,
  onAccept,
  onSelectOption,
  onSubmitAnswer,
  onRetryChallenge,
  onOpenCoach,
}: SoloChallengeWelcomePopupProps) {
  if (!open) {
    return null;
  }

  const question = quiz?.questions?.[0] ?? null;
  const isQuestionReady = Boolean(question) && answerResult === null;
  const isSuccess = answerResult === "correct";
  const isFailure = answerResult === "incorrect";

  return (
    <div className="fixed inset-0 z-[145] flex items-center justify-center px-4 py-6">
      <div
        className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(14,163,122,0.28),transparent_26%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.24),transparent_22%),rgba(15,23,42,0.66)] backdrop-blur-sm"
        onClick={onClose}
      />
      {FLOATING_TOKENS.map(({ icon: Icon, left, top, delay, duration }) => (
        <div
          key={`${left}-${top}`}
          className="pointer-events-none absolute text-white/70"
          style={{
            left,
            top,
            animation: `solo-challenge-float ${duration} ease-in-out ${delay} infinite`,
          }}
        >
          <Icon className="h-7 w-7" />
        </div>
      ))}
      <div className="relative w-full max-w-3xl overflow-hidden rounded-[34px] border border-white/40 bg-[linear-gradient(160deg,rgba(255,255,255,0.96),rgba(236,253,250,0.97)_38%,rgba(224,242,254,0.96)_72%,rgba(255,247,237,0.96)_100%)] shadow-[0_28px_80px_rgba(15,23,42,0.28)]">
        <div className="absolute inset-x-0 top-0 h-2 bg-[linear-gradient(90deg,#0ea37a_0%,#22c7b4_35%,#38bdf8_70%,#f59e0b_100%)]" />
        <div className="pointer-events-none absolute -left-14 top-12 h-40 w-40 rounded-full bg-emerald-300/35 blur-3xl" />
        <div className="pointer-events-none absolute -right-12 bottom-10 h-44 w-44 rounded-full bg-sky-300/35 blur-3xl" />

        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200/80 bg-white/80 text-slate-500 transition-colors hover:bg-white hover:text-slate-900"
          aria-label="Dismiss solo challenge popup"
        >
          <X className="h-4 w-4" />
        </button>

        {!quiz ? (
          <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-white/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700 shadow-[0_10px_26px_rgba(14,163,122,0.12)]">
                <Sparkles className="h-3.5 w-3.5" />
                Solo Challenge Agent
              </div>

              <h2 className="mt-4 max-w-xl text-3xl font-black tracking-tight text-slate-950 sm:text-4xl">
                Welcome back to SkillForge.
              </h2>

              <div className="mt-5 rounded-[28px] border border-white/70 bg-[linear-gradient(145deg,rgba(15,23,42,0.96),rgba(30,41,59,0.94),rgba(14,116,144,0.9))] p-5 text-white shadow-[0_20px_60px_rgba(15,23,42,0.22)]">
                <div className="flex items-start gap-3">
                  <div className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0ea37a_0%,#22c7b4_60%,#38bdf8_120%)] shadow-[0_10px_24px_rgba(34,199,180,0.28)]">
                    <Swords className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-200/90">
                      Daily Mission
                    </p>
                    <p className="mt-2 text-base leading-7 text-white/92 sm:text-lg">
                      I have a challenge for you. Answer this question and you will get{" "}
                      <span className="font-black text-amber-300">50 XP points</span>.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={onAccept}
                  disabled={isStarting}
                  className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0ea37a_0%,#22c7b4_58%,#14b8a6_100%)] px-5 py-3 text-sm font-black text-white shadow-[0_18px_44px_rgba(14,163,122,0.24)] transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  <Zap className="h-4 w-4" />
                  {isStarting ? "Challenge agent is waking up..." : "Bring it on"}
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isStarting}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/85 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white hover:text-slate-950"
                >
                  Maybe later
                </button>
              </div>
              {isStarting ? (
                <p className="mt-3 text-sm font-medium text-emerald-700">
                  Solo Challenge Agent is starting its workflow. Check the terminal logs.
                </p>
              ) : null}
              {errorMessage ? (
                <p className="mt-3 text-sm font-medium text-rose-700">{errorMessage}</p>
              ) : null}
            </div>

            <div className="relative">
              <div className="rounded-[30px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,255,255,0.8))] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
                <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(160deg,rgba(236,253,245,0.96),rgba(240,249,255,0.96),rgba(255,247,237,0.96))] p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                        Reward
                      </p>
                      <p className="mt-1 text-3xl font-black text-slate-950">50 XP</p>
                    </div>
                    <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#f59e0b_0%,#fb923c_100%)] text-white shadow-[0_18px_36px_rgba(249,115,22,0.3)]">
                      <Zap className="h-8 w-8" />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <div className="rounded-[22px] border border-emerald-200/80 bg-white/80 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                        Challenge Type
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        Multiple-choice reinforcement
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-sky-200/80 bg-white/80 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                        Focus
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        Your last failed quiz concept
                      </p>
                    </div>
                    <div className="rounded-[22px] border border-amber-200/80 bg-white/80 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                        Difficulty
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-900">
                        Adaptive and personalized
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="relative p-6 sm:p-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200/70 bg-white/80 px-3 py-1 text-[11px] font-black uppercase tracking-[0.24em] text-emerald-700 shadow-[0_10px_26px_rgba(14,163,122,0.12)]">
              <Sparkles className="h-3.5 w-3.5" />
              Solo Challenge Agent
            </div>

            {isSuccess ? (
              <div className="relative mt-6 overflow-hidden rounded-[32px] border border-amber-200/20 bg-[radial-gradient(circle_at_top,rgba(251,191,36,0.18),transparent_24%),linear-gradient(180deg,#101828_0%,#172033_48%,#0f172a_100%)] px-6 py-8 text-center shadow-[0_28px_80px_rgba(15,23,42,0.35)]">
                <div className="pointer-events-none absolute inset-x-10 top-5 h-24 rounded-full bg-amber-300/20 blur-3xl" />
                <div className="pointer-events-none absolute -left-8 top-24 h-28 w-28 rounded-full bg-emerald-400/10 blur-3xl" />
                <div className="pointer-events-none absolute -right-8 bottom-16 h-32 w-32 rounded-full bg-sky-400/10 blur-3xl" />
                <div className="relative mx-auto mb-5 flex h-24 w-24 animate-bounce items-center justify-center rounded-full border border-amber-200/30 bg-amber-300/15 text-amber-200 shadow-[0_0_40px_rgba(251,191,36,0.35)]">
                  <PartyPopper className="h-10 w-10" />
                  <CheckCircle2 className="absolute -right-1 -top-1 h-6 w-6 rounded-full bg-emerald-400 p-1 text-slate-950 shadow-[0_0_18px_rgba(52,211,153,0.5)]" />
                </div>
                <div className="relative flex items-center justify-center gap-2 text-amber-200">
                  <Sparkles className="h-4 w-4" />
                  <p className="text-sm font-semibold uppercase tracking-[0.3em]">
                    Solo Challenge Cleared
                  </p>
                  <Sparkles className="h-4 w-4" />
                </div>
                <h2 className="relative mt-4 text-5xl font-black text-white drop-shadow-[0_6px_18px_rgba(0,0,0,0.45)]">
                  +{awardedXp} XP
                </h2>
                <p className="mt-3 text-lg font-semibold text-amber-100">
                  Correct answer. The concept is landing.
                </p>
                <p className="mt-3 text-sm text-white/75">
                  Celebration unlocked. Momentum looks good on you.
                </p>
                <div className="mt-6 flex items-center justify-center gap-3 text-amber-200">
                  <Trophy className="h-6 w-6 animate-[celebration-wiggle_1.6s_ease-in-out_infinite]" />
                  <Sparkles className="h-6 w-6 animate-[celebration-wiggle_1.9s_ease-in-out_0.1s_infinite]" />
                  <PartyPopper className="h-6 w-6 animate-[celebration-wiggle_1.7s_ease-in-out_0.2s_infinite]" />
                  <Stars className="h-6 w-6 animate-[celebration-wiggle_2s_ease-in-out_0.15s_infinite]" />
                </div>
                <div className="relative mt-6 rounded-[26px] border border-white/10 bg-white/5 px-5 py-4 text-left backdrop-blur-sm">
                  <p className="text-sm font-semibold uppercase tracking-[0.22em] text-emerald-300">
                    Reward Delivered
                  </p>
                  <p className="mt-2 text-2xl font-black text-white">Solo challenge completed</p>
                  <p className="mt-2 text-sm text-white/75">
                    You read the reformulated question well and picked the right answer.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  className="relative mt-6 inline-flex items-center justify-center rounded-2xl bg-amber-300 px-5 py-3 text-sm font-black text-slate-950 transition-colors hover:bg-amber-200"
                >
                  Close
                </button>
              </div>
            ) : isFailure ? (
              <div className="mt-6">
                <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-[linear-gradient(135deg,#f97316_0%,#fb7185_100%)] text-white shadow-[0_18px_50px_rgba(249,115,22,0.25)]">
                  <XCircle className="h-11 w-11" />
                </div>
                <h2 className="mt-5 text-center text-3xl font-black tracking-tight text-slate-950">
                  Not this time.
                </h2>
                <p className="mx-auto mt-3 max-w-2xl text-center text-base text-slate-700">
                  Try to concentrate more next time. If there is still something you do not
                  understand, ask the coaching agent to help you understand the course better.
                </p>
                {question?.explanation ? (
                  <div className="mt-5 rounded-[24px] border border-amber-200/80 bg-amber-50/90 p-4 text-sm text-slate-700">
                    <p className="font-semibold text-amber-800">Quick hint</p>
                    <p className="mt-1">{question.explanation}</p>
                  </div>
                ) : null}
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={onRetryChallenge}
                    className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-slate-950"
                  >
                    Try again
                  </button>
                  <button
                    type="button"
                    onClick={onOpenCoach}
                    className="inline-flex items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0f172a_0%,#1e293b_100%)] px-5 py-3 text-sm font-semibold text-white"
                  >
                    Open coaching agent
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-6 grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
                <div>
                  <h2 className="text-3xl font-black tracking-tight text-slate-950">
                    Your solo challenge is ready.
                  </h2>
                  <p className="mt-2 text-sm text-slate-600">
                    Pick the best answer. A correct answer gives you {awardedXp} XP.
                  </p>
                  {quiz.courseTitle ? (
                    <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                      Course: {quiz.courseTitle}
                    </p>
                  ) : null}

                  <div className="mt-5 rounded-[28px] border border-slate-200/80 bg-white/90 p-5 shadow-[0_18px_50px_rgba(15,23,42,0.08)]">
                    <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
                      Reformulated question
                    </p>
                    <p className="mt-3 text-lg font-bold leading-8 text-slate-950">
                      {question?.text}
                    </p>
                    <div className="mt-5 grid gap-3">
                      {question?.options.map((option) => {
                        const isSelected = selectedOptionId === option.id;
                        return (
                          <button
                            key={option.id}
                            type="button"
                            onClick={() => onSelectOption(option.id)}
                            className={`rounded-[22px] border px-4 py-3 text-left transition-all ${
                              isSelected
                                ? "border-emerald-500 bg-emerald-50 shadow-[0_12px_28px_rgba(16,185,129,0.12)]"
                                : "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50"
                            }`}
                          >
                            <div className="flex items-start gap-3">
                              <div
                                className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-black ${
                                  isSelected
                                    ? "bg-emerald-600 text-white"
                                    : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {option.id}
                              </div>
                              <p className="text-sm font-semibold text-slate-900">{option.label}</p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={onSubmitAnswer}
                      disabled={!selectedOptionId || isSubmittingAnswer}
                      className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#0ea37a_0%,#22c7b4_58%,#14b8a6_100%)] px-5 py-3 text-sm font-black text-white shadow-[0_18px_44px_rgba(14,163,122,0.24)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <Zap className="h-4 w-4" />
                      {isSubmittingAnswer ? "Checking answer..." : "Submit answer"}
                    </button>
                    <button
                      type="button"
                      onClick={onClose}
                      disabled={isSubmittingAnswer}
                      className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/85 px-5 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-white hover:text-slate-950"
                    >
                      Close
                    </button>
                  </div>
                  {errorMessage ? (
                    <p className="mt-3 text-sm font-medium text-rose-700">{errorMessage}</p>
                  ) : null}
                </div>

                <div className="rounded-[30px] border border-white/75 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(255,255,255,0.8))] p-4 shadow-[0_18px_50px_rgba(15,23,42,0.12)]">
                  <div className="rounded-[24px] border border-slate-200/80 bg-[linear-gradient(160deg,rgba(236,253,245,0.96),rgba(240,249,255,0.96),rgba(255,247,237,0.96))] p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">
                          Reward
                        </p>
                        <p className="mt-1 text-3xl font-black text-slate-950">{awardedXp} XP</p>
                      </div>
                      <div className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-[linear-gradient(135deg,#f59e0b_0%,#fb923c_100%)] text-white shadow-[0_18px_36px_rgba(249,115,22,0.3)]">
                        <Zap className="h-8 w-8" />
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3">
                      <div className="rounded-[22px] border border-emerald-200/80 bg-white/80 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                          Focus
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          Last failed quiz concept
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-sky-200/80 bg-white/80 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-sky-700">
                          Question mode
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          {question?.generationMode === "llm_recreated_question"
                            ? "Fresh LLM reformulation"
                            : "Fallback source question"}
                        </p>
                      </div>
                      <div className="rounded-[22px] border border-amber-200/80 bg-white/80 px-4 py-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-700">
                          Reminder
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-900">
                          Read every option before choosing.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <style jsx global>{`
        @keyframes solo-challenge-float {
          0%,
          100% {
            transform: translateY(0) scale(1) rotate(0deg);
            opacity: 0.55;
          }
          50% {
            transform: translateY(-12px) scale(1.08) rotate(6deg);
            opacity: 1;
          }
        }

        @keyframes celebration-wiggle {
          0%,
          100% {
            transform: rotate(0deg) scale(1);
          }
          25% {
            transform: rotate(-10deg) scale(1.05);
          }
          75% {
            transform: rotate(10deg) scale(1.08);
          }
        }
      `}</style>
    </div>
  );
}
