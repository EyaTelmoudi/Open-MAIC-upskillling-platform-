"use client";

import { useState } from "react";
import { Sidebar } from "@/app/components/layout/Sidebar";
import { ChatMessages, type Message } from "@/app/components/coach/ChatMessages";
import { ChatInput } from "@/app/components/coach/ChatInput";
import { ConversationList } from "@/app/components/coach/ConversationList";
import { Sparkles } from "lucide-react";

const mockConversations = [
  {
    id: "1",
    title: "JavaScript Async",
    preview: "How do async/await work?",
    lastMessage: "2 hours ago",
    unread: true,
  },
  {
    id: "2",
    title: "Python Basics",
    preview: "Understanding lists and dicts",
    lastMessage: "Yesterday",
    unread: false,
  },
  {
    id: "3",
    title: "React Hooks",
    preview: "When to use useMemo?",
    lastMessage: "3 days ago",
    unread: false,
  },
];

const mockMessages: Message[] = [
  {
    id: "1",
    role: "assistant",
    content: "Hello! I'm your AI Learning Coach. I can help you understand concepts, answer questions about your courses, and guide you through your learning journey. What would you like to learn about today?",
    timestamp: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: "2",
    role: "user",
    content: "Can you explain how async/await works in JavaScript? I'm having trouble understanding when to use it.",
    timestamp: new Date(Date.now() - 3500000).toISOString(),
  },
  {
    id: "3",
    role: "assistant",
    content: "Great question! Async/await is a way to handle asynchronous operations in JavaScript that makes your code more readable and easier to follow.\n\n**Here's the key concept:**\n\nThink of async/await like ordering food at a restaurant. When you place an order, the kitchen starts cooking (async operation), but you don't just stand there waiting - you can do other things. When your food is ready, the server brings it to you (await).\n\n**Key points to remember:**\n\n1. **async** - Declares a function that returns a Promise\n2. **await** - Pauses execution until the Promise resolves\n3. It makes asynchronous code look synchronous\n\nWould you like me to show you a practical example?",
    timestamp: new Date(Date.now() - 3400000).toISOString(),
    sources: [
      { title: "JavaScript Fundamentals", lesson: "Async Programming" },
    ],
  },
  {
    id: "4",
    role: "user",
    content: "Yes, please show me an example with error handling.",
    timestamp: new Date(Date.now() - 3300000).toISOString(),
  },
  {
    id: "5",
    role: "assistant",
    content: "Here's a practical example with proper error handling using try/catch:\n\n```javascript\nasync function fetchUserData(userId) {\n  try {\n    const response = await fetch(`/api/users/${userId}`);\n    \n    if (!response.ok) {\n      throw new Error(`HTTP error! status: ${response.status}`);\n    }\n    \n    const data = await response.json();\n    return data;\n  } catch (error) {\n    console.error('Failed to fetch user:', error);\n    throw error;\n  }\n}\n```\n\n**Bloom's Taxonomy Insight:** You're moving from 'Understanding' to 'Applying' - great progress! The pattern above is a common real-world scenario you'll encounter frequently.\n\nDo you want to practice this with a quiz?",
    timestamp: new Date(Date.now() - 3200000).toISOString(),
    suggestedQuestions: [
      "What's the difference between .then() and async/await?",
      "Can you show me Promise.all()?",
    ],
  },
];

export default function CoachPage() {
  const [messages, setMessages] = useState(mockMessages);
  const [conversations] = useState(mockConversations);
  const [activeConversation, setActiveConversation] = useState("1");
  const [isTyping, setIsTyping] = useState(false);

  const handleSendMessage = (content: string) => {
    const newUserMessage = {
      id: String(messages.length + 1),
      role: "user" as const,
      content,
      timestamp: new Date().toISOString(),
    };
    setMessages([...messages, newUserMessage]);

    setIsTyping(true);
    setTimeout(() => {
      setIsTyping(false);
      const aiResponse = {
        id: String(messages.length + 2),
        role: "assistant" as const,
        content: "Thank you for your question! This is a demo response - in Sprint 4, this will connect to the actual AI agent API. The AI Coach will provide personalized tutoring based on your learning context and progress.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, aiResponse]);
    }, 1500);
  };

  const suggestedQuestions = [
    "Explain closures in JavaScript",
    "How does CSS Grid work?",
    "What are React hooks?",
    "Help me with Python dictionaries",
  ];

  return (
    <div className="flex min-h-screen scroll-smooth bg-background">
      <Sidebar isCompact={false} />

      <main className="flex min-h-screen flex-1 overflow-x-hidden">
        <ConversationList
          conversations={conversations}
          activeId={activeConversation}
          onSelect={setActiveConversation}
        />

        <div className="flex flex-1 flex-col">
          <header className="flex items-center gap-3 border-b border-border bg-card px-6 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-text-primary">
                AI Learning Coach
              </h1>
              <p className="text-sm text-text-secondary">
                Powered by Bloom's Taxonomy
              </p>
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
      </main>
    </div>
  );
}
