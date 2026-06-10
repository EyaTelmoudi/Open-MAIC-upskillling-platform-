"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@/app/components/layout/AppShell";
import { AchievementBadge } from "@/app/components/profile/AchievementBadge";
import { LevelBadge } from "@/app/components/profile/LevelBadge";
import { XPProgressBar } from "@/app/components/profile/XPProgressBar";
import { useAuth } from "@/app/context/AuthContext";
import { useGamificationRealtime } from "@/app/hooks/useGamificationRealtime";
import {
  getCertificates,
  getBadgeDefinitions,
  getEnrollments,
  getGamificationProfile,
  getUserProgress,
  getXpHistory,
  type CertificateListResponse,
  type BadgeResponse,
  type EnrollmentResponse,
  type GamificationProfileResponse,
  type UserProgressResponse,
  type XPHistoryResponse,
} from "@/app/lib/api";
import {
  Activity,
  Award,
  BookOpen,
  Flame,
  Loader2,
  Medal,
  Sparkles,
  Target,
  TrendingUp,
  Trophy,
  Zap,
} from "lucide-react";

interface BadgeWithUnlocked extends BadgeResponse {
  unlocked: boolean;
}

function formatDuration(totalMinutes: number) {
  if (totalMinutes <= 0) {
    return "0 min";
  }

  if (totalMinutes < 60) {
    return `${totalMinutes} min`;
  }

  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
}

