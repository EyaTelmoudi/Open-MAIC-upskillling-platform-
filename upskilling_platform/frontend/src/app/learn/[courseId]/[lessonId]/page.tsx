"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useRouter, useParams } from "next/navigation";
import { AppShell } from "@/app/components/layout/AppShell";
import { Button } from "@/app/components/ui/Button";
import { Badge } from "@/app/components/ui/Badge";
import { Card } from "@/app/components/ui/Card";
import { BookmarkButton } from "@/app/components/ui/BookmarkButton";
import { ChatMessages, type Message } from "@/app/components/coach/ChatMessages";
import { ChatInput } from "@/app/components/coach/ChatInput";
import {
  AiGeneratedLessonPlayer,
  parseAiGeneratedLesson,
} from "@/app/components/learn/AiGeneratedLessonPlayer";
import { AiPlatformQuiz } from "@/app/components/learn/AiPlatformQuiz";
import {
  api,
  learningApi,
  type AssessmentAttemptResult,
  type GamificationProfileResponse,
} from "@/app/lib/api";
import {
  createCoachSession,
  getCoachSessionDetail,
  listCoachSessions,
} from "@/app/lib/coach-chat-sessions";
import { useAuth } from "@/app/context/AuthContext";
import { Quiz } from "@/app/components/learn/Quiz";
import { ProgressTracker } from "@/app/lib/progressTracker";
import { resolveCourseCompletionXp } from "@/app/lib/course-completion-celebration";
import {
  ArrowLeft,
  ArrowRight,
  Bot,
  CheckCircle,
  BookOpen,
  Clock,
  ChevronDown,
  ChevronUp,
  Video,
  FileText,
  HelpCircle,
  Menu,
  X,
  Percent,
  Rocket,
  Trophy,
  Lock,
  Unlock,
  Sparkles,
  PartyPopper,
  Stars,
} from "lucide-react";

interface Lesson {
  id: string;
  title: string;
  content: string;
  video_url: string | null;
  content_type: string;
  duration: number;
  order: number;
  assessment_id?: string;
}

interface Module {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: Lesson[];
}

interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  category: string;
  difficulty: string;
  duration: number;
  xp_reward: number;
  modules: Module[];
}

interface Progress {
  lesson_id: string;
  status: string;
  completed_at: string | null;
}

interface LessonSupportItem {
  title: string;
  url: string;
}

interface GamificationSnapshot {
  totalXp: number;
  level: number;
  badges: Array<{
    badge_id: string;
    name: string;
    tier: string;
    icon: string;
  }>;
  currentStreak?: number;
}

function pendingProgressStorageKey(courseId: string) {
  return `learn-pending-progress:${courseId}`;
}

function completedProgressStorageKey(courseId: string) {
  return `learn-completed-progress:${courseId}`;
}

