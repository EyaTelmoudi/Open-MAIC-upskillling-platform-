"use client";

import { useState } from "react";
import { Sparkles, BookOpen, Lightbulb } from "lucide-react";
import { RecommendationCard, type Recommendation } from "./RecommendationCard";

export interface RecommendationsPanelProps {
  recommendations?: Recommendation[];
}

const mockRecommendations: Recommendation[] = [
  {
    id: "rec-1",
    title: "Advanced JavaScript Patterns",
    description: "Master modern JavaScript design patterns and best practices for building scalable applications.",
    relevanceScore: 94,
    reason: "Matches your skill gap in async programming",
    duration: 45,
    difficulty: "advanced",
    category: "Development",
  },
  {
    id: "rec-2",
    title: "React Performance Optimization",
    description: "Learn techniques to optimize React applications for better user experience and performance.",
    relevanceScore: 87,
    reason: "Based on your recent React course progress",
    duration: 30,
    difficulty: "intermediate",
    category: "Frontend",
  },
  {
    id: "rec-3",
    title: "TypeScript for Professionals",
    description: "Deep dive into TypeScript generics, utility types, and advanced type system features.",
    relevanceScore: 78,
    reason: "Complements your JavaScript learning path",
    duration: 60,
    difficulty: "intermediate",
    category: "Development",
  },
];

export function RecommendationsPanel({
  recommendations = mockRecommendations,
}: RecommendationsPanelProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  return (
    <div className="rounded-xl border border-border bg-card">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-secondary/20">
            <Sparkles className="h-4 w-4 text-secondary" />
          </div>
          <div className="text-left">
            <h3 className="text-sm font-semibold text-text-primary">
              Recommended for You
            </h3>
            <p className="text-xs text-text-secondary">
              Personalized learning suggestions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-secondary/20 px-2 py-0.5 text-xs font-medium text-secondary">
            {recommendations.length}
          </span>
          <svg
            className={`h-4 w-4 text-text-secondary transition-transform ${
              isExpanded ? "rotate-180" : ""
            }`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </button>

      {isExpanded && (
        <div className="border-t border-border px-4 pb-4">
          {recommendations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-8 text-center">
              <Lightbulb className="mb-3 h-10 w-10 text-text-secondary/50" />
              <p className="text-sm font-medium text-text-primary">
                No recommendations yet
              </p>
              <p className="mt-1 text-xs text-text-secondary">
                Your personalized recommendations will appear here once you
                complete some courses.
              </p>
            </div>
          ) : (
            <div className="space-y-3 pt-4">
              {recommendations.map((rec) => (
                <RecommendationCard key={rec.id} recommendation={rec} />
              ))}
            </div>
          )}

          {recommendations.length > 0 && (
            <button className="mt-4 w-full rounded-lg border border-border py-2 text-sm font-medium text-text-secondary transition-colors hover:border-primary hover:text-primary">
              View All Recommendations
            </button>
          )}
        </div>
      )}
    </div>
  );
}