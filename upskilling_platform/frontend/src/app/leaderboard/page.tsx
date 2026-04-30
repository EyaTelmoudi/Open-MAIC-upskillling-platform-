"use client";

import { useCallback, useEffect, useState } from "react";
import { Trophy, Medal, Crown, TrendingUp, TrendingDown, Minus, Users, Loader2, Flame, Zap } from "lucide-react";
import { getLeaderboard, getMyRank, getTeams, type LeaderboardEntry, type UserRankResponse } from "@/app/lib/api";
import { AppShell } from "@/app/components/layout/AppShell";
import { useAuth } from "@/app/context/AuthContext";
import { useGamificationRealtime } from "@/app/hooks/useGamificationRealtime";

const tierColors = {
  gold: { bg: "bg-yellow-500/20", border: "border-yellow-500", text: "text-yellow-500", icon: "text-yellow-400" },
  silver: { bg: "bg-gray-400/20", border: "border-gray-400", text: "text-gray-400", icon: "text-gray-300" },
  bronze: { bg: "bg-amber-700/20", border: "border-amber-700", text: "text-amber-700", icon: "text-amber-600" },
  platinum: { bg: "bg-purple-500/20", border: "border-purple-400", text: "text-purple-400", icon: "text-purple-300" },
};

function getTierFromLevel(level: number): string {
  if (level >= 51) return "platinum";
  if (level >= 26) return "gold";
  if (level >= 11) return "silver";
  return "bronze";
}

