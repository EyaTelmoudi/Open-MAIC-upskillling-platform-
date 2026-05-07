"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Archive, FilePenLine, Layers3, PlaySquare, Wand2 } from "lucide-react";

import { routes } from "@/app/lib/routes";

const navItems = [
  {
    key: "studio",
    href: routes.adminAiCourseStudio,
    label: "AI Course Studio",
    description: "Workspace overview",
    icon: Layers3,
    match: (pathname: string) => pathname === routes.adminAiCourseStudio,
  },
  {
    key: "builder",
    href: routes.adminAiCourseBuilder,
    label: "AI Course Builder",
    description: "Generate and review",
    icon: Wand2,
    match: (pathname: string) =>
      pathname === routes.adminAiCourseBuilder,
  },
  {
    key: "drafts",
    href: routes.adminAiCourseDrafts,
    label: "Generated Drafts",
    description: "Saved draft courses",
    icon: Archive,
    match: (pathname: string) => pathname === routes.adminAiCourseDrafts,
  },
];

export function AiCourseStudioNav({ currentDraftId }: { currentDraftId?: string }) {
  const pathname = usePathname();
  const draftIdFromPath = pathname.startsWith("/admin/ai-course-studio/drafts/")
    ? pathname.split("/")[5]
    : pathname.startsWith("/admin/ai-course-studio/course-builder/review/")
      ? pathname.split("/")[6]
      : undefined;
  const editorDraftId = currentDraftId || draftIdFromPath;

  const items = [
    ...navItems,
    {
      key: "editor",
      href: editorDraftId
        ? routes.adminAiCourseEditor(editorDraftId)
        : routes.adminAiCourseEditorHome,
      label: "Course Editor",
      description: editorDraftId ? "Edit generated draft" : "Choose a draft here",
      icon: FilePenLine,
      match: (currentPath: string) =>
        currentPath === routes.adminAiCourseEditorHome ||
        (currentPath.startsWith("/admin/ai-course-studio/drafts/") &&
          currentPath.endsWith("/editor")),
    },
    {
      key: "final-preview",
      href: editorDraftId
        ? routes.adminAiCourseReview(editorDraftId)
        : routes.adminAiCourseReviewHome,
      label: "Final Course Preview",
      description: editorDraftId ? "Animated final revision" : "Choose a finalized course here",
      icon: PlaySquare,
      match: (currentPath: string) =>
        currentPath === routes.adminAiCourseReviewHome ||
        currentPath.startsWith("/admin/ai-course-studio/course-builder/review/"),
    },
  ];

  return (
    <nav className="rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-3 lg:flex-row">
        {items.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 py-3 transition ${
                active
                  ? "bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(59,130,246,0.1))] text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.08)]"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-950"
              }`}
            >
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                  active ? "bg-white text-emerald-700" : "bg-slate-100 text-slate-500"
                }`}
              >
                <item.icon className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold">{item.label}</div>
                <div className="text-xs text-slate-500">{item.description}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
