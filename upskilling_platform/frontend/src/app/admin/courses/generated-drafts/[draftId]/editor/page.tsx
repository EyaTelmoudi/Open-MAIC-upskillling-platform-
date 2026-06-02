'use client';

import { useParams } from 'next/navigation';

import { AiCourseDraftEditorContent } from '@/app/admin/ai-course-studio/drafts/[draftId]/editor/AiCourseDraftEditorContent';
import { CourseManagementNav } from '@/app/admin/courses/course-management-nav';
import { AdminShell } from '@/app/components/layout/AdminShell';
import { routes } from '@/app/lib/routes';

export default function CourseGeneratedDraftEditorPage() {
  const params = useParams<{ draftId: string }>();

  return (
    <AdminShell>
      <AiCourseDraftEditorContent
        draftId={params.draftId}
        navigation={<CourseManagementNav />}
        reviewHref={routes.adminCourseGeneratedDraftReview}
      />
    </AdminShell>
  );
}
