"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/app/components/layout/AppShell";
import { ChatMessages, type Message } from "@/app/components/coach/ChatMessages";
import { ChatInput } from "@/app/components/coach/ChatInput";
import { ConversationList } from "@/app/components/coach/ConversationList";
import { Select } from "@/app/components/ui/Select";
import { api } from "@/app/lib/api";
import { Sparkles } from "lucide-react";
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

const starterMessages: Message[] = [
  {
    id: "1",
    role: "assistant",
    content:
      "Hello! I'm your AI Learning Coach. Ask me a question about your retained course knowledge and I will query Hindsight for the answer and supporting evidence.",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
  },
];

export default function CoachPage() {
  const { tenantId, user } = useAuth();
  const [messages, setMessages] = useState(starterMessages);
  const [availableCourses, setAvailableCourses] = useState<CoachCourseOption[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState(COURSE_MEMORY_DEMO_COURSE_ID);
  const [isLoadingCourses, setIsLoadingCourses] = useState(true);
  const [conversations] = useState([
    {
      id: "1",
      title: "HTML Course Coach",
      preview: "Ask about the retained HTML course",
      lastMessage: "Now",
      unread: false,
    },
  ]);
  const [activeConversation, setActiveConversation] = useState("1");
  const [isTyping, setIsTyping] = useState(false);

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
        console.error("Failed to load coach courses:", error);
        setAvailableCourses([]);
        setSelectedCourseId(COURSE_MEMORY_DEMO_COURSE_ID);
      } finally {
        setIsLoadingCourses(false);
      }
    }

    void loadCoachCourses();
  }, [user?.id]);

  const courseOptions = useMemo(() => {
    if (availableCourses.length === 0) {
      return [
        {
          value: COURSE_MEMORY_DEMO_COURSE_ID,
          label: "Demo coach course",
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

  const handleSendMessage = async (content: string) => {
    const newUserMessage = {
      id: crypto.randomUUID(),
      role: "user" as const,
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, newUserMessage]);

    setIsTyping(true);
    try {
      const response = await fetch("/api/chat-coach-agent/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          tenantId,
          courseId: selectedCourseId,
          question: content,
        }),
      });

      const body = (await response.json().catch(() => null)) as
        | {
            success?: boolean;
            result?: {
              answer?: string;
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

      const aiResponse = {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content: body.result.answer || "I could not generate an answer.",
        timestamp: new Date().toISOString(),
        sources: (body.result.supportingMemories || body.result.basedOn?.memories || []).slice(0, 3).map((memory, index) => ({
          title: `Hindsight memory ${index + 1}`,
          lesson: memory.type || "observation",
          snippet: memory.text || "",
        })),
      };
      setMessages((prev) => [...prev, aiResponse]);
    } catch (error) {
      const aiErrorResponse = {
        id: crypto.randomUUID(),
        role: "assistant" as const,
        content:
          error instanceof Error
            ? error.message
            : "The AI Coach could not answer your question right now.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiErrorResponse]);
    } finally {
      setIsTyping(false);
    }
  };

  const suggestedQuestions = [
    "Why is the alt attribute important for images?",
    "What does the course say about the src attribute?",
    "Which HTML element should be used for navigation links?",
    "Why are semantic HTML tags important for accessibility and SEO?",
  ];

  return (
    <AppShell fullBleed>
      <div className="flex h-[calc(100vh-76px)] min-h-0 overflow-hidden">
        <ConversationList
          conversations={conversations}
          activeId={activeConversation}
          onSelect={setActiveConversation}
        />

        <div className="flex min-w-0 flex-1 flex-col border border-border bg-card">
          <header className="flex items-center gap-3 border-b border-border bg-card px-6 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text-primary">
                AI Learning Coach
              </h1>
              <p className="text-sm text-text-secondary">
                Powered by AgnoOS and Hindsight
              </p>
            </div>
            <div className="ml-auto w-full max-w-xs">
              <Select
                value={selectedCourseId}
                onChange={(event) => setSelectedCourseId(event.target.value)}
                options={courseOptions}
                disabled={isTyping || isLoadingCourses}
                aria-label="Coach course selection"
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
