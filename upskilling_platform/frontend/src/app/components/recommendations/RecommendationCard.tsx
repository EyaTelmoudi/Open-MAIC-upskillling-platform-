"use client";

import { cn } from "@/app/lib/utils";
import { BookOpen, Clock, TrendingUp } from "lucide-react";
import Link from "next/link";

export interface Recommendation {
  id: string;
  title: string;
  description: string;
  thumbnail?: string;
  relevanceScore: number;
  reason: string;
  duration: number;
  difficulty: "beginner" | "intermediate" | "advanced";
  category: string;
}

interface RecommendationCardProps {
  recommendation: Recommendation;
}

export function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case "beginner":
        return "bg-secondary/20 text-secondary";
      case "intermediate":
        return "bg-gold/20 text-gold";
      case "advanced":
        return "bg-destructive/20 text-destructive";
      default:
        return "bg-primary/20 text-primary";
    }
  };

  const getRelevanceColor = (score: number) => {
    if (score >= 90) return "bg-secondary text-white";
    if (score >= 70) return "bg-primary text-white";
    return "bg-text-secondary/20 text-text-primary";
  };

  return (
    <Link
      href={`/courses/${recommendation.id}`}
      className="group block rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/10"
    >
      <div className="flex gap-4">
        <div className="relative flex h-20 w-28 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-background">
          {recommendation.thumbnail ? (
            <img
              src={recommendation.thumbnail}
              alt={recommendation.title}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary/30 to-secondary/30">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
          )}
          <div
            className={cn(
              "absolute right-1 top-1 rounded px-1.5 py-0.5 text-xs font-medium",
              getRelevanceColor(recommendation.relevanceScore)
            )}
          >
            {recommendation.relevanceScore}%
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h4 className="text-sm font-semibold text-text-primary group-hover:text-primary">
            {recommendation.title}
          </h4>
          <p className="mt-1 line-clamp-2 text-xs text-text-secondary">
            {recommendation.description}
          </p>

          <div className="mt-2 flex items-center gap-3">
            <div className="flex items-center gap-1 text-xs text-text-secondary">
              <Clock className="h-3 w-3" />
              <span>{recommendation.duration} min</span>
            </div>
            <span
              className={cn(
                "rounded px-1.5 py-0.5 text-xs font-medium",
                getDifficultyColor(recommendation.difficulty)
              )}
            >
              {recommendation.difficulty}
            </span>
          </div>

          <div className="mt-2 flex items-center gap-1">
            <TrendingUp className="h-3 w-3 text-secondary" />
            <span className="text-xs text-secondary">{recommendation.reason}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}