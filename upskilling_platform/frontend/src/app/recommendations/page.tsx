"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Lightbulb, Loader2, RefreshCcw } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";
import { routes } from "@/app/lib/routes";

type RecommendationItem = {
  type?: string;
  priority?: string;
  skillDomain?: string;
  title?: string;
  courseId?: string;
  courseTitle?: string;
  lessonId?: string | null;
  reason?: string;
  whyNow?: string[];
  learnerMessage?: string;
  actionLabel?: string;
};

type RecommendationResponse = {
  success?: boolean;
  status?: string;
  cacheStatus?: "fresh" | "stale_revalidating" | "missing_revalidating";
  message?: string;
  summary?: {
    total?: number;
    highPriority?: number;
    mediumPriority?: number;
    lowPriority?: number;
  };
  recommendations?: RecommendationItem[];
};

function getPriorityStyle(priority: string) {
  switch (priority) {
    case "high":
      return {
        badge: "bg-rose-100 text-rose-700",
        border: "border-rose-200",
      };
    case "medium":
      return {
        badge: "bg-amber-100 text-amber-700",
        border: "border-amber-200",
      };
    default:
      return {
        badge: "bg-sky-100 text-sky-700",
        border: "border-sky-200",
      };
  }
}

function isPreparationMessage(message?: string) {
  if (!message) {
    return false;
  }

  return /prepared|preparing|background/i.test(message);
}

