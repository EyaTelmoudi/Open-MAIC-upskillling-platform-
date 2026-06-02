'use client';

import { AdminShell } from '@/app/components/layout/AdminShell';

import { AiCourseDraftsContent } from './AiCourseDraftsContent';

export default function AiCourseDraftsPage() {
  return (
    <AdminShell>
      <AiCourseDraftsContent />
    </AdminShell>
  );
}
