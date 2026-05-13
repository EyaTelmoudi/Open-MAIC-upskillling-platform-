"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle, Loader2, Trophy, XCircle } from "lucide-react";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Badge } from "@/app/components/ui/Badge";

type QuizQuestion = {
  id: string;
  text: string;
  type: string;
  options: Array<{ value: string; label: string }>;
  allowMultiple: boolean;
  order: number;
};

type QuizPayload = {
  lessonId: string;
  courseId: string;
  title: string;
  passingScore: number;
  questions: QuizQuestion[];
};

type QuizResult = {
  attemptId: string;
  passed: boolean;
  score: number;
  totalQuestions: number;
  correctCount: number;
  questions: Array<{
    id: string;
    text: string;
    options: Array<{ value: string; label: string }>;
    userAnswers: string[];
    correctAnswers: string[];
    isCorrect: boolean;
    explanation?: string | null;
    allowMultiple: boolean;
  }>;
};

export function AiPlatformQuiz({
  lessonId,
  onComplete,
  onAttemptEvaluated,
}: {
  lessonId: string;
  onComplete?: () => void | Promise<void>;
  onAttemptEvaluated?: (result: QuizResult) => void | Promise<void>;
}) {
  const [quiz, setQuiz] = useState<QuizPayload | null>(null);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<QuizResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const completionTriggeredRef = useRef(false);

  useEffect(() => {
    async function loadQuiz() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/ai-course-builder/platform-course-quiz/${lessonId}`, {
          cache: "no-store",
        });
        const data = (await response.json()) as {
          success?: boolean;
          quiz?: QuizPayload;
          error?: string;
        };
        if (!response.ok || !data.success || !data.quiz) {
          throw new Error(data.error || "Failed to load AI-generated quiz");
        }
        setQuiz(data.quiz);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : "Failed to load AI-generated quiz");
      } finally {
        setIsLoading(false);
      }
    }

    void loadQuiz();
  }, [lessonId]);

  const answeredCount = useMemo(
    () => Object.values(answers).filter((entry) => entry.length > 0).length,
    [answers],
  );

  useEffect(() => {
    if (!result?.passed || !onComplete || completionTriggeredRef.current) {
      return;
    }

    completionTriggeredRef.current = true;
    void onComplete();
  }, [onComplete, result]);

  function toggleAnswer(questionId: string, value: string, allowMultiple: boolean) {
    setAnswers((current) => {
      const existing = current[questionId] || [];
      if (!allowMultiple) {
        return {
          ...current,
          [questionId]: [value],
        };
      }

      const next = existing.includes(value)
        ? existing.filter((item) => item !== value)
        : [...existing, value];

      return {
        ...current,
        [questionId]: next,
      };
    });
  }

  async function handleSubmit() {
    if (!quiz) return;
    if (answeredCount === 0) {
      setError("Select at least one answer before submitting.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/ai-course-builder/platform-course-quiz/${lessonId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });
      const data = (await response.json()) as {
        success?: boolean;
        result?: QuizResult;
        error?: string;
      };
      if (!response.ok || !data.success || !data.result) {
        throw new Error(data.error || "Failed to submit AI-generated quiz");
      }
      setResult(data.result);
      if (onAttemptEvaluated) {
        await onAttemptEvaluated(data.result);
      }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Failed to submit AI-generated quiz");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !quiz) {
    return (
      <Card className="p-8 text-center">
        <AlertCircle className="mx-auto mb-4 h-12 w-12 text-destructive" />
        <p className="text-text-secondary">{error}</p>
      </Card>
    );
  }

  if (!quiz) {
    return null;
  }

  if (result) {
    return (
      <div className="space-y-6">
        <Card className="p-6">
          <div className="text-center">
            {result.passed ? (
              <CheckCircle className="mx-auto mb-4 h-16 w-16 text-green-500" />
            ) : (
              <XCircle className="mx-auto mb-4 h-16 w-16 text-destructive" />
            )}
            <h2 className="text-2xl font-bold text-text-primary">
              {result.passed ? "Quiz completed successfully" : "Quiz review"}
            </h2>
            <p className="mt-2 text-text-secondary">
              Score: {result.score.toFixed(0)}% • {result.correctCount}/{result.totalQuestions} correct
            </p>
          </div>
        </Card>

        <div className="space-y-4">
          {result.questions.map((question, index) => (
            <Card key={question.id} className="p-4">
              <div className="mb-3 flex items-center gap-2">
                <Badge variant="outline">Question {index + 1}</Badge>
                {question.isCorrect ? (
                  <Badge className="bg-green-500/10 text-green-500">Correct</Badge>
                ) : (
                  <Badge className="bg-destructive/10 text-destructive">Incorrect</Badge>
                )}
              </div>
              <p className="mb-3 font-medium text-text-primary">{question.text}</p>
              <div className="space-y-2">
                {question.options.map((option) => {
                  const isCorrect = question.correctAnswers.includes(option.value);
                  const isChosen = question.userAnswers.includes(option.value);
                  return (
                    <div
                      key={option.value}
                      className={`rounded-lg border p-3 text-sm ${
                        isCorrect
                          ? "border-green-500/30 bg-green-500/10"
                          : isChosen
                            ? "border-destructive/30 bg-destructive/10"
                            : "border-border bg-background/50"
                      }`}
                    >
                      <span className="font-semibold">{option.value}.</span> {option.label}
                    </div>
                  );
                })}
              </div>
              {question.explanation ? (
                <div className="mt-4 rounded-lg border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-slate-700">
                  <span className="font-semibold text-slate-900">Explanation:</span> {question.explanation}
                </div>
              ) : null}
            </Card>
          ))}
        </div>

        {result.passed ? (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
            Quiz passed. Marking lesson complete and preparing the next step.
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <span className="text-sm text-text-secondary">
            Quiz • {quiz.questions.length} questions
          </span>
        </div>
        <span className="text-sm text-text-secondary">
          {answeredCount}/{quiz.questions.length} answered
        </span>
      </div>

      {error ? (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">{error}</span>
        </div>
      ) : null}

      <div className="space-y-6">
        {quiz.questions.map((question, index) => (
          <Card key={question.id} className="p-4">
            <div className="mb-4">
              <div className="mb-2 flex items-center gap-2">
                <Badge variant="outline">Question {index + 1}</Badge>
                {question.allowMultiple ? (
                  <Badge variant="outline">Select all that apply</Badge>
                ) : null}
              </div>
              <p className="font-medium text-text-primary">{question.text}</p>
            </div>
            <div className="space-y-2">
              {question.options.map((option) => {
                const selected = (answers[question.id] || []).includes(option.value);
                return (
                  <button
                    key={option.value}
                    onClick={() => toggleAnswer(question.id, option.value, question.allowMultiple)}
                    className={`w-full rounded-lg border p-3 text-left text-sm transition-colors ${
                      selected
                        ? "border-primary bg-primary text-white shadow-[0_10px_24px_rgba(37,99,235,0.28)]"
                        : "border-slate-200 bg-background/50 text-text-secondary hover:border-slate-400 hover:bg-slate-100"
                    }`}
                  >
                    <span className="font-semibold">{option.value}.</span> {option.label}
                  </button>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      <Button
        className="w-full"
        size="lg"
        onClick={handleSubmit}
        disabled={isSubmitting || answeredCount === 0}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Verifying answers...
          </>
        ) : (
          <>
            <CheckCircle className="mr-2 h-4 w-4" />
            Verify Answers
          </>
        )}
      </Button>
    </div>
  );
}
