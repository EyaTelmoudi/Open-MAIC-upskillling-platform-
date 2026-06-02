'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Archive, FilePenLine, Layers3, PlaySquare, Wand2 } from 'lucide-react';

import { routes } from '@/app/lib/routes';

const navItems = [
  {
    key: 'studio',
    href: routes.adminCourses,
    label: 'AI Course Studio',
    description: 'Workspace overview',
    icon: Layers3,
    match: (pathname: string) => pathname === routes.adminCourses,
  },
  {
    key: 'builder',
    href: routes.adminCourseNew,
    label: 'AI Course Builder',
    description: 'Generate and review',
    icon: Wand2,
    match: (pathname: string) => pathname === routes.adminCourseNew,
  },
  {
    key: 'drafts',
    href: routes.adminCourseGeneratedDrafts,
    label: 'Generated Drafts',
    description: 'Saved draft courses',
    icon: Archive,
    match: (pathname: string) => pathname === routes.adminCourseGeneratedDrafts,
  },
  {
    key: 'editor',
    href: routes.adminCourseEditor,
    label: 'Course Editor',
    description: 'Choose a draft here',
    icon: FilePenLine,
    match: (pathname: string) =>
      pathname === routes.adminCourseEditor ||
      (pathname.startsWith('/admin/courses/generated-drafts/') && pathname.endsWith('/editor')),
  },
  {
    key: 'final-preview',
    href: routes.adminCourseGeneratedDraftReviewHome,
    label: 'Final Course Preview',
    description: 'Choose a finalized course here',
    icon: PlaySquare,
    match: (pathname: string) =>
      pathname === routes.adminCourseGeneratedDraftReviewHome ||
      (pathname.startsWith('/admin/courses/generated-drafts/') && pathname.endsWith('/review')) ||
      pathname === routes.adminAiCourseReviewHome ||
      pathname.startsWith('/admin/ai-course-studio/course-builder/review/'),
  },
];

export function CourseAiWorkflowNav() {
  const pathname = usePathname();

  return (
    <nav className="rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
      <div className="flex flex-col gap-3 lg:flex-row">
        {navItems.map((item) => {
          const active = item.match(pathname);
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-4 py-3 transition ${
                active
                  ? 'bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(59,130,246,0.1))] text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.08)]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
              }`}
            >
              <div
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                  active ? 'bg-white text-emerald-700' : 'bg-slate-100 text-slate-500'
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
