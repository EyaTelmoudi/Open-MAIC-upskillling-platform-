'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Archive, BookOpen, FilePenLine, PlaySquare, PlusCircle } from 'lucide-react';

import { routes } from '@/app/lib/routes';

type CourseOption = {
  id: string;
  title: string;
};

export function CourseManagementNav({
  currentCourseId,
  showAiWorkflowLinks = false,
}: {
  courses?: CourseOption[];
  currentCourseId?: string;
  showAiWorkflowLinks?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const detailsHref = routes.adminCourseDetails;
  const editorHref = currentCourseId
    ? routes.adminCourseEditorResolver(currentCourseId)
    : routes.adminCourseEditor;
  const isCatalogActive = pathname === routes.adminCourses;
  const isEditorActive =
    searchParams.get('edit') === '1' ||
    (!!currentCourseId && pathname === routes.adminCourseEditorResolver(currentCourseId)) ||
    pathname === routes.adminCourseEditor;
  const isDetailsActive =
    (pathname === routes.adminCourseDetails ||
      (!!currentCourseId && pathname === routes.adminCourseDetail(currentCourseId))) &&
    !isEditorActive;
  const isGeneratedDraftsActive =
    pathname === routes.adminCourseGeneratedDrafts ||
    pathname === routes.adminAiCourseDrafts ||
    (pathname.startsWith('/admin/ai-course-studio/drafts/') && !pathname.endsWith('/editor'));
  const aiWorkflowItems = [
    {
      key: 'ai-course-editor',
      href: routes.adminAiCourseEditorHome,
      label: 'Course Editor',
      description: 'Choose a draft here',
      icon: FilePenLine,
      active:
        pathname === routes.adminAiCourseEditorHome ||
        (pathname.startsWith('/admin/ai-course-studio/drafts/') && pathname.endsWith('/editor')),
    },
    {
      key: 'final-course-preview',
      href: routes.adminAiCourseReviewHome,
      label: 'Final Course Preview',
      description: 'Choose a finalized course here',
      icon: PlaySquare,
      active:
        pathname === routes.adminAiCourseReviewHome ||
        pathname.startsWith('/admin/ai-course-studio/course-builder/review/'),
    },
  ];

  return (
    <nav className="rounded-3xl border border-slate-200 bg-white/95 p-3 shadow-[0_14px_36px_rgba(15,23,42,0.08)]">
      <div className="grid gap-3 lg:grid-cols-5">
        <Link
          href={routes.adminCourses}
          className={`flex min-w-0 items-center gap-3 rounded-2xl px-4 py-3 transition ${
            isCatalogActive
              ? 'bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(59,130,246,0.1))] text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.08)]'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
          }`}
        >
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              isCatalogActive ? 'bg-white text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Course Catalog</div>
            <div className="text-xs text-slate-500">Browse and review all courses</div>
          </div>
        </Link>

        <Link
          href={routes.adminCourseNew}
          className={`flex min-w-0 items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
            pathname === routes.adminCourseNew
              ? 'bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(59,130,246,0.1))] text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.08)]'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
          }`}
        >
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              pathname === routes.adminCourseNew
                ? 'bg-white text-emerald-700'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            <PlusCircle className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Create New Course</div>
            <div className="text-xs text-slate-500">Start a new course authoring flow</div>
          </div>
        </Link>

        <Link
          href={routes.adminCourseGeneratedDrafts}
          className={`flex min-w-0 items-center gap-3 rounded-2xl px-4 py-3 transition ${
            isGeneratedDraftsActive
              ? 'bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(59,130,246,0.1))] text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.08)]'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
          }`}
        >
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              isGeneratedDraftsActive ? 'bg-white text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <Archive className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold">Generated Drafts</div>
            <div className="text-xs text-slate-500">Saved draft courses</div>
          </div>
        </Link>

        <Link
          href={detailsHref}
          className={`flex min-w-0 items-center gap-3 rounded-2xl px-4 py-3 transition ${
            isDetailsActive
              ? 'bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(59,130,246,0.1))] text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.08)]'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
          }`}
        >
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              isDetailsActive ? 'bg-white text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <BookOpen className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900">Course Details</div>
            <div className="mt-1 text-xs text-slate-500">
              Choose a course inside the details workspace
            </div>
          </div>
        </Link>

        <Link
          href={editorHref}
          className={`flex min-w-0 items-center gap-3 rounded-2xl px-4 py-3 ${
            isEditorActive
              ? 'bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(59,130,246,0.1))] text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.08)]'
              : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
          }`}
        >
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
              isEditorActive ? 'bg-white text-emerald-700' : 'bg-slate-100 text-slate-600'
            }`}
          >
            <FilePenLine className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900">Course Editor</div>
            <div className="mt-1 text-xs text-slate-500">
              {currentCourseId
                ? 'Open the editing view for the current course'
                : 'Choose a course inside the editor workspace'}
            </div>
          </div>
        </Link>
      </div>

      {showAiWorkflowLinks ? (
        <div className="mt-3 border-t border-slate-100 pt-3">
          <div className="grid gap-3 lg:grid-cols-2">
            {aiWorkflowItems.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={`flex min-w-0 items-center gap-3 rounded-2xl px-4 py-3 transition ${
                  item.active
                    ? 'bg-[linear-gradient(135deg,rgba(16,185,129,0.14),rgba(59,130,246,0.1))] text-slate-950 shadow-[0_10px_24px_rgba(15,23,42,0.08)]'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-950'
                }`}
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${
                    item.active ? 'bg-white text-emerald-700' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  <item.icon className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-semibold">{item.label}</div>
                  <div className="text-xs text-slate-500">{item.description}</div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      ) : null}
    </nav>
  );
}
