"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy, Medal, Crown, TrendingUp, TrendingDown, Minus, Users, Loader2, Flame, Zap } from "lucide-react";
import { getLeaderboard, getMyRank, getTeams, type LeaderboardEntry, type UserRankResponse } from "@/app/lib/api";
import { AppShell } from "@/app/components/layout/AppShell";
import { useAuth } from "@/app/context/AuthContext";
import { useGamificationRealtime } from "@/app/hooks/useGamificationRealtime";

const tierColors = {
  gold: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700" },
  silver: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-600" },
  bronze: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-700" },
  platinum: { bg: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-700" },
};

function getTierFromLevel(level: number): string {
  if (level >= 51) return "platinum";
  if (level >= 26) return "gold";
  if (level >= 11) return "silver";
  return "bronze";
}

function getRankIcon(rank: number) {
  if (rank === 1) return <Crown className="h-5 w-5 text-amber-500" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-slate-500" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-orange-500" />;
  return null;
}

function getRankChangeIcon(change: number) {
  if (change > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
  if (change < 0) return <TrendingDown className="h-4 w-4 text-destructive" />;
  return <Minus className="h-4 w-4 text-text-secondary" />;
}

export default function LeaderboardPage() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [myRank, setMyRank] = useState<UserRankResponse | null>(null);
  const [selectedType, setSelectedType] = useState<string>("global");
  const [error, setError] = useState<string | null>(null);
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      let resolvedTeamId = activeTeamId;
      if (selectedType === "team" && !resolvedTeamId) {
        const teams = await getTeams();
        resolvedTeamId = teams[0]?.id || null;
        setActiveTeamId(resolvedTeamId);
        if (!resolvedTeamId) {
          setLeaderboard([]);
          setError(null);
          setLoading(false);
          return;
        }
      }

      const data = await getLeaderboard(
        selectedType as "global" | "weekly" | "monthly" | "team",
        resolvedTeamId ? { teamId: resolvedTeamId } : undefined
      );
      setLeaderboard(data.leaderboard);
      
      try {
        const rank = await getMyRank();
        setMyRank(rank);
      } catch {
        setMyRank(null);
      }
    } catch (err) {
      console.error("Failed to load leaderboard:", err);
      setError("Failed to load leaderboard data");
    } finally {
      setLoading(false);
    }
  }, [activeTeamId, selectedType]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useGamificationRealtime(user?.id, Boolean(user), () => {
    loadData();
  });

  const leaderboardTypes = [
    { value: "global", label: "Global", description: "All learners", icon: Trophy },
    { value: "weekly", label: "This Week", description: "Recent momentum", icon: Flame },
    { value: "monthly", label: "This Month", description: "Monthly XP", icon: Zap },
    { value: "team", label: "My Team", description: "Team ranking", icon: Users },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-[1440px] space-y-6">
        <section className="overflow-hidden rounded-[30px] border border-emerald-300/55 bg-[radial-gradient(circle_at_12%_18%,_rgba(52,211,153,0.46),_transparent_30%),radial-gradient(circle_at_76%_14%,_rgba(14,165,233,0.42),_transparent_28%),radial-gradient(circle_at_88%_82%,_rgba(242,165,27,0.24),_transparent_24%),linear-gradient(135deg,_#063B35_0%,_#075E63_42%,_#0B315F_72%,_#101827_100%)] px-6 py-7 text-white shadow-[0_30px_80px_rgba(6,78,59,0.36)] sm:px-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100/85">
                Leaderboard
              </p>
              <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-[2.25rem]">
                Compare learning momentum across your community.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-emerald-50 sm:text-base">
                Follow XP, levels, and rank movement from one focused leaderboard.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 xl:w-auto xl:min-w-[440px]">
              {myRank && (
                <div className="rounded-[24px] border border-white/30 bg-white/16 p-4 shadow-[0_20px_48px_rgba(6,78,59,0.18)] backdrop-blur">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/60 bg-white/88 px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
                      <div className="mb-3 h-1.5 w-10 rounded-full bg-emerald-500" />
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Your rank
                      </p>
                      <p className="mt-2 font-mono text-3xl font-semibold text-slate-950">
                        #{myRank.rank}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-white/60 bg-white/88 px-4 py-3 shadow-[0_12px_28px_rgba(15,23,42,0.08)]">
                      <div className="mb-3 h-1.5 w-10 rounded-full bg-gold" />
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                        Total XP
                      </p>
                      <p className="mt-2 font-mono text-3xl font-semibold text-slate-950">
                        {myRank.total_xp.toLocaleString()}
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        <nav
          aria-label="Leaderboard views"
          className="overflow-hidden rounded-[26px] border border-emerald-200/70 bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(236,253,245,0.84),rgba(224,242,254,0.72))] p-2 shadow-[0_18px_44px_rgba(14,163,122,0.1)] backdrop-blur"
        >
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {leaderboardTypes.map((type) => (
              <button
                key={type.value}
                onClick={() => setSelectedType(type.value)}
                className={`flex min-w-[210px] flex-1 items-center gap-3 rounded-2xl border px-4 py-3 text-left text-sm font-medium transition-all ${
                  selectedType === type.value
                    ? "border-emerald-300 bg-[linear-gradient(135deg,rgba(14,163,122,0.14),rgba(34,199,180,0.12),rgba(14,165,233,0.1))] text-primary shadow-[0_14px_30px_rgba(14,163,122,0.14)]"
                    : "border-transparent bg-white/58 text-slate-600 hover:border-emerald-200 hover:bg-white/82 hover:text-slate-950"
                }`}
              >
                <div
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${
                    selectedType === type.value ? "bg-primary/15 text-primary" : "bg-white/80 text-slate-500"
                  }`}
                >
                  <type.icon className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0">
                  <p className="font-semibold">{type.label}</p>
                  <p
                    className={`mt-1 text-xs leading-5 ${
                      selectedType === type.value ? "text-primary/80" : "text-slate-500"
                    }`}
                  >
                    {type.description}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </nav>

        {/* Leaderboard Table */}
        {loading ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-[28px] border border-white/70 bg-white/80 shadow-[0_20px_48px_rgba(14,163,122,0.1)] backdrop-blur">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="rounded-[28px] border border-red-200 bg-red-50/90 px-6 py-10 text-center text-sm font-medium text-red-700 shadow-[0_20px_48px_rgba(239,68,68,0.08)]">
            {error}
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="flex min-h-[280px] items-center justify-center rounded-[28px] border border-dashed border-teal-200 bg-[linear-gradient(135deg,rgba(240,253,250,0.92),rgba(224,242,254,0.82))] px-6 py-10 shadow-[0_20px_48px_rgba(14,163,122,0.08)]">
            <div className="text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#0ea37a,#22c7b4,#0ea5e9)] text-white shadow-[0_14px_30px_rgba(14,163,122,0.22)]">
                <Trophy className="h-7 w-7" />
              </div>
              <p className="mt-4 text-lg font-semibold text-slate-950">No rankings yet</p>
              <p className="mt-1 text-sm text-slate-500">
                {selectedType === "team"
                  ? "Join a team and start learning to appear on the team leaderboard."
                  : "Start learning to appear on the leaderboard!"}
              </p>
            </div>
          </div>
        ) : (
          <div className="overflow-hidden rounded-[28px] border border-teal-200/70 bg-[radial-gradient(circle_at_16%_18%,rgba(34,199,180,0.16),transparent_30%),radial-gradient(circle_at_86%_8%,rgba(14,165,233,0.14),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(236,253,245,0.9),rgba(224,242,254,0.72))] shadow-[0_22px_54px_rgba(14,163,122,0.12)] backdrop-blur">
            <div className="flex flex-col gap-2 border-b border-white/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">Current ranking</h2>
                <p className="text-sm text-slate-600">
                  {leaderboard.length} learners ranked by XP and recent movement.
                </p>
              </div>
              <span className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-200 bg-white/80 px-3 py-1 text-xs font-semibold text-emerald-700 shadow-[0_8px_18px_rgba(14,163,122,0.1)]">
                <Trophy className="h-3.5 w-3.5" />
                {leaderboardTypes.find((type) => type.value === selectedType)?.label || "Leaderboard"}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/70 bg-white/55">
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Rank
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Learner
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Level
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      XP
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                      Trend
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/70">
                  {leaderboard.map((entry) => {
                    const tier = getTierFromLevel(entry.level);
                    const colors = tierColors[tier as keyof typeof tierColors];
                    const isCurrentUser = user?.id === entry.user_id;
                    
                    return (
                      <tr
                        key={entry.user_id}
                        className={`transition-colors ${
                          isCurrentUser
                            ? "bg-emerald-50/90"
                            : "bg-white/45 hover:bg-white/80"
                        }`}
                      >
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex h-10 w-10 items-center justify-center rounded-2xl border border-white/80 bg-white/75 shadow-[0_8px_18px_rgba(15,23,42,0.06)]">
                            {getRankIcon(entry.rank) || (
                              <span className="font-mono text-lg font-semibold text-slate-800">
                                {entry.rank}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-11 w-11 items-center justify-center rounded-2xl text-sm font-semibold shadow-[0_10px_22px_rgba(15,23,42,0.08)] ${
                                isCurrentUser
                                  ? "bg-[linear-gradient(135deg,#0ea37a,#22c7b4)] text-white"
                                  : "bg-white text-emerald-700"
                              }`}
                            >
                              {entry.user_name?.charAt(0).toUpperCase() || "?"}
                            </div>
                            <div>
                              <p className={`font-semibold ${isCurrentUser ? "text-emerald-700" : "text-slate-950"}`}>
                                {entry.user_name || "Unknown User"}
                                {isCurrentUser && (
                                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">You</span>
                                )}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${colors.bg} ${colors.border} ${colors.text}`}>
                                  {tier.charAt(0).toUpperCase() + tier.slice(1)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <span className="font-mono text-lg font-semibold text-slate-950">
                            {entry.level}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <span className="font-mono text-lg font-semibold text-amber-600">
                            {entry.total_xp.toLocaleString()}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center justify-center">
                            {getRankChangeIcon(entry.rank_change)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Top 3 Podium */}
        {leaderboard.length >= 3 && !loading && !error && (
          <section className="rounded-[28px] border border-emerald-200/70 bg-[radial-gradient(circle_at_14%_18%,rgba(16,185,129,0.18),transparent_30%),radial-gradient(circle_at_88%_10%,rgba(242,165,27,0.18),transparent_28%),linear-gradient(135deg,rgba(255,255,255,0.96),rgba(240,253,244,0.9),rgba(255,251,235,0.72))] p-6 shadow-[0_22px_54px_rgba(14,163,122,0.12)] backdrop-blur sm:p-8">
            <div className="mb-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">
                Top learners
              </p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">Highest XP right now</h2>
            </div>
            <div className="flex items-end justify-center gap-3 sm:gap-5">
              {/* 2nd Place */}
              <div className="flex flex-col items-center">
                <div className="relative mb-2">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-500 text-2xl font-bold text-white shadow-[0_14px_28px_rgba(100,116,139,0.22)] ring-4 ring-white/80">
                    {leaderboard[1]?.user_name?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <Medal className="absolute -bottom-2 left-1/2 h-8 w-8 -translate-x-1/2 text-slate-500" />
                </div>
                <p className="max-w-[100px] truncate text-sm font-semibold text-slate-950">
                  {leaderboard[1]?.user_name || "Unknown"}
                </p>
                <p className="font-mono text-sm text-slate-500">
                  {leaderboard[1]?.total_xp.toLocaleString()} XP
                </p>
                <div className="mt-2 flex h-20 w-24 items-end justify-center rounded-t-2xl border border-slate-200 bg-white/80 pb-2 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                  <span className="font-mono text-2xl font-bold text-slate-500">2</span>
                </div>
              </div>

              {/* 1st Place */}
              <div className="flex flex-col items-center">
                <div className="relative mb-2">
                  <div className="flex h-20 w-20 items-center justify-center rounded-[26px] bg-[linear-gradient(135deg,#f2a51b,#f59e0b,#10b981)] text-3xl font-bold text-white shadow-[0_18px_36px_rgba(242,165,27,0.26)] ring-4 ring-white/80">
                    {leaderboard[0]?.user_name?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <Crown className="absolute -top-6 left-1/2 h-8 w-8 -translate-x-1/2 text-amber-500" />
                </div>
                <p className="max-w-[100px] truncate text-sm font-semibold text-slate-950">
                  {leaderboard[0]?.user_name || "Unknown"}
                </p>
                <p className="font-mono text-sm text-amber-600">
                  {leaderboard[0]?.total_xp.toLocaleString()} XP
                </p>
                <div className="mt-2 flex h-28 w-24 items-end justify-center rounded-t-2xl border border-amber-200 bg-white/90 pb-2 shadow-[0_16px_34px_rgba(242,165,27,0.14)]">
                  <span className="font-mono text-3xl font-bold text-amber-500">1</span>
                </div>
              </div>

              {/* 3rd Place */}
              <div className="flex flex-col items-center">
                <div className="relative mb-2">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500 text-xl font-bold text-white shadow-[0_14px_28px_rgba(249,115,22,0.22)] ring-4 ring-white/80">
                    {leaderboard[2]?.user_name?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <Medal className="absolute -bottom-2 left-1/2 h-8 w-8 -translate-x-1/2 text-orange-500" />
                </div>
                <p className="max-w-[100px] truncate text-sm font-semibold text-slate-950">
                  {leaderboard[2]?.user_name || "Unknown"}
                </p>
                <p className="font-mono text-sm text-orange-600">
                  {leaderboard[2]?.total_xp.toLocaleString()} XP
                </p>
                <div className="mt-2 flex h-16 w-24 items-end justify-center rounded-t-2xl border border-orange-200 bg-white/80 pb-2 shadow-[0_12px_28px_rgba(15,23,42,0.06)]">
                  <span className="font-mono text-2xl font-bold text-orange-500">3</span>
                </div>
              </div>
            </div>
          </section>
        )}
      </div>
    </AppShell>
  );
}
