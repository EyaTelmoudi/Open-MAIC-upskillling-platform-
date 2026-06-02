'use client';

import { useParams } from 'next/navigation';

import { AiCourseReviewContent } from '@/app/admin/ai-course-studio/course-builder/review/[draftId]/AiCourseReviewContent';
import { CourseManagementNav } from '@/app/admin/courses/course-management-nav';
import { AdminShell } from '@/app/components/layout/AdminShell';

export default function CourseGeneratedDraftReviewPage() {
  const params = useParams<{ draftId: string }>();

  return (
    <AdminShell>
      <AiCourseReviewContent draftId={params.draftId} navigation={<CourseManagementNav />} />
    </AdminShell>
  );
}
