"use client";

import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
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

function splitTableRow(line: string) {
  return line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim());
}

function isMarkdownTableDivider(line: string) {
  const cells = splitTableRow(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

function renderInlineMarkdown(text: string): ReactNode {
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return <strong key={index}>{part.slice(2, -2)}</strong>;
    }
    return <span key={index}>{part}</span>;
  });
}

function renderMessageContent(content: string, isUser: boolean) {
  const normalized = content.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const blocks: ReactNode[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index] ?? "";
    const trimmed = line.trim();

    if (!trimmed) {
      index += 1;
      continue;
    }

    if (trimmed.startsWith("```")) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length && lines[index].trim().startsWith("```")) {
        index += 1;
      }
      blocks.push(
        <pre
          key={`code-${index}`}
          className="overflow-x-auto rounded-xl bg-background px-4 py-3 text-sm leading-6 text-text-primary"
        >
          <code>{codeLines.join("\n")}</code>
        </pre>,
      );
      continue;
    }

    if (
      trimmed.includes("|") &&
      index + 1 < lines.length &&
      isMarkdownTableDivider(lines[index + 1] ?? "")
    ) {
      const header = splitTableRow(line);
      const rows: string[][] = [];
      index += 2;
      while (index < lines.length) {
        const tableLine = lines[index] ?? "";
        if (!tableLine.trim() || !tableLine.includes("|")) {
          break;
        }
        rows.push(splitTableRow(tableLine));
        index += 1;
      }

      blocks.push(
        <div key={`table-${index}`} className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full min-w-[480px] border-collapse text-left text-sm">
            <thead className="bg-background/80">
              <tr>
                {header.map((cell, cellIndex) => (
                  <th
                    key={`head-${cellIndex}`}
                    className="border-b border-border px-4 py-3 font-semibold text-text-primary"
                  >
                    {renderInlineMarkdown(cell)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, rowIndex) => (
                <tr key={`row-${rowIndex}`} className="align-top">
                  {row.map((cell, cellIndex) => (
                    <td
                      key={`cell-${rowIndex}-${cellIndex}`}
                      className="border-t border-border px-4 py-3 leading-6 text-text-primary"
                    >
                      {renderInlineMarkdown(cell)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );
      continue;
    }

    if (trimmed.startsWith("### ")) {
      blocks.push(
        <h3 key={`h3-${index}`} className="text-base font-semibold text-text-primary">
          {renderInlineMarkdown(trimmed.slice(4))}
        </h3>,
      );
      index += 1;
      continue;
    }

    if (trimmed.startsWith("## ")) {
      blocks.push(
        <h2 key={`h2-${index}`} className="text-lg font-semibold text-text-primary">
          {renderInlineMarkdown(trimmed.slice(3))}
        </h2>,
      );
      index += 1;
      continue;
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const items: string[] = [];
      while (index < lines.length) {
        const listLine = (lines[index] ?? "").trim();
        if (!(listLine.startsWith("- ") || listLine.startsWith("* "))) {
          break;
        }
        items.push(listLine.slice(2));
        index += 1;
      }

      blocks.push(
        <ul key={`ul-${index}`} className="ml-5 list-disc space-y-2 text-text-primary">
          {items.map((item, itemIndex) => (
            <li key={`item-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      const items: string[] = [];
      while (index < lines.length) {
        const listLine = (lines[index] ?? "").trim();
        if (!/^\d+\.\s/.test(listLine)) {
          break;
        }
        items.push(listLine.replace(/^\d+\.\s/, ""));
        index += 1;
      }

      blocks.push(
        <ol key={`ol-${index}`} className="ml-5 list-decimal space-y-2 text-text-primary">
          {items.map((item, itemIndex) => (
            <li key={`item-${itemIndex}`}>{renderInlineMarkdown(item)}</li>
          ))}
        </ol>,
      );
      continue;
    }

    blocks.push(
      <p key={`p-${index}`} className={isUser ? "" : "leading-7 text-text-primary"}>
        {renderInlineMarkdown(line)}
      </p>,
    );
    index += 1;
  }

  return blocks;
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
                {renderMessageContent(message.content, message.role === "user")}
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
