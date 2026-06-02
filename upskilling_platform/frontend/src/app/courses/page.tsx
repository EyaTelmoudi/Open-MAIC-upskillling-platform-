"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AppShell } from "@/app/components/layout/AppShell";
import { Button } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Input";
import { Badge } from "@/app/components/ui/Badge";
import { Card } from "@/app/components/ui/Card";
import { BookmarkButton } from "@/app/components/ui/BookmarkButton";
import { api, getCourseBookmarks, getEnrollments } from "@/app/lib/api";
import { useAuth } from "@/app/context/AuthContext";
import { resolveStoredMediaUrl } from "@/app/lib/media";
import {
  Search,
  BookOpen,
  Clock,
  Star,
  Users,
  ChevronDown,
  Grid,
  List,
  X,
  GraduationCap,
  PlayCircle,
  Eye,
  Loader2,
  CheckCircle2,
} from "lucide-react";

interface Course {
  id: string;
  title: string;
  description: string;
  thumbnail: string | null;
  category: string;
  difficulty: string;
  duration: number;
  xp_reward: number;
  rating: number | null;
  is_published: boolean;
}

const difficulties = ["All", "Beginner", "Intermediate", "Advanced"];
const categories = [
  "All",
  "Technology",
  "Business",
  "Design",
  "Marketing",
  "Finance",
  "HR",
  "Leadership",
  "Programming",
];

const difficultyColors: Record<string, { bg: string; text: string }> = {
  Beginner: { bg: "bg-green-500/10", text: "text-green-500" },
  Intermediate: { bg: "bg-amber-500/10", text: "text-amber-500" },
  Advanced: { bg: "bg-red-500/10", text: "text-red-500" },
};

function formatCourseDuration(totalMinutes: number) {
  const roundedMinutes = Math.max(0, Math.ceil(totalMinutes || 0));

  if (roundedMinutes <= 0) {
    return "0 min";
  }

  if (roundedMinutes < 60) {
    return `${roundedMinutes} min`;
  }

  const hours = Math.floor(roundedMinutes / 60);
  const minutes = roundedMinutes % 60;
  return minutes > 0 ? `${hours}h ${minutes}min` : `${hours}h`;
}

