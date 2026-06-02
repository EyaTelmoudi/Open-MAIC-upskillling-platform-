'use client';

import { AdminShell } from '@/app/components/layout/AdminShell';

import { AiCourseBuilderContent } from './AiCourseBuilderContent';

export default function AiCourseBuilderPage() {
  return (
    <AdminShell>
      <AiCourseBuilderContent />
    </AdminShell>
  );
}
