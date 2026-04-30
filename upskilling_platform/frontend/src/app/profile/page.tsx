"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/context/AuthContext";
import {
  getAvatarUrl,
  getCourseBookmarks,
  getEnrollments,
  getGamificationProfile,
  getLessonBookmarks,
  getUserProgress,
  getXpHistory,
  type Bookmark,
  type EnrollmentResponse,
  type GamificationProfileResponse,
  type UserProgressResponse,
  type XPHistoryTransaction,
} from "@/app/lib/api";
import { AppShell } from "@/app/components/layout/AppShell";
import { LevelBadge } from "@/app/components/profile/LevelBadge";
import { XPProgressBar } from "@/app/components/profile/XPProgressBar";
import { ActivityHeatmap } from "@/app/components/profile/ActivityHeatmap";
import { useGamificationRealtime } from "@/app/hooks/useGamificationRealtime";
import {
  BadgeCheck,
  BookOpen,
  Building2,
  CalendarDays,
  Flame,
  Hash,
  Loader2,
  Mail,
  Target,
  Trophy,
  User,
  Zap,
} from "lucide-react";

interface HeatmapDay {
  date: string;
  count: number;
}

function deriveCompanyName(email: string, tenantName?: string | null): string {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  const root = domain.split(".")[0] || "";

  const mappedCompanies: Record<string, string> = {
    smartup: "Smart UP",
    "3sgroup": "3S Group",
    globalnet: "Global Net",
    advancia: "Advancia",
  };

  if (mappedCompanies[root]) {
    return mappedCompanies[root];
  }

  if (root) {
    return root
      .replace(/[-_]+/g, " ")
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  return tenantName || "Not assigned";
}

function buildActivityHeatmapData(
  xpTransactions: XPHistoryTransaction[],
  enrollments: EnrollmentResponse[],
  courseBookmarks: Bookmark[],
  lessonBookmarks: Bookmark[],
  progressItems: UserProgressResponse[]
): HeatmapDay[] {
  const days = 52 * 7;
  const today = new Date();
  const activityMap = new Map<string, number>();

  const addDate = (value?: string | null) => {
    if (!value) return;
    const key = new Date(value).toISOString().split("T")[0];
    activityMap.set(key, (activityMap.get(key) || 0) + 1);
  };

  xpTransactions.forEach((item) => addDate(item.created_at));
  enrollments.forEach((item) => {
    addDate(item.enrolled_at);
    addDate(item.completed_at);
  });
  courseBookmarks.forEach((item) => addDate(item.created_at));
  lessonBookmarks.forEach((item) => addDate(item.created_at));
  progressItems.forEach((item) => {
    addDate(item.last_activity_at);
    addDate(item.completed_at);
  });

  const result: HeatmapDay[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(date.getDate() - i);
    const key = date.toISOString().split("T")[0];
    result.push({
      date: key,
      count: activityMap.get(key) || 0,
    });
  }

  return result;
}

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [gamificationProfile, setGamificationProfile] =
    useState<GamificationProfileResponse | null>(null);
  const [enrollments, setEnrollments] = useState<EnrollmentResponse[]>([]);
  const [courseBookmarks, setCourseBookmarks] = useState<Bookmark[]>([]);
  const [lessonBookmarks, setLessonBookmarks] = useState<Bookmark[]>([]);
  const [xpHistory, setXpHistory] = useState<XPHistoryTransaction[]>([]);
  const [progressItems, setProgressItems] = useState<UserProgressResponse[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [bioDraft, setBioDraft] = useState("");
  const [skillsDraft, setSkillsDraft] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSaveMessage, setProfileSaveMessage] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      setError(null);
      const [
        profile,
        enrollmentData,
        courseBookmarkData,
        lessonBookmarkData,
        xpHistoryData,
        progressData,
      ] = await Promise.all([
        getGamificationProfile(),
        getEnrollments(user.id).catch(() => []),
        getCourseBookmarks().catch(() => []),
        getLessonBookmarks().catch(() => []),
        getXpHistory(200, 0).catch(() => ({ transactions: [] })),
        getUserProgress(user.id).catch(() => []),
      ]);

      setGamificationProfile(profile);
      setEnrollments(enrollmentData);
      setCourseBookmarks(courseBookmarkData);
      setLessonBookmarks(lessonBookmarkData);
      setXpHistory(xpHistoryData.transactions);
      setProgressItems(progressData);
    } catch (err) {
      console.error("Failed to fetch gamification profile:", err);
      setError("Failed to load profile data");
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    fetchData();
  }, [fetchData, user]);

  useGamificationRealtime(user?.id, Boolean(user), () => {
    fetchData();
  });

  useEffect(() => {
    if (!user) {
      return;
    }

    setBioDraft(user.bio || "");
    setSkillsDraft(Array.isArray(user.skills) ? user.skills : []);
  }, [user]);

  const activityData = useMemo(
    () =>
      buildActivityHeatmapData(
        xpHistory,
        enrollments,
        courseBookmarks,
        lessonBookmarks,
        progressItems
      ),
    [courseBookmarks, enrollments, lessonBookmarks, progressItems, xpHistory]
  );

  if (!user) return null;

  const displayName = `${user.first_name} ${user.last_name}`;
  const levelInfo = gamificationProfile?.level;
  const rankInfo = gamificationProfile?.rank;
  const totalXp = gamificationProfile?.xp.total || 0;
  const completedCourses = enrollments.filter((item) => item.status === "completed").length;
  const companyName = deriveCompanyName(user.email, user.tenant_name);
  const normalizedRole = user.role.replace(/([a-z])([A-Z])/g, "$1 $2");
  const normalizedStatus =
    user.status.charAt(0).toUpperCase() + user.status.slice(1).toLowerCase();
  const memberSince = user.created_at
    ? new Date(user.created_at).toLocaleDateString()
    : "Unavailable";
  const activeDays = activityData.filter((day) => day.count > 0).length;

  const personalInfoCards = [
    {
      label: "Full Name",
      value: displayName || "Not provided",
      icon: User,
      accent: "bg-primary/10 text-primary",
    },
    {
      label: "Email",
      value: user.email,
      icon: Mail,
      accent: "bg-cyan-100 text-cyan-700",
    },
    {
      label: "Role",
      value: normalizedRole,
      icon: BadgeCheck,
      accent: "bg-violet-100 text-violet-700",
    },
    {
      label: "Status",
      value: normalizedStatus,
      icon: BadgeCheck,
      accent:
        user.status.toLowerCase() === "active"
          ? "bg-emerald-100 text-emerald-700"
          : "bg-amber-100 text-amber-700",
    },
    {
      label: "Company",
      value: companyName,
      icon: Building2,
      accent: "bg-sky-100 text-sky-700",
    },
    {
      label: "Department",
      value: user.department || "Not assigned",
      icon: Building2,
      accent: "bg-orange-100 text-orange-700",
    },
    {
      label: "Workspace",
      value: user.tenant_slug || user.tenant_name || "Global workspace",
      icon: Hash,
      accent: "bg-amber-100 text-amber-700",
    },
    {
      label: "Member Since",
      value: memberSince,
      icon: CalendarDays,
      accent: "bg-emerald-100 text-emerald-700",
    },
  ];

  const maxXP = levelInfo ? levelInfo.xp_needed : 5000;
  const currentXPInLevel = levelInfo ? levelInfo.xp_in_level : 0;
  const hasProfileChanges =
    bioDraft.trim() !== (user.bio || "").trim() ||
    JSON.stringify(skillsDraft) !== JSON.stringify(Array.isArray(user.skills) ? user.skills : []);

  const handleAddSkill = () => {
    const normalized = newSkill.trim();
    if (!normalized) {
      return;
    }

    if (skillsDraft.some((skill) => skill.toLowerCase() === normalized.toLowerCase())) {
      setNewSkill("");
      return;
    }

    setSkillsDraft((current) => [...current, normalized]);
    setNewSkill("");
  };

  const handleRemoveSkill = (skillToRemove: string) => {
    setSkillsDraft((current) => current.filter((skill) => skill !== skillToRemove));
  };

  const handleSaveProfileDetails = async () => {
    try {
      setIsSavingProfile(true);
      setProfileSaveMessage(null);
      await updateProfile({
        bio: bioDraft.trim() || null,
        skills: skillsDraft,
      });
      setProfileSaveMessage("Profile details updated.");
    } catch (saveError) {
      console.error("Failed to update profile details:", saveError);
      setProfileSaveMessage("Failed to save profile details.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-[1440px] space-y-6 p-6">
        <div className="overflow-hidden rounded-[28px] border border-white/70 bg-[radial-gradient(circle_at_top_left,rgba(14,163,122,0.14),transparent_28%),radial-gradient(circle_at_top_right,rgba(14,165,233,0.12),transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.94),rgba(244,249,250,0.96))] shadow-[0_20px_45px_rgba(15,23,42,0.06)]">
          <div className="grid gap-0 xl:grid-cols-[1.12fr_1fr]">
            <div className="border-b border-border/70 p-6 xl:border-b-0 xl:border-r">
              <div className="flex items-start gap-4">
                <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-3xl bg-[linear-gradient(135deg,#0ea37a_0%,#22c7b4_58%,#f2a51b_115%)] text-xl font-semibold text-white shadow-[0_16px_32px_rgba(14,163,122,0.22)]">
                  {user.avatar ? (
                    <img
                      src={getAvatarUrl(user.avatar) || ""}
                      alt=""
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    (user.first_name?.charAt(0) || user.email.charAt(0)).toUpperCase()
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-primary/75">
                    Personal Profile
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">
                    {displayName}
                  </h2>
                  <p className="mt-1 text-sm text-slate-600">{normalizedRole}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="inline-flex items-center rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-700">
                      {normalizedStatus}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-700">
                      {companyName}
                    </span>
                    <span className="inline-flex items-center rounded-full bg-violet-100 px-3 py-1 text-xs font-semibold text-violet-700">
                      {user.department || "No department"}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                {personalInfoCards.map((item) => (
                  <div
                    key={item.label}
                    className="rounded-2xl border border-white/80 bg-white/75 px-4 py-3 shadow-[0_10px_24px_rgba(15,23,42,0.04)]"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${item.accent}`}>
                        <item.icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                          {item.label}
                        </p>
                        <p className="mt-1 break-words text-sm font-medium text-slate-950">
                          {item.value}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="grid gap-4 p-6">
              <div className="rounded-[24px] border border-white/80 bg-[linear-gradient(135deg,rgba(14,163,122,0.08),rgba(34,199,180,0.06),rgba(255,255,255,0.82))] p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                    <User className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Bio
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Write a short introduction that helps others understand your focus.
                    </p>
                    <textarea
                      value={bioDraft}
                      onChange={(event) => setBioDraft(event.target.value)}
                      placeholder="Add a short introduction so your profile feels more personal."
                      className="mt-3 min-h-[140px] w-full rounded-[22px] border border-white/80 bg-white/90 px-4 py-4 text-sm leading-6 text-slate-700 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)] outline-none transition-colors placeholder:text-slate-400 focus:border-primary/40 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="rounded-[24px] border border-white/80 bg-[linear-gradient(135deg,rgba(14,165,233,0.08),rgba(99,102,241,0.05),rgba(255,255,255,0.82))] p-5 shadow-[0_12px_28px_rgba(15,23,42,0.05)]">
                <div className="flex items-start gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary/10 text-secondary">
                    <BookOpen className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                      Skills
                    </p>
                    <p className="mt-1 text-sm text-slate-500">
                      Add the skills that best describe your expertise or learning direction.
                    </p>
                    <div className="mt-3 rounded-[22px] border border-white/80 bg-white/90 p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.6)]">
                      <div className="flex gap-2">
                        <input
                          value={newSkill}
                          onChange={(event) => setNewSkill(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              handleAddSkill();
                            }
                          }}
                          placeholder="Add a skill"
                          className="flex-1 rounded-2xl border border-border/70 bg-slate-50/90 px-4 py-2.5 text-sm text-slate-700 outline-none transition-colors placeholder:text-slate-400 focus:border-primary/40 focus:bg-white"
                        />
                        <button
                          type="button"
                          onClick={handleAddSkill}
                          className="rounded-2xl bg-[linear-gradient(135deg,#0ea37a_0%,#22c7b4_100%)] px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_20px_rgba(14,163,122,0.18)] transition-opacity hover:opacity-95"
                        >
                          Add
                        </button>
                      </div>
                      {skillsDraft.length > 0 ? (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {skillsDraft.map((skill) => (
                            <span
                              key={skill}
                              className="inline-flex items-center gap-2 rounded-full border border-primary/10 bg-[linear-gradient(135deg,rgba(14,163,122,0.12),rgba(34,199,180,0.08))] px-3 py-1.5 text-xs font-medium text-primary shadow-[0_6px_14px_rgba(14,163,122,0.08)]"
                            >
                              {skill}
                              <button
                                type="button"
                                onClick={() => handleRemoveSkill(skill)}
                                className="flex h-4 w-4 items-center justify-center rounded-full bg-white/70 text-primary/70 transition-colors hover:text-primary"
                                aria-label={`Remove ${skill}`}
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="mt-3 text-sm leading-6 text-slate-700">
                          No skills added yet. Once skills are defined, they will appear here as profile tags.
                        </p>
                      )}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-white/70 bg-white/75 px-4 py-3">
                      {profileSaveMessage ? (
                        <p
                          className={`text-sm ${
                            profileSaveMessage.includes("Failed")
                              ? "text-red-600"
                              : "text-emerald-700"
                          }`}
                        >
                          {profileSaveMessage}
                        </p>
                      ) : (
                        <span className="text-sm text-slate-500">
                          Update your bio and skills, then save the changes.
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={handleSaveProfileDetails}
                        disabled={!hasProfileChanges || isSavingProfile}
                        className="rounded-2xl bg-slate-950 px-4 py-2.5 text-sm font-medium text-white shadow-[0_10px_20px_rgba(15,23,42,0.18)] transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
                      >
                        {isSavingProfile ? "Saving..." : "Save"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-border bg-card">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : error ? (
          <div className="flex h-64 items-center justify-center rounded-2xl border border-destructive/50 bg-card">
            <p className="text-destructive">{error}</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-gradient-to-r from-primary/10 to-secondary/10 p-8">
            <div className="flex flex-col items-center gap-6 md:flex-row md:items-start">
              <div className="relative">
                <div
                  className="relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-full border-4 text-4xl font-bold text-white"
                  style={{
                    borderColor:
                      levelInfo?.tier === "gold"
                        ? "#FFD700"
                        : levelInfo?.tier === "silver"
                          ? "#C0C0C0"
                          : levelInfo?.tier === "platinum"
                            ? "#E5E4E4"
                            : "#CD7F32",
                    boxShadow: "0 0 24px rgba(255, 215, 0, 0.3)",
                    background: "linear-gradient(135deg, #6C63FF, #00D4AA)",
                  }}
                >
                  {user.avatar ? (
                    <img src={getAvatarUrl(user.avatar) || ""} alt="" className="h-full w-full object-cover" />
                  ) : (
                    (user.first_name?.charAt(0) || user.email.charAt(0)).toUpperCase()
                  )}
                </div>
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2">
                  <LevelBadge level={levelInfo?.level || 1} size="md" />
                </div>
              </div>

              <div className="flex-1 text-center md:text-left">
                <h1 className="text-2xl font-bold text-text-primary">{displayName}</h1>
                <p className="mt-1 text-sm text-text-secondary">{normalizedRole}</p>
                {user.department && <p className="text-sm text-text-secondary">{user.department}</p>}

                <div className="mt-4">
                  <XPProgressBar
                    currentXP={currentXPInLevel}
                    maxXP={maxXP}
                    level={levelInfo?.level || 1}
                  />
                </div>

                <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
                  <div className="rounded-xl border border-border bg-card/80 p-4 text-center backdrop-blur">
                    <Zap className="mx-auto h-5 w-5 text-gold" />
                    <p className="mt-1 font-mono text-xl font-bold text-text-primary">
                      {totalXp.toLocaleString()}
                    </p>
                    <p className="text-xs text-text-secondary">Total XP</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card/80 p-4 text-center backdrop-blur">
                    <BookOpen className="mx-auto h-5 w-5 text-primary" />
                    <p className="mt-1 font-mono text-xl font-bold text-text-primary">
                      {completedCourses}
                    </p>
                    <p className="text-xs text-text-secondary">Courses</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card/80 p-4 text-center backdrop-blur">
                    <Flame className="mx-auto h-5 w-5 text-orange-500" />
                    <p className="mt-1 font-mono text-xl font-bold text-text-primary">
                      {activeDays}
                    </p>
                    <p className="text-xs text-text-secondary">Active Days</p>
                  </div>
                  <div className="rounded-xl border border-border bg-card/80 p-4 text-center backdrop-blur">
                    <Trophy className="mx-auto h-5 w-5 text-secondary" />
                    <p className="mt-1 font-mono text-xl font-bold text-text-primary">
                      #{rankInfo?.rank || "—"}
                    </p>
                    <p className="text-xs text-text-secondary">Rank</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex flex-col gap-4 border-b border-border p-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(14,163,122,0.14),rgba(34,199,180,0.12),rgba(242,165,27,0.08))] text-secondary">
                <Target className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-text-primary">Activity</h2>
                <p className="text-sm text-text-secondary">
                  Your recent learning rhythm across the platform.
                </p>
              </div>
            </div>
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-primary/15 bg-primary/5 px-3 py-1.5 text-xs font-medium text-primary sm:self-auto">
              <BookOpen className="h-3.5 w-3.5" />
              {activeDays} active days tracked
            </div>
          </div>
          <div className="overflow-x-auto p-6">
            <div className="rounded-2xl border border-border/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.82),rgba(244,249,250,0.88))] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.45)] sm:p-5">
              <ActivityHeatmap data={activityData} />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
