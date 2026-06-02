'use client';

import { useParams } from 'next/navigation';

import { AdminShell } from '@/app/components/layout/AdminShell';

import { AiCourseDraftEditorContent } from './AiCourseDraftEditorContent';

export default function AiCourseDraftEditorPage() {
  const params = useParams<{ draftId: string }>();

  return (
    <AdminShell>
      <AiCourseDraftEditorContent draftId={params.draftId} />
    </AdminShell>
  );
}
