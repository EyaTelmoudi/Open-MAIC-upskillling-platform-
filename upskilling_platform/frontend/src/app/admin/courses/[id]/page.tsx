"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Clock3,
  Edit,
  FileText,
  FileVideo,
  Layers3,
  Loader2,
  PlayCircle,
  Save,
  Star,
  Upload,
  X,
} from "lucide-react";

import { AdminShell } from "@/app/components/layout/AdminShell";
import { Button } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Input";
import {
  getCourseById,
  updateCourseById,
  updateCourseModule,
  updateModuleLesson,
  uploadCourseContent,
  type ContentUploadResponse,
  type CourseDetailResponse,
} from "@/app/lib/api";
import { routes } from "@/app/lib/routes";

type ResourceLink = {
  title: string;
  url: string;
};

type EditableLesson = {
  id: string;
  title: string;
  summary: string;
  video_url: string | null;
  content_type: string;
  duration: number;
  order: number;
  resources: ResourceLink[];
  newVideoFile: File | null;
  newFiles: File[];
};

type EditableModule = {
  id: string;
  title: string;
  description: string;
  order: number;
  lessons: EditableLesson[];
};

type EditableCourse = {
  id: string;
  title: string;
  description: string;
  category: string;
  difficulty: string;
  duration: number;
  xp_reward: number;
  is_published: boolean;
  modules: EditableModule[];
};

const difficultyStyles: Record<string, string> = {
  Beginner: "bg-green-500/10 text-green-600",
  Intermediate: "bg-amber-500/10 text-amber-600",
  Advanced: "bg-red-500/10 text-red-600",
};

const categoryOptions = [
  "Technology",
  "Business",
  "Design",
  "Marketing",
  "Finance",
  "HR",
  "Leadership",
  "Programming",
];

const difficultyOptions = ["Beginner", "Intermediate", "Advanced"];