function getRankIcon(rank: number) {
  if (rank === 1) return <Crown className="h-5 w-5 text-yellow-400" />;
  if (rank === 2) return <Medal className="h-5 w-5 text-gray-300" />;
  if (rank === 3) return <Medal className="h-5 w-5 text-amber-600" />;
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
    { value: "global", label: "Global", icon: Trophy },
    { value: "weekly", label: "This Week", icon: Flame },
    { value: "monthly", label: "This Month", icon: Zap },
    { value: "team", label: "My Team", icon: Users },
  ];

  return (
    <AppShell>
      <div className="mx-auto max-w-[1440px] space-y-6 p-6">
        {/* Header */}
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-text-primary flex items-center gap-3">
              <Trophy className="h-7 w-7 text-gold" />
              Leaderboard
            </h1>
            <p className="mt-1 text-sm text-text-secondary">
              See how you stack up against other learners
            </p>
          </div>
          
          {/* Leaderboard Type Tabs */}
          <div className="flex gap-2 rounded-xl bg-card p-1 border border-border">
            {leaderboardTypes.map((type) => (
              <button
                key={type.value}
                onClick={() => setSelectedType(type.value)}
                className={`flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-all ${
                  selectedType === type.value
                    ? "bg-primary text-white"
                    : "text-text-secondary hover:text-text-primary hover:bg-background"
                }`}
              >
                <type.icon className="h-4 w-4" />
                {type.label}
              </button>
            ))}
          </div>
        </div>

        {/* My Rank Card */}
        {myRank && (
          <div className="rounded-2xl border border-border bg-gradient-to-r from-primary/10 to-secondary/10 p-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Your Position</h2>
                <p className="text-sm text-text-secondary">Keep learning to climb the ranks!</p>
              </div>
              <div className="text-right">
                <p className="font-mono text-4xl font-bold text-primary">#{myRank.rank}</p>
                <p className="text-sm text-text-secondary">{myRank.total_xp.toLocaleString()} XP</p>
              </div>
            </div>
          </div>
        )}

        {/* Leaderboard Table */}
        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-border bg-card">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-destructive/50 bg-card">
            <p className="text-destructive">{error}</p>
          </div>
        ) : leaderboard.length === 0 ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-border bg-card">
            <div className="text-center">
              <Trophy className="mx-auto h-12 w-12 text-text-secondary" />
              <p className="mt-4 text-lg font-medium text-text-primary">No rankings yet</p>
              <p className="text-sm text-text-secondary">
                {selectedType === "team"
                  ? "Join a team and start learning to appear on the team leaderboard."
                  : "Start learning to appear on the leaderboard!"}
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border bg-background/50">
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                      Rank
                    </th>
                    <th className="px-6 py-4 text-left text-xs font-medium uppercase tracking-wider text-text-secondary">
                      Learner
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-text-secondary">
                      Level
                    </th>
                    <th className="px-6 py-4 text-right text-xs font-medium uppercase tracking-wider text-text-secondary">
                      XP
                    </th>
                    <th className="px-6 py-4 text-center text-xs font-medium uppercase tracking-wider text-text-secondary">
                      Trend
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {leaderboard.map((entry, idx) => {
                    const tier = getTierFromLevel(entry.level);
                    const colors = tierColors[tier as keyof typeof tierColors];
                    const isCurrentUser = user?.id === entry.user_id;
                    
                    return (
                      <tr
                        key={entry.user_id}
                        className={`transition-colors ${
                          isCurrentUser
                            ? "bg-primary/10"
                            : "hover:bg-background/50"
                        }`}
                      >
                        <td className="whitespace-nowrap px-6 py-4">
                          <div className="flex items-center justify-center w-10">
                            {getRankIcon(entry.rank) || (
                              <span className="font-mono text-lg font-bold text-text-primary">
                                {entry.rank}
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-full text-sm font-medium ${
                                isCurrentUser
                                  ? "bg-primary text-white"
                                  : "bg-primary/20 text-primary"
                              }`}
                            >
                              {entry.user_name?.charAt(0).toUpperCase() || "?"}
                            </div>
                            <div>
                              <p className={`font-medium ${isCurrentUser ? "text-primary" : "text-text-primary"}`}>
                                {entry.user_name || "Unknown User"}
                                {isCurrentUser && (
                                  <span className="ml-2 text-xs text-primary">(You)</span>
                                )}
                              </p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-xs px-2 py-0.5 rounded-full border ${colors.bg} ${colors.border} ${colors.text}`}>
                                  {tier.charAt(0).toUpperCase() + tier.slice(1)}
                                </span>
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <span className="font-mono text-lg font-bold text-text-primary">
                            {entry.level}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-6 py-4 text-right">
                          <span className="font-mono text-lg font-bold text-gold">
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
          <div className="rounded-2xl border border-border bg-card p-8">
            <h2 className="mb-6 text-center text-lg font-semibold text-text-primary">Top Learners</h2>
            <div className="flex items-end justify-center gap-4">
              {/* 2nd Place */}
              <div className="flex flex-col items-center">
                <div className="relative mb-2">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-gray-400 text-2xl font-bold text-white ring-4 ring-gray-400/30">
                    {leaderboard[1]?.user_name?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <Medal className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-8 w-8 text-gray-300" />
                </div>
                <p className="text-sm font-medium text-text-primary truncate max-w-[100px]">
                  {leaderboard[1]?.user_name || "Unknown"}
                </p>
                <p className="font-mono text-sm text-gray-400">
                  {leaderboard[1]?.total_xp.toLocaleString()} XP
                </p>
                <div className="mt-2 h-20 w-24 rounded-t-lg bg-gray-400/30 flex items-end justify-center pb-2">
                  <span className="font-mono text-2xl font-bold text-gray-400">2</span>
                </div>
              </div>

              {/* 1st Place */}
              <div className="flex flex-col items-center">
                <div className="relative mb-2">
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-yellow-500 text-3xl font-bold text-white ring-4 ring-yellow-500/30">
                    {leaderboard[0]?.user_name?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <Crown className="absolute -top-6 left-1/2 -translate-x-1/2 h-8 w-8 text-yellow-400" />
                </div>
                <p className="text-sm font-medium text-text-primary truncate max-w-[100px]">
                  {leaderboard[0]?.user_name || "Unknown"}
                </p>
                <p className="font-mono text-sm text-gold">
                  {leaderboard[0]?.total_xp.toLocaleString()} XP
                </p>
                <div className="mt-2 h-28 w-24 rounded-t-lg bg-yellow-500/30 flex items-end justify-center pb-2">
                  <span className="font-mono text-3xl font-bold text-yellow-500">1</span>
                </div>
              </div>

              {/* 3rd Place */}
              <div className="flex flex-col items-center">
                <div className="relative mb-2">
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-700 text-xl font-bold text-white ring-4 ring-amber-700/30">
                    {leaderboard[2]?.user_name?.charAt(0).toUpperCase() || "?"}
                  </div>
                  <Medal className="absolute -bottom-2 left-1/2 -translate-x-1/2 h-8 w-8 text-amber-600" />
                </div>
                <p className="text-sm font-medium text-text-primary truncate max-w-[100px]">
                  {leaderboard[2]?.user_name || "Unknown"}
                </p>
                <p className="font-mono text-sm text-amber-600">
                  {leaderboard[2]?.total_xp.toLocaleString()} XP
                </p>
                <div className="mt-2 h-16 w-24 rounded-t-lg bg-amber-700/30 flex items-end justify-center pb-2">
                  <span className="font-mono text-2xl font-bold text-amber-700">3</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
