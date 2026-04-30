"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "@/app/components/layout/AppShell";
import { getSkillGapAnalysis, getSkillGraph, type SkillGapResponse, type SkillGraphResponse } from "@/app/lib/api";
import { AlertTriangle, CheckCircle2, GitBranchPlus, Loader2 } from "lucide-react";

export default function SkillGapPage() {
  const [graph, setGraph] = useState<SkillGraphResponse | null>(null);
  const [analysis, setAnalysis] = useState<SkillGapResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      try {
        setError(null);
        const [graphData, gapData] = await Promise.all([
          getSkillGraph(),
          getSkillGapAnalysis(),
        ]);
        setGraph(graphData);
        setAnalysis(gapData);
      } catch (err) {
        console.error("Failed to load skill gap analysis:", err);
        setError(err instanceof Error ? err.message : "Failed to load skill gap analysis");
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const groupedSkills = useMemo(() => {
    if (!graph) {
      return [];
    }
    const map = new Map<string, string[]>();
    for (const skill of graph.skills) {
      const current = map.get(skill.category) || [];
      current.push(skill.name);
      map.set(skill.category, current);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [graph]);

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
            <GitBranchPlus className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-text-primary">Skill Gap Analysis</h1>
            <p className="text-sm text-text-secondary">
              View your target skills, current mastery, missing prerequisites, and recommended courses.
            </p>
          </div>
        </div>

        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="flex h-48 items-center justify-center rounded-2xl border border-border bg-card">
            <div className="inline-flex items-center gap-2 text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading skill gap analysis...
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-sm text-text-secondary">Target Skills</p>
                <p className="mt-2 text-3xl font-bold text-text-primary">{analysis?.target_skills.length || 0}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-sm text-text-secondary">Mastered Skills</p>
                <p className="mt-2 text-3xl font-bold text-green-600">{analysis?.mastered_skills.length || 0}</p>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5">
                <p className="text-sm text-text-secondary">Open Gaps</p>
                <p className="mt-2 text-3xl font-bold text-amber-600">{analysis?.gaps.length || 0}</p>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h2 className="text-lg font-semibold text-text-primary">Gap Report</h2>
                  <p className="mt-1 text-sm text-text-secondary">
                    Role baseline: <span className="font-medium text-text-primary">{analysis?.role || "-"}</span>
                  </p>
                </div>

                {!analysis || analysis.gaps.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-card p-6">
                    <div className="flex items-center gap-2 text-green-600">
                      <CheckCircle2 className="h-5 w-5" />
                      <span className="font-medium">No open gaps detected.</span>
                    </div>
                    <p className="mt-2 text-sm text-text-secondary">
                      Your completed courses currently cover the target skills derived from your role and selected skills.
                    </p>
                  </div>
                ) : (
                  analysis.gaps.map((gap) => (
                    <div key={`${gap.target_skill}-${gap.skill_name}`} className="rounded-2xl border border-border bg-card p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="text-lg font-semibold text-text-primary">{gap.skill_name}</h3>
                            <span
                              className={`rounded-full px-2.5 py-1 text-xs font-medium ${
                                gap.severity === "high"
                                  ? "bg-red-500/10 text-red-600"
                                  : "bg-amber-500/10 text-amber-600"
                              }`}
                            >
                              {gap.severity}
                            </span>
                          </div>
                          <p className="mt-1 text-sm text-text-secondary">
                            Missing for target skill <span className="font-medium text-text-primary">{gap.target_skill}</span>
                          </p>
                          <p className="mt-1 text-xs uppercase tracking-wide text-text-secondary">
                            {gap.gap_type}
                          </p>
                        </div>
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                      </div>

                      <div className="mt-4">
                        <p className="text-sm font-medium text-text-primary">Recommended Courses</p>
                        {gap.recommended_courses.length === 0 ? (
                          <p className="mt-2 text-sm text-text-secondary">
                            No published course currently matches this skill in your tenant.
                          </p>
                        ) : (
                          <div className="mt-3 space-y-3">
                            {gap.recommended_courses.map((course) => (
                              <div key={course.id} className="rounded-xl border border-border bg-background px-4 py-3">
                                <div className="flex items-center justify-between gap-4">
                                  <div>
                                    <p className="font-medium text-text-primary">{course.title}</p>
                                    <p className="text-xs text-text-secondary">
                                      {course.category} • {course.difficulty}
                                    </p>
                                  </div>
                                  <a
                                    href={`/courses/${course.id}`}
                                    className="text-sm font-medium text-primary hover:underline"
                                  >
                                    Open
                                  </a>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-2xl border border-border bg-card p-5">
                  <h2 className="text-lg font-semibold text-text-primary">Target Skills</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(analysis?.target_skills || []).map((skill) => (
                      <span key={skill} className="rounded-full bg-primary/10 px-3 py-1 text-sm text-primary">
                        {skill}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-5">
                  <h2 className="text-lg font-semibold text-text-primary">Mastered Skills</h2>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(analysis?.mastered_skills || []).map((skill) => (
                      <span key={skill} className="rounded-full bg-green-500/10 px-3 py-1 text-sm text-green-600">
                        {skill}
                      </span>
                    ))}
                    {analysis && analysis.mastered_skills.length === 0 && (
                      <p className="text-sm text-text-secondary">No mastered skills inferred yet.</p>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-border bg-card p-5">
                  <h2 className="text-lg font-semibold text-text-primary">Skill Graph</h2>
                  <div className="mt-4 space-y-4">
                    {groupedSkills.map(([category, names]) => (
                      <div key={category}>
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{category}</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {names.map((name) => (
                            <span key={name} className="rounded-full bg-background px-3 py-1 text-sm text-text-primary">
                              {name}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
