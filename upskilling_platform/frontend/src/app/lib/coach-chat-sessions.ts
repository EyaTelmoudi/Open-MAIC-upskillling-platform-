"use client";

import type { Message } from "@/app/components/coach/ChatMessages";

export type CoachSessionSource =
  | "coach-page"
  | "course-page"
  | "course-lesson-coach"
  | "hindsight-coach-page";

export type CoachSessionListItem = {
  id: string;
  tenantId: string;
  userId: string;
  courseId: string;
  lessonId: string | null;
  source: CoachSessionSource;
  title: string;
  status: "active" | "inactive";
  preview: string;
  turnCount: number;
  lastActivityAt: string;
  startedAt: string;
};

export type CoachSessionDetail = CoachSessionListItem & {
  pagePath: string | null;
  messages: Message[];
};

type ListSessionsOptions = {
  courseId: string;
  lessonId?: string | null;
  source?: CoachSessionSource | null;
};

type CreateSessionOptions = {
  tenantId: string;
  courseId: string;
  lessonId?: string | null;
  source: CoachSessionSource;
  pagePath?: string | null;
};

function buildQuery(params: Record<string, string | null | undefined>) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value) {
      query.set(key, value);
    }
  });
  const text = query.toString();
  return text ? `?${text}` : "";
}

async function parseJson<T>(response: Response) {
  const body = (await response.json().catch(() => null)) as T | { error?: string } | null;
  if (!response.ok || !body || (body as { error?: string }).error) {
    throw new Error((body as { error?: string } | null)?.error || "Coach session request failed.");
  }
  return body as T;
}

export async function listCoachSessions(options: ListSessionsOptions) {
  const response = await fetch(
    `/api/chat-coach-agent/sessions${buildQuery({
      courseId: options.courseId,
      lessonId: options.lessonId || null,
      source: options.source,
    })}`,
    {
      cache: "no-store",
    },
  );

  const body = await parseJson<{ success: boolean; sessions: CoachSessionListItem[] }>(response);
  return body.sessions;
}

export async function createCoachSession(options: CreateSessionOptions) {
  const response = await fetch("/api/chat-coach-agent/sessions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(options),
  });

  const body = await parseJson<{ success: boolean; session: CoachSessionListItem }>(response);
  return body.session;
}

export async function activateCoachSession(sessionId: string) {
  const response = await fetch(`/api/chat-coach-agent/sessions/${sessionId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action: "activate" }),
  });

  const body = await parseJson<{ success: boolean; session: CoachSessionListItem }>(response);
  return body.session;
}

export async function getCoachSessionDetail(sessionId: string) {
  const response = await fetch(`/api/chat-coach-agent/sessions/${sessionId}`, {
    cache: "no-store",
  });

  const body = await parseJson<{ success: boolean; session: CoachSessionDetail }>(response);
  return body.session;
}
