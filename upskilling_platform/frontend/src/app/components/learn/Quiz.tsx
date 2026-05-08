"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Badge } from "@/app/components/ui/Badge";
import {
  api,
  type AssessmentAttemptResult,
  type AssessmentQuestionResponse,
} from "@/app/lib/api";
import {
  CheckCircle,
  XCircle,
  Trophy,
  AlertCircle,
  Loader2,
} from "lucide-react";

interface QuizProps {
  lessonId: string;
  courseId: string;
  assessmentId?: string;
  onComplete?: () => void | Promise<void>;
}

export function Quiz({ lessonId, courseId, assessmentId, onComplete }: QuizProps) {
  const [questions, setQuestions] = useState<AssessmentQuestionResponse[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<AssessmentAttemptResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const completionTriggeredRef = useRef(false);

  const getAssessmentId = () => {
    return assessmentId || lessonId;
  };

  useEffect(() => {
    loadQuestions();
  }, [lessonId, courseId]);

  useEffect(() => {
    if (!result?.passed || !onComplete || completionTriggeredRef.current) {
      return;
    }

    completionTriggeredRef.current = true;
    void onComplete();
  }, [onComplete, result]);

  const loadQuestions = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const assessId = getAssessmentId();
      const data = await api.get<AssessmentQuestionResponse[]>(
        `/api/v1/learning/courses/${courseId}/assessments/${assessId}/questions`
      );
      setQuestions(data);
    } catch (err) {
      console.error("Failed to load questions:", err);
      setError("Failed to load quiz questions");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectAnswer = (questionId: string, answer: string) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: answer,
    }));
  };

  const handleSubmit = async () => {
    if (Object.keys(answers).length !== questions.length) {
      setError("Please answer every question before submitting the quiz.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const assessId = getAssessmentId();
      const submitResult = await api.post<AssessmentAttemptResult>(
        `/api/v1/learning/courses/${courseId}/assessments/${assessId}/submit`,
        { answers }
      );
      setResult(submitResult);
    } catch (err) {
      console.error("Failed to submit quiz:", err);
      setError("Failed to submit quiz. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !questions.length) {
    return (
      <Card className="p-8 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <p className="text-text-secondary">{error}</p>
        <Button variant="outline" className="mt-4" onClick={loadQuestions}>
          Retry
        </Button>
      </Card>
    );
  }

  if (result) {
    return (
      <div className="space-y-6">
        {/* Results Header */}
        <Card className="p-6">
          <div className="text-center">
            {result.passed ? (
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
            ) : (
              <XCircle className="h-16 w-16 text-destructive mx-auto mb-4" />
            )}
            <h2 className="text-2xl font-bold text-text-primary">
              {result.passed ? "Congratulations!" : "Keep Learning!"}
            </h2>
            <p className="text-text-secondary mt-2">
              {result.passed
                ? "You passed the quiz!"
                : "You didn't pass this time. Review your answers below and try again."}
            </p>
            <div className="mt-6 flex items-center justify-center gap-8">
              <div className="text-center">
                <div className="text-3xl font-bold text-primary">
                  {result.score.toFixed(0)}%
                </div>
                <p className="text-sm text-text-secondary">Score</p>
              </div>
              <div className="text-center">
                <div className="text-3xl font-bold text-text-primary">
                  {result.earned_points}/{result.total_points}
                </div>
                <p className="text-sm text-text-secondary">Points</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Question Review */}
        <div className="space-y-4">
          <h3 className="text-lg font-semibold text-text-primary">
            Question Review
          </h3>
          {result.questions.map((q, idx) => (
            <Card key={q.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  {q.is_correct ? (
                    <CheckCircle className="h-5 w-5 text-green-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive" />
                  )}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-medium text-text-secondary">
                      Question {idx + 1}
                    </span>
                    <Badge variant="outline">{q.points} pts</Badge>
                    {q.is_correct ? (
                      <Badge className="bg-green-500/10 text-green-500">
                        Correct
                      </Badge>
                    ) : (
                      <Badge className="bg-destructive/10 text-destructive">
                        Incorrect
                      </Badge>
                    )}
                  </div>
                  <p className="text-text-primary font-medium mb-3">{q.text}</p>
                  <div className="space-y-2">
                    {q.options.map((option) => {
                      const isUserAnswer = option === q.user_answer;
                      return (
                        <div
                          key={option}
                          className={`p-3 rounded-lg text-sm ${
                            q.is_correct && isUserAnswer
                              ? "bg-green-500/10 border border-green-500/30"
                              : isUserAnswer && !q.is_correct
                              ? "bg-destructive/10 border border-destructive/30"
                              : "bg-background/50"
                          }`}
                        >
                          <span className="text-text-primary">{option}</span>
                          {isUserAnswer && q.is_correct && (
                            <span className="ml-2 text-xs text-green-500">
                              (Your correct answer)
                            </span>
                          )}
                          {isUserAnswer && !q.is_correct && (
                            <span className="ml-2 text-xs text-destructive">
                              (Your Answer)
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
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

  const totalQuestions = questions.length;
  const answeredQuestions = Object.keys(answers).length;

  return (
    <div className="space-y-6">
      {/* Progress Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="h-5 w-5 text-amber-500" />
          <span className="text-sm text-text-secondary">
            Quiz • {totalQuestions} questions
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-text-secondary">
            {answeredQuestions}/{totalQuestions} answered
          </span>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-destructive/10 rounded-lg">
          <AlertCircle className="h-4 w-4 text-destructive" />
          <span className="text-sm text-destructive">{error}</span>
        </div>
      )}

      {/* Questions */}
      <div className="space-y-6">
        {questions.map((question, idx) => (
          <Card key={question.id} className="p-4">
            <div className="mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Badge variant="outline">Question {idx + 1}</Badge>
                <Badge variant="outline">{question.points} pts</Badge>
              </div>
              <p className="text-text-primary font-medium">{question.text}</p>
            </div>
            <div className="space-y-2">
              {question.options.map((option) => (
                <button
                  key={option}
                  onClick={() => handleSelectAnswer(question.id, option)}
                  className={`w-full p-3 rounded-lg text-left text-sm transition-colors ${
                    answers[question.id] === option
                      ? "bg-primary/10 border border-primary text-text-primary"
                      : "bg-background/50 border border-transparent hover:border-border text-text-secondary"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* Submit Button */}
      <Button
        className="w-full"
        size="lg"
        onClick={handleSubmit}
        disabled={isSubmitting || answeredQuestions === 0}
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Submitting...
          </>
        ) : (
          <>
            <CheckCircle className="h-4 w-4 mr-2" />
            Submit Quiz
          </>
        )}
      </Button>
    </div>
  );
}
