"use client";

export type StoredCoachMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources?: { title: string; lesson: string; snippet?: string }[];
  suggestedQuestions?: string[];
};

function coachChatStorageKey(userId: string, courseId: string) {
  return `coach-chat:${userId}:${courseId}`;
}

export function readCoachChatMessages(
  userId: string | null | undefined,
  courseId: string | null | undefined,
): StoredCoachMessage[] {
  if (typeof window === "undefined" || !userId || !courseId) {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(coachChatStorageKey(userId, courseId));
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as StoredCoachMessage[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeCoachChatMessages(
  userId: string | null | undefined,
  courseId: string | null | undefined,
  messages: StoredCoachMessage[],
) {
  if (typeof window === "undefined" || !userId || !courseId) {
    return;
  }

  try {
    window.localStorage.setItem(
      coachChatStorageKey(userId, courseId),
      JSON.stringify(messages),
    );
  } catch {
    // ignore storage failures
  }
}