export default function RecommendationsPage() {
  const { user, tenantId } = useAuth();
  const userId = user?.id ?? null;
  const effectiveTenantId = tenantId || user?.tenant_id || null;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [payload, setPayload] = useState<RecommendationResponse | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    if (!userId) {
      return;
    }

    const controller = new AbortController();
    let active = true;

    async function loadRecommendations() {
      try {
        setIsLoading(true);
        setError(null);

        console.log(
          `[Agno Recommendation Agent] page fetch cycle started. tenantId=${effectiveTenantId || "auto"} userId=${userId}`,
        );

        const response = await fetch("/api/recommendation-agent/recommendations", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            tenantId: effectiveTenantId,
            userId,
          }),
        });

        const data = (await response.json().catch(() => null)) as RecommendationResponse | null;
        if (!response.ok || !data?.success) {
          throw new Error(data?.message || "Recommendations could not be loaded right now.");
        }

        if (active) {
          const nextRecommendations = data.recommendations || [];
          console.log(
            `[Agno Recommendation Agent] page received recommendation payload. tenantId=${effectiveTenantId || "auto"} userId=${userId} recommendationCount=${nextRecommendations.length} total=${data.summary?.total || 0}`,
          );
          setPayload(data);
        }
      } catch (fetchError) {
        if (active && fetchError instanceof Error && fetchError.name !== "AbortError") {
          setError(fetchError.message);
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    void loadRecommendations();

    return () => {
      active = false;
      controller.abort();
    };
  }, [effectiveTenantId, refreshTick, userId]);

  const shouldPollPreparedRecommendations =
    payload?.status === "pending" ||
    payload?.cacheStatus === "missing_revalidating" ||
    payload?.cacheStatus === "stale_revalidating" ||
    isPreparationMessage(payload?.message);

  useEffect(() => {
    if (!userId || !shouldPollPreparedRecommendations) {
      return;
    }

    const timer = window.setTimeout(() => {
      setRefreshTick((current) => current + 1);
    }, 5000);

    return () => window.clearTimeout(timer);
  }, [refreshTick, shouldPollPreparedRecommendations, userId]);

  const groupedRecommendations = useMemo(() => {
    const items = payload?.recommendations || [];
    return {
      high: items.filter((item) => (item.priority || "medium") === "high"),
      medium: items.filter((item) => item.priority === "medium"),
      low: items.filter((item) => item.priority === "low"),
    };
  }, [payload]);

  return (
    <div className="grid gap-6">
      <section className="rounded-[28px] border border-border/70 bg-card p-6 shadow-[0_16px_55px_rgba(15,23,42,0.06)]">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-primary/10">
            <BookOpen className="h-7 w-7 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-text-primary">Recommendations</h2>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-[24px] border border-rose-200 bg-rose-50/80 px-4 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-rose-700">
              High priority
            </p>
            <p className="mt-2 text-3xl font-semibold text-rose-800">
              {isLoading && !payload ? "-" : payload?.summary?.highPriority || 0}
            </p>
          </div>
          <div className="rounded-[24px] border border-amber-200 bg-amber-50/80 px-4 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-amber-700">
              Medium priority
            </p>
            <p className="mt-2 text-3xl font-semibold text-amber-800">
              {isLoading && !payload ? "-" : payload?.summary?.mediumPriority || 0}
            </p>
          </div>
          <div className="rounded-[24px] border border-sky-200 bg-sky-50/80 px-4 py-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-sky-700">
              Light suggestions
            </p>
            <p className="mt-2 text-3xl font-semibold text-sky-800">
              {isLoading && !payload ? "-" : payload?.summary?.lowPriority || 0}
            </p>
          </div>
        </div>

        {isLoading && !payload ? (
          <div className="mt-6 overflow-hidden rounded-[28px] border border-border/70 bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] shadow-[0_16px_55px_rgba(15,23,42,0.04)]">
            <div className="border-b border-border/60 px-6 py-5">
              <div className="flex items-center gap-3 text-sm font-medium text-text-primary">
                <Loader2 className="h-5 w-5 animate-spin text-primary" />
                Your personalized recommendations are being prepared
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                We&apos;re reading your recent progress, current course activity, and skill signals to
                tailor the next set of suggestions just for you. This usually takes a moment.
              </p>
            </div>
            <div className="grid gap-4 p-6 md:grid-cols-3">
              {["high", "medium", "low"].map((tone) => (
                <div
                  key={tone}
                  className="rounded-[24px] border border-dashed border-border bg-white/70 p-4"
                >
                  <div className="h-3 w-24 animate-pulse rounded-full bg-slate-200/80" />
                  <div className="mt-4 h-5 w-3/4 animate-pulse rounded-full bg-slate-200/80" />
                  <div className="mt-3 space-y-2">
                    <div className="h-3 w-full animate-pulse rounded-full bg-slate-100" />
                    <div className="h-3 w-11/12 animate-pulse rounded-full bg-slate-100" />
                    <div className="h-3 w-9/12 animate-pulse rounded-full bg-slate-100" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : error && !payload ? (
          <div className="mt-6 rounded-[28px] border border-rose-200 bg-rose-50/90 px-6 py-8 text-center">
            <p className="text-sm font-medium text-rose-700">{error}</p>
          </div>
        ) : payload?.recommendations?.length ? (
          <div className="mt-6 grid gap-5 xl:grid-cols-3">
            {[
              {
                title: "Start here",
                subtitle: "The most important next actions",
                items: groupedRecommendations.high,
              },
              {
                title: "Worth continuing",
                subtitle: "Skills that are improving but still need structure",
                items: groupedRecommendations.medium,
              },
              {
                title: "Light refresh",
                subtitle: "Useful revision or lower-pressure follow-ups",
                items: groupedRecommendations.low,
              },
            ].map((column) => (
              <section
                key={column.title}
                className="rounded-[28px] border border-border/70 bg-white/90 p-4 shadow-[0_16px_40px_rgba(15,23,42,0.05)]"
              >
                <div>
                  <h3 className="text-base font-semibold text-text-primary">{column.title}</h3>
                  <p className="mt-1 text-sm text-text-secondary">{column.subtitle}</p>
                </div>

                <div className="mt-4 space-y-3">
                  {column.items.length > 0 ? (
                    column.items.map((item, index) => {
                      const style = getPriorityStyle(item.priority || "medium");
                      const href =
                        item.type === "lesson_recommendation" && item.courseId && item.lessonId
                          ? routes.learn(item.courseId, item.lessonId)
                          : item.type === "course_recommendation" && item.courseId
                            ? routes.courseDetail(item.courseId)
                            : routes.recommendationsSkillGap;

                      return (
                        <article
                          key={`${column.title}-${item.title || "rec"}-${index}`}
                          className={`rounded-[24px] border ${style.border} bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] p-4 transition-transform duration-500 hover:-translate-y-1`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                              {item.type === "topic_suggestion" ? (
                                <Lightbulb className="h-4 w-4" />
                              ) : item.type === "lesson_recommendation" ? (
                                <RefreshCcw className="h-4 w-4" />
                              ) : (
                                <BookOpen className="h-4 w-4" />
                              )}
                            </div>
                            <span
                              className={`rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${style.badge}`}
                            >
                              {item.priority || "medium"}
                            </span>
                          </div>

                          <h4 className="mt-4 text-base font-semibold leading-6 text-text-primary">
                            {item.title || "Recommendation"}
                          </h4>
                          <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-primary/80">
                            {item.skillDomain || "Learning focus"}
                          </p>
                          <p className="mt-3 text-sm leading-6 text-text-secondary">
                            {item.reason || "A suggested next action based on current learner signals."}
                          </p>
                          <p className="mt-3 rounded-2xl bg-background/90 px-3 py-2 text-sm leading-6 text-text-secondary">
                            {item.learnerMessage || "Learner guidance is being prepared."}
                          </p>

                          {item.type === "topic_suggestion" ? null : (
                            <div className="mt-4">
                              <Link
                                href={href}
                                className="inline-flex items-center gap-2 rounded-full bg-text-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-slate-800"
                              >
                                {item.actionLabel || "Open"}
                                <ArrowRight className="h-4 w-4" />
                              </Link>
                            </div>
                          )}
                        </article>
                      );
                    })
                  ) : (
                    <div className="rounded-[24px] border border-dashed border-border bg-[linear-gradient(180deg,#ffffff_0%,#f8fbff_100%)] px-4 py-6 text-sm text-text-secondary">
                      {error ? (
                        error
                      ) : isPreparationMessage(payload?.message) ? (
                        <div className="space-y-3">
                          <p className="text-sm font-semibold text-text-primary">
                            Your personalized recommendation is still being prepared.
                          </p>
                          <p className="text-sm leading-6 text-text-secondary">
                            We&apos;re combining your latest progress, course activity, and skill
                            signals to tailor the next suggestions specifically for you. The feed
                            will appear as soon as the analysis is ready.
                          </p>
                        </div>
                      ) : (
                        payload?.message || "Recommendations are being prepared."
                      )}
                    </div>
                  )}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-[28px] border border-dashed border-border bg-card px-6 py-10 text-center shadow-[0_16px_40px_rgba(15,23,42,0.04)]">
            {error ? (
              <p className="text-sm font-medium text-rose-700">{error}</p>
            ) : isPreparationMessage(payload?.message) ? (
              <div className="mx-auto max-w-2xl space-y-3">
                <p className="text-sm font-semibold text-text-primary">
                  Your personalized recommendation is being prepared.
                </p>
                <p className="text-sm leading-6 text-text-secondary">
                  We&apos;re using your latest learner signals to build a recommendation feed just
                  for you. It should appear in a moment.
                </p>
              </div>
            ) : (
              <p className="text-sm font-medium text-text-primary">
                {payload?.message || "Recommendations are being prepared."}
              </p>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