export default function CoursesPage() {
  const router = useRouter();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("All");
  const [category, setCategory] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [previewingCourse, setPreviewingCourse] = useState<string | null>(null);
  const [bookmarkedCourses, setBookmarkedCourses] = useState<Set<string>>(new Set());
  const [completedCourses, setCompletedCourses] = useState<Set<string>>(new Set());

  const handlePreview = async (courseId: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPreviewingCourse(courseId);
    try {
      const result = await api.post<{ preview_url: string }>(
        `/api/v1/learning/courses/${courseId}/preview-token`
      );
      window.open(result.preview_url, "_blank");
    } catch (err) {
      console.error("Failed to generate preview:", err);
      alert("Failed to generate preview");
    } finally {
      setPreviewingCourse(null);
    }
  };

  useEffect(() => {
    if (isAuthLoading) {
      return;
    }

    if (!isAuthenticated) {
      setCourses([]);
      setBookmarkedCourses(new Set());
      setCompletedCourses(new Set());
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    async function loadData() {
      try {
        const [coursesData, bookmarksData, enrollmentsData] = await Promise.all([
          api.get<{ items: Course[] }>("/api/v1/learning/courses/?is_published=true&page_size=100"),
          getCourseBookmarks().catch(() => []),
          user ? getEnrollments(user.id).catch(() => []) : Promise.resolve([]),
        ]);
        if (cancelled) {
          return;
        }
        setCourses(coursesData.items);
        const bookmarkedIds = new Set(
          bookmarksData
            .filter((b: any) => b.course_id)
            .map((b: any) => b.course_id)
        );
        setBookmarkedCourses(bookmarkedIds);
        const completedIds = new Set(
          enrollmentsData
            .filter((enrollment: any) => enrollment.status === "completed")
            .map((enrollment: any) => enrollment.course_id)
        );
        setCompletedCourses(completedIds);
      } catch (err) {
        if (cancelled) {
          return;
        }

        if (err instanceof Error && err.message === "Not authenticated") {
          return;
        }

        console.error("Failed to load courses:", err);
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    setIsLoading(true);
    loadData();
    return () => {
      cancelled = true;
    };
  }, [isAuthenticated, isAuthLoading, user]);

  const filteredCourses = courses.filter((c) => {
    const matchesSearch =
      !search ||
      c.title.toLowerCase().includes(search.toLowerCase()) ||
      c.description.toLowerCase().includes(search.toLowerCase());
    const matchesDifficulty = difficulty === "All" || c.difficulty === difficulty;
    const matchesCategory = category === "All" || c.category === category;
    return matchesSearch && matchesDifficulty && matchesCategory;
  });

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Header */}
        <section className="overflow-hidden rounded-3xl border border-emerald-300/55 bg-[radial-gradient(circle_at_12%_18%,_rgba(52,211,153,0.46),_transparent_30%),radial-gradient(circle_at_76%_14%,_rgba(14,165,233,0.42),_transparent_28%),radial-gradient(circle_at_88%_82%,_rgba(242,165,27,0.24),_transparent_24%),linear-gradient(135deg,_#063B35_0%,_#075E63_42%,_#0B315F_72%,_#101827_100%)] p-5 text-white shadow-[0_30px_80px_rgba(6,78,59,0.36)] sm:p-6 lg:p-8">
          <div className="max-w-3xl">
            <h1 className="text-3xl font-semibold tracking-tight text-white drop-shadow-sm sm:text-4xl">
              Course Catalog
            </h1>
            <p className="mt-4 text-sm leading-7 text-emerald-50 sm:text-base">
              Browse and enroll in available courses.
            </p>
          </div>
        </section>

        {/* Search and Filters */}
        <div className="rounded-2xl border border-emerald-100 bg-white/85 px-3 py-3 shadow-[0_14px_34px_rgba(15,23,42,0.06)] backdrop-blur">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search courses..."
                className="h-10 border-slate-200 bg-white pl-10"
              />
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition-colors focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              >
                {difficulties.map((d) => (
                  <option key={d} value={d}>
                    {d === "All" ? "All Levels" : d}
                  </option>
                ))}
              </select>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-medium text-slate-700 shadow-sm outline-none transition-colors focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
              >
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c === "All" ? "All Categories" : c}
                  </option>
                ))}
              </select>
              {(difficulty !== "All" || category !== "All" || search) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDifficulty("All");
                    setCategory("All");
                    setSearch("");
                  }}
                  className="h-10 px-3 text-slate-600 hover:bg-slate-100"
                >
                  <X className="mr-1 h-4 w-4" />
                  Clear
                </Button>
              )}
            </div>
            <div className="flex h-10 shrink-0 rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className="h-8 w-8 p-0"
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
                className="h-8 w-8 p-0"
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>

        {/* Course Grid */}
        {isLoading ? (
          <div className="flex h-40 items-center justify-center">
            <p className="text-text-secondary">Loading courses...</p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredCourses.map((course) => (
              <div key={course.id} className="relative group">
                <Link href={`/courses/${course.id}`}>
                  <Card className="h-full cursor-pointer transition-all hover:border-primary/50 hover:shadow-lg">
                    {/* Thumbnail */}
                    <div className="relative h-40 rounded-t-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center overflow-hidden">
                      {course.thumbnail ? (
                        <img
                          src={resolveStoredMediaUrl(course.thumbnail)}
                          alt={course.title}
                          className="h-full w-full object-cover rounded-t-xl"
                        />
                      ) : (
                        <GraduationCap className="h-16 w-16 text-primary/30" />
                      )}
                      <Badge
                        className={`absolute top-3 left-3 ${
                          difficultyColors[course.difficulty]?.bg || "bg-gray-500/10"
                        } ${
                          difficultyColors[course.difficulty]?.text || "text-gray-500"
                        }`}
                      >
                        {course.difficulty}
                      </Badge>
                      {completedCourses.has(course.id) ? (
                        <div className="absolute left-3 top-12 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-white/95 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 shadow-sm">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Finished
                        </div>
                      ) : null}
                      {/* Bookmark Button */}
                      <div className="absolute top-3 right-3">
                        <BookmarkButton
                          courseId={course.id}
                          initialBookmarked={bookmarkedCourses.has(course.id)}
                          size="sm"
                        />
                      </div>
                      {/* Preview Button */}
                      <button
                        onClick={(e) => handlePreview(course.id, e)}
                        disabled={previewingCourse === course.id}
                        className="absolute bottom-3 right-3 flex h-8 w-8 items-center justify-center rounded-full border border-white/70 bg-white/90 text-slate-700 opacity-0 shadow-sm transition-all group-hover:opacity-100 hover:scale-110 hover:bg-white disabled:opacity-50"
                        title="Preview course"
                      >
                        {previewingCourse === course.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>

                    {/* Content */}
                    <div className="p-4">
                      <p className="text-xs text-text-secondary mb-1">
                        {course.category}
                      </p>
                      <h3 className="font-semibold text-text-primary mb-2 line-clamp-2">
                        {course.title}
                      </h3>
                      {completedCourses.has(course.id) ? (
                        <div className="mb-2 inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Course finished
                        </div>
                      ) : null}
                      <p className="text-xs text-text-secondary line-clamp-2 mb-3">
                        {course.description}
                      </p>

                      {/* Meta */}
                      <div className="flex items-center justify-between text-xs text-text-secondary">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                              {formatCourseDuration(course.duration)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Star className="h-3 w-3 text-amber-500" />
                            {course.rating || "-"}
                          </span>
                        </div>
                        <span className="font-medium text-primary">
                          +{course.xp_reward} XP
                        </span>
                      </div>
                    </div>
                  </Card>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          /* Course List */
          <div className="space-y-3">
            {filteredCourses.map((course) => (
              <div key={course.id} className="relative group">
                <Link href={`/courses/${course.id}`}>
                  <Card className="cursor-pointer transition-all hover:border-primary/50 hover:shadow-lg">
                    <div className="flex gap-4 p-4">
                      {/* Thumbnail */}
                      <div className="relative h-24 w-40 flex-shrink-0 rounded-lg bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center overflow-hidden">
                        {course.thumbnail ? (
                          <img
                            src={resolveStoredMediaUrl(course.thumbnail)}
                            alt={course.title}
                            className="h-full w-full object-cover rounded-lg"
                          />
                        ) : (
                          <GraduationCap className="h-10 w-10 text-primary/30" />
                        )}
                        {/* Bookmark Button */}
                        <div className="absolute top-2 right-2">
                          <BookmarkButton
                            courseId={course.id}
                            initialBookmarked={bookmarkedCourses.has(course.id)}
                            size="sm"
                          />
                        </div>
                        {/* Preview Button */}
                        <button
                          onClick={(e) => handlePreview(course.id, e)}
                          disabled={previewingCourse === course.id}
                          className="absolute inset-0 flex items-center justify-center rounded-lg bg-white/85 backdrop-blur-sm text-slate-700 opacity-0 transition-all group-hover:opacity-100 hover:bg-white/90 disabled:opacity-50"
                          title="Preview course"
                        >
                          {previewingCourse === course.id ? (
                            <Loader2 className="h-6 w-6 animate-spin" />
                          ) : (
                            <Eye className="h-6 w-6" />
                          )}
                        </button>
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <Badge
                                variant="outline"
                                className={`text-xs ${
                                  difficultyColors[course.difficulty]?.bg || "bg-gray-500/10"
                                } ${
                                  difficultyColors[course.difficulty]?.text || "text-gray-500"
                                }`}
                              >
                                {course.difficulty}
                              </Badge>
                              <span className="text-xs text-text-secondary">
                                {course.category}
                              </span>
                              {completedCourses.has(course.id) ? (
                                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Finished
                                </span>
                              ) : null}
                            </div>
                            <h3 className="font-semibold text-text-primary">
                              {course.title}
                            </h3>
                            <p className="text-sm text-text-secondary line-clamp-1 mt-1">
                              {course.description}
                            </p>
                          </div>
                          <div className="text-right">
                            <div className="flex items-center gap-1 text-sm text-amber-500">
                              <Star className="h-4 w-4 fill-current" />
                              {course.rating || "-"}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 mt-3 text-xs text-text-secondary">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                              {formatCourseDuration(course.duration)}
                          </span>
                          <span className="font-medium text-primary">
                            +{course.xp_reward} XP
                          </span>
                        </div>
                      </div>
                    </div>
                  </Card>
                </Link>
              </div>
            ))}
          </div>
        )}

        {/* Empty state */}
        {filteredCourses.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <BookOpen className="h-12 w-12 text-text-secondary mb-4" />
            <h3 className="text-lg font-semibold text-text-primary mb-2">
              No courses found
            </h3>
            <p className="text-sm text-text-secondary mb-4">
              Try adjusting your filters or search query
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setDifficulty("All");
                setCategory("All");
                setSearch("");
              }}
            >
              Clear filters
            </Button>
          </div>
        )}
      </div>
    </AppShell>
  );
}
