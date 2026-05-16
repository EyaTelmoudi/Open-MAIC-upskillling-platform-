"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/app/lib/utils";
import { Bot, User, Sparkles } from "lucide-react";

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  sources?: { title: string; lesson: string; snippet?: string }[];
  suggestedQuestions?: string[];
}

interface ChatMessagesProps {
  messages: Message[];
  isTyping: boolean;
}

export function ChatMessages({ messages, isTyping }: ChatMessagesProps) {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, isTyping]);

  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto px-6 py-4 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="space-y-6">
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "flex gap-4",
              message.role === "user" ? "flex-row-reverse" : "flex-row"
            )}
          >
            <div
              className={cn(
                "flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full",
                message.role === "user"
                  ? "bg-primary"
                  : "bg-secondary/20"
              )}
            >
              {message.role === "user" ? (
                <User className="h-4 w-4 text-white" />
              ) : (
                <Bot className="h-4 w-4 text-secondary" />
              )}
            </div>

            <div
              className={cn(
                "max-w-[75%] rounded-2xl px-5 py-4",
                message.role === "user"
                  ? "bg-primary text-white"
                  : "bg-card border border-border"
              )}
            >
              {message.role === "assistant" && (
                <div className="mb-2 flex items-center gap-2">
                  <Sparkles className="h-3 w-3 text-secondary" />
                  <span className="text-xs font-medium text-secondary">
                    AI Coach
                  </span>
                </div>
              )}

              <div className="space-y-3">
                {message.content.split("\n").map((line, i) => {
                  if (line.startsWith("```")) {
                    return (
                      <pre
                        key={i}
                        className="mt-2 overflow-x-auto rounded-lg bg-background p-3 text-sm"
                      >
                        <code>{line.replace(/```/g, "")}</code>
                      </pre>
                    );
                  }
                  if (line.startsWith("**") && line.endsWith("**")) {
                    return (
                      <p key={i} className="font-semibold">
                        {line.replace(/\*\*/g, "")}
                      </p>
                    );
                  }
                  if (line.match(/^\d+\./)) {
                    return (
                      <p key={i} className="ml-2">
                        {line}
                      </p>
                    );
                  }
                  return (
                    <p
                      key={i}
                      className={message.role === "user" ? "" : "text-text-primary"}
                    >
                      {line}
                    </p>
                  );
                })}
              </div>

              <p
                className={cn(
                  "mt-3 text-xs",
                  message.role === "user"
                    ? "text-white/60"
                    : "text-text-secondary"
                )}
              >
                {formatTime(message.timestamp)}
              </p>
            </div>
          </div>
        ))}

        {isTyping && (
          <div className="flex gap-4">
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-secondary/20">
              <Bot className="h-4 w-4 text-secondary" />
            </div>
            <div className="flex items-center gap-2 rounded-2xl border border-border bg-card px-5 py-4">
              <div className="flex gap-1">
                <span className="h-2 w-2 animate-bounce rounded-full bg-secondary [animation-delay:-0.3s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-secondary [animation-delay:-0.15s]" />
                <span className="h-2 w-2 animate-bounce rounded-full bg-secondary" />
              </div>
              <span className="text-sm text-text-secondary">Thinking...</span>
            </div>
          </div>
        )}
        <div ref={bottomAnchorRef} />
      </div>
    </div>
  );
}
