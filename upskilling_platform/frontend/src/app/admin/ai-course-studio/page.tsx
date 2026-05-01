"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BrainCircuit,
  Bot,
  CheckCircle2,
  ClipboardCheck,
  ExternalLink,
  FileText,
  Film,
  Gauge,
  Layers3,
  MessageSquareQuote,
  PencilRuler,
  Presentation,
  Rocket,
  ShieldCheck,
  Sparkles,
  Target,
  Workflow,
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
    title: "Start From Real Course Material",
    description:
      "Upload a PDF, combine it with a clear expert brief, and use that source material as the foundation for course generation.",
  },
  {
    icon: Layers3,
    title: "Generate A Full Learning Draft",
    description:
      "The studio can build a structured course draft with lessons, quizzes, scripts, and interactive learning scenes instead of only giving raw text.",
  },
  {
    icon: PencilRuler,
    title: "Review, Edit, And Approve",
    description:
      "Every generated scene remains reviewable and editable so the learning expert stays in control before anything becomes a platform course.",
  },
];

const workflowSteps = [
  {
    icon: FileText,
    title: "1. Provide the source",
    description:
      "Upload the course PDF and describe the intended audience, tone, level, and learning objectives.",
  },
  {
    icon: Workflow,
    title: "2. Let the AI build the draft",
    description:
      "The course generator agent turns the source into a draft learning experience with lesson structure, quizzes, scripts, and scenes.",
  },
  {
    icon: ClipboardCheck,
    title: "3. Review scene by scene",
    description:
      "The learning expert checks each generated lesson part, corrects weak sections, and validates educational quality.",
  },
  {
    icon: CheckCircle2,
    title: "4. Save as a platform draft",
    description:
      "After final approval, the course is preserved as a platform draft so it can later be published to learners.",
  },
];

const outputs = [
  { icon: Presentation, label: "Animated lesson slides" },
  { icon: MessageSquareQuote, label: "Teacher narration and scripts" },
  { icon: ClipboardCheck, label: "Generated quizzes and assessments" },
  { icon: Film, label: "Media-ready structured lesson scenes" },
];

const benefits = [
  {
    icon: Gauge,
    title: "Reduce authoring time",
    description:
      "Move faster from raw source material to a reviewable course draft without starting from a blank page.",
  },
  {
    icon: Target,
    title: "Keep pedagogical control",
    description:
      "AI accelerates production, but the learning expert remains responsible for accuracy, relevance, and approval.",
  },
  {
    icon: BrainCircuit,
    title: "Create reusable course intelligence",
    description:
      "The generated draft becomes a structured asset that can later be refined, stored, searched, and reused across the platform.",
  },
];

const quickFacts = [
  {
    icon: Sparkles,
    title: "Agentic generation",
    description:
      "AI converts your source document and prompt into the first structured course draft.",
    accent: "from-emerald-400/25 to-emerald-100/40",
    iconClassName: "bg-emerald-100 text-emerald-700",
  },
  {
    icon: PencilRuler,
    title: "Expert validation",
    description:
      "You stay in control by reviewing, editing, and approving every generated lesson scene.",
    accent: "from-sky-400/25 to-sky-100/40",
    iconClassName: "bg-sky-100 text-sky-700",
  },
  {
    icon: ShieldCheck,
    title: "Controlled publishing",
    description:
      "Only reviewed output moves forward into a platform draft that can later be published.",
    accent: "from-amber-400/25 to-amber-100/40",
    iconClassName: "bg-amber-100 text-amber-700",
  },
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
                AI Course Studio is the learning expert&apos;s workspace for transforming source
                material into a structured, reviewable course draft. It combines the course
                generator agent, editorial review, and platform persistence so experts can move
                from PDF content to a final course experience with far less manual setup.
              </p>
              <div className="mt-6 flex flex-wrap gap-3 text-xs font-medium text-emerald-100">
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                  AI-assisted course generation
                </span>
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                  Scene-by-scene expert review
                </span>
                <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                  Platform draft persistence
                </span>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link href={routes.adminAiCourseBuilder}>
                <Button className="bg-white text-slate-950 hover:bg-slate-100">
                  <Rocket className="mr-2 h-4 w-4" />
                  Open Course Management
                </Button>
              </Link>
              <Link href={routes.adminCourses}>
                <Button
                  variant="outline"
                  className="border-white/20 bg-white/10 text-white hover:bg-white/15"
                >
                  <ExternalLink className="mr-2 h-4 w-4" />
                  Open Existing Courses
                </Button>
              </Link>
            </div>
          </div>
          <div className="mt-8 grid gap-3 lg:grid-cols-3">
            {quickFacts.map((item) => (
              <div
                key={item.title}
                className={`rounded-2xl border border-white/12 bg-gradient-to-br ${item.accent} p-[1px]`}
              >
                <div className="h-full rounded-2xl bg-slate-950/40 p-4 backdrop-blur-sm">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-2xl ${item.iconClassName}`}
                  >
                    <item.icon className="h-5 w-5" />
                  </div>
                  <div className="mt-4 text-sm font-semibold text-white">{item.title}</div>
                  <p className="mt-1 text-sm leading-6 text-slate-200">{item.description}</p>
                </div>
              </div>
            ))}
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

        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-3xl border border-slate-200 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,250,255,0.96))] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                <Workflow className="h-5 w-5" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-950">
                  How the AI Course Studio works
                </h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  This module is built to support a clear human-in-the-loop flow: the course
                  generator agent creates the first draft, and the learning expert turns that draft
                  into a publishable course.
                </p>
              </div>
            </div>

            <div className="mt-6 grid gap-3">
              {workflowSteps.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-slate-200 bg-white/90 p-4"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                      <item.icon className="h-5 w-5" />
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-slate-950">{item.title}</div>
                      <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="rounded-3xl border border-emerald-200 bg-[linear-gradient(180deg,rgba(240,253,250,0.98),rgba(255,255,255,0.96))] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-950">What the expert receives</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    The AI does not return one generic blob of text. It prepares structured course
                    building blocks that can be reviewed and improved inside the platform.
                  </p>
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                {outputs.map((item) => (
                  <div
                    key={item.label}
                    className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-white/85 px-4 py-3"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                      <item.icon className="h-4.5 w-4.5" />
                    </div>
                    <span className="text-sm font-medium text-slate-800">{item.label}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="rounded-3xl border border-amber-200 bg-[linear-gradient(180deg,rgba(255,251,235,0.98),rgba(255,255,255,0.96))] p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
              <div className="flex items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                  <ShieldCheck className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-xl font-semibold text-slate-950">Why this workspace matters</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">
                    This section is intentionally restricted to the{" "}
                    <span className="font-semibold">LearningExpert</span> role because it is an
                    editorial and quality-control workspace, not just a generation screen.
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {benefits.map((item) => (
                  <div
                    key={item.title}
                    className="rounded-2xl border border-amber-100 bg-white/90 p-4"
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
                        <item.icon className="h-4.5 w-4.5" />
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-slate-950">{item.title}</div>
                        <p className="mt-1 text-sm leading-6 text-slate-600">{item.description}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
