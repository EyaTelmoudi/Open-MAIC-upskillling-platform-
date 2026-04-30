"use client";

import { Sidebar } from "@/app/components/layout/Sidebar";
import { RecommendationsPanel } from "@/app/components/recommendations/RecommendationsPanel";

export default function RecommendationsPage() {
  return (
    <div className="flex min-h-screen scroll-smooth bg-background">
      <Sidebar isCompact={false} />

      <main className="flex flex-1 overflow-x-hidden">
        <div className="mx-auto max-w-4xl px-8 py-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-text-primary">
              Recommendations
            </h1>
            <p className="mt-2 text-text-secondary">
              Personalized course suggestions based on your learning journey
            </p>
          </div>

          <RecommendationsPanel />

          <div className="mt-8 rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-text-primary">
              How Recommendations Work
            </h2>
            <div className="mt-4 grid gap-4 md:grid-cols-3">
              <div className="flex flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20">
                  <span className="text-xl font-bold text-primary">1</span>
                </div>
                <h3 className="mt-3 text-sm font-medium text-text-primary">
                  Analyze Your Profile
                </h3>
                <p className="mt-2 text-xs text-text-secondary">
                  We analyze your skills, goals, and learning history
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-secondary/20">
                  <span className="text-xl font-bold text-secondary">2</span>
                </div>
                <h3 className="mt-3 text-sm font-medium text-text-primary">
                  Match Courses
                </h3>
                <p className="mt-2 text-xs text-text-secondary">
                  Find courses that fill your skill gaps
                </p>
              </div>
              <div className="flex flex-col items-center text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/20">
                  <span className="text-xl font-bold text-gold">3</span>
                </div>
                <h3 className="mt-3 text-sm font-medium text-text-primary">
                  Personalize
                </h3>
                <p className="mt-2 text-xs text-text-secondary">
                  Tailor recommendations to your role and interests
                </p>
              </div>
            </div>
          </div>

          <div className="mt-8 rounded-xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-text-primary">
              Demo: Empty State
            </h2>
            <p className="mt-2 text-sm text-text-secondary">
              Pass an empty array to see the empty state:
            </p>
            <div className="mt-4">
              <RecommendationsPanel recommendations={[]} />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
