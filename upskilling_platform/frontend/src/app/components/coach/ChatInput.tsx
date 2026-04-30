"use client";

import { useState, KeyboardEvent } from "react";
import { Send, Loader2 } from "lucide-react";
import { cn } from "@/app/lib/utils";

interface ChatInputProps {
  onSend: (message: string) => void;
  disabled?: boolean;
}

export function ChatInput({ onSend, disabled }: ChatInputProps) {
  const [message, setMessage] = useState("");

  const handleSend = () => {
    if (message.trim() && !disabled) {
      onSend(message.trim());
      setMessage("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-border bg-card p-4">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={
              disabled ? "AI Coach is thinking..." : "Ask me anything..."
            }
            disabled={disabled}
            className={cn(
              "w-full resize-none rounded-xl border border-border bg-background px-4 py-3 text-sm text-text-primary placeholder:text-text-secondary focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary",
              disabled && "opacity-50"
            )}
            rows={1}
            style={{ minHeight: "48px", maxHeight: "120px" }}
          />
        </div>
        <button
          onClick={handleSend}
          disabled={!message.trim() || disabled}
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-xl transition-colors",
            message.trim() && !disabled
              ? "bg-primary hover:bg-primary-light"
              : "bg-border text-text-secondary cursor-not-allowed"
          )}
        >
          {disabled ? (
            <Loader2 className="h-5 w-5 animate-spin text-white" />
          ) : (
            <Send className="h-5 w-5 text-white" />
          )}
        </button>
      </div>
      <p className="mt-2 text-xs text-text-secondary">
        Press Enter to send, Shift+Enter for new line
      </p>
    </div>
  );
}