function stripHtml(value?: string | null) {
  if (!value) {
    return "";
  }
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildLessonContentFromResources(
  summary: string,
  resources: ResourceLink[]
): string {
  const parts: string[] = [];

  if (summary.trim()) {
    parts.push(`<p>${escapeHtml(summary.trim())}</p>`);
  }

  if (resources.length > 0) {
    const links = resources
      .map(
        (resource) =>
          `<li><a href="${resource.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(resource.title)}</a></li>`
      )
      .join("");
    parts.push(`<h3>Learning Materials</h3><ul>${links}</ul>`);
  }

  return parts.join("");
}

function buildStoredVideoReference(upload: ContentUploadResponse | null): string | null {
  if (!upload) {
    return null;
  }
  return `minio://${upload.bucket}/${upload.object_name}`;
}

function extractLessonEditorData(content: string | null | undefined): {
  summary: string;
  resources: ResourceLink[];
} {
  if (!content || typeof window === "undefined") {
    return { summary: content || "", resources: [] };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(content, "text/html");
  const resources = Array.from(doc.querySelectorAll("a[href]")).map((link) => ({
    title: link.textContent?.trim() || "Resource",
    url: link.getAttribute("href") || "#",
  }));

  doc.querySelectorAll("ul, ol, h3, h4, a").forEach((node) => node.remove());
  const summary = (doc.body.textContent || "").replace(/\s+/g, " ").trim();

  return { summary, resources };
}

function SelectedFilesList({
  files,
  emptyLabel,
}: {
  files: File[];
  emptyLabel: string;
}) {
  if (files.length === 0) {
    return <p className="mt-2 text-xs text-text-secondary">{emptyLabel}</p>;
  }

  return (
    <ul className="mt-2 space-y-1 text-xs text-text-secondary">
      {files.map((file) => (
        <li key={`${file.name}-${file.size}`}>{file.name}</li>
      ))}
    </ul>
  );
}

export default function AdminCourseDetailPage() {
  const params = useParams<{ id: string }>();
  const courseId = Array.isArray(params?.id) ? params.id[0] : params?.id;

  const [course, setCourse] = useState<CourseDetailResponse | null>(null);
  const [editingCourse, setEditingCourse] = useState<EditableCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadCourse() {
    if (!courseId) {
      setError("Missing course id.");
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const detail = await getCourseById(courseId);
      setCourse(detail);
      setEditingCourse({
        id: detail.id,
        title: detail.title,
        description: detail.description || "",
        category: detail.category,
        difficulty: detail.difficulty,
        duration: detail.duration,
        xp_reward: detail.xp_reward,
        is_published: detail.is_published,
        modules: detail.modules.map((module) => ({
          id: module.id,
          title: module.title,
          description: module.description || "",
          order: module.order,
          lessons: module.lessons.map((lesson) => {
            const parsed = extractLessonEditorData(lesson.content);
            return {
              id: lesson.id,
              title: lesson.title,
              summary: parsed.summary,
              video_url: lesson.video_url || null,
              content_type: lesson.content_type,
              duration: lesson.duration,
              order: lesson.order,
              resources: parsed.resources,
              newVideoFile: null,
              newFiles: [],
            };
          }),
        })),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load course details.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCourse();
  }, [courseId]);

  const updateEditingCourse = (changes: Partial<EditableCourse>) => {
    setEditingCourse((current) => (current ? { ...current, ...changes } : current));
  };

  const updateEditingModule = (moduleId: string, changes: Partial<EditableModule>) => {
    setEditingCourse((current) =>
      current
        ? {
            ...current,
            modules: current.modules.map((module) =>
              module.id === moduleId ? { ...module, ...changes } : module
            ),
          }
        : current
    );
  };

  const updateEditingLesson = (
    moduleId: string,
    lessonId: string,
    changes: Partial<EditableLesson>
  ) => {
    setEditingCourse((current) =>
      current
        ? {
            ...current,
            modules: current.modules.map((module) =>
              module.id === moduleId
                ? {
                    ...module,
                    lessons: module.lessons.map((lesson) =>
                      lesson.id === lessonId ? { ...lesson, ...changes } : lesson
                    ),
                  }
                : module
            ),
          }
        : current
    );
  };

  async function handleSave() {
    if (!editingCourse) {
      return;
    }

    setIsSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateCourseById(editingCourse.id, {
        title: editingCourse.title,
        description: editingCourse.description || null,
        category: editingCourse.category,
        difficulty: editingCourse.difficulty,
        duration: editingCourse.duration,
        xp_reward: editingCourse.xp_reward,
      });

      for (const module of editingCourse.modules) {
        await updateCourseModule(module.id, {
          title: module.title,
          description: module.description || null,
          order: module.order,
        });

        for (const lesson of module.lessons) {
          let videoUrl = lesson.video_url;
          const resources = [...lesson.resources];

          if (lesson.newVideoFile) {
            const upload = await uploadCourseContent(lesson.newVideoFile, {
              courseId: editingCourse.id,
              moduleId: module.id,
            });
            videoUrl = buildStoredVideoReference(upload);
            resources.push({ title: upload.filename, url: upload.url });
          }

          for (const file of lesson.newFiles) {
            const upload = await uploadCourseContent(file, {
              courseId: editingCourse.id,
              moduleId: module.id,
            });
            resources.push({ title: upload.filename, url: upload.url });
          }

          await updateModuleLesson(lesson.id, {
            title: lesson.title,
            content: buildLessonContentFromResources(lesson.summary, resources),
            video_url: videoUrl,
            content_type: videoUrl ? "video" : "resource",
            duration: lesson.duration,
            order: lesson.order,
          });
        }
      }

      await loadCourse();
      setIsEditMode(false);
      setSuccess("Course updated successfully.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update course.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Link
              href={routes.adminCourses}
              className="mb-3 inline-flex items-center gap-2 text-sm text-text-secondary transition-colors hover:text-text-primary"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to courses
            </Link>
            <h1 className="text-2xl font-bold text-text-primary">Course Details</h1>
            <p className="mt-1 text-sm text-text-secondary">
              Review and modify the full structure, modules, and lessons of the selected course.
            </p>
          </div>

          {!loading && course && (
            <div className="flex flex-wrap gap-3">
              {isEditMode ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditMode(false);
                      setSuccess(null);
                      setError(null);
                      loadCourse();
                    }}
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                  <Button onClick={handleSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </>
              ) : (
                <Button onClick={() => setIsEditMode(true)}>
                  <Edit className="h-4 w-4" />
                  Edit Course
                </Button>
              )}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-border bg-card">
            <div className="inline-flex items-center gap-2 text-text-secondary">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading course details...
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        ) : course && editingCourse ? (
          <>
            {success && (
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-300">
                {success}
              </div>
            )}

            <div className="rounded-3xl border border-border bg-card p-6 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-4 flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary">
                      <BookOpen className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {isEditMode ? (
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-xs font-medium text-text-secondary">Title</label>
                            <Input
                              value={editingCourse.title}
                              onChange={(e) => updateEditingCourse({ title: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-xs font-medium text-text-secondary">Description</label>
                            <textarea
                              value={editingCourse.description}
                              onChange={(e) => updateEditingCourse({ description: e.target.value })}
                              rows={3}
                              className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                            />
                          </div>
                        </div>
                      ) : (
                        <>
                          <h2 className="text-xl font-semibold text-text-primary">{course.title}</h2>
                          <p className="text-sm text-text-secondary">
                            {course.description || "No description provided."}
                          </p>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditMode ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-text-secondary">Category</label>
                        <select
                          value={editingCourse.category}
                          onChange={(e) => updateEditingCourse({ category: e.target.value })}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                        >
                          {categoryOptions.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-text-secondary">Difficulty</label>
                        <select
                          value={editingCourse.difficulty}
                          onChange={(e) => updateEditingCourse({ difficulty: e.target.value })}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                        >
                          {difficultyOptions.map((difficulty) => (
                            <option key={difficulty} value={difficulty}>
                              {difficulty}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-text-secondary">Duration (minutes)</label>
                        <Input
                          type="number"
                          value={editingCourse.duration}
                          onChange={(e) =>
                            updateEditingCourse({ duration: parseInt(e.target.value, 10) || 0 })
                          }
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-text-secondary">XP Reward</label>
                        <Input
                          type="number"
                          value={editingCourse.xp_reward}
                          onChange={(e) =>
                            updateEditingCourse({ xp_reward: parseInt(e.target.value, 10) || 0 })
                          }
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                        {course.category}
                      </span>
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium ${
                          difficultyStyles[course.difficulty] || "bg-muted text-text-secondary"
                        }`}
                      >
                        {course.difficulty}
                      </span>
                      <span className="rounded-full bg-muted px-3 py-1 text-xs font-medium text-text-secondary">
                        {course.is_published ? "Published" : "Draft"}
                      </span>
                    </div>
                  )}
                </div>

                <div className="grid min-w-[260px] gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-text-secondary">
                      <Clock3 className="h-4 w-4" />
                      Duration
                    </div>
                    <p className="mt-2 text-lg font-semibold text-text-primary">
                      {Math.round((isEditMode ? editingCourse.duration : course.duration) / 60)}h
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-text-secondary">
                      <Star className="h-4 w-4" />
                      XP Reward
                    </div>
                    <p className="mt-2 text-lg font-semibold text-primary">
                      +{isEditMode ? editingCourse.xp_reward : course.xp_reward}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-text-secondary">
                      <Layers3 className="h-4 w-4" />
                      Modules
                    </div>
                    <p className="mt-2 text-lg font-semibold text-text-primary">
                      {editingCourse.modules.length}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-border bg-background p-4">
                    <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-text-secondary">
                      <PlayCircle className="h-4 w-4" />
                      Lessons
                    </div>
                    <p className="mt-2 text-lg font-semibold text-text-primary">
                      {editingCourse.modules.reduce((total, module) => total + module.lessons.length, 0)}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {(isEditMode ? editingCourse.modules : course.modules).map((module, moduleIndex) => (
                <div
                  key={module.id}
                  className="rounded-3xl border border-border bg-card p-6 shadow-sm"
                >
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-secondary">
                      Module {moduleIndex + 1}
                    </p>
                    {isEditMode ? (
                      <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-text-secondary">Module Title</label>
                          <Input
                            value={(module as EditableModule).title}
                            onChange={(e) =>
                              updateEditingModule(module.id, { title: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-text-secondary">Order</label>
                          <Input
                            type="number"
                            value={(module as EditableModule).order}
                            onChange={(e) =>
                              updateEditingModule(module.id, {
                                order: parseInt(e.target.value, 10) || 1,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-xs font-medium text-text-secondary">Module Description</label>
                          <textarea
                            value={(module as EditableModule).description}
                            onChange={(e) =>
                              updateEditingModule(module.id, { description: e.target.value })
                            }
                            rows={3}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className="mt-2 text-lg font-semibold text-text-primary">
                          {module.title}
                        </h3>
                        <p className="mt-1 text-sm text-text-secondary">
                          {module.description || "No module description provided."}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="space-y-3">
                    {module.lessons.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-border bg-background px-4 py-5 text-sm text-text-secondary">
                        No lessons defined for this module yet.
                      </div>
                    ) : (
                      module.lessons.map((lesson, lessonIndex) => (
                        <div
                          key={lesson.id}
                          className="rounded-2xl border border-border bg-background p-4"
                        >
                          {isEditMode ? (
                            <div className="space-y-4">
                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                  <label className="text-xs font-medium text-text-secondary">Lesson Title</label>
                                  <Input
                                    value={(lesson as EditableLesson).title}
                                    onChange={(e) =>
                                      updateEditingLesson(module.id, lesson.id, {
                                        title: e.target.value,
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-medium text-text-secondary">Duration (minutes)</label>
                                  <Input
                                    type="number"
                                    value={(lesson as EditableLesson).duration}
                                    onChange={(e) =>
                                      updateEditingLesson(module.id, lesson.id, {
                                        duration: parseInt(e.target.value, 10) || 0,
                                      })
                                    }
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                  <label className="text-xs font-medium text-text-secondary">Lesson Summary</label>
                                  <textarea
                                    value={(lesson as EditableLesson).summary}
                                    onChange={(e) =>
                                      updateEditingLesson(module.id, lesson.id, {
                                        summary: e.target.value,
                                      })
                                    }
                                    rows={3}
                                    className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary"
                                  />
                                </div>
                              </div>

                              {((lesson as EditableLesson).resources.length > 0 ||
                                (lesson as EditableLesson).video_url) && (
                                <div className="rounded-xl border border-border bg-card p-3">
                                  <p className="text-xs font-medium text-text-primary">
                                    Current Attached Content
                                  </p>
                                  {(lesson as EditableLesson).video_url && (
                                    <p className="mt-2 text-xs text-text-secondary">
                                      Main video already attached
                                    </p>
                                  )}
                                  {(lesson as EditableLesson).resources.length > 0 && (
                                    <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                                      {(lesson as EditableLesson).resources.map((resource) => (
                                        <li key={`${lesson.id}-${resource.url}`}>{resource.title}</li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}

                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-2xl border border-dashed border-border bg-card p-4">
                                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-text-secondary">
                                    <FileVideo className="h-4 w-4" />
                                    Replace / Add Main Video
                                  </div>
                                  <label
                                    htmlFor={`lesson-${lesson.id}-video`}
                                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                                  >
                                    <Upload className="h-4 w-4" />
                                    Choose Video
                                  </label>
                                  <input
                                    id={`lesson-${lesson.id}-video`}
                                    type="file"
                                    accept="video/mp4,video/webm,video/ogg"
                                    className="sr-only"
                                    onChange={(e) =>
                                      updateEditingLesson(module.id, lesson.id, {
                                        newVideoFile: e.target.files?.[0] || null,
                                      })
                                    }
                                  />
                                  <SelectedFilesList
                                    files={(lesson as EditableLesson).newVideoFile ? [(lesson as EditableLesson).newVideoFile as File] : []}
                                    emptyLabel="No new video selected"
                                  />
                                </div>

                                <div className="rounded-2xl border border-dashed border-border bg-card p-4">
                                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-text-secondary">
                                    <Upload className="h-4 w-4" />
                                    Add Support Files
                                  </div>
                                  <label
                                    htmlFor={`lesson-${lesson.id}-files`}
                                    className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary/90"
                                  >
                                    <Upload className="h-4 w-4" />
                                    Choose Files
                                  </label>
                                  <input
                                    id={`lesson-${lesson.id}-files`}
                                    type="file"
                                    accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.ppt,.pptx,.doc,.docx,.txt,.csv,.xls,.xlsx,.zip"
                                    multiple
                                    className="sr-only"
                                    onChange={(e) =>
                                      updateEditingLesson(module.id, lesson.id, {
                                        newFiles: Array.from(e.target.files || []),
                                      })
                                    }
                                  />
                                  <SelectedFilesList
                                    files={(lesson as EditableLesson).newFiles}
                                    emptyLabel="No new support files selected"
                                  />
                                </div>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex flex-wrap items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-text-primary">
                                    Lesson {lessonIndex + 1}: {lesson.title}
                                  </p>
                                  <p className="mt-1 text-xs text-text-secondary">
                                    {lesson.duration} min
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-text-secondary">
                                    {lesson.content_type}
                                  </span>
                                  {lesson.video_url && (
                                    <span className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-primary">
                                      Main video attached
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="mt-3 rounded-xl border border-border bg-card px-4 py-3">
                                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-text-secondary">
                                  <FileText className="h-4 w-4" />
                                  Lesson Content
                                </div>
                                <p className="mt-2 text-sm leading-6 text-text-secondary">
                                  {stripHtml(lesson.content) || "No lesson summary or resources text available."}
                                </p>
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}
