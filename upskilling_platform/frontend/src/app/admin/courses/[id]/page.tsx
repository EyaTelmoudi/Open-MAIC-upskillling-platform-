"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle,
  Clock3,
  Edit,
  Eye,
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
import { CourseManagementNav } from "@/app/admin/courses/course-management-nav";
import { AiCourseModulePlayer } from "@/app/components/admin/AiCourseModulePlayer";
import { Button, buttonVariants } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Input";
import {
  getCourseById,
  LEARNING_URL,
  toggleCoursePublish,
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

const statusStyles: Record<"published" | "draft", string> = {
  published: "bg-green-500/10 text-green-600",
  draft: "bg-amber-500/10 text-amber-600",
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

type ParsedAiScenePreview = {
  type: string;
  title: string;
  teacherParoles: string[];
  visibleTexts: string[];
  interactiveDescription: string | null;
};

function stripHtml(value?: string | null) {
  if (!value) {
    return "";
  }
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function decodeHtmlEntities(value: string) {
  if (typeof window === "undefined") {
    return value
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'");
  }

  const textarea = document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function extractLooseMatches(source: string, pattern: RegExp) {
  return Array.from(source.matchAll(pattern))
    .map((match) => decodeHtmlEntities(stripHtml(match[1] || "")))
    .filter(Boolean);
}

function parseLooseAiScenePreview(content: string): ParsedAiScenePreview | null {
  const sceneType =
    content.match(/"content"\s*:\s*\{\s*"type"\s*:\s*"([^"]+)"/)?.[1] ||
    content.match(/"type"\s*:\s*"([^"]+)"/)?.[1] ||
    "lesson";

  const teacherParoles = extractLooseMatches(
    content,
    /"text"\s*:\s*"([\s\S]*?)"\s*,\s*"type"\s*:\s*"speech"/g
  );

  const visibleTexts = extractLooseMatches(
    content,
    /"content"\s*:\s*"([\s\S]*?)"\s*,\s*"defaultColor"/g
  );

  const interactiveDescriptionMatch = content.match(
    /"html"\s*:\s*"([\s\S]*?)"\s*,\s*"type"\s*:\s*"interactive"/
  );
  const interactiveDescription = interactiveDescriptionMatch
    ? decodeHtmlEntities(stripHtml(interactiveDescriptionMatch[1])).slice(0, 900)
    : null;

  if (teacherParoles.length === 0 && visibleTexts.length === 0 && !interactiveDescription && !content.includes('"questions"')) {
    return null;
  }

  return {
    type: sceneType,
    title: "",
    teacherParoles,
    visibleTexts,
    interactiveDescription,
  };
}

function parseAiScenePreview(content?: string | null): ParsedAiScenePreview | null {
  if (!content) {
    return null;
  }

  const trimmed = content.trim();
  if (!trimmed.startsWith("{")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed) as {
      type?: string;
      title?: string;
      actions?: Array<{ type?: string; text?: string; content?: string }>;
      content?: {
        type?: string;
        html?: string;
        canvas?: {
          elements?: Array<{ type?: string; content?: string }>;
        };
      };
    };

    const teacherParoles = (parsed.actions || [])
      .filter((action) => action.type === "speech")
      .map((action) => decodeHtmlEntities(stripHtml(action.text || action.content || "")))
      .filter(Boolean);

    const visibleTexts = ((parsed.content?.canvas?.elements || []) as Array<{
      type?: string;
      content?: string;
    }>)
      .filter((element) => element.type === "text")
      .map((element) => decodeHtmlEntities(stripHtml(element.content || "")))
      .filter(Boolean);

    const interactiveDescription =
      parsed.content?.type === "interactive" && parsed.content?.html
        ? decodeHtmlEntities(stripHtml(parsed.content.html)).slice(0, 900)
        : null;

    return {
      type: String(parsed.type || parsed.content?.type || "lesson"),
      title: decodeHtmlEntities(stripHtml(parsed.title || "")),
      teacherParoles,
      visibleTexts,
      interactiveDescription,
    };
  } catch {
    return parseLooseAiScenePreview(trimmed);
  }
}

function isAiSceneLesson(content?: string | null) {
  return parseAiScenePreview(content) !== null;
}

function moduleHasAiLessons(
  module: { lessons: Array<{ content?: string | null }> }
) {
  return module.lessons.some((lesson) => isAiSceneLesson(lesson.content));
}

function isAiGeneratedCourse(course: Pick<EditableCourse | CourseDetailResponse, "category" | "description">) {
  const category = String(course.category || "").toLowerCase();
  const description = String(course.description || "").toLowerCase();
  return category.includes("ai") || description.includes("ai-generated");
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

function getLessonPreviewData(content: string | null | undefined): {
  summary: string;
  resources: ResourceLink[];
} {
  if (!content) {
    return { summary: "", resources: [] };
  }

  if (typeof window === "undefined") {
    return {
      summary: stripHtml(content),
      resources: [],
    };
  }

  return extractLessonEditorData(content);
}

function dedupeResources(resources: ResourceLink[]) {
  const seen = new Set<string>();
  return resources.filter((resource) => {
    const key = `${resource.title}::${resource.url}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function encodeObjectPath(objectName: string) {
  return objectName
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function buildProxyMediaUrl(bucket: string, objectName: string) {
  return `${LEARNING_URL}/api/v1/content/media/${bucket}/${encodeObjectPath(objectName)}`;
}

function normalizeResourceUrl(url: string) {
  if (!url) {
    return url;
  }

  if (url.startsWith("minio://")) {
    const remainder = url.slice("minio://".length);
    const slashIndex = remainder.indexOf("/");
    if (slashIndex > 0) {
      const bucket = remainder.slice(0, slashIndex);
      const objectName = remainder.slice(slashIndex + 1);
      return buildProxyMediaUrl(bucket, objectName);
    }
    return url;
  }

  try {
    const parsed = new URL(url);
    const pathParts = parsed.pathname.split("/").filter(Boolean);
    const mediaMarker = ["api", "v1", "content", "media"];

    if (pathParts.length >= 6 && mediaMarker.every((part, index) => pathParts[index] === part)) {
      return url;
    }

    if (pathParts.length >= 2) {
      const [bucket, ...rest] = pathParts;
      if (
        ["course-videos", "course-pdfs", "course-slides", "course-images", "course-files"].includes(bucket)
      ) {
        return buildProxyMediaUrl(bucket, rest.join("/"));
      }
    }
  } catch {
    return url;
  }

  return url;
}

function getResourceExtension(resource: ResourceLink) {
  const raw = `${resource.title} ${resource.url}`.toLowerCase();
  const match = raw.match(/\.([a-z0-9]+)(?:$|[?#\s])/);
  return match?.[1] || "";
}

function getResourceKind(resource: ResourceLink) {
  const extension = getResourceExtension(resource);

  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(extension)) {
    return "image";
  }

  if (extension === "pdf") {
    return "pdf";
  }

  if (["mp4", "webm", "ogg", "mov"].includes(extension)) {
    return "video";
  }

  if (["mp3", "wav", "m4a"].includes(extension)) {
    return "audio";
  }

  return "file";
}

function getResourceFilename(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  try {
    const normalized = value.startsWith("minio://") ? value.slice("minio://".length) : value;
    const pathname = normalized.startsWith("http://") || normalized.startsWith("https://")
      ? new URL(normalized).pathname
      : normalized;
    const parts = pathname.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || "").toLowerCase();
  } catch {
    const parts = value.split("/").filter(Boolean);
    return decodeURIComponent(parts[parts.length - 1] || "").toLowerCase();
  }
}

function isDuplicateOfMainVideo(resource: ResourceLink, videoUrl: string | null) {
  if (!videoUrl) {
    return false;
  }

  const resourceFile = getResourceFilename(resource.url || resource.title);
  const resourceTitle = getResourceFilename(resource.title);
  const videoFile = getResourceFilename(videoUrl);

  return Boolean(
    videoFile &&
      (resourceFile === videoFile || resourceTitle === videoFile)
  );
}

function SelectedFilesList({
  files,
  emptyLabel,
}: {
  files: File[];
  emptyLabel: string;
}) {
  if (files.length === 0) {
    return <p className="mt-2 text-xs text-slate-500">{emptyLabel}</p>;
  }

  return (
    <ul className="mt-2 space-y-1 text-xs text-slate-500">
      {files.map((file) => (
        <li key={`${file.name}-${file.size}`}>{file.name}</li>
      ))}
    </ul>
  );
}

export default function AdminCourseDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const courseId = Array.isArray(params?.id) ? params.id[0] : params?.id;
  const startInEditMode = searchParams.get("edit") === "1";

  const [course, setCourse] = useState<CourseDetailResponse | null>(null);
  const [editingCourse, setEditingCourse] = useState<EditableCourse | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
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

  useEffect(() => {
    if (startInEditMode && course && editingCourse) {
      setIsEditMode(true);
    }
  }, [course, editingCourse, startInEditMode]);

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

  async function handleTogglePublish() {
    if (!course) {
      return;
    }

    setIsPublishing(true);
    setError(null);
    setSuccess(null);

    try {
      const updated = await toggleCoursePublish(course.id);

      if (updated.is_published) {
        const memoryResponse = await fetch("/api/course-memory-agent/published-course", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ courseId: course.id }),
        });
        const memoryData = (await memoryResponse.json().catch(() => null)) as
          | { success?: boolean; error?: string }
          | null;

        if (!memoryResponse.ok || !memoryData?.success) {
          throw new Error(
            memoryData?.error ||
              "Course published, but the Course Memory Agent failed to assemble the course payload."
          );
        }
      }

      setCourse((current) => (current ? { ...current, is_published: updated.is_published } : current));
      setEditingCourse((current) =>
        current ? { ...current, is_published: updated.is_published } : current
      );
      setSuccess(
        updated.is_published
          ? "Course is now visible to everyone on the platform."
          : "Course moved back to draft."
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to change course visibility."
      );
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <CourseManagementNav
          currentCourseId={courseId}
        />

        {loading ? (
          <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-slate-200 bg-white/95 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
            <div className="inline-flex items-center gap-2 text-slate-600">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading course details...
            </div>
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        ) : course && editingCourse ? (
          <>
            {(() => {
              const aiCourse = isAiGeneratedCourse(course);

              return (
                <>
            {success && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                {success}
              </div>
            )}

            <div className="flex flex-wrap justify-end gap-3">
              {isEditMode ? (
                <>
                  <Button
                    variant="outline"
                    onClick={handleTogglePublish}
                    disabled={isSaving || isPublishing}
                    className="border-slate-300 bg-white text-slate-950 hover:bg-slate-100"
                  >
                    {isPublishing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : course.is_published ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    {isPublishing
                      ? "Updating..."
                      : course.is_published
                        ? "Move To Draft"
                        : "Publish Course"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setIsEditMode(false);
                      setSuccess(null);
                      setError(null);
                      loadCourse();
                    }}
                    className="border-slate-300 bg-white text-slate-950 hover:bg-slate-100"
                  >
                    <X className="h-4 w-4" />
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSave}
                    disabled={isSaving}
                    className="bg-slate-900 text-white hover:bg-slate-800"
                  >
                    {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isSaving ? "Saving..." : "Save Changes"}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant={course.is_published ? "outline" : "default"}
                    onClick={handleTogglePublish}
                    disabled={isPublishing}
                    className={
                      course.is_published
                        ? "border-slate-300 bg-white text-slate-950 hover:bg-slate-100"
                        : undefined
                    }
                  >
                    {isPublishing ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : course.is_published ? (
                      <Eye className="h-4 w-4" />
                    ) : (
                      <CheckCircle className="h-4 w-4" />
                    )}
                    {isPublishing
                      ? "Updating..."
                      : course.is_published
                        ? "Move To Draft"
                        : "Publish Course"}
                  </Button>
                  <Link
                    href={routes.adminCourseEditorResolver(course.id)}
                    className={buttonVariants({ variant: "default", size: "default" })}
                  >
                    <Edit className="h-4 w-4" />
                    Edit Course
                  </Link>
                </>
              )}
            </div>

            {isEditMode ? (
              <div className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[0_18px_40px_rgba(15,23,42,0.08)]">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <div className="mb-4 flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                        <BookOpen className="h-5 w-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="grid gap-4 md:grid-cols-2">
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-xs font-medium text-slate-600">Title</label>
                            <Input
                              value={editingCourse.title}
                              onChange={(e) => updateEditingCourse({ title: e.target.value })}
                              className="border-slate-200 bg-white text-slate-900"
                            />
                          </div>
                          <div className="space-y-2 md:col-span-2">
                            <label className="text-xs font-medium text-slate-600">Description</label>
                            <textarea
                              value={editingCourse.description}
                              onChange={(e) => updateEditingCourse({ description: e.target.value })}
                              rows={3}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                            />
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-600">Category</label>
                        <select
                          value={editingCourse.category}
                          onChange={(e) => updateEditingCourse({ category: e.target.value })}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                        >
                          {categoryOptions.map((category) => (
                            <option key={category} value={category}>
                              {category}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-600">Difficulty</label>
                        <select
                          value={editingCourse.difficulty}
                          onChange={(e) => updateEditingCourse({ difficulty: e.target.value })}
                          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                        >
                          {difficultyOptions.map((difficulty) => (
                            <option key={difficulty} value={difficulty}>
                              {difficulty}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-600">Duration (minutes)</label>
                        <Input
                          type="number"
                          value={editingCourse.duration}
                          onChange={(e) =>
                            updateEditingCourse({ duration: parseInt(e.target.value, 10) || 0 })
                          }
                          className="border-slate-200 bg-white text-slate-900"
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-xs font-medium text-slate-600">XP Reward</label>
                        <Input
                          type="number"
                          value={editingCourse.xp_reward}
                          onChange={(e) =>
                            updateEditingCourse({ xp_reward: parseInt(e.target.value, 10) || 0 })
                          }
                          className="border-slate-200 bg-white text-slate-900"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid min-w-[260px] gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-600">
                        <Clock3 className="h-4 w-4" />
                        Duration
                      </div>
                      <p className="mt-2 text-lg font-semibold text-slate-950">
                        {Math.round(editingCourse.duration / 60)}h
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-600">
                        <Star className="h-4 w-4" />
                        XP Reward
                      </div>
                      <p className="mt-2 text-lg font-semibold text-emerald-700">
                        +{editingCourse.xp_reward}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-600">
                        <Layers3 className="h-4 w-4" />
                        Modules
                      </div>
                      <p className="mt-2 text-lg font-semibold text-slate-950">
                        {editingCourse.modules.length}
                      </p>
                    </div>
                    <div className="rounded-2xl border border-slate-200 bg-slate-50/90 p-4">
                      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-600">
                        <PlayCircle className="h-4 w-4" />
                        Lessons
                      </div>
                      <p className="mt-2 text-lg font-semibold text-slate-950">
                        {editingCourse.modules.reduce((total, module) => total + module.lessons.length, 0)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <section className="overflow-hidden rounded-3xl border border-[#2A5B4A] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.22),_transparent_32%),radial-gradient(circle_at_76%_18%,_rgba(59,130,246,0.2),_transparent_26%),linear-gradient(135deg,_#102E2D_0%,_#132A3A_48%,_#0F172A_100%)] p-6 text-white shadow-[0_26px_70px_rgba(0,0,0,0.28)] sm:p-8">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.22em] text-emerald-100">
                  <BookOpen className="h-3.5 w-3.5" />
                  Course Overview
                </div>
                <div className="mt-5 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                  <div className="max-w-3xl">
                    <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                      {course.title}
                    </h2>
                    <p className="mt-4 text-sm leading-7 text-slate-200 sm:text-base">
                      {course.description || "No description provided."}
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3 text-xs font-medium text-emerald-100">
                      <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                        {course.category}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                        {course.difficulty}
                      </span>
                      <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1.5">
                        {course.is_published ? "Published" : "Draft"}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-8 grid gap-3 lg:grid-cols-4">
                  <div className="rounded-2xl border border-white/12 bg-gradient-to-br from-emerald-400/25 to-emerald-100/10 p-[1px]">
                    <div className="h-full rounded-2xl bg-slate-950/40 p-4 backdrop-blur-sm">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
                        <Clock3 className="h-5 w-5" />
                      </div>
                      <div className="mt-4 text-sm font-semibold text-white">Duration</div>
                      <p className="mt-1 text-sm leading-6 text-slate-200">
                        {Math.round(course.duration / 60)}h of learner-facing content
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-gradient-to-br from-sky-400/25 to-sky-100/10 p-[1px]">
                    <div className="h-full rounded-2xl bg-slate-950/40 p-4 backdrop-blur-sm">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-100 text-sky-700">
                        <Star className="h-5 w-5" />
                      </div>
                      <div className="mt-4 text-sm font-semibold text-white">XP Reward</div>
                      <p className="mt-1 text-sm leading-6 text-slate-200">
                        +{course.xp_reward} points for successful completion
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-gradient-to-br from-amber-400/25 to-amber-100/10 p-[1px]">
                    <div className="h-full rounded-2xl bg-slate-950/40 p-4 backdrop-blur-sm">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-700">
                        <Layers3 className="h-5 w-5" />
                      </div>
                      <div className="mt-4 text-sm font-semibold text-white">Modules</div>
                      <p className="mt-1 text-sm leading-6 text-slate-200">
                        {course.modules.length} structured module{course.modules.length === 1 ? "" : "s"}
                      </p>
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/12 bg-gradient-to-br from-violet-400/25 to-violet-100/10 p-[1px]">
                    <div className="h-full rounded-2xl bg-slate-950/40 p-4 backdrop-blur-sm">
                      <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
                        <PlayCircle className="h-5 w-5" />
                      </div>
                      <div className="mt-4 text-sm font-semibold text-white">Lessons</div>
                      <p className="mt-1 text-sm leading-6 text-slate-200">
                        {course.modules.reduce((total, module) => total + module.lessons.length, 0)} lesson{course.modules.reduce((total, module) => total + module.lessons.length, 0) === 1 ? "" : "s"} ready for review
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            )}

            <div className="space-y-4">
              {(isEditMode ? editingCourse.modules : course.modules).map((module, moduleIndex) => (
                <div
                  key={module.id}
                  className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-[0_14px_32px_rgba(15,23,42,0.06)]"
                >
                  {(() => {
                    const isAiModule =
                      aiCourse || moduleHasAiLessons(module as { lessons: Array<{ content?: string | null }> });

                    return (
                      <>
                  <div className="mb-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-600">
                      Module {moduleIndex + 1}
                    </p>
                    {isEditMode ? (
                      <div className="mt-3 grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-slate-600">Module Title</label>
                          <Input
                            value={(module as EditableModule).title}
                            onChange={(e) =>
                              updateEditingModule(module.id, { title: e.target.value })
                            }
                            className="border-slate-200 bg-white text-slate-900"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-slate-600">Order</label>
                          <Input
                            type="number"
                            value={(module as EditableModule).order}
                            onChange={(e) =>
                              updateEditingModule(module.id, {
                                order: parseInt(e.target.value, 10) || 1,
                              })
                            }
                            className="border-slate-200 bg-white text-slate-900"
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-xs font-medium text-slate-600">Module Description</label>
                          <textarea
                            value={(module as EditableModule).description}
                            onChange={(e) =>
                              updateEditingModule(module.id, { description: e.target.value })
                            }
                            rows={3}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                          />
                        </div>
                      </div>
                    ) : (
                      <>
                        <h3 className="mt-2 text-lg font-semibold text-slate-950">
                          {module.title}
                        </h3>
                        <p className="mt-1 text-sm text-slate-600">
                          {module.description || "No module description provided."}
                        </p>
                      </>
                    )}
                  </div>

                  <div className="space-y-3">
                    {module.lessons.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/80 px-4 py-5 text-sm text-slate-600">
                        No lessons defined for this module yet.
                      </div>
                    ) : isAiModule ? (
                      <div className="space-y-4">
                        {isEditMode ? (
                          <div className="rounded-2xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm text-sky-800">
                            This module contains AI-generated lesson scenes. It is shown with the AI lesson presentation instead of the traditional lesson resource editor.
                          </div>
                        ) : null}
                        <AiCourseModulePlayer
                          lessons={module.lessons.map((lesson) => ({
                            id: lesson.id,
                            title: lesson.title,
                            duration: lesson.duration,
                            content: lesson.content,
                          }))}
                        />
                      </div>
                    ) : (
                      module.lessons.map((lesson, lessonIndex) => (
                        <div
                          key={lesson.id}
                          className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                        >
                          {isEditMode ? (
                            <div className="space-y-4">
                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                  <label className="text-xs font-medium text-slate-600">Lesson Title</label>
                                  <Input
                                    value={(lesson as EditableLesson).title}
                                    onChange={(e) =>
                                      updateEditingLesson(module.id, lesson.id, {
                                        title: e.target.value,
                                      })
                                    }
                                    className="border-slate-200 bg-white text-slate-900"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <label className="text-xs font-medium text-slate-600">Duration (minutes)</label>
                                  <Input
                                    type="number"
                                    value={(lesson as EditableLesson).duration}
                                    onChange={(e) =>
                                      updateEditingLesson(module.id, lesson.id, {
                                        duration: parseInt(e.target.value, 10) || 0,
                                      })
                                    }
                                    className="border-slate-200 bg-white text-slate-900"
                                  />
                                </div>
                                <div className="space-y-2 md:col-span-2">
                                  <label className="text-xs font-medium text-slate-600">Lesson Summary</label>
                                  <textarea
                                    value={(lesson as EditableLesson).summary}
                                    onChange={(e) =>
                                      updateEditingLesson(module.id, lesson.id, {
                                        summary: e.target.value,
                                      })
                                    }
                                    rows={3}
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
                                  />
                                </div>
                              </div>

                              {((lesson as EditableLesson).resources.length > 0 ||
                                (lesson as EditableLesson).video_url) && (
                                <div className="rounded-xl border border-slate-200 bg-white p-3">
                                  <p className="text-xs font-medium text-slate-900">
                                    Current Attached Content
                                  </p>
                                  {(lesson as EditableLesson).video_url && (
                                    <p className="mt-2 text-xs text-slate-500">
                                      Main video already attached
                                    </p>
                                  )}
                                  {(lesson as EditableLesson).resources.length > 0 && (
                                    <ul className="mt-2 space-y-1 text-xs text-slate-500">
                                      {(lesson as EditableLesson).resources.map((resource) => (
                                        <li key={`${lesson.id}-${resource.url}`}>{resource.title}</li>
                                      ))}
                                    </ul>
                                  )}
                                </div>
                              )}

                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4">
                                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600">
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

                                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-4">
                                  <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600">
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
                                  <p className="text-sm font-semibold text-slate-950">
                                    Lesson {lessonIndex + 1}: {lesson.title}
                                  </p>
                                  <p className="mt-1 text-xs text-slate-600">
                                    {lesson.duration} min
                                  </p>
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  <span className="rounded-full bg-slate-200/80 px-2.5 py-1 text-xs text-slate-700">
                                    {lesson.content_type}
                                  </span>
                                  {lesson.video_url && (
                                    <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-xs text-sky-700">
                                      Main video attached
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="mt-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
                                <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-600">
                                  <FileText className="h-4 w-4" />
                                  Lesson Preview
                                </div>
                                {(() => {
                                  const aiPreview = parseAiScenePreview(lesson.content);
                                  const lessonPreview = getLessonPreviewData(lesson.content);
                                  const lessonResources = dedupeResources(
                                    lessonPreview.resources
                                      .filter((resource) => resource.url)
                                      .map((resource) => ({
                                        ...resource,
                                        url: normalizeResourceUrl(resource.url),
                                      }))
                                      .filter((resource) => !isDuplicateOfMainVideo(resource, lesson.video_url))
                                  );

                                  if (aiPreview) {
                                    return (
                                      <div className="mt-3 space-y-4 text-sm text-slate-600">
                                        {aiPreview.title && (
                                          <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                              Scene Title
                                            </p>
                                            <p className="mt-1 text-sm font-medium text-slate-950">
                                              {aiPreview.title}
                                            </p>
                                          </div>
                                        )}

                                        {aiPreview.visibleTexts.length > 0 && (
                                          <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                              On-Screen Content
                                            </p>
                                            <ul className="mt-2 space-y-2">
                                              {aiPreview.visibleTexts.map((text, index) => (
                                                <li
                                                  key={`${lesson.id}-visible-${index}`}
                                                  className="rounded-lg bg-slate-50 px-3 py-2 leading-6 text-slate-700"
                                                >
                                                  {text}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}

                                        {aiPreview.teacherParoles.length > 0 && (
                                          <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                              Teacher Explanations
                                            </p>
                                            <ul className="mt-2 space-y-2">
                                              {aiPreview.teacherParoles.map((text, index) => (
                                                <li
                                                  key={`${lesson.id}-speech-${index}`}
                                                  className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 leading-6 text-slate-700"
                                                >
                                                  {text}
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}

                                        {aiPreview.interactiveDescription && (
                                          <div>
                                            <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                              Interactive Activity
                                            </p>
                                            <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 leading-6 text-slate-700">
                                              {aiPreview.interactiveDescription}
                                            </p>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  }

                                  return (
                                    <div className="mt-3 space-y-4">
                                      {lesson.video_url ? (
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                            Main Video
                                          </p>
                                          <div className="mt-2 overflow-hidden rounded-2xl border border-slate-200 bg-slate-950 shadow-sm">
                                            <video
                                              controls
                                              preload="metadata"
                                              className="h-auto w-full"
                                              src={lesson.video_url}
                                            >
                                              Your browser does not support the video tag.
                                            </video>
                                          </div>
                                        </div>
                                      ) : null}

                                      {lessonPreview.summary ? (
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                            Lesson Summary
                                          </p>
                                          <p className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm leading-6 text-slate-700">
                                            {lessonPreview.summary}
                                          </p>
                                        </div>
                                      ) : null}

                                      {lessonResources.length > 0 ? (
                                        <div>
                                          <p className="text-xs font-semibold uppercase tracking-wide text-slate-600">
                                            Learning Materials
                                          </p>
                                          <div className="mt-2 space-y-4">
                                            {lessonResources.map((resource) => (
                                              <div
                                                key={`${lesson.id}-${resource.url}`}
                                                className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50"
                                              >
                                                <div className="flex items-start gap-3 border-b border-slate-200 bg-white px-4 py-3">
                                                  <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700 shadow-sm">
                                                    <FileText className="h-4 w-4" />
                                                  </div>
                                                  <div className="min-w-0">
                                                    <p className="truncate text-sm font-semibold text-slate-900">
                                                      {resource.title}
                                                    </p>
                                                    <p className="mt-1 text-xs text-slate-500">
                                                      {getResourceKind(resource) === "image"
                                                        ? "Image resource"
                                                        : getResourceKind(resource) === "pdf"
                                                          ? "PDF resource"
                                                          : getResourceKind(resource) === "video"
                                                            ? "Video resource"
                                                            : getResourceKind(resource) === "audio"
                                                              ? "Audio resource"
                                                              : "Attached file"}
                                                    </p>
                                                  </div>
                                                  <div className="ml-auto">
                                                    <a
                                                      href={resource.url}
                                                      target="_blank"
                                                      rel="noopener noreferrer"
                                                      className="inline-flex rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 transition hover:bg-slate-100"
                                                    >
                                                      Open
                                                    </a>
                                                  </div>
                                                </div>

                                                <div className="bg-slate-50 px-4 py-4">
                                                  {getResourceKind(resource) === "image" ? (
                                                    <img
                                                      src={resource.url}
                                                      alt={resource.title}
                                                      className="max-h-[420px] w-full rounded-xl border border-slate-200 bg-white object-contain"
                                                    />
                                                  ) : getResourceKind(resource) === "pdf" ? (
                                                    <iframe
                                                      title={resource.title}
                                                      src={resource.url}
                                                      className="h-[520px] w-full rounded-xl border border-slate-200 bg-white"
                                                    />
                                                  ) : getResourceKind(resource) === "video" ? (
                                                    <video
                                                      controls
                                                      preload="metadata"
                                                      className="w-full rounded-xl border border-slate-200 bg-slate-950"
                                                      src={resource.url}
                                                    >
                                                      Your browser does not support the video tag.
                                                    </video>
                                                  ) : getResourceKind(resource) === "audio" ? (
                                                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                                                      <audio controls className="w-full" src={resource.url}>
                                                        Your browser does not support the audio element.
                                                      </audio>
                                                    </div>
                                                  ) : (
                                                    <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-6 text-sm text-slate-600">
                                                      This file cannot be previewed inline. Use{" "}
                                                      <a
                                                        href={resource.url}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="font-medium text-slate-900 underline underline-offset-2"
                                                      >
                                                        Open
                                                      </a>{" "}
                                                      to view it.
                                                    </div>
                                                  )}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      ) : null}

                                      {!lesson.video_url &&
                                      !lessonPreview.summary &&
                                      lessonResources.length === 0 ? (
                                        <p className="text-sm leading-6 text-slate-600">
                                          No lesson summary is available for this lesson yet.
                                        </p>
                                      ) : null}
                                    </div>
                                  );
                                })()}
                              </div>
                            </>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                      </>
                    );
                  })()}
                </div>
              ))}
            </div>
                </>
              );
            })()}
          </>
        ) : null}
      </div>
    </AdminShell>
  );
}