function readPendingCompletedLessons(courseId: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.sessionStorage.getItem(pendingProgressStorageKey(courseId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writePendingCompletedLessons(courseId: string, lessonIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.sessionStorage.setItem(
      pendingProgressStorageKey(courseId),
      JSON.stringify(Array.from(new Set(lessonIds)))
    );
  } catch {
    // ignore storage failures
  }
}

function markPendingCompletedLesson(courseId: string, lessonId: string) {
  const current = readPendingCompletedLessons(courseId);
  if (!current.includes(lessonId)) {
    writePendingCompletedLessons(courseId, [...current, lessonId]);
  }
}

function clearPendingCompletedLesson(courseId: string, lessonId: string) {
  const next = readPendingCompletedLessons(courseId).filter((id) => id !== lessonId);
  writePendingCompletedLessons(courseId, next);
}

function readCompletedLessons(courseId: string): string[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(completedProgressStorageKey(courseId));
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCompletedLessons(courseId: string, lessonIds: string[]) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(
      completedProgressStorageKey(courseId),
      JSON.stringify(Array.from(new Set(lessonIds)))
    );
  } catch {
    // ignore storage failures
  }
}

function rememberCompletedLesson(courseId: string, lessonId: string) {
  const current = readCompletedLessons(courseId);
  if (!current.includes(lessonId)) {
    writeCompletedLessons(courseId, [...current, lessonId]);
  }
}

const CELEBRATION_BURSTS = [
  { emoji: "🎉", left: "8%", top: "14%", delay: "0s", duration: "2.8s", size: "text-4xl" },
  { emoji: "✨", left: "18%", top: "72%", delay: "0.2s", duration: "3.4s", size: "text-3xl" },
  { emoji: "🚀", left: "28%", top: "18%", delay: "0.45s", duration: "3.1s", size: "text-4xl" },
  { emoji: "🥳", left: "42%", top: "78%", delay: "0.1s", duration: "3.6s", size: "text-5xl" },
  { emoji: "⚡", left: "58%", top: "16%", delay: "0.25s", duration: "2.9s", size: "text-3xl" },
  { emoji: "💥", left: "70%", top: "70%", delay: "0.6s", duration: "3.3s", size: "text-4xl" },
  { emoji: "🕺", left: "82%", top: "20%", delay: "0.35s", duration: "3.2s", size: "text-4xl" },
  { emoji: "🏆", left: "90%", top: "62%", delay: "0.55s", duration: "3.7s", size: "text-4xl" },
];

const COMPLETION_ONE_LINERS = [
  "Course defeated. Brain upgraded.",
  "Your keyboard deserves a standing ovation.",
  "Certified menace to unfinished lessons.",
  "That course tried. You finished it anyway.",
];

function CelebrationBurstIcon({
  index,
  className,
}: {
  index: number;
  className?: string;
}) {
  const mod = index % 4;

  if (mod === 0) {
    return <PartyPopper className={className} />;
  }

  if (mod === 1) {
    return <Sparkles className={className} />;
  }

  if (mod === 2) {
    return <Stars className={className} />;
  }

  return <Trophy className={className} />;
}

function extractLessonContentParts(rawContent: string | null | undefined): {
  summary: string;
  supportItems: LessonSupportItem[];
} {
  if (!rawContent) {
    return { summary: "", supportItems: [] };
  }

  if (typeof window === "undefined") {
    return { summary: rawContent, supportItems: [] };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(rawContent, "text/html");
  const supportItems = Array.from(doc.querySelectorAll("a[href]")).map((link) => ({
    title: link.textContent?.trim() || "Open file",
    url: link.getAttribute("href") || "#",
  }));

  doc.querySelectorAll("ul, ol, h3, h4, a").forEach((node) => node.remove());

  const summary = (doc.body.textContent || "")
    .replace(/\s+/g, " ")
    .trim();

  return { summary, supportItems };
}

export default function LearnPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuth();
  const courseId = params.courseId as string;
  const lessonId = params.lessonId as string;

  const [course, setCourse] = useState<Course | null>(null);
  const [currentLesson, setCurrentLesson] = useState<Lesson | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isEnrolled, setIsEnrolled] = useState(false);
  const [progress, setProgress] = useState<Record<string, boolean>>({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedModules, setExpandedModules] = useState<Set<string>>(new Set());
  const [videoProgressPercent, setVideoProgressPercent] = useState(0);
  const [completionLocked, setCompletionLocked] = useState(true);
  const [supportOpen, setSupportOpen] = useState(false);
  const [courseXpCelebration, setCourseXpCelebration] = useState<number | null>(null);
  const [completionOneLiner, setCompletionOneLiner] = useState(COMPLETION_ONE_LINERS[0]);
  const [levelCelebration, setLevelCelebration] = useState<{
    oldLevel: number;
    newLevel: number;
  } | null>(null);
  const [badgeCelebration, setBadgeCelebration] = useState<{
    name: string;
    tier: string;
    icon: string;
  } | null>(null);
  const [certificatePromptOpen, setCertificatePromptOpen] = useState(false);
  const [nextLessonPrompt, setNextLessonPrompt] = useState<{
    lessonId: string;
    title: string;
    countdown: number;
  } | null>(null);
  const [coachOpen, setCoachOpen] = useState(false);
  const [coachTyping, setCoachTyping] = useState(false);
  const [coachMessages, setCoachMessages] = useState<Message[]>([]);
  const [coachSessionId, setCoachSessionId] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const progressTrackerRef = useRef<ProgressTracker | null>(null);
  const resumeVideoPositionRef = useRef<number | null>(null);
  const resumeVideoAppliedForLessonRef = useRef<string | null>(null);
  const completionSequenceRunningRef = useRef(false);
  const gamificationBaselineRef = useRef<GamificationSnapshot | null>(null);
  const xpCelebrationResolverRef = useRef<(() => void) | null>(null);
  const levelCelebrationResolverRef = useRef<(() => void) | null>(null);
  const badgeCelebrationResolverRef = useRef<(() => void) | null>(null);
  const nextLessonTimerRef = useRef<number | null>(null);
  const learnerMemoryCaptureKeysRef = useRef<Set<string>>(new Set());
  const videoProgressCheckpointBucketsRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (user) {
      loadCourse();
    }
  }, [courseId, lessonId, user]);

  useEffect(() => {
    async function loadLessonCoachSession() {
      if (!user?.id || !courseId || !lessonId) {
        return;
      }

      try {
        const sessions = await listCoachSessions({
          courseId,
          lessonId,
          source: "course-lesson-coach",
        });
        const active = sessions.find((session) => session.status === "active") || sessions[0] || null;
        if (active) {
          const detail = await getCoachSessionDetail(active.id);
          setCoachSessionId(active.id);
          setCoachMessages(detail.messages);
          return;
        }
      } catch (error) {
        console.error("Failed to load lesson coach session:", error);
      }

      setCoachSessionId(null);
      setCoachMessages([]);
    }

    void loadLessonCoachSession();
  }, [course?.title, courseId, lessonId, user?.id]);

  useEffect(() => {
    return () => {
      if (nextLessonTimerRef.current !== null) {
        window.clearInterval(nextLessonTimerRef.current);
        nextLessonTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    if (course && lessonId) {
      setNextLessonPrompt(null);
      const lesson = findLesson(lessonId);
      setCurrentLesson(lesson);
      setSupportOpen(false);
      setVideoProgressPercent(0);
      resumeVideoPositionRef.current = null;
      resumeVideoAppliedForLessonRef.current = null;
      setCompletionLocked(lesson?.content_type === "video");
      // Expand module containing current lesson
      for (const mod of course.modules) {
        if (mod.lessons.some((l) => l.id === lessonId)) {
          setExpandedModules((prev) => new Set([...prev, mod.id]));
          break;
        }
      }
    }
  }, [course, lessonId]);

  useEffect(() => {
    if (!user?.id || !currentLesson || currentLesson.content_type !== "video") {
      return;
    }

    let cancelled = false;

    const loadSavedVideoProgress = async () => {
      try {
        const saved = await learningApi.get<{
          current_time: number;
          watch_percent: number;
          status: string;
        }>(`/api/v1/learning/progress/video/${currentLesson.id}?user_id=${user.id}`);

        if (cancelled) {
          return;
        }

        const safeCurrentTime = Math.max(0, Number(saved.current_time || 0));
        resumeVideoPositionRef.current = safeCurrentTime;
        setVideoProgressPercent(Math.max(0, Number(saved.watch_percent || 0)));
      } catch (error) {
        if (cancelled) {
          return;
        }
        resumeVideoPositionRef.current = null;
        setVideoProgressPercent(0);
      }
    };

    void loadSavedVideoProgress();

    return () => {
      cancelled = true;
    };
  }, [currentLesson?.id, currentLesson?.content_type, user?.id]);

  const applySavedVideoPosition = useCallback(() => {
    if (!currentLesson || currentLesson.content_type !== "video" || !videoRef.current) {
      return;
    }

    const savedPosition = resumeVideoPositionRef.current;
    if (
      savedPosition === null ||
      !Number.isFinite(savedPosition) ||
      savedPosition <= 0 ||
      resumeVideoAppliedForLessonRef.current === currentLesson.id
    ) {
      return;
    }

    const video = videoRef.current;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const clampedPosition =
      duration > 1 ? Math.min(savedPosition, Math.max(duration - 1, 0)) : savedPosition;

    if (clampedPosition <= 0) {
      resumeVideoAppliedForLessonRef.current = currentLesson.id;
      return;
    }

    try {
      video.currentTime = clampedPosition;
      resumeVideoAppliedForLessonRef.current = currentLesson.id;
    } catch (error) {
      console.error("Failed to restore saved video position:", error);
    }
  }, [currentLesson]);

  useEffect(() => {
    if (!currentLesson || !user) return;

    if (progressTrackerRef.current) {
      progressTrackerRef.current.destroy();
    }

    const contentType = currentLesson.content_type as "video" | "text" | "quiz";
    progressTrackerRef.current = new ProgressTracker(
      lessonId,
      user.id,
      contentType
    );

    return () => {
      if (progressTrackerRef.current) {
        progressTrackerRef.current.destroy();
      }
    };
  }, [currentLesson, user, lessonId]);

  useEffect(() => {
    if (!user || !lessonId) {
      return;
    }

    let cancelled = false;

    const loadGamificationBaseline = async () => {
      try {
        const profile = await api.get<GamificationProfileResponse>(
          "/api/v1/learning/gamification/profile"
        );
        if (cancelled) {
          return;
        }
        gamificationBaselineRef.current = {
          totalXp: profile.xp.total,
          level: profile.level.level,
          badges: profile.badges.user.map((badge) => ({
            badge_id: badge.badge_id,
            name: badge.name,
            tier: badge.tier,
            icon: badge.icon,
          })),
        };
      } catch (error) {
        console.error("Failed to load gamification baseline:", error);
      }
    };

    loadGamificationBaseline();

    return () => {
      cancelled = true;
    };
  }, [user, lessonId]);

  const handleVideoProgressUpdate = useCallback((percent: number, _unlocked: boolean) => {
    setVideoProgressPercent(percent);
  }, []);

  const lessonContent = useMemo(
    () => extractLessonContentParts(currentLesson?.content),
    [currentLesson?.content]
  );

  const captureLearnerMemoryEvent = useCallback(
    async (
      eventType:
        | "lesson_completed"
        | "course_enrollment_completed"
        | "quiz_completed"
        | "video_progress_checkpoint",
      extras?: {
        quizId?: string | null;
        quizPassed?: boolean | null;
        quizScore?: number | null;
        videoWatchPercent?: number | null;
        videoCurrentTimeSeconds?: number | null;
        wrongAnswers?: Array<Record<string, unknown>>;
        captureSuffix?: string;
      },
    ) => {
      if (!user?.id || !user.tenant_id || !course || !currentLesson) {
        return;
      }

      const currentModule = course.modules.find((module) =>
        module.lessons.some((lesson) => lesson.id === currentLesson.id)
      );
      const captureKey = [
        user.id,
        course.id,
        currentLesson.id,
        eventType,
        extras?.captureSuffix || extras?.quizId || "",
      ].join(":");
      if (learnerMemoryCaptureKeysRef.current.has(captureKey)) {
        return;
      }
      learnerMemoryCaptureKeysRef.current.add(captureKey);

      try {
        await api.post("/api/learner-memory-agent/lesson-engagement", {
          tenantId: user.tenant_id,
          userId: user.id,
          courseId: course.id,
          courseTitle: course.title,
          lessonId: currentLesson.id,
          lessonTitle: currentLesson.title,
          moduleId: currentModule?.id || null,
          moduleTitle: currentModule?.title || null,
          lessonContentType: currentLesson.content_type,
          lessonDurationMinutes: currentLesson.duration,
          lessonOrder: currentLesson.order,
          assessmentId: currentLesson.assessment_id || null,
          eventType,
          quizId: extras?.quizId || null,
          quizPassed: extras?.quizPassed ?? null,
          quizScore: extras?.quizScore ?? null,
          videoWatchPercent: extras?.videoWatchPercent ?? null,
          videoCurrentTimeSeconds: extras?.videoCurrentTimeSeconds ?? null,
          wrongAnswers: extras?.wrongAnswers || [],
          lessonReferenceIds: [],
          supportReferences: [],
        });
      } catch (error) {
        learnerMemoryCaptureKeysRef.current.delete(captureKey);
        if (eventType === "course_enrollment_completed") {
          console.warn(
            "Failed to capture learner course_enrollment_completed memory; suppressing hard failure for course completion flow:",
            error,
          );
          return;
        }
        console.error(`Failed to capture learner ${eventType} memory:`, error);
      }
    },
    [course, currentLesson, user?.id, user?.tenant_id]
  );

  const captureVideoProgressCheckpoint = useCallback(
    async (watchPercent: number, currentTimeSeconds: number) => {
      if (!currentLesson || currentLesson.content_type !== "video") {
        return;
      }

      const normalizedPercent = Math.max(0, Math.min(100, Number(watchPercent || 0)));
      const normalizedCurrentTime = Math.max(0, Number(currentTimeSeconds || 0));
      if (normalizedPercent <= 0 || normalizedPercent >= 100) {
        return;
      }

      const checkpointBucket = Math.floor(normalizedPercent / 10) * 10;
      if (checkpointBucket < 10) {
        return;
      }

      const lessonKey = `${courseId}:${currentLesson.id}`;
      const lastCapturedBucket = videoProgressCheckpointBucketsRef.current.get(lessonKey) ?? 0;
      if (checkpointBucket <= lastCapturedBucket) {
        return;
      }

      videoProgressCheckpointBucketsRef.current.set(lessonKey, checkpointBucket);
      await captureLearnerMemoryEvent("video_progress_checkpoint", {
        videoWatchPercent: normalizedPercent,
        videoCurrentTimeSeconds: normalizedCurrentTime,
        captureSuffix: `video-progress-${checkpointBucket}`,
      });
    },
    [captureLearnerMemoryEvent, courseId, currentLesson],
  );

  const aiGeneratedLesson = useMemo(
    () =>
      currentLesson
        ? parseAiGeneratedLesson({
            id: currentLesson.id,
            title: currentLesson.title,
            duration: currentLesson.duration,
            content: currentLesson.content,
          })
        : null,
    [currentLesson]
  );

  const handleTraditionalQuizAttemptEvaluated = useCallback(
    async (result: AssessmentAttemptResult) => {
      await captureLearnerMemoryEvent("quiz_completed", {
        quizId: result.assessment_id,
        quizPassed: result.passed,
        quizScore: result.score,
        wrongAnswers: result.questions
          .filter((question) => !question.is_correct)
          .map((question) => ({
            question: question.text,
            user_answer: question.user_answer,
            correct_answer: question.correct_answer,
          })),
        captureSuffix: result.id,
      });
    },
    [captureLearnerMemoryEvent],
  );

  const handleAiQuizAttemptEvaluated = useCallback(
    async (result: {
      attemptId: string;
      passed: boolean;
      score: number;
      questions: Array<{
        text: string;
        userAnswers: string[];
        correctAnswers: string[];
        isCorrect: boolean;
      }>;
    }) => {
      await captureLearnerMemoryEvent("quiz_completed", {
        quizId: currentLesson?.assessment_id || currentLesson?.id || lessonId,
        quizPassed: result.passed,
        quizScore: result.score,
        wrongAnswers: result.questions
          .filter((question) => !question.isCorrect)
          .map((question) => ({
            question: question.text,
            user_answer: question.userAnswers.join(", "),
            correct_answer: question.correctAnswers.join(", "),
          })),
        captureSuffix: result.attemptId,
      });
    },
    [captureLearnerMemoryEvent, currentLesson?.assessment_id, currentLesson?.id, lessonId],
  );

  const wait = useCallback((ms: number) => {
    return new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }, []);

  const fetchGamificationSnapshot = useCallback(async (): Promise<GamificationSnapshot> => {
    const profile = await api.get<GamificationProfileResponse>(
      "/api/v1/learning/gamification/profile"
    );

    return {
      totalXp: profile.xp.total,
      level: profile.level.level,
      currentStreak: profile.streak?.current_streak ?? 0,
      badges: profile.badges.user.map((badge) => ({
        badge_id: badge.badge_id,
        name: badge.name,
        tier: badge.tier,
        icon: badge.icon,
      })),
    };
  }, []);

  const totalLessonCount = course?.modules.reduce((acc, m) => acc + m.lessons.length, 0) || 0;

  const waitForCourseXpDismiss = useCallback(async (xpGained: number) => {
    setCourseXpCelebration(xpGained);
    await new Promise<void>((resolve) => {
      xpCelebrationResolverRef.current = resolve;
    });
  }, []);

  const waitForLevelDismiss = useCallback(async (oldLevel: number, newLevel: number) => {
    setLevelCelebration({ oldLevel, newLevel });
    await new Promise<void>((resolve) => {
      levelCelebrationResolverRef.current = resolve;
    });
  }, []);

  const waitForBadgeDismiss = useCallback(
    async (badge: { name: string; tier: string; icon: string }) => {
      setBadgeCelebration({
        name: badge.name,
        tier: badge.tier,
        icon: badge.icon,
      });
      await new Promise<void>((resolve) => {
        badgeCelebrationResolverRef.current = resolve;
      });
    },
    []
  );

  const runCourseCompletionSequence = useCallback(async () => {
    if (completionSequenceRunningRef.current) {
      return;
    }

    completionSequenceRunningRef.current = true;
    try {
      setCompletionOneLiner(
        COMPLETION_ONE_LINERS[
          Math.floor(Math.random() * COMPLETION_ONE_LINERS.length)
        ]
      );
      const before = gamificationBaselineRef.current;
      let after: GamificationSnapshot | null = null;
      const expectedCourseXp = Math.max(Number(course?.xp_reward || 0), 0);

      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          after = await fetchGamificationSnapshot();
          if (
            !before ||
            after.totalXp > before.totalXp ||
            after.badges.length > before.badges.length ||
            attempt === 3
          ) {
            break;
          }
        } catch (error) {
          if (attempt === 3) {
            throw error;
          }
        }
        await wait(500);
      }

      if (after && before) {
        const xpGained = Math.max(0, after.totalXp - before.totalXp);
        const leveledUp = after.level > before.level;
        const previousBadgeIds = new Set(before.badges.map((badge) => badge.badge_id));
        const earnedBadge =
          after.badges.find((badge) => !previousBadgeIds.has(badge.badge_id)) || null;

        const celebrationXp = resolveCourseCompletionXp(expectedCourseXp, xpGained);

        if (celebrationXp > 0) {
          await waitForCourseXpDismiss(celebrationXp);
          await wait(150);
        }

        if (leveledUp) {
          await waitForLevelDismiss(before.level, after.level);
          await wait(150);
        }

        if (earnedBadge) {
          await waitForBadgeDismiss(earnedBadge);
          await wait(150);
        }

        gamificationBaselineRef.current = after;
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("learning.gamification.sync", {
              detail: {
                totalXp: after.totalXp,
                currentStreak: after.currentStreak ?? 0,
              },
            })
          );
        }
      } else if (expectedCourseXp > 0) {
        await waitForCourseXpDismiss(expectedCourseXp);
        await wait(150);
      }

      setCertificatePromptOpen(true);
    } catch (error) {
      console.error("Failed to run course completion sequence:", error);
      setCertificatePromptOpen(true);
    } finally {
      completionSequenceRunningRef.current = false;
    }
  }, [course?.xp_reward, fetchGamificationSnapshot, wait, waitForBadgeDismiss, waitForCourseXpDismiss, waitForLevelDismiss]);

  const handleLessonCompletionFlow = useCallback(
    async (completedProgress: Record<string, boolean>) => {
      setProgress(completedProgress);

      const completedLessons = Object.values(completedProgress).filter(Boolean).length;
      const courseCompleted =
        totalLessonCount > 0 && completedLessons >= totalLessonCount;

      if (courseCompleted) {
        await runCourseCompletionSequence();
        return;
      }

      let next: { moduleId: string; lessonId: string } | null = null;
      if (course?.modules) {
        let foundCurrent = false;
        for (const module of course.modules) {
          for (const lesson of module.lessons) {
            if (foundCurrent) {
              next = { moduleId: module.id, lessonId: lesson.id };
              break;
            }
            if (lesson.id === lessonId) {
              foundCurrent = true;
            }
          }
          if (next) {
            break;
          }
        }
      }

      if (next) {
        const nextLesson = findLesson(next.lessonId);
        if (nextLessonTimerRef.current !== null) {
          window.clearInterval(nextLessonTimerRef.current);
          nextLessonTimerRef.current = null;
        }

        setNextLessonPrompt({
          lessonId: next.lessonId,
          title: nextLesson?.title || "Next lesson",
          countdown: 5,
        });
      }
    },
    [course?.modules, runCourseCompletionSequence, totalLessonCount]
  );

  useEffect(() => {
    if (!nextLessonPrompt) {
      if (nextLessonTimerRef.current !== null) {
        window.clearInterval(nextLessonTimerRef.current);
        nextLessonTimerRef.current = null;
      }
      return;
    }

    nextLessonTimerRef.current = window.setInterval(() => {
      setNextLessonPrompt((current) => {
        if (!current) return null;
        if (current.countdown <= 1) {
          if (nextLessonTimerRef.current !== null) {
            window.clearInterval(nextLessonTimerRef.current);
            nextLessonTimerRef.current = null;
          }
          return { ...current, countdown: 0 };
        }
        return { ...current, countdown: current.countdown - 1 };
      });
    }, 1000);

    return () => {
      if (nextLessonTimerRef.current !== null) {
        window.clearInterval(nextLessonTimerRef.current);
        nextLessonTimerRef.current = null;
      }
    };
  }, [courseId, nextLessonPrompt, router]);

  useEffect(() => {
    if (!nextLessonPrompt || nextLessonPrompt.countdown !== 0) {
      return;
    }

    const targetLessonId = nextLessonPrompt.lessonId;
    setNextLessonPrompt(null);
    router.push(`/learn/${courseId}/${targetLessonId}`);
  }, [courseId, nextLessonPrompt, router]);

  const loadCourse = async () => {
    if (!user) return;
    setIsLoading(true);
    try {
      // Load course details
      const courseData = await api.get<Course>(`/api/v1/learning/courses/${courseId}`);
      setCourse(courseData);

      // Load enrollment status
      try {
        const enrollments = await api.get<{id: string; course_id: string; status: string}[]>(
          `/api/v1/learning/enrollments/?user_id=${user.id}`
        );
        const enrollment = enrollments.find((e) => e.course_id === courseId);
        setIsEnrolled(!!enrollment);
      } catch {
        setIsEnrolled(false);
      }

      // Load progress
      try {
        const progressData = await api.get<Progress[]>(
          `/api/v1/learning/progress/?course_id=${courseId}&user_id=${user.id}`
        );
        const progressMap: Record<string, boolean> = {};
        progressData.forEach((p) => {
          if (p.status === "completed") {
            progressMap[p.lesson_id] = true;
            clearPendingCompletedLesson(courseId, p.lesson_id);
            rememberCompletedLesson(courseId, p.lesson_id);
          }
        });
        readCompletedLessons(courseId).forEach((completedLessonId) => {
          progressMap[completedLessonId] = true;
        });
        readPendingCompletedLessons(courseId).forEach((pendingLessonId) => {
          progressMap[pendingLessonId] = true;
        });
        setProgress(progressMap);
      } catch {
        const fallbackProgress: Record<string, boolean> = {};
        readCompletedLessons(courseId).forEach((completedLessonId) => {
          fallbackProgress[completedLessonId] = true;
        });
        readPendingCompletedLessons(courseId).forEach((pendingLessonId) => {
          fallbackProgress[pendingLessonId] = true;
        });
        setProgress(fallbackProgress);
      }

      // Set initial expanded modules
      if (courseData.modules) {
        const moduleIds = new Set(courseData.modules.map((m: Module) => m.id));
        setExpandedModules(moduleIds);
      }
    } catch (err) {
      console.error("Failed to load course:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const findLesson = (lessonId: string): Lesson | null => {
    if (!course?.modules) return null;
    for (const mod of course.modules) {
      for (const lesson of mod.lessons) {
        if (lesson.id === lessonId) return lesson;
      }
    }
    return null;
  };

  const loadProgress = useCallback(async () => {
    if (!user) {
      return {};
    }

    try {
      const progressData = await api.get<Progress[]>(
        `/api/v1/learning/progress/?course_id=${courseId}&user_id=${user.id}`
      );
      const progressMap: Record<string, boolean> = {};
      progressData.forEach((p) => {
        if (p.status === "completed") {
          progressMap[p.lesson_id] = true;
          clearPendingCompletedLesson(courseId, p.lesson_id);
          rememberCompletedLesson(courseId, p.lesson_id);
        }
      });
      readCompletedLessons(courseId).forEach((completedLessonId) => {
        progressMap[completedLessonId] = true;
      });
      readPendingCompletedLessons(courseId).forEach((pendingLessonId) => {
        progressMap[pendingLessonId] = true;
      });
      setProgress(progressMap);
      return progressMap;
    } catch {
      const fallbackProgress: Record<string, boolean> = {};
      readCompletedLessons(courseId).forEach((completedLessonId) => {
        fallbackProgress[completedLessonId] = true;
      });
      readPendingCompletedLessons(courseId).forEach((pendingLessonId) => {
        fallbackProgress[pendingLessonId] = true;
      });
      setProgress(fallbackProgress);
      return fallbackProgress;
    }
  }, [courseId, user]);

  const isCourseCompletedInBackend = useCallback(async () => {
    if (!user) {
      return false;
    }

    try {
      const enrollments = await api.get<{ id: string; course_id: string; status: string }[]>(
        `/api/v1/learning/enrollments/?user_id=${user.id}`
      );
      const enrollment = enrollments.find((item) => item.course_id === courseId);
      return enrollment?.status === "completed";
    } catch {
      return false;
    }
  }, [courseId, user]);

  useEffect(() => {
    if (!user || !course) {
      return;
    }

    const allLessons = course.modules.flatMap((module) => module.lessons);
    if (allLessons.length === 0) {
      return;
    }

    const allCompleted = allLessons.every((lesson) => progress[lesson.id]);
    if (!allCompleted) {
      return;
    }

    let cancelled = false;

    const ensureCourseCompletionMemoryCaptured = async () => {
      try {
        const backendCourseCompleted = await isCourseCompletedInBackend();
        if (cancelled || !backendCourseCompleted) {
          return;
        }
        await captureLearnerMemoryEvent("course_enrollment_completed");
      } catch (error) {
        console.error("Failed to verify backend course completion for learner memory:", error);
      }
    };

    void ensureCourseCompletionMemoryCaptured();

    return () => {
      cancelled = true;
    };
  }, [captureLearnerMemoryEvent, course, isCourseCompletedInBackend, progress, user]);

  const getCurrentModule = (): Module | null => {
    if (!course?.modules) return null;
    for (const mod of course.modules) {
      if (mod.lessons.some((l) => l.id === lessonId)) return mod;
    }
    return null;
  };

  const getNextLesson = (): { moduleId: string; lessonId: string } | null => {
    if (!course?.modules) return null;
    let found = false;
    for (const mod of course.modules) {
      for (const lesson of mod.lessons) {
        if (found) return { moduleId: mod.id, lessonId: lesson.id };
        if (lesson.id === lessonId) found = true;
      }
    }
    return null;
  };

  const getPrevLesson = (): { moduleId: string; lessonId: string } | null => {
    if (!course?.modules) return null;
    let prev: { moduleId: string; lessonId: string } | null = null;
    for (const mod of course.modules) {
      for (const lesson of mod.lessons) {
        if (lesson.id === lessonId) return prev;
        prev = { moduleId: mod.id, lessonId: lesson.id };
      }
    }
    return null;
  };

    const handleMarkComplete = async () => {
      if (!user) return;
      try {
        markPendingCompletedLesson(courseId, lessonId);
        await api.post(`/api/v1/learning/progress/${lessonId}/complete`, {
        user_id: user.id,
        course_id: courseId,
        status: "completed",
      });
      const persistedProgress = await loadProgress();
        const nextProgress = {
          ...persistedProgress,
          [lessonId]: true,
        };
        rememberCompletedLesson(courseId, lessonId);
        setProgress(nextProgress);
        await captureLearnerMemoryEvent("lesson_completed");
        const backendCourseCompleted = await isCourseCompletedInBackend();
        if (backendCourseCompleted) {
          await captureLearnerMemoryEvent("course_enrollment_completed");
          await runCourseCompletionSequence();
          return;
        }

      await handleLessonCompletionFlow(nextProgress);
    } catch (err) {
      clearPendingCompletedLesson(courseId, lessonId);
      console.error("Failed to mark complete:", err);
    }
    };

  const handleVideoEnded = useCallback(async () => {
    if (!currentLesson || currentLesson.content_type !== "video" || progress[lessonId]) {
      return;
    }

    try {
      const heartbeatResult = await progressTrackerRef.current?.sendVideoHeartbeat();
      if (!heartbeatResult?.completion_unlocked) {
        return;
      }
      await handleMarkComplete();
    } catch (error) {
      console.error("Failed to complete lesson after video ended:", error);
    }
  }, [currentLesson, handleMarkComplete, lessonId, progress]);

  useEffect(() => {
    if (!currentLesson || currentLesson.content_type !== "video" || !user?.id) {
      return;
    }

    const handlePageHide = () => {
      const video = videoRef.current;
      if (!video || !user?.tenant_id) {
        return;
      }

      const currentModule = course?.modules.find((module) =>
        module.lessons.some((lesson) => lesson.id === currentLesson.id),
      );

      const watchPercent = Math.round(videoProgressPercent);
      if (watchPercent <= 0 || watchPercent >= 100) {
        return;
      }

      const body = JSON.stringify({
        tenantId: user.tenant_id,
        userId: user.id,
        courseId,
        courseTitle: course?.title || null,
        lessonId: currentLesson.id,
        lessonTitle: currentLesson.title,
        moduleId: currentModule?.id || null,
        moduleTitle: currentModule?.title || null,
        lessonContentType: currentLesson.content_type,
        lessonDurationMinutes: currentLesson.duration,
        lessonOrder: currentLesson.order,
        assessmentId: currentLesson.assessment_id || null,
        eventType: "video_progress_checkpoint",
        videoWatchPercent: watchPercent,
        videoCurrentTimeSeconds: Number(video.currentTime || 0),
        wrongAnswers: [],
        lessonReferenceIds: [],
        supportReferences: [],
      });

      fetch("/api/learner-memory-agent/lesson-engagement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(() => {
        // ignore pagehide failures
      });
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [course, courseId, currentLesson, user?.id, user?.tenant_id, videoProgressPercent]);

  const handleCoachMessage = useCallback(
    async (content: string) => {
      let sessionId = coachSessionId;
      if (!sessionId && user?.tenant_id) {
        const created = await createCoachSession({
          tenantId: user.tenant_id,
          courseId,
          lessonId,
          source: "course-lesson-coach",
          pagePath: `/learn/${courseId}/${lessonId}`,
        });
        sessionId = created.id;
        setCoachSessionId(sessionId);
      }

      const newUserMessage: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content,
        timestamp: new Date().toISOString(),
      };

      setCoachMessages((prev) => [...prev, newUserMessage]);
      setCoachTyping(true);

      try {
        const response = await fetch("/api/chat-coach-agent/ask", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            tenantId: user?.tenant_id,
            courseId,
            question: content,
            source: "course-lesson-coach",
            lessonId,
            pagePath: `/learn/${courseId}/${lessonId}`,
            sessionId,
          }),
        });

        const body = (await response.json().catch(() => null)) as
          | {
              success?: boolean;
              result?: {
                answer?: string;
                sessionId?: string;
                basedOn?: {
                  memories?: Array<{
                    text?: string;
                    type?: string;
                  }>;
                };
                supportingMemories?: Array<{
                  text?: string;
                  type?: string;
                }>;
              };
              error?: string;
            }
          | null;

        if (!response.ok || !body?.success || !body.result) {
          throw new Error(body?.error || "The AI Coach could not answer your question.");
        }

        const effectiveSessionId = body.result.sessionId || sessionId;
        if (effectiveSessionId) {
          const detail = await getCoachSessionDetail(effectiveSessionId);
          setCoachSessionId(effectiveSessionId);
          setCoachMessages(detail.messages);
        }
      } catch (error) {
        const aiErrorResponse: Message = {
          id: crypto.randomUUID(),
          role: "assistant",
          content:
            error instanceof Error
              ? error.message
              : "The AI Coach could not answer your question right now.",
          timestamp: new Date().toISOString(),
        };
        setCoachMessages((prev) => [...prev, aiErrorResponse]);
      } finally {
        setCoachTyping(false);
      }
    },
    [coachSessionId, course?.title, courseId, lessonId, user?.tenant_id],
  );

  const handleEnroll = async () => {
    if (!user) {
      router.push("/login");
      return;
    }
    try {
      await api.post("/api/v1/learning/enrollments/", {
        user_id: user.id,
        course_id: courseId,
      });
      setIsEnrolled(true);
    } catch (err) {
      console.error("Failed to enroll:", err);
    }
  };

  const completedCount = Object.values(progress).filter(Boolean).length;
  const totalLessons = totalLessonCount;
  const progressPercent = totalLessons > 0 ? Math.round((completedCount / totalLessons) * 100) : 0;

  const toggleModule = (moduleId: string) => {
    setExpandedModules((prev) => {
      const next = new Set(prev);
      if (next.has(moduleId)) {
        next.delete(moduleId);
      } else {
        next.add(moduleId);
      }
      return next;
    });
  };

  const getContentTypeIcon = (type: string) => {
    switch (type) {
      case "video":
        return Video;
      case "quiz":
        return HelpCircle;
      default:
        return FileText;
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center">
          <p className="text-text-secondary">Loading...</p>
        </div>
      </AppShell>
    );
  }

  if (!course) {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center">
          <p className="text-text-secondary">Course not found</p>
        </div>
      </AppShell>
    );
  }

  // Show enrollment prompt if not enrolled
  if (!isEnrolled) {
    return (
      <AppShell>
        <div className="flex h-[60vh] items-center justify-center">
          <Card className="max-w-md p-8 text-center">
            <BookOpen className="h-16 w-16 text-primary mx-auto mb-4" />
            <h2 className="text-xl font-bold text-text-primary mb-2">
              {course.title}
            </h2>
            <p className="text-text-secondary mb-6">
              Enroll in this course to start learning
            </p>
            <Button onClick={handleEnroll} className="w-full" size="lg">
              Enroll Now
            </Button>
          </Card>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="flex min-h-[calc(100vh-64px)] overflow-hidden scroll-smooth">
        {/* Sidebar */}
        <div
          className={`${
            sidebarOpen ? "w-72" : "w-0"
          } overflow-y-auto border-r border-border bg-card transition-all duration-200 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden`}
        >
          {/* Course Header */}
          <div className="sticky top-0 z-10 border-b border-border bg-card p-4">
            <h3 className="font-semibold text-text-primary truncate">
              {course.title}
            </h3>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 flex-1 rounded-full bg-background">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <span className="text-xs text-text-secondary">
                {progressPercent}%
              </span>
            </div>
            <p className="mt-1 text-xs text-text-secondary">
              {completedCount}/{totalLessons} lessons
            </p>
          </div>

          {/* Modules */}
          <div className="py-2">
            {course.modules.map((module) => (
              <div key={module.id}>
                <button
                  onClick={() => toggleModule(module.id)}
                  className="w-full flex items-center justify-between px-4 py-2 hover:bg-background/50"
                >
                  <span className="text-sm font-medium text-text-primary">
                    {module.title}
                  </span>
                  {expandedModules.has(module.id) ? (
                    <ChevronUp className="h-4 w-4 text-text-secondary" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-text-secondary" />
                  )}
                </button>
                {expandedModules.has(module.id) && (
                  <div>
                    {module.lessons.map((lesson) => {
                      const isActive = lesson.id === lessonId;
                      const isCompleted = progress[lesson.id];
                      const Icon = getContentTypeIcon(lesson.content_type);
                      return (
                        <button
                          key={lesson.id}
                          onClick={() =>
                            router.push(`/learn/${courseId}/${lesson.id}`)
                          }
                          className={`w-full flex items-center gap-3 px-4 py-2 pl-8 ${
                            isActive
                              ? "bg-primary/10 text-primary"
                              : "text-text-secondary hover:bg-background/50"
                          }`}
                        >
                          {isCompleted ? (
                            <CheckCircle className="h-4 w-4 text-green-500" />
                          ) : (
                            <Icon className="h-4 w-4" />
                          )}
                          <span className="flex-1 text-left text-sm truncate">
                            {lesson.title}
                          </span>
                          <span className="text-xs text-text-secondary">
                            {lesson.duration}m
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Top Bar */}
          <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2">
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSidebarOpen(!sidebarOpen)}
              >
                {sidebarOpen ? (
                  <X className="h-4 w-4" />
                ) : (
                  <Menu className="h-4 w-4" />
                )}
              </Button>
              <span className="text-sm text-text-secondary">
                {getCurrentModule()?.title}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {user && (
                <BookmarkButton
                  lessonId={lessonId}
                  size="sm"
                />
              )}
              <Trophy className="h-4 w-4 text-amber-500" />
              <span className="text-sm font-medium text-text-primary">
                +{course.xp_reward} XP
              </span>
            </div>
          </div>

          {/* Video/Content Area */}
          <div className="flex-1 overflow-y-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
            {currentLesson?.content_type === "quiz" && aiGeneratedLesson?.type === "quiz" ? (
              <div className="p-6">
                <div className="mx-auto max-w-2xl">
                  <AiPlatformQuiz
                    lessonId={lessonId}
                    onComplete={handleMarkComplete}
                    onAttemptEvaluated={handleAiQuizAttemptEvaluated}
                  />
                </div>
              </div>
            ) : aiGeneratedLesson ? (
              <AiGeneratedLessonPlayer
                lesson={{
                  id: currentLesson!.id,
                  title: currentLesson!.title,
                  duration: currentLesson!.duration,
                  content: currentLesson!.content,
                }}
                completed={!!progress[lessonId]}
                onComplete={handleMarkComplete}
                onPrevious={() => {
                  const prev = getPrevLesson();
                  if (prev) router.push(`/learn/${courseId}/${prev.lessonId}`);
                }}
                onNext={() => {
                  const next = getNextLesson();
                  if (next) router.push(`/learn/${courseId}/${next.lessonId}`);
                }}
              />
            ) : currentLesson?.content_type === "video" ? (
              <div className="relative aspect-video bg-slate-950 flex items-center justify-center">
                {currentLesson?.video_url ? (
                  <>
                    <video
                      ref={videoRef}
                      controls
                      className="w-full h-full"
                      src={currentLesson.video_url}
                      onLoadedMetadata={applySavedVideoPosition}
                      onPlay={() => {
                        if (videoRef.current && user && progressTrackerRef.current) {
                          progressTrackerRef.current.startVideoTracking(
                            videoRef.current,
                            handleVideoProgressUpdate
                          );
                        }
                      }}
                      onPause={() => {
                        if (progressTrackerRef.current) {
                          progressTrackerRef.current.stopVideoTracking();
                          progressTrackerRef.current.sendVideoHeartbeat().then((result) => {
                            if (result) {
                              setVideoProgressPercent(result.watch_percent);
                              void captureVideoProgressCheckpoint(
                                result.watch_percent,
                                Number(videoRef.current?.currentTime || 0),
                              );
                            }
                          }).catch((error) => {
                            console.error("Failed to capture video progress checkpoint:", error);
                          });
                        }
                      }}
                      onEnded={handleVideoEnded}
                    >
                      Your browser does not support the video tag.
                    </video>
                  </>
                ) : (
                  <div className="rounded-3xl bg-white/8 px-8 py-6 text-center backdrop-blur-sm">
                    <Video className="mx-auto mb-4 h-20 w-20 text-white/60" />
                    <p className="font-medium text-white">Video: {currentLesson.title}</p>
                    <p className="mt-2 text-sm text-white/65">
                      Duration: {currentLesson.duration} minutes
                    </p>
                  </div>
                )}
              </div>
            ) : currentLesson?.content_type === "quiz" ? (
              <div className="p-6">
                <div className="max-w-2xl mx-auto">
                  <Quiz
                    lessonId={lessonId}
                    courseId={courseId}
                    assessmentId={currentLesson?.assessment_id}
                    onComplete={handleMarkComplete}
                    onAttemptEvaluated={handleTraditionalQuizAttemptEvaluated}
                  />
                </div>
              </div>
            ) : (
              <div className="rounded-b-3xl border-b border-x border-border bg-card">
                <div className="mx-auto max-w-3xl p-8">
                  <h1 className="mb-4 text-2xl font-bold text-text-primary">
                    {currentLesson?.title}
                  </h1>
                  <div className="prose prose-slate max-w-none">
                    <p className="leading-7 text-text-secondary">{currentLesson?.content}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Lesson Info - only for non-quiz content */}
            {currentLesson?.content_type !== "quiz" && !aiGeneratedLesson && (
              <div className="p-6">
                <h1 className="text-2xl font-bold text-text-primary">
                  {currentLesson?.title}
                </h1>
                <div className="mt-2 flex items-center gap-4 text-sm text-text-secondary">
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    {currentLesson?.duration} minutes
                  </span>
                  <Badge variant="outline">{currentLesson?.content_type}</Badge>
                  {videoProgressPercent > 0 && (
                    <span className="flex items-center gap-1 text-primary">
                      <Percent className="h-4 w-4" />
                      {Math.round(videoProgressPercent)}%
                    </span>
                  )}
                </div>
                <div className="mt-4 prose">
                  <p className="text-text-secondary">
                    {lessonContent.summary || currentLesson?.content}
                  </p>
                </div>
                {lessonContent.supportItems.length > 0 && (
                  <div className="mt-6">
                    <Button
                      variant="outline"
                      onClick={() => setSupportOpen((prev) => !prev)}
                      className="w-full sm:w-auto"
                    >
                      <BookOpen className="mr-2 h-4 w-4" />
                      {supportOpen ? "Hide Lesson Support" : "Show Lesson Support"}
                    </Button>
                    {supportOpen && (
                      <Card className="mt-4 border-border bg-card p-4">
                        <div className="mb-3 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-primary" />
                          <h3 className="font-semibold text-text-primary">
                            Lesson Support Materials
                          </h3>
                        </div>
                        <div className="space-y-3">
                          {lessonContent.supportItems.map((item) => (
                            <a
                              key={`${item.url}-${item.title}`}
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center justify-between rounded-xl border border-border bg-background px-4 py-3 text-sm font-medium text-primary transition-colors hover:border-primary/40 hover:bg-primary/5"
                            >
                              <span className="truncate">{item.title}</span>
                              <ArrowRight className="ml-3 h-4 w-4 shrink-0" />
                            </a>
                          ))}
                        </div>
                      </Card>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Bottom Navigation - hide for quiz content */}
          {currentLesson?.content_type !== "quiz" && !aiGeneratedLesson && (
            <div className="flex items-center justify-between border-t border-border bg-card px-4 py-3">
              <Button
                variant="outline"
                onClick={() => {
                  const prev = getPrevLesson();
                  if (prev) router.push(`/learn/${courseId}/${prev.lessonId}`);
                }}
              >
                <ArrowLeft className="h-4 w-4 mr-2" />
                Previous
              </Button>

              <Button
                onClick={handleMarkComplete}
                disabled={
                  progress[lessonId] ||
                  (currentLesson?.content_type === "video" && completionLocked)
                }
                title={
                  currentLesson?.content_type === "video" && completionLocked
                    ? "Finish the entire video to unlock completion"
                    : ""
                }
              >
                {progress[lessonId] ? (
                  <>
                    <CheckCircle className="h-4 w-4 mr-2" />
                    Completed
                  </>
                ) : completionLocked ? (
                  <>
                    <Lock className="h-4 w-4 mr-2" />
                    Locked
                  </>
                ) : (
                  <>
                    <Unlock className="h-4 w-4 mr-2" />
                    Mark Complete
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={() => {
                  const next = getNextLesson();
                  if (next) router.push(`/learn/${courseId}/${next.lessonId}`);
                }}
              >
                Next
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          )}
        </div>
      </div>
      {nextLessonPrompt && (
        <div className="fixed bottom-6 right-6 z-[110] w-full max-w-md px-4 sm:px-0">
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
            <div className="bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.96))] px-6 py-5 text-white">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-emerald-200">
                Up Next
              </p>
              <h3 className="mt-2 text-xl font-bold">{nextLessonPrompt.title}</h3>
              <p className="mt-2 text-sm text-slate-300">
                Starting automatically in {nextLessonPrompt.countdown}s unless you cancel.
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 px-6 py-4">
              <Button
                variant="outline"
                onClick={() => setNextLessonPrompt(null)}
              >
                Cancel
              </Button>
              <Button
                onClick={() => {
                  const targetLessonId = nextLessonPrompt.lessonId;
                  setNextLessonPrompt(null);
                  router.push(`/learn/${courseId}/${targetLessonId}`);
                }}
              >
                Play next lesson
              </Button>
            </div>
          </div>
        </div>
      )}
      <div className="fixed bottom-6 right-6 z-[109]">
        {coachOpen ? (
          <div className="w-[360px] overflow-hidden rounded-[24px] border border-border bg-card shadow-[0_24px_60px_rgba(15,23,42,0.24)]">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/15 text-primary">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">AI Coach</p>
                  <p className="text-xs text-text-secondary">
                    Focused on {course?.title || "this course"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCoachOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border bg-background text-text-secondary transition-colors hover:text-text-primary"
                aria-label="Close AI coach"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="flex h-[460px] flex-col">
              <ChatMessages messages={coachMessages} isTyping={coachTyping} />
              <ChatInput onSend={handleCoachMessage} disabled={coachTyping || !user} />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setCoachOpen(true)}
            className="inline-flex items-center gap-3 rounded-full border border-primary/20 bg-primary px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_40px_rgba(37,99,235,0.32)] transition-colors hover:bg-primary-light"
          >
            <Bot className="h-5 w-5" />
            Ask AI Coach
          </button>
        )}
      </div>
      {courseXpCelebration !== null && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
          {CELEBRATION_BURSTS.map((burst, index) => (
            <div
              key={`${burst.left}-${burst.top}-${index}`}
              className="pointer-events-none absolute text-amber-200 opacity-90"
              style={{
                left: burst.left,
                top: burst.top,
                animation: `celebration-float ${burst.duration} ease-in-out ${burst.delay} infinite`,
              }}
            >
              <CelebrationBurstIcon index={index} className={burst.size} />
            </div>
          ))}
          <div className="relative w-full max-w-xl overflow-hidden rounded-[32px] border border-amber-300/30 bg-[radial-gradient(circle_at_top,_rgba(250,204,21,0.24),_rgba(17,24,39,0.98)_58%)] p-8 text-center shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setCourseXpCelebration(null);
                xpCelebrationResolverRef.current?.();
                xpCelebrationResolverRef.current = null;
              }}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close celebration"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="pointer-events-none absolute inset-x-10 top-5 h-24 rounded-full bg-amber-300/20 blur-3xl" />
            <div className="relative mx-auto mb-5 flex h-24 w-24 animate-bounce items-center justify-center rounded-full border border-amber-200/30 bg-amber-300/15 text-amber-200 shadow-[0_0_40px_rgba(251,191,36,0.35)]">
              <PartyPopper className="h-10 w-10" />
            </div>
            <div className="relative flex items-center justify-center gap-2 text-amber-200">
              <Sparkles className="h-4 w-4" />
              <p className="text-sm font-semibold uppercase tracking-[0.3em]">
                Course Obliterated
              </p>
              <Sparkles className="h-4 w-4" />
            </div>
            <h2 className="mt-4 text-5xl font-black text-white drop-shadow-[0_6px_18px_rgba(0,0,0,0.45)]">
              +{courseXpCelebration} XP
            </h2>
            <p className="mt-3 text-lg font-semibold text-amber-100">
              {completionOneLiner}
            </p>
            <p className="mt-3 text-sm text-white/75">
              Confetti budget exceeded. XP delivered successfully.
            </p>
            <div className="mt-6 flex items-center justify-center gap-3 text-amber-200">
              <Trophy className="h-6 w-6 animate-[celebration-wiggle_1.6s_ease-in-out_infinite]" />
              <Sparkles className="h-6 w-6 animate-[celebration-wiggle_1.9s_ease-in-out_0.1s_infinite]" />
              <PartyPopper className="h-6 w-6 animate-[celebration-wiggle_1.7s_ease-in-out_0.2s_infinite]" />
              <Stars className="h-6 w-6 animate-[celebration-wiggle_2s_ease-in-out_0.15s_infinite]" />
            </div>
            <button
              type="button"
              onClick={() => {
                setCourseXpCelebration(null);
                xpCelebrationResolverRef.current?.();
                xpCelebrationResolverRef.current = null;
              }}
              className="relative mt-6 inline-flex items-center justify-center rounded-2xl bg-amber-300 px-4 py-2 text-sm font-semibold text-slate-950 transition-colors hover:bg-amber-200"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {levelCelebration && (
        <div className="fixed inset-0 z-[123] flex items-center justify-center bg-black/75 px-6 backdrop-blur-sm">
          <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-secondary/30 bg-[#141925] p-8 text-center shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setLevelCelebration(null);
                levelCelebrationResolverRef.current?.();
                levelCelebrationResolverRef.current = null;
              }}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close celebration"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="pointer-events-none absolute inset-x-16 top-4 h-20 rounded-full bg-secondary/20 blur-3xl" />
            <div className="relative mx-auto mb-4 flex h-24 w-24 animate-[celebration-pop_0.9s_ease-out] items-center justify-center rounded-full bg-secondary/15 text-secondary shadow-[0_0_30px_rgba(16,185,129,0.25)]">
              <Rocket className="h-10 w-10" />
              <Sparkles className="absolute -right-1 top-2 h-5 w-5 animate-pulse" />
              <Stars className="absolute -left-1 bottom-3 h-5 w-5 animate-pulse" />
            </div>
            <p className="relative text-sm font-semibold uppercase tracking-[0.3em] text-secondary">
              Level Up
            </p>
            <h2 className="relative mt-3 text-3xl font-black text-white">
              Level {levelCelebration.newLevel}
            </h2>
            <p className="relative mt-2 text-sm text-white/70">
              You climbed from level {levelCelebration.oldLevel} to level {levelCelebration.newLevel}.
            </p>
            <p className="relative mt-3 text-sm text-white/70">
              Strong work. Close this when you are ready for the next step.
            </p>
            <div className="relative mt-5 flex items-center justify-center gap-2 text-white">
              <Rocket className="h-5 w-5 text-secondary" />
              <Sparkles className="h-5 w-5 text-secondary" />
              <PartyPopper className="h-5 w-5 text-secondary" />
              <Stars className="h-5 w-5 text-secondary" />
            </div>
            <button
              type="button"
              onClick={() => {
                setLevelCelebration(null);
                levelCelebrationResolverRef.current?.();
                levelCelebrationResolverRef.current = null;
              }}
              className="relative mt-6 inline-flex items-center justify-center rounded-2xl bg-secondary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-secondary/90"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {badgeCelebration && (
        <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/75 px-6 backdrop-blur-sm">
          <div className="relative w-full max-w-md overflow-hidden rounded-[28px] border border-primary/30 bg-[#141925] p-8 text-center shadow-2xl">
            <button
              type="button"
              onClick={() => {
                setBadgeCelebration(null);
                badgeCelebrationResolverRef.current?.();
                badgeCelebrationResolverRef.current = null;
              }}
              className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/5 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              aria-label="Close celebration"
            >
              <X className="h-4 w-4" />
            </button>
            <div className="pointer-events-none absolute inset-x-16 top-4 h-20 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative mx-auto mb-4 flex h-24 w-24 animate-[celebration-pop_0.9s_ease-out] items-center justify-center rounded-full bg-primary/15 text-primary shadow-[0_0_30px_rgba(59,130,246,0.25)]">
              <Trophy className="h-10 w-10" />
              <Sparkles className="absolute -right-1 top-2 h-5 w-5 animate-pulse" />
              <Stars className="absolute -left-1 bottom-3 h-5 w-5 animate-pulse" />
            </div>
            <p className="relative text-sm font-semibold uppercase tracking-[0.3em] text-primary">
              New Badge
            </p>
            <h2 className="relative mt-3 text-3xl font-black text-white">
              {badgeCelebration.name}
            </h2>
            <p className="relative mt-2 text-sm capitalize text-white/70">
              {badgeCelebration.tier} badge unlocked
            </p>
            <p className="relative mt-3 text-sm text-white/70">
              Another milestone down. Momentum looks good on you.
            </p>
            <div className="relative mt-5 flex items-center justify-center gap-2 text-xl text-white">
              <Stars className="h-5 w-5 text-primary" />
              <span>Shiny achievement acquired</span>
              <PartyPopper className="h-5 w-5 text-primary" />
              <Stars className="h-5 w-5 text-primary" />
            </div>
            <button
              type="button"
              onClick={() => {
                setBadgeCelebration(null);
                badgeCelebrationResolverRef.current?.();
                badgeCelebrationResolverRef.current = null;
              }}
              className="relative mt-6 inline-flex items-center justify-center rounded-2xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-light"
            >
              Close
            </button>
          </div>
        </div>
      )}
      {certificatePromptOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center bg-black/75 px-6 backdrop-blur-sm">
          <Card className="relative w-full max-w-lg overflow-hidden border-border bg-card p-8 text-center shadow-2xl">
            <div className="pointer-events-none absolute -top-8 left-1/2 h-24 w-48 -translate-x-1/2 rounded-full bg-green-400/10 blur-3xl" />
            <div className="relative mx-auto mb-4 flex h-20 w-20 animate-[celebration-pop_0.8s_ease-out] items-center justify-center rounded-full bg-green-500/10 text-green-400">
              <CheckCircle className="h-10 w-10" />
            </div>
            <h2 className="relative text-3xl font-bold text-text-primary">
              Congratulations, chaos agent.
            </h2>
            <p className="relative mt-3 text-text-secondary">
              You finished the course, collected the XP, and unlocked official bragging rights. Your certificate is ready.
            </p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
              <Button onClick={() => router.push("/certificates")}>
                Get My Certificate
              </Button>
              <Button
                variant="outline"
                onClick={() => setCertificatePromptOpen(false)}
              >
                Later
              </Button>
            </div>
          </Card>
        </div>
      )}
      <style jsx global>{`
        @keyframes celebration-float {
          0%, 100% {
            transform: translate3d(0, 0, 0) rotate(-8deg) scale(0.96);
          }
          50% {
            transform: translate3d(0, -14px, 0) rotate(8deg) scale(1.08);
          }
        }

        @keyframes celebration-wiggle {
          0%, 100% {
            transform: rotate(-10deg) translateY(0);
          }
          50% {
            transform: rotate(10deg) translateY(-6px);
          }
        }

        @keyframes celebration-pop {
          0% {
            opacity: 0;
            transform: scale(0.75);
          }
          70% {
            opacity: 1;
            transform: scale(1.08);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }
      `}</style>
    </AppShell>
  );
}
