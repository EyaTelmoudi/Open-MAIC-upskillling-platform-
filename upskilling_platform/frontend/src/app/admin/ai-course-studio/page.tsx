"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Bot,
  ExternalLink,
  FileText,
  Layers3,
  Rocket,
  ShieldCheck,
  Sparkles,
  Wand2,
} from "lucide-react";

import { AdminShell } from "@/app/components/layout/AdminShell";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { useAuth } from "@/app/context/AuthContext";
import { routes } from "@/app/lib/routes";
import { AiCourseStudioNav } from "./ai-course-studio-nav";

const highlights = [
  {
    icon: FileText,
    title: "Upload Course Sources",
    description:
      "Learning experts will be able to start from PDFs, course notes, and structured briefs instead of authoring each lesson manually.",
  },
  {
    icon: Layers3,
    title: "Generate Draft Curriculum",
    description:
      "The upcoming workflow will turn source material into course structure, lessons, quizzes, and guided learning content.",
  },
  {
    icon: Wand2,
    title: "Review Before Publishing",
    description:
      "AI output will remain editable so experts can validate, refine, and approve the final learning experience before release.",
  },
];

const roadmap = [
  "Create an AI-assisted course creation request from a PDF and an expert brief.",
  "Review the generated draft scene by scene before it becomes a platform course.",
  "Map the approved AI output into your existing course, module, and lesson structure.",
];

export default function AdminAiCourseStudioPage() {
  const router = useRouter();
  const { user, isLoading } = useAuth();

  useEffect(() => {
    if (!isLoading && user && user.role !== "LearningExpert") {
      router.replace(routes.adminCourses);
    }
  }, [isLoading, router, user]);

  if (!isLoading && user?.role !== "LearningExpert") {
    return null;
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <AiCourseStudioNav />

        <section className="overflow-hidden rounded-3xl border border-[#2A5B4A] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.22),_transparent_32%),radial-gradient(circle_at_76%_18%,_rgba(59,130,246,0.2),_transparent_26%),linear-gradient(135deg,_#102E2D_0%,_#132A3A_48%,_#0F172A_100%)] p-6 text-white shadow-[0_26px_70px_rgba(0,0,0,0.28)] sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
            <Sparkles className="h-3.5 w-3.5" />
            Learning Expert Only
          </div>
          <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                AI Course Studio
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-200 sm:text-base">
                This new workspace is the first integration point for AI-assisted course creation in your platform.
                It is reserved for learning experts and will host the future flow for generating courses from source material.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={routes.adminAiCourseBuilder}>
                <Button className="bg-white text-slate-950 hover:bg-slate-100">
                  <Rocket className="mr-2 h-4 w-4" />
                  Open Course Management
                </Button>
              </Link>
              <Link href={routes.adminCourses}>
                <Button variant="outline" className="border-white/20 bg-white/10 text-white hover:bg-white/15">
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Existing Courses
                </Button>
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          {highlights.map((item) => (
            <Card
              key={item.title}
              className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                <item.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-slate-950">{item.title}</h3>
              <p className="mt-3 text-sm leading-6 text-slate-600">{item.description}</p>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
          <Card className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-50 text-sky-700">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-950">
                  What this page confirms
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Your platform now has a dedicated administrative page for the learning expert role.
                  This is where the AI course creation workflow will be introduced next.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
              <p className="text-sm font-semibold text-slate-900">Next implementation slices</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
                {roadmap.map((item, index) => (
                  <li key={item} className="flex gap-3">
                    <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
                      {index + 1}
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </Card>

          <Card className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-950">Role protection</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This workspace is intended only for the <span className="font-semibold">LearningExpert</span> role.
                  Other admin roles are redirected back to regular course administration.
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              The AI course generation engine is not yet wired into your backend here. This page is the first visible feature entry point inside the platform.
            </div>
          </Card>
        </section>
      </div>
    </AdminShell>
  );
}
