"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "@/app/components/layout/AppShell";
import { ChatMessages, type Message } from "@/app/components/coach/ChatMessages";
import { ChatInput } from "@/app/components/coach/ChatInput";
import { ConversationList } from "@/app/components/coach/ConversationList";
import { Select } from "@/app/components/ui/Select";
import { api } from "@/app/lib/api";
import {
  activateCoachSession,
  createCoachSession,
  getCoachSessionDetail,
  listCoachSessions,
  type CoachSessionListItem,
} from "@/app/lib/coach-chat-sessions";
import { Brain } from "lucide-react";
import { useAuth } from "@/app/context/AuthContext";

const COURSE_MEMORY_DEMO_COURSE_ID = "30e2a552-f281-496e-99b8-cbab2fbff07b";

type EnrollmentRecord = {
  course_id: string;
  enrolled_at: string;
  completed_at?: string | null;
  status: string;
};

type CoachCourseOption = {
  id: string;
  title: string;
  status: string;
  enrolledAt: string;
  completedAt: string | null;
};

function starterMessages(courseTitle?: string | null): Message[] {
  void courseTitle;
  return [];
}

export default function CoachHindsightPage() {
  const { tenantId, user } = useAuth();
  const [messages, setMessages] = useState<Message[]>(starterMessages());
  const [availableCourses, setAvailableCourses] = useState<CoachCourseOption[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState(COURSE_MEMORY_DEMO_COURSE_ID);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [conversations, setConversations] = useState<CoachSessionListItem[]>([]);
  const [activeConversation, setActiveConversation] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const draftConversationKeysRef = useRef<Set<string>>(new Set());
  const selectedCourse = useMemo(
    () => availableCourses.find((course) => course.id === selectedCourseId) || null,
    [availableCourses, selectedCourseId],
  );

  useEffect(() => {
    async function loadCoachCourses() {
      if (!user?.id) {
        setIsLoadingCourses(false);
        return;
      }

      setIsLoadingCourses(true);
      try {
        const enrollments = await api.get<EnrollmentRecord[]>(
          `/api/v1/learning/enrollments/?user_id=${user.id}`,
        );

        const sortedEnrollments = [...enrollments].sort((a, b) => {
          const statusRank = (status: string) => {
            if (status === "in_progress") return 3;
            if (status === "completed") return 2;
            return 1;
          };
          const dateA = new Date(a.completed_at || a.enrolled_at).getTime();
          const dateB = new Date(b.completed_at || b.enrolled_at).getTime();
          return statusRank(b.status) - statusRank(a.status) || dateB - dateA;
        });

        const uniqueCourseIds = Array.from(new Set(sortedEnrollments.map((item) => item.course_id)));
        const courseEntries = await Promise.all(
          uniqueCourseIds.map(async (courseId) => {
            const course = await api.get<{ id: string; title: string }>(`/api/v1/learning/courses/${courseId}`);
            const enrollment = sortedEnrollments.find((item) => item.course_id === courseId);
            return {
              id: course.id,
              title: course.title,
              status: enrollment?.status || "unknown",
              enrolledAt: enrollment?.enrolled_at || "",
              completedAt: enrollment?.completed_at || null,
            } satisfies CoachCourseOption;
          }),
        );

        if (courseEntries.length > 0) {
          setAvailableCourses(courseEntries);
          setSelectedCourseId((current) =>
            current === COURSE_MEMORY_DEMO_COURSE_ID ? courseEntries[0].id : current,
          );
        } else {
          setAvailableCourses([]);
          setSelectedCourseId(COURSE_MEMORY_DEMO_COURSE_ID);
        }
      } catch (error) {
        console.error("Failed to load hindsight coach courses:", error);
        setAvailableCourses([]);
        setSelectedCourseId(COURSE_MEMORY_DEMO_COURSE_ID);
      } finally {
        setIsLoadingCourses(false);
      }
    }

    void loadCoachCourses();
  }, [user?.id]);

  useEffect(() => {
    async function loadSessions() {
      if (!user?.id || !selectedCourseId || !tenantId) {
        return;
      }

      const scopeKey = `${user.id}:${selectedCourseId}:hindsight-coach-page`;

      try {
        const sessions = (await listCoachSessions({
          courseId: selectedCourseId,
          source: "hindsight-coach-page",
        })).filter((session) => session.turnCount > 0);

        setConversations(sessions);

        if (!draftConversationKeysRef.current.has(scopeKey)) {
          draftConversationKeysRef.current.add(scopeKey);
          setActiveConversation("");
          setMessages(starterMessages(selectedCourse?.title || null));
          return;
        }

        const active = sessions.find((session) => session.status === "active") || sessions[0] || null;
        if (!active) {
          setActiveConversation("");
          setMessages(starterMessages(selectedCourse?.title || null));
          return;
        }

        setActiveConversation(active.id);
        const detail = await getCoachSessionDetail(active.id);
        setMessages(
          detail.messages.length > 0 ? detail.messages : starterMessages(selectedCourse?.title || null),
        );
      } catch (error) {
        console.error("Failed to load hindsight coach sessions:", error);
        setConversations([]);
        setActiveConversation("");
        setMessages(starterMessages(selectedCourse?.title || null));
      }
    }

    void loadSessions();
  }, [selectedCourse?.title, selectedCourseId, tenantId, user?.id]);

  const courseOptions = useMemo(() => {
    if (availableCourses.length === 0) {
      return [
        {
          value: COURSE_MEMORY_DEMO_COURSE_ID,
          label: "Demo hindsight coach course",
        },
      ];
    }

    return availableCourses.map((course) => ({
      value: course.id,
      label:
        course.status === "completed"
          ? `${course.title} - completed`
          : course.status === "in_progress"
            ? `${course.title} - in progress`
            : course.title,
    }));
  }, [availableCourses]);

  const createNewConversation = async () => {
    const scopeKey = `${user?.id || "anonymous"}:${selectedCourseId}:hindsight-coach-page`;
    draftConversationKeysRef.current.add(scopeKey);
    setActiveConversation("");
    setMessages(starterMessages(selectedCourse?.title || null));
  };

  const openConversation = async (sessionId: string) => {
    try {
      await activateCoachSession(sessionId);
      const [sessions, detail] = await Promise.all([
        listCoachSessions({
          courseId: selectedCourseId,
          source: "hindsight-coach-page",
        }),
        getCoachSessionDetail(sessionId),
      ]);
      setConversations(sessions.filter((session) => session.turnCount > 0));
      setActiveConversation(sessionId);
      setMessages(detail.messages.length > 0 ? detail.messages : starterMessages(selectedCourse?.title || null));
    } catch (error) {
      console.error("Failed to open hindsight coach session:", error);
    }
  };

  const handleSendMessage = async (content: string) => {
    let sessionId = activeConversation;
    if (!sessionId) {
      if (!tenantId) {
        return;
      }
      const created = await createCoachSession({
        tenantId,
        courseId: selectedCourseId,
        source: "hindsight-coach-page",
        pagePath: "/coach-hindsight",
      });
      sessionId = created.id;
      setActiveConversation(sessionId);
    }

    const newUserMessage = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newUserMessage]);

    setIsTyping(true);
    try {
      const response = await fetch("/api/hindsight-coach-agent/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          courseId: selectedCourseId,
          question: content,
          pagePath: "/coach-hindsight",
          sessionId,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | {
            success?: boolean;
            result?: {
              answer?: string;
              sessionId?: string;
            };
            error?: string;
          }
        | null;

      if (!response.ok || !body?.success || !body.result) {
        throw new Error(body?.error || "The Hindsight coach could not answer your question.");
      }

      const effectiveSessionId = body.result.sessionId || sessionId;
      if (effectiveSessionId) {
        const [sessions, detail] = await Promise.all([
          listCoachSessions({
            courseId: selectedCourseId,
            source: "hindsight-coach-page",
          }),
          getCoachSessionDetail(effectiveSessionId),
        ]);
        setConversations(sessions.filter((session) => session.turnCount > 0));
        setActiveConversation(effectiveSessionId);
        setMessages(detail.messages.length > 0 ? detail.messages : starterMessages(selectedCourse?.title || null));
      }
    } catch (error) {
      const aiErrorResponse = {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content:
          error instanceof Error
            ? error.message
            : "The Hindsight coach could not answer your question right now.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiErrorResponse]);
    } finally {
      setIsTyping(false);
    }
  };

  const suggestedQuestions = [
    "Summarize what this course wants me to understand first.",
    "What should I focus on before moving to the next lesson?",
    "What does the course memory say about this topic?",
    "Give me a concise explanation grounded in the retained course content.",
  ];

  return (
    <AppShell fullBleed>
      <div className="flex h-[calc(100vh-76px)] min-h-0 overflow-hidden">
        <ConversationList
          conversations={conversations.map((conversation) => ({
            id: conversation.id,
            title: conversation.title,
            preview: conversation.preview,
            lastMessage: new Date(conversation.lastActivityAt).toLocaleString(),
            unread: false,
          }))}
          activeId={activeConversation}
          onSelect={openConversation}
          onCreate={createNewConversation}
        />

        <div className="flex min-w-0 flex-1 flex-col border border-border bg-card">
          <header className="flex items-center gap-3 border-b border-border bg-card px-6 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <Brain className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text-primary">
                AI Coaching Agent
              </h1>
              <p className="text-sm text-text-secondary">
                Powered directly by Hindsight Reflect
              </p>
            </div>
            <div className="ml-auto w-full max-w-xs">
              <Select
                value={selectedCourseId}
                onChange={(event) => setSelectedCourseId(event.target.value)}
                options={courseOptions}
                disabled={isTyping || isLoadingCourses}
                aria-label="Hindsight coach course selection"
              />
            </div>
          </header>

          <ChatMessages
            messages={messages}
            isTyping={isTyping}
          />

          {messages.length <= 1 && (
            <div className="px-6 pb-4">
              <p className="mb-3 text-sm text-text-secondary">
                Try asking:
              </p>
              <div className="flex flex-wrap gap-2">
                {suggestedQuestions.map((q, i) => (
                  <button
                    key={i}
                    onClick={() => handleSendMessage(q)}
                    className="rounded-full border border-border bg-card px-4 py-2 text-sm text-text-secondary transition-colors hover:border-primary hover:text-primary"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          <ChatInput onSend={handleSendMessage} disabled={isTyping} />
        </div>
      </div>
    </AppShell>
  );
}