export default function ProgressPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [gamificationProfile, setGamificationProfile] =
    useState<GamificationProfileResponse | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentResponse[]>([]);
  const [progressItems, setProgressItems] = useState<UserProgressResponse[]>([]);
  const [xpHistory, setXpHistory] = useState<XPHistoryResponse["transactions"]>([]);
  const [certificateCount, setCertificateCount] = useState(0);
  const [allBadges, setAllBadges] = useState<BadgeWithUnlocked[]>([]);

  const loadProgress = useCallback(async () => {
    if (!user) {
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const [profile, definitions, enrollmentData, progressData, xpData, certificateData] =
        await Promise.all([
          getGamificationProfile(),
          getBadgeDefinitions(),
          getEnrollments(user.id).catch(() => []),
          getUserProgress(user.id).catch(() => []),
          getXpHistory(20, 0).catch(() => ({ transactions: [] })),
          getCertificates(user.id).catch(
            () =>
              ({
                certificates: [],
                total: 0,
              }) as CertificateListResponse
          ),
        ]);

      setGamificationProfile(profile);
      const unlockedIds = new Set(profile.badges.user.map((badge) => badge.badge_id));
      setAllBadges(
        definitions.badges.map((badge) => ({
          ...badge,
          unlocked: unlockedIds.has(badge.badge_id),
        }))
      );
      setEnrollments(enrollmentData);
      setProgressItems(progressData);
      setXpHistory(xpData.transactions);
      setCertificateCount(certificateData.total);
    } catch (loadError) {
      console.error("Failed to load learner progress:", loadError);
      setError("Failed to load your progress right now.");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadProgress();
  }, [loadProgress]);

  useGamificationRealtime(user?.id, Boolean(user), () => {
    loadProgress();
  });

  const completedCourses = useMemo(
    () => enrollments.filter((item) => item.status === "completed").length,
    [enrollments]
  );
  const activeCourses = useMemo(
    () => enrollments.filter((item) => item.status === "in_progress").length,
    [enrollments]
  );
  const completedLessons = useMemo(
    () => progressItems.filter((item) => item.status === "completed").length,
    [progressItems]
  );
  const learningMinutes = useMemo(
    () =>
      Math.round(
        progressItems.reduce((total, item) => total + (item.time_spent || 0), 0) / 60
      ),
    [progressItems]
  );

  const totalXp = gamificationProfile?.xp.total ?? 0;
  const levelInfo = gamificationProfile?.level;
  const streakInfo = gamificationProfile?.streak;
  const rankInfo = gamificationProfile?.rank;
  const badgeCount = gamificationProfile?.badges.user.length ?? 0;

  return (
    <AppShell>
      <div className="mx-auto max-w-[1440px] space-y-6">
        <section className="overflow-hidden rounded-[30px] border border-emerald-300/55 bg-[radial-gradient(circle_at_12%_18%,_rgba(52,211,153,0.46),_transparent_30%),radial-gradient(circle_at_76%_14%,_rgba(14,165,233,0.42),_transparent_28%),radial-gradient(circle_at_88%_82%,_rgba(242,165,27,0.24),_transparent_24%),linear-gradient(135deg,_#063B35_0%,_#075E63_42%,_#0B315F_72%,_#101827_100%)] px-6 py-7 text-white shadow-[0_30px_80px_rgba(6,78,59,0.36)] sm:px-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100/85">
                Learning Progress
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-[2.25rem]">
                See how far your learning is really moving.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50 sm:text-base">
                Track your live XP, level, streak, completed learning, and momentum.
              </p>
            </div>
            <div className="grid min-w-[260px] grid-cols-2 gap-3 rounded-[28px] border border-white/30 bg-white/16 p-4 shadow-[0_20px_48px_rgba(6,78,59,0.18)] backdrop-blur">
              <div className="rounded-2xl border border-white/60 bg-white/88 px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
                <div className="mb-3 h-1.5 w-10 rounded-full bg-emerald-500" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Current level
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <LevelBadge level={levelInfo?.level || 1} size="sm" />
                  <span className="text-lg font-semibold text-slate-950">
                    Level {levelInfo?.level || 1}
                  </span>
                </div>
              </div>
              <div className="rounded-2xl border border-white/60 bg-white/88 px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
                <div className="mb-3 h-1.5 w-10 rounded-full bg-gold" />
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  Current streak
                </p>
                <div className="mt-2 flex items-center gap-2 text-slate-950">
                  <Flame className="h-5 w-5 text-amber-500" />
                  <span className="text-lg font-semibold">
                    {streakInfo?.current_streak ?? 0}{" "}
                    {(streakInfo?.current_streak ?? 0) === 1 ? "day" : "days"}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-[28px] border border-white/70 bg-white/80 shadow-sm">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="rounded-[28px] border border-red-200 bg-red-50/90 px-6 py-10 text-center text-sm font-medium text-red-700">
            {error}
          </div>
        ) : (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                {
                  label: "Total XP",
                  value: totalXp.toLocaleString(),
                  hint: `Rank #${rankInfo?.rank ?? "—"}`,
                  icon: Zap,
                  tone: "from-cyan-50 to-sky-50 text-cyan-950 border-cyan-100",
                  iconTone: "bg-cyan-500",
                },
                {
                  label: "Completed Courses",
                  value: String(completedCourses),
                  hint: `${activeCourses} in progress`,
                  icon: BookOpen,
                  tone: "from-emerald-50 to-teal-50 text-emerald-950 border-emerald-100",
                  iconTone: "bg-emerald-500",
                },
                {
                  label: "Completed Lessons",
                  value: String(completedLessons),
                  hint: formatDuration(learningMinutes),
                  icon: Target,
                  tone: "from-violet-50 to-indigo-50 text-violet-950 border-violet-100",
                  iconTone: "bg-violet-500",
                },
                {
                  label: "Achievements",
                  value: String(badgeCount),
                  hint: `${certificateCount} certificates`,
                  icon: Trophy,
                  tone: "from-amber-50 to-orange-50 text-amber-950 border-amber-100",
                  iconTone: "bg-amber-500",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className={`rounded-[26px] border bg-gradient-to-br ${item.tone} px-5 py-5 shadow-[0_14px_30px_rgba(15,23,42,0.06)]`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                        {item.label}
                      </p>
                      <p className="mt-3 text-3xl font-semibold tracking-tight">
                        {item.value}
                      </p>
                      <p className="mt-2 text-sm text-slate-600">{item.hint}</p>
                    </div>
                    <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ${item.iconTone} text-white shadow-lg`}>
                      <item.icon className="h-5 w-5" />
                    </div>
                  </div>
                </div>
              ))}
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.25fr_0.95fr]">
              <div className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.06)] backdrop-blur">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <TrendingUp className="h-5 w-5" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">
                      Level progress
                    </h2>
                    <p className="text-sm text-slate-600">
                      Your real XP progression toward the next level.
                    </p>
                  </div>
                </div>
                <div className="mt-6 grid gap-5 lg:grid-cols-[auto_1fr] lg:items-stretch">
                  <div className="flex min-h-[190px] flex-col items-center justify-center rounded-[24px] border border-emerald-100 bg-[linear-gradient(135deg,rgba(236,253,245,0.9),rgba(224,242,254,0.72))] px-6 py-5 text-center">
                    <LevelBadge level={levelInfo?.level || 1} size="lg" />
                    <p className="mt-3 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Current level
                    </p>
                    <p className="mt-1 text-xl font-semibold text-slate-950">
                      Level {levelInfo?.level || 1}
                    </p>
                  </div>

                  <div className="rounded-[24px] border border-slate-100 bg-white/72 px-5 py-5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Progress to next level
                        </p>
                        <p className="mt-2 font-mono text-2xl font-semibold text-slate-950">
                          {(levelInfo?.progress ?? 0).toFixed(0)}%
                        </p>
                      </div>
                      <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-right">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
                          Remaining
                        </p>
                        <p className="mt-1 font-mono text-xl font-semibold text-slate-950">
                          {(levelInfo?.next_level_xp ?? 0).toLocaleString()} XP
                        </p>
                      </div>
                    </div>

                    <div className="mt-5">
                      <XPProgressBar
                        currentXP={levelInfo?.xp_in_level ?? 0}
                        maxXP={levelInfo?.xp_needed ?? 1}
                        level={levelInfo?.level ?? 1}
                      />
                    </div>

                    <div className="mt-5 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Total XP
                        </p>
                        <p className="mt-2 font-mono text-xl font-semibold text-slate-950">
                          {totalXp.toLocaleString()}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                          Tier
                        </p>
                        <p className="mt-2 text-xl font-semibold capitalize text-slate-950">
                          {levelInfo?.tier ?? "bronze"}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                <div className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.06)] backdrop-blur">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                      <Flame className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">
                        Streak status
                      </h2>
                      <p className="text-sm text-slate-600">
                        Your consistency across learning days.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-amber-50 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">
                        Current streak
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {streakInfo?.current_streak ?? 0}{" "}
                        {(streakInfo?.current_streak ?? 0) === 1 ? "day" : "days"}
                      </p>
                    </div>
                    <div className="rounded-2xl bg-orange-50 px-4 py-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-orange-700">
                        Longest streak
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-slate-950">
                        {streakInfo?.longest_streak ?? 0} days
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.06)] backdrop-blur">
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-fuchsia-100 text-fuchsia-700">
                      <Activity className="h-5 w-5" />
                    </div>
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">
                        Recent XP activity
                      </h2>
                      <p className="text-sm text-slate-600">
                        Your latest recorded gamification events.
                      </p>
                    </div>
                  </div>
                  <div className="mt-5 space-y-3">
                    {xpHistory.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
                        No XP activity recorded yet.
                      </div>
                    ) : (
                      xpHistory.slice(0, 5).map((item) => (
                        <div
                          key={item.id}
                          className="flex items-start justify-between gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 px-4 py-3"
                        >
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-slate-950">
                              {item.reason}
                            </p>
                            <p className="mt-1 text-xs text-slate-500">
                              {new Date(item.created_at).toLocaleString()}
                            </p>
                          </div>
                          <div className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                            <Sparkles className="h-3.5 w-3.5" />+{item.amount} XP
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/70 bg-white/85 p-6 shadow-[0_20px_40px_rgba(15,23,42,0.06)] backdrop-blur">
              <div className="flex items-center gap-3 border-b border-slate-100 pb-5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <Trophy className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-950">
                    Achievements
                  </h2>
                  <p className="text-sm text-slate-600">
                    {badgeCount}/{allBadges.length} unlocked
                  </p>
                </div>
              </div>
              <div className="mt-5 grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-7">
                {allBadges.map((badge) => (
                  <AchievementBadge
                    key={badge.badge_id}
                    name={badge.name}
                    icon={badge.icon}
                    tier={badge.tier as "bronze" | "silver" | "gold" | "platinum"}
                    unlocked={badge.unlocked}
                    description={badge.description}
                    unlockHint={badge.unlock_hint}
                  />
                ))}
              </div>
            </section>

            <section className="grid gap-4 md:grid-cols-3">
              <div className="rounded-[26px] border border-white/70 bg-white/85 p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                    <Medal className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Leaderboard rank</p>
                    <p className="text-xs text-slate-500">Your current competitive standing</p>
                  </div>
                </div>
                <p className="mt-4 text-3xl font-semibold text-slate-950">
                  #{rankInfo?.rank ?? "—"}
                </p>
              </div>
              <div className="rounded-[26px] border border-white/70 bg-white/85 p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                    <Award className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Certificates earned</p>
                    <p className="text-xs text-slate-500">Validated course completions</p>
                  </div>
                </div>
                <p className="mt-4 text-3xl font-semibold text-slate-950">
                  {certificateCount}
                </p>
              </div>
              <div className="rounded-[26px] border border-white/70 bg-white/85 p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                    <Target className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-950">Learning time</p>
                    <p className="text-xs text-slate-500">Tracked from real lesson activity</p>
                  </div>
                </div>
                <p className="mt-4 text-3xl font-semibold text-slate-950">
                  {formatDuration(learningMinutes)}
                </p>
              </div>
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
