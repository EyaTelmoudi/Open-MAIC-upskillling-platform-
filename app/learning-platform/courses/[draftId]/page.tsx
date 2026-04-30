import { notFound } from 'next/navigation';
import { readFinalizedCourse } from '@/lib/learing-expert-agent/draft-store';
import { PlatformCourseViewer } from './platform-course-viewer';

export default async function LearningPlatformCoursePage({
  params,
}: {
  params: Promise<{ draftId: string }>;
}) {
  const { draftId } = await params;
  const course = await readFinalizedCourse(draftId);

  if (!course) {
    notFound();
  }

  return <PlatformCourseViewer course={course} />;
}
