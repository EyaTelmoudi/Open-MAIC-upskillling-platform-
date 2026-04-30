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
import { api, getCourseBookmarks } from "@/app/lib/api";
import {
  Search,
  Filter,
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

export default function CoursesPage() {
  const router = useRouter();
  const [courses, setCourses] = useState<Course[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState("All");
  const [category, setCategory] = useState("All");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [showFilters, setShowFilters] = useState(true);
  const [previewingCourse, setPreviewingCourse] = useState<string | null>(null);
  const [bookmarkedCourses, setBookmarkedCourses] = useState<Set<string>>(new Set());

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
    async function loadData() {
      try {
        const [coursesData, bookmarksData] = await Promise.all([
          api.get<{ items: Course[] }>("/api/v1/learning/courses/?is_published=true&page_size=100"),
          getCourseBookmarks().catch(() => []),
        ]);
        setCourses(coursesData.items);
        const bookmarkedIds = new Set(
          bookmarksData
            .filter((b: any) => b.course_id)
            .map((b: any) => b.course_id)
        );
        setBookmarkedCourses(bookmarkedIds);
      } catch (err) {
        console.error("Failed to load courses:", err);
      } finally {
        setIsLoading(false);
      }
    }
    loadData();
  }, []);

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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <BookOpen className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-text-primary">Course Catalog</h1>
              <p className="text-sm text-text-secondary">
                Browse and enroll in available courses
              </p>
            </div>
          </div>
        </div>

        {/* Search and Filters */}
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-secondary" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search courses..."
                className="pl-10"
              />
            </div>
            <Button
              variant="outline"
              onClick={() => setShowFilters(!showFilters)}
              className={showFilters ? "bg-primary/10" : ""}
            >
              <Filter className="h-4 w-4 mr-2" />
              Filters
            </Button>
            <div className="flex rounded-lg border border-border">
              <Button
                variant={viewMode === "grid" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("grid")}
              >
                <Grid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="sm"
                onClick={() => setViewMode("list")}
              >
                <List className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 flex flex-wrap gap-4">
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
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
                className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
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
                >
                  <X className="h-4 w-4 mr-1" />
                  Clear
                </Button>
              )}
            </div>
          )}
        </div>

        {/* Results count */}
        <div className="flex items-center justify-between">
          <p className="text-sm text-text-secondary">
            {isLoading ? "Loading..." : `${filteredCourses.length} course${filteredCourses.length !== 1 ? "s" : ""} found`}
          </p>
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
                          src={course.thumbnail}
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
                      <p className="text-xs text-text-secondary line-clamp-2 mb-3">
                        {course.description}
                      </p>

                      {/* Meta */}
                      <div className="flex items-center justify-between text-xs text-text-secondary">
                        <div className="flex items-center gap-3">
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {Math.round(course.duration / 60)}h
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
                            src={course.thumbnail}
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
                            {Math.round(course.duration / 60)}h
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
