import { AppShell } from "@/app/components/layout/AppShell";
import { Sparkles } from "lucide-react";

export default function RecommendationsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AppShell>
      <div className="space-y-6">
        <div className="overflow-hidden rounded-3xl border border-[#2A5B4A] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.22),_transparent_32%),radial-gradient(circle_at_76%_18%,_rgba(59,130,246,0.2),_transparent_26%),linear-gradient(135deg,_#102E2D_0%,_#132A3A_48%,_#0F172A_100%)] p-6 text-white shadow-[0_26px_70px_rgba(0,0,0,0.28)] sm:p-8">
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
            <Sparkles className="h-3.5 w-3.5" />
            Learner Guidance
          </div>
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.26em] text-emerald-100/80">
            Recommendation Studio
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Personalized learner intelligence
          </h1>
          <p className="mt-4 max-w-3xl text-sm leading-7 text-slate-200 sm:text-base">
            This page helps the learner decide what to do next: resume the most relevant lesson,
            review the skills that are still weak, and keep moving toward course completion with
            less guesswork.
          </p>
        </div>

        {children}
      </div>
    </AppShell>
  );
}
