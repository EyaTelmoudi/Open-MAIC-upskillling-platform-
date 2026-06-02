'use client';

import { useParams } from 'next/navigation';

import { AdminShell } from '@/app/components/layout/AdminShell';

import { AiCourseReviewContent } from './AiCourseReviewContent';

export default function AiCourseReviewPage() {
  const params = useParams<{ draftId: string }>();

  return (
    <AdminShell>
      <AiCourseReviewContent draftId={params.draftId} />
    </AdminShell>
  );
}
