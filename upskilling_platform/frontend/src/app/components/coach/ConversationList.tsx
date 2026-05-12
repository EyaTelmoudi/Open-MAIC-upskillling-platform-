"use client";

import { cn } from "@/app/lib/utils";
import { MessageCircle, Plus, Bot } from "lucide-react";

interface Conversation {
  id: string;
  title: string;
  preview: string;
  lastMessage: string;
  unread: boolean;
}

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onCreate?: () => void;
}

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onCreate,
}: ConversationListProps) {
  return (
    <div className="flex w-[280px] flex-col border-r border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-4">
        <h2 className="text-sm font-semibold text-text-primary">Conversations</h2>
        <button
          onClick={onCreate}
          className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors hover:bg-primary/20"
          aria-label="Start a new conversation"
          type="button"
        >
          <Plus className="h-4 w-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
        {conversations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <MessageCircle className="mb-3 h-10 w-10 text-text-secondary/50" />
            <p className="text-sm text-text-secondary">No conversations yet</p>
            <p className="text-xs text-text-secondary/70">
              Start a new chat with your AI Coach
            </p>
          </div>
        ) : (
          <div className="space-y-1">
            {conversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => onSelect(conv.id)}
                className={cn(
                  "w-full rounded-xl p-3 text-left transition-colors",
                  activeId === conv.id
                    ? "bg-primary/10 border border-primary/20"
                    : "hover:bg-background"
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full",
                      activeId === conv.id
                        ? "bg-primary"
                        : "bg-secondary/20"
                    )}
                  >
                    <Bot
                      className={cn(
                        "h-4 w-4",
                        activeId === conv.id ? "text-white" : "text-secondary"
                      )}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <p
                        className={cn(
                          "truncate text-sm font-medium",
                          activeId === conv.id
                            ? "text-primary"
                            : "text-text-primary"
                        )}
                      >
                        {conv.title}
                      </p>
                      {conv.unread && (
                        <span className="h-2 w-2 flex-shrink-0 rounded-full bg-primary" />
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-text-secondary">
                      {conv.preview}
                    </p>
                    <p className="mt-1 text-xs text-text-secondary/60">
                      {conv.lastMessage}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
