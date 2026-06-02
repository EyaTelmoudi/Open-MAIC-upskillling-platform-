"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { AppShell } from "@/app/components/layout/AppShell";
import { Card } from "@/app/components/ui/Card";
import { Badge } from "@/app/components/ui/Badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/Tabs";
import { Button } from "@/app/components/ui/Button";
import { getCourseBookmarks, getLessonBookmarks, deleteBookmark, api } from "@/app/lib/api";
import { resolveStoredMediaUrl } from "@/app/lib/media";
import {
  BookOpen,
  Clock,
  Star,
  Trash2,
  Loader2,
  GraduationCap,
  FileText,
  PlayCircle,
} from "lucide-react";

interface CourseBookmark {
  id: string;
  course_id: string | null;
  lesson_id: string | null;
  created_at: string;
}

interface LessonBookmark {
  id: string;
  lesson_id: string | null;
  course_id: string | null;
  created_at: string;
}

interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  category: string;
  difficulty: string;
  duration: number;
  rating: number | null;
}

interface Lesson {
  id: string;
  title: string;
  content_type: string;
  duration: number;
  module_title: string;
  course_id: string;
  course_title: string;
}

const difficultyColors: Record<string, { bg: string; text: string }> = {
  Beginner: { bg: "bg-green-500/10", text: "text-green-500" },
  Intermediate: { bg: "bg-amber-500/10", text: "text-amber-500" },
  Advanced: { bg: "bg-red-500/10", text: "text-red-500" },
};

export default function BookmarksPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [courseBookmarks, setCourseBookmarks] = useState<CourseBookmark[]>([]);
  const [lessonBookmarks, setLessonBookmarks] = useState<LessonBookmark[]>([]);
  const [courses, setCourses] = useState<Record<string, Course>>({});
  const [lessons, setLessons] = useState<Record<string, Lesson>>({});
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadBookmarks();
  }, []);

  async function loadBookmarks() {
    try {
      const [coursesData, lessonsData] = await Promise.all([
        getCourseBookmarks().catch(() => []),
        getLessonBookmarks().catch(() => []),
      ]);
      setCourseBookmarks(coursesData);
      setLessonBookmarks(lessonsData);

      // Load course details
      const courseIds = coursesData.map((b: any) => b.course_id).filter(Boolean);
      if (courseIds.length > 0) {
        const coursesResponse = await api.get<{ items: Course[] }>(
          `/api/v1/learning/courses/?ids=${courseIds.join(",")}`
        );
        const coursesMap: Record<string, Course> = {};
        coursesResponse.items.forEach((c) => {
          coursesMap[c.id] = c;
        });
        setCourses(coursesMap);
      }

      // For lessons, we need to fetch course to get lessons
      // This is more complex - we'll handle it when needed
    } catch (err) {
      console.error("Failed to load bookmarks:", err);
    } finally {
      setIsLoading(false);
    }
  }

  async function handleRemoveBookmark(id: string) {
    setDeletingId(id);
    try {
      await deleteBookmark(id);
      setCourseBookmarks((prev) => prev.filter((b) => b.id !== id));
      setLessonBookmarks((prev) => prev.filter((b) => b.id !== id));
    } catch (err: any) {
      console.error("Failed to remove bookmark:", err);
      alert(err?.message || "Failed to remove bookmark. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AppShell>
    );
  }

  const hasBookmarks = courseBookmarks.length === 0 && lessonBookmarks.length === 0;

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold text-text-primary">My Bookmarks</h1>
          <p className="text-text-secondary">
            Quickly access your saved courses and lessons
          </p>
        </div>

        {hasBookmarks ? (
          <Card className="p-12 text-center">
            <BookOpen className="h-16 w-16 text-text-secondary mx-auto mb-4" />
            <h2 className="text-xl font-semibold text-text-primary mb-2">
              No bookmarks yet
            </h2>
            <p className="text-text-secondary mb-6">
              Bookmark courses and lessons to find them quickly later
            </p>
            <Link href={"/courses"}>
              <Button>Browse Courses</Button>
            </Link>
          </Card>
        ) : (
          <Tabs defaultValue="courses" className="space-y-4">
            <TabsList>
              <TabsTrigger value="courses">
                Courses ({courseBookmarks.length})
              </TabsTrigger>
              <TabsTrigger value="lessons">
                Lessons ({lessonBookmarks.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="courses" className="space-y-4">
              {courseBookmarks.map((bookmark: any) => {
                const course = courses[bookmark.course_id];
                if (!course) return null;
                return (
                  <Card key={bookmark.id} className="p-4">
                    <div className="flex gap-4">
                      <Link
                        href={`/courses/${course.id}`}
                        className="w-40 h-24 flex-shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center"
                      >
                        {course.thumbnail ? (
                          <img
                            src={resolveStoredMediaUrl(course.thumbnail)}
                            alt={course.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <GraduationCap className="h-10 w-10 text-primary/30" />
                        )}
                      </Link>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div>
                            <Link
                              href={`/courses/${course.id}`}
                              className="font-semibold text-text-primary hover:text-primary"
                            >
                              {course.title}
                            </Link>
                            <p className="text-sm text-text-secondary line-clamp-1 mt-1">
                              {course.description}
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemoveBookmark(bookmark.id)}
                            disabled={deletingId === bookmark.id}
                            className="text-text-secondary hover:text-destructive"
                          >
                            {deletingId === bookmark.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Trash2 className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-sm text-text-secondary">
                          <Badge
                            className={`${
                              difficultyColors[course.difficulty]?.bg || "bg-gray-500/10"
                            } ${
                              difficultyColors[course.difficulty]?.text || "text-gray-500"
                            }`}
                          >
                            {course.difficulty}
                          </Badge>
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {Math.round(course.duration / 60)}h
                          </span>
                          {course.rating && (
                            <span className="flex items-center gap-1 text-amber-500">
                              <Star className="h-3 w-3 fill-current" />
                              {course.rating}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </TabsContent>

            <TabsContent value="lessons" className="space-y-4">
              {lessonBookmarks.length === 0 ? (
                <Card className="p-8 text-center">
                  <FileText className="h-12 w-12 text-text-secondary mx-auto mb-3" />
                  <p className="text-text-secondary">
                    No bookmarked lessons yet
                  </p>
                </Card>
              ) : (
                <Card className="p-4">
                  <p className="text-text-secondary text-sm">
                    Lesson bookmarking coming soon. Browse courses and bookmark
                    lessons to see them here.
                  </p>
                </Card>
              )}
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppShell>
  );
}
