'use client';

import { AiCourseDraftsContent } from '@/app/admin/ai-course-studio/drafts/AiCourseDraftsContent';
import { CourseManagementNav } from '@/app/admin/courses/course-management-nav';
import { AdminShell } from '@/app/components/layout/AdminShell';
import { routes } from '@/app/lib/routes';

export default function CourseGeneratedDraftsPage() {
  return (
    <AdminShell>
      <AiCourseDraftsContent
        navigation={<CourseManagementNav />}
        editorHref={routes.adminCourseGeneratedDraftEditor}
      />
    </AdminShell>
  );
}
