"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CourseManagementNav } from "@/app/admin/courses/course-management-nav";
import { CourseThumbnailField } from "@/app/admin/courses/course-thumbnail-field";
import { AdminShell } from "@/app/components/layout/AdminShell";
import { useAuth } from "@/app/context/AuthContext";
import { Button } from "@/app/components/ui/Button";
import { Input } from "@/app/components/ui/Input";
import {
  createCourse,
  createCourseModule,
  createModuleLesson,
  deleteCourseById,
  getCourses,
  getTenants,
  updateCourseById,
  updateCourseModule,
  updateModuleLesson,
  uploadCourseContent,
  type ContentUploadResponse,
  type Course,
  type CourseDetailResponse,
  type TenantResponse,
} from "@/app/lib/api";
import { routes } from "@/app/lib/routes";
import {
  BookOpen,
  Edit,
  FileText,
  FileVideo,
  Loader2,
  Plus,
  Search,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { buildStoredMediaReference } from "@/app/lib/media";

type AdminCourse = Course & {
  thumbnail?: string | null;
  rating?: number | null;
  created_at?: string;
};

type CourseOrigin = "all" | "traditional" | "ai";

type ModuleDraft = {
  id: string;
  title: string;
  description: string;
  lessonTitle: string;
  lessonSummary: string;
  duration: number;
  pdfFile: File | null;
  videoFile: File | null;
  attachments: File[];
};

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
  thumbnail: string | null;
  category: string;
  difficulty: string;
  duration: number;
  xp_reward: number;
  is_published: boolean;
  modules: EditableModule[];
};

const difficulties = ["Beginner", "Intermediate", "Advanced"];
const categories = [
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

function getCourseOrigin(course: Pick<Course, "category" | "description">): Exclude<CourseOrigin, "all"> {
  const category = (course.category || "").trim().toLowerCase();
  const description = (course.description || "").trim().toLowerCase();

  if (
    category === "ai generated" ||
    description.includes("ai-generated course draft") ||
    description.includes("openmaic")
  ) {
    return "ai";
  }

  return "traditional";
}

function createEmptyModule(index: number): ModuleDraft {
  return {
    id: `${Date.now()}-${index}`,
    title: "",
    description: "",
    lessonTitle: `Lesson ${index + 1}`,
    lessonSummary: "",
    duration: 30,
    pdfFile: null,
    videoFile: null,
    attachments: [],
  };
}

const emptyForm = {
  title: "",
  description: "",
  category: "Technology",
  difficulty: "Beginner",
  duration: 60,
  xp_reward: 100,
  is_published: false,
};

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildLessonContent(
  summary: string,
  uploads: ContentUploadResponse[]
): string {
  return buildLessonContentFromResources(
    summary,
    uploads.map((upload) => ({
      title: upload.filename,
      url: upload.url,
    }))
  );
}

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

  if (minutes === 0) {
    return `${hours}h`;
  }

  return `${hours}h ${minutes}min`;
}

function buildStoredVideoReference(upload: ContentUploadResponse | null): string | null {
  if (!upload) {
    return null;
  }
  return `minio://${upload.bucket}/${upload.object_name}`;
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

function FilePickerCard({
  icon,
  title,
  accept,
  multiple = false,
  buttonLabel,
  files,
  emptyLabel,
  inputId,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  accept: string;
  multiple?: boolean;
  buttonLabel: string;
  files: File[];
  emptyLabel: string;
  inputId: string;
  onChange: (files: FileList | null) => void;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-text-secondary">
        {icon}
        {title}
      </div>
      <label
        htmlFor={inputId}
        className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-light"
      >
        <Upload className="h-4 w-4" />
        {buttonLabel}
      </label>
      <input
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => onChange(e.target.files)}
        className="sr-only"
      />
      <p className="mt-3 text-xs text-text-secondary">
        {multiple ? "You can select multiple files." : "Select one file to attach."}
      </p>
      <SelectedFilesList files={files} emptyLabel={emptyLabel} />
    </div>
  );
}

export default function AdminCoursesPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [courses, setCourses] = useState<AdminCourse[]>([]);
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState<AdminCourse | null>(null);
  const [editingCourse, setEditingCourse] = useState<EditableCourse | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [originFilter, setOriginFilter] = useState<CourseOrigin>("all");
  const [formData, setFormData] = useState(emptyForm);
  const [thumbnailFile, setThumbnailFile] = useState<File | null>(null);
  const [editingThumbnailFile, setEditingThumbnailFile] = useState<File | null>(null);
  const [modules, setModules] = useState<ModuleDraft[]>([createEmptyModule(0)]);
  const [tenants, setTenants] = useState<TenantResponse[]>([]);

  const canManageCourses =
    !!user && ["Admin", "Manager", "LearningExpert", "SuperAdmin"].includes(user.role);
  const isSuperAdmin = user?.role === "SuperAdmin";

  const tenantNameById = useMemo(
    () => Object.fromEntries(tenants.map((tenant) => [tenant.id, tenant.name])),
    [tenants]
  );

  const filteredCourses = useMemo(() => {
    return courses.filter((course) => {
      const matchesOrigin =
        originFilter === "all" ? true : getCourseOrigin(course) === originFilter;

      if (!matchesOrigin) {
        return false;
      }

      if (!search) {
        return true;
      }
      const needle = search.toLowerCase();
      return (
        course.title.toLowerCase().includes(needle) ||
        (course.description || "").toLowerCase().includes(needle) ||
        course.category.toLowerCase().includes(needle) ||
        (isSuperAdmin &&
          (course.tenant_id ? tenantNameById[course.tenant_id] || "" : "Platform-wide")
            .toLowerCase()
            .includes(needle))
      );
    });
  }, [courses, isSuperAdmin, originFilter, search, tenantNameById]);

  const courseCounts = useMemo(() => {
    let ai = 0;
    let traditional = 0;
    for (const course of courses) {
      if (getCourseOrigin(course) === "ai") {
        ai += 1;
      } else {
        traditional += 1;
      }
    }
    return {
      all: courses.length,
      ai,
      traditional,
    };
  }, [courses]);

  const loadCourses = useCallback(async () => {
    try {
      setError(null);
      const [coursesResponse, tenantsResponse] = await Promise.all([
        getCourses({ page: 1, page_size: 100 }),
        isSuperAdmin ? getTenants(1, 100) : Promise.resolve(null),
      ]);
      setCourses(coursesResponse.items);
      if (tenantsResponse) {
        setTenants(tenantsResponse.tenants || []);
      }
    } catch (err) {
      console.error("Failed to load admin courses:", err);
      setError(err instanceof Error ? err.message : "Failed to load courses");
    } finally {
      setIsLoading(false);
    }
  }, [isSuperAdmin]);

  useEffect(() => {
    if (!canManageCourses) {
      setIsLoading(false);
      return;
    }
    loadCourses();
  }, [canManageCourses, loadCourses]);

  function resetCreateForm() {
    setFormData(emptyForm);
    setThumbnailFile(null);
    setModules([createEmptyModule(0)]);
  }

  function updateModule(
    moduleId: string,
    changes: Partial<ModuleDraft>
  ) {
    setModules((current) =>
      current.map((module) =>
        module.id === moduleId ? { ...module, ...changes } : module
      )
    );
  }

  function validateDraft(): string | null {
    if (!formData.title.trim()) {
      return "Course title is required.";
    }
    if (modules.length === 0) {
      return "Add at least one module.";
    }

    for (const [index, module] of modules.entries()) {
      if (!module.title.trim()) {
        return `Module ${index + 1} title is required.`;
      }
      if (!module.lessonTitle.trim()) {
        return `Module ${index + 1} lesson title is required.`;
      }
      if (!module.videoFile && !module.pdfFile && module.attachments.length === 0) {
        return `Module ${index + 1} needs at least one file.`;
      }
    }

    return null;
  }

  const handleCreate = async () => {
    const validationError = validateDraft();
    if (validationError) {
      setError(validationError);
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      let savedCourse = await createCourse({
        ...formData,
        description: formData.description || null,
        is_published: false,
      });

      if (thumbnailFile) {
        const thumbnailUpload = await uploadCourseContent(thumbnailFile, {
          courseId: savedCourse.id,
        });
        savedCourse = await updateCourseById(savedCourse.id, {
          thumbnail: buildStoredMediaReference(thumbnailUpload),
        });
      }

      for (const [index, moduleDraft] of modules.entries()) {
        const createdModule = await createCourseModule(savedCourse.id, {
          title: moduleDraft.title,
          description: moduleDraft.description || null,
          order: index + 1,
        });

        const uploads: ContentUploadResponse[] = [];

        if (moduleDraft.videoFile) {
          uploads.push(
            await uploadCourseContent(moduleDraft.videoFile, {
              courseId: savedCourse.id,
              moduleId: createdModule.id,
            })
          );
        }

        if (moduleDraft.pdfFile) {
          uploads.push(
            await uploadCourseContent(moduleDraft.pdfFile, {
              courseId: savedCourse.id,
              moduleId: createdModule.id,
            })
          );
        }

        for (const attachment of moduleDraft.attachments) {
          uploads.push(
            await uploadCourseContent(attachment, {
              courseId: savedCourse.id,
              moduleId: createdModule.id,
            })
          );
        }

        const videoUpload =
          uploads.find((upload) => upload.bucket === "course-videos") || null;

        await createModuleLesson(createdModule.id, {
          title: moduleDraft.lessonTitle,
          content: buildLessonContent(moduleDraft.lessonSummary, uploads),
          video_url: buildStoredVideoReference(videoUpload),
          content_type: videoUpload ? "video" : "resource",
          duration: moduleDraft.duration,
          order: 1,
        });
      }

      const finalCourse: AdminCourse = {
        ...savedCourse,
        rating: null,
      };

      setCourses((current) => [finalCourse, ...current]);
      setSuccess("Course created successfully. Publish will be available after course memory retention completes.");
      setShowCreateModal(false);
      resetCreateForm();
    } catch (err) {
      console.error("Failed to create course:", err);
      setError(err instanceof Error ? err.message : "Failed to create course");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedCourse) {
      return;
    }
    setIsSubmitting(true);
    setError(null);
    try {
      await deleteCourseById(selectedCourse.id);
      setCourses((current) =>
        current.filter((course) => course.id !== selectedCourse.id)
      );
      setShowDeleteModal(false);
      setSelectedCourse(null);
      setSuccess("Course deleted successfully.");
    } catch (err) {
      console.error("Failed to delete course:", err);
      setError(err instanceof Error ? err.message : "Failed to delete course");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenEditor = (courseId: string) => {
    setError(null);
    setSuccess(null);
    router.push(routes.adminCourseEditorResolver(courseId));
  };

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

  const handleSaveEditor = async () => {
    if (!editingCourse) {
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const updatedCourse = await updateCourseById(editingCourse.id, {
        title: editingCourse.title,
        description: editingCourse.description || null,
        thumbnail: editingThumbnailFile
          ? buildStoredMediaReference(
              await uploadCourseContent(editingThumbnailFile, {
                courseId: editingCourse.id,
              })
            )
          : editingCourse.thumbnail || "",
        category: editingCourse.category,
        difficulty: editingCourse.difficulty,
        duration: editingCourse.duration,
        xp_reward: editingCourse.xp_reward,
      });

      for (const courseModule of editingCourse.modules) {
        await updateCourseModule(courseModule.id, {
          title: courseModule.title,
          description: courseModule.description || null,
          order: courseModule.order,
        });

        for (const lesson of courseModule.lessons) {
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
            content_type:
              String(lesson.content_type || "").trim().toLowerCase() === "quiz"
                ? "quiz"
                : videoUrl
                  ? "video"
                  : "resource",
            duration: lesson.duration,
            order: lesson.order,
          });
        }
      }

      setCourses((current) =>
        current.map((course) =>
          course.id === editingCourse.id
            ? { ...course, ...updatedCourse }
            : course
        )
      );
      setShowEditModal(false);
      setEditingCourse(null);
      setEditingThumbnailFile(null);
      setSuccess("Course updated successfully.");
    } catch (err) {
      console.error("Failed to update course:", err);
      setError(err instanceof Error ? err.message : "Failed to update course");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!canManageCourses) {
    return (
      <AdminShell>
        <div className="flex h-[60vh] items-center justify-center">
          <div className="text-center">
            <BookOpen className="mx-auto h-12 w-12 text-text-secondary" />
            <h2 className="mt-4 text-xl font-semibold text-text-primary">
              Access Denied
            </h2>
            <p className="mt-2 text-text-secondary">
              This page is only accessible to course administrators and learning experts.
            </p>
          </div>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <CourseManagementNav />

        {error && (
          <div className="rounded-xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm text-green-600">
            {success}
          </div>
        )}

        <section className="overflow-hidden rounded-3xl border border-[#2A5B4A] bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.22),_transparent_32%),radial-gradient(circle_at_76%_18%,_rgba(59,130,246,0.2),_transparent_26%),linear-gradient(135deg,_#102E2D_0%,_#132A3A_48%,_#0F172A_100%)] p-5 text-white shadow-[0_26px_70px_rgba(0,0,0,0.28)] sm:p-6 lg:p-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
            <div className="max-w-3xl">
              <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                Course Management Workspace
              </h2>
              <p className="mt-4 text-sm leading-7 text-slate-200 sm:text-base">
                Traditional courses and AI-generated courses remain available together in the same workspace.
              </p>
            </div>

            <div className="flex w-full flex-col gap-4 xl:w-[440px] xl:items-end">
              <div className="relative w-full">
                <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-300" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search courses..."
                  className="h-12 rounded-2xl border-white/15 bg-white/10 pl-11 text-white placeholder:text-slate-300 shadow-[0_16px_36px_rgba(0,0,0,0.18)] backdrop-blur-sm focus:border-emerald-300"
                />
              </div>

              <div className="grid w-full grid-cols-3 gap-2">
                {[
                  { value: "all" as const, label: "All Courses", count: courseCounts.all },
                  { value: "traditional" as const, label: "Traditional", count: courseCounts.traditional },
                  { value: "ai" as const, label: "AI Generated", count: courseCounts.ai },
                ].map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setOriginFilter(option.value)}
                    className={`rounded-2xl border px-3 py-3 text-left transition-colors ${
                      originFilter === option.value
                        ? "border-emerald-300/50 bg-white/16 text-white"
                        : "border-white/10 bg-white/8 text-slate-200 hover:border-white/25 hover:bg-white/12"
                    }`}
                  >
                    <span className="block text-xs font-semibold uppercase tracking-[0.16em]">
                      {option.label}
                    </span>
                    <span className="mt-2 block font-mono text-2xl font-bold leading-none">
                      {option.count}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/92 shadow-[0_22px_50px_rgba(15,23,42,0.08)]">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-200 bg-[linear-gradient(180deg,rgba(244,250,252,0.95),rgba(237,247,248,0.9))]">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Course
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Category
                </th>
                {isSuperAdmin ? (
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Company
                  </th>
                ) : null}
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Level
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Duration
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  XP
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Edit
                </th>
                <th className="px-4 py-3 text-center text-xs font-semibold uppercase tracking-wider text-slate-700">
                  Delete
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {isLoading ? (
                <tr>
                  <td
                    colSpan={isSuperAdmin ? 9 : 8}
                    className="px-4 py-10 text-center text-slate-600"
                  >
                    <div className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading courses...
                    </div>
                  </td>
                </tr>
              ) : (
                filteredCourses.map((course) => (
                  <tr
                    key={course.id}
                    className="cursor-pointer transition-colors hover:bg-slate-50/80"
                    onClick={() => router.push(routes.adminCourseDetail(course.id))}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                          <BookOpen className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-slate-950">
                              {course.title}
                            </p>
                            <span
                              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                getCourseOrigin(course) === "ai"
                                  ? "bg-cyan-500/10 text-cyan-700"
                                  : "bg-slate-200/80 text-slate-700"
                              }`}
                            >
                              {getCourseOrigin(course) === "ai" ? "AI Generated" : "Traditional"}
                            </span>
                          </div>
                          <p className="line-clamp-1 text-xs text-slate-600">
                            {course.description || "No description provided"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-900">
                      {course.category}
                    </td>
                    {isSuperAdmin ? (
                      <td className="px-4 py-4">
                        <div className="min-w-[150px]">
                          <p className="text-sm font-semibold text-slate-900">
                            {course.tenant_id
                              ? tenantNameById[course.tenant_id] || "Unknown company"
                              : "Platform-wide"}
                          </p>
                        </div>
                      </td>
                    ) : null}
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          difficultyColors[course.difficulty]?.bg ||
                          "bg-gray-500/10"
                        } ${
                          difficultyColors[course.difficulty]?.text ||
                          "text-gray-500"
                        }`}
                      >
                        {course.difficulty}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-700">
                      {formatCourseDuration(course.duration)}
                    </td>
                    <td className="px-4 py-4 text-sm font-medium text-primary">
                      +{course.xp_reward}
                    </td>
                    <td className="px-4 py-4">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
                          course.is_published
                            ? "bg-green-500/10 text-green-500"
                            : "bg-amber-500/10 text-amber-500"
                        }`}
                      >
                        {course.is_published ? "Published" : "Draft"}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-700 hover:text-slate-950"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleOpenEditor(course.id);
                        }}
                        title="Open course edit modal"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-slate-700 hover:text-destructive"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSelectedCourse(course);
                          setShowDeleteModal(true);
                        }}
                        title="Delete course"
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {!isLoading && filteredCourses.length === 0 && (
            <div className="px-4 py-8 text-center text-slate-600">
              No courses found for the selected filter.
            </div>
          )}
        </div>

        {showCreateModal && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-background/80 backdrop-blur-sm">
            <div className="mx-auto my-10 w-full max-w-5xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <BookOpen className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">
                      Create New Course
                    </h2>
                    <p className="text-xs text-text-secondary">
                      Add at least one module and one uploaded resource per module.
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowCreateModal(false)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-medium text-text-secondary">
                      Title
                    </label>
                    <Input
                      value={formData.title}
                      onChange={(e) =>
                        setFormData((current) => ({
                          ...current,
                          title: e.target.value,
                        }))
                      }
                      placeholder="Course title"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-medium text-text-secondary">
                      Description
                    </label>
                    <textarea
                      value={formData.description}
                      onChange={(e) =>
                        setFormData((current) => ({
                          ...current,
                          description: e.target.value,
                        }))
                      }
                      placeholder="Course description"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                      rows={3}
                    />
                  </div>
                  <CourseThumbnailField
                    inputId="create-course-thumbnail"
                    currentUrl={null}
                    file={thumbnailFile}
                    onFileChange={setThumbnailFile}
                    onRemove={() => setThumbnailFile(null)}
                  />
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text-secondary">
                      Category
                    </label>
                    <select
                      value={formData.category}
                      onChange={(e) =>
                        setFormData((current) => ({
                          ...current,
                          category: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                    >
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text-secondary">
                      Difficulty
                    </label>
                    <select
                      value={formData.difficulty}
                      onChange={(e) =>
                        setFormData((current) => ({
                          ...current,
                          difficulty: e.target.value,
                        }))
                      }
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                    >
                      {difficulties.map((difficulty) => (
                        <option key={difficulty} value={difficulty}>
                          {difficulty}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text-secondary">
                      Duration (minutes)
                    </label>
                    <Input
                      type="number"
                      value={formData.duration}
                      onChange={(e) =>
                        setFormData((current) => ({
                          ...current,
                          duration: parseInt(e.target.value, 10) || 0,
                        }))
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text-secondary">
                      XP Reward
                    </label>
                    <Input
                      type="number"
                      value={formData.xp_reward}
                      onChange={(e) =>
                        setFormData((current) => ({
                          ...current,
                          xp_reward: parseInt(e.target.value, 10) || 0,
                        }))
                      }
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-semibold text-text-primary">
                        Modules
                      </h3>
                      <p className="text-xs text-text-secondary">
                        Each module will create one lesson with uploaded MinIO resources.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        setModules((current) => [
                          ...current,
                          createEmptyModule(current.length),
                        ])
                      }
                    >
                      <Plus className="mr-2 h-4 w-4" />
                      Add Module
                    </Button>
                  </div>

                  {modules.map((module, index) => (
                    <div
                      key={module.id}
                      className="rounded-2xl border border-border bg-background p-5"
                    >
                      <div className="mb-4 flex items-center justify-between">
                        <div>
                          <h4 className="font-semibold text-text-primary">
                            Module {index + 1}
                          </h4>
                          <p className="text-xs text-text-secondary">
                            Add a video, PDF, or other learning files.
                          </p>
                        </div>
                        {modules.length > 1 && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              setModules((current) =>
                                current.filter((item) => item.id !== module.id)
                              )
                            }
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-text-secondary">
                            Module Title
                          </label>
                          <Input
                            value={module.title}
                            onChange={(e) =>
                              updateModule(module.id, { title: e.target.value })
                            }
                            placeholder="Module title"
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-text-secondary">
                            Lesson Title
                          </label>
                          <Input
                            value={module.lessonTitle}
                            onChange={(e) =>
                              updateModule(module.id, {
                                lessonTitle: e.target.value,
                              })
                            }
                            placeholder="Lesson title"
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-xs font-medium text-text-secondary">
                            Module Description
                          </label>
                          <textarea
                            value={module.description}
                            onChange={(e) =>
                              updateModule(module.id, {
                                description: e.target.value,
                              })
                            }
                            placeholder="Module description"
                            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary"
                            rows={2}
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-xs font-medium text-text-secondary">
                            Lesson Summary
                          </label>
                          <textarea
                            value={module.lessonSummary}
                            onChange={(e) =>
                              updateModule(module.id, {
                                lessonSummary: e.target.value,
                              })
                            }
                            placeholder="Short text shown inside the lesson page"
                            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary"
                            rows={3}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-text-secondary">
                            Lesson Duration (minutes)
                          </label>
                          <Input
                            type="number"
                            value={module.duration}
                            onChange={(e) =>
                              updateModule(module.id, {
                                duration: parseInt(e.target.value, 10) || 0,
                              })
                            }
                          />
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3">
                        <FilePickerCard
                          icon={<FileText className="h-4 w-4" />}
                          title="PDF File"
                          accept=".pdf,application/pdf"
                          buttonLabel="Choose PDF"
                          files={module.pdfFile ? [module.pdfFile] : []}
                          emptyLabel="No PDF selected"
                          inputId={`module-${module.id}-pdf`}
                          onChange={(files) =>
                            updateModule(module.id, {
                              pdfFile: files?.[0] || null,
                            })
                          }
                        />

                        <FilePickerCard
                          icon={<FileVideo className="h-4 w-4" />}
                          title="Video File"
                          accept="video/mp4,video/webm,video/ogg"
                          buttonLabel="Choose Video"
                          files={module.videoFile ? [module.videoFile] : []}
                          emptyLabel="No video selected"
                          inputId={`module-${module.id}-video`}
                          onChange={(files) =>
                            updateModule(module.id, {
                              videoFile: files?.[0] || null,
                            })
                          }
                        />

                        <FilePickerCard
                          icon={<Upload className="h-4 w-4" />}
                          title="Other Files"
                          accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.ppt,.pptx,.doc,.docx,.txt,.csv,.xls,.xlsx,.zip"
                          multiple
                          buttonLabel="Choose Files"
                          files={module.attachments}
                          emptyLabel="No extra files selected"
                          inputId={`module-${module.id}-attachments`}
                          onChange={(files) =>
                            updateModule(module.id, {
                              attachments: Array.from(files || []),
                            })
                          }
                        />
                      </div>

                      <div className="mt-4 rounded-xl border border-primary/15 bg-primary/5 p-4">
                        <div className="flex items-start gap-3">
                          <Upload className="mt-0.5 h-4 w-4 text-primary" />
                          <div className="text-xs text-text-secondary">
                            <p className="font-medium text-text-primary">Learning Files</p>
                            <p className="mt-1">
                              Upload at least one file for this module. Supported types:
                              PDF, MP4, WebM, OGG, PNG, JPG, GIF, WEBP, PPT, PPTX,
                              DOC, DOCX, TXT, CSV, XLS, XLSX, ZIP.
                            </p>
                            <p className="mt-1">
                              All selected files are uploaded to MinIO when you create
                              the course.
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <label className="flex items-center gap-3 rounded-lg border border-border bg-background px-3 py-3 text-sm text-text-primary">
                  <input
                    type="checkbox"
                    checked={false}
                    disabled
                    onChange={() => undefined}
                    className="h-4 w-4 rounded border-border"
                  />
                  Publish is locked during creation. It becomes available only after Hindsight fully retains the course memory.
                </label>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleCreate}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Upload className="h-4 w-4 animate-pulse" />
                      Creating...
                    </>
                  ) : (
                    "Create Course"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {showEditModal && editingCourse && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-background/80 backdrop-blur-sm">
            <div className="mx-auto my-10 w-full max-w-5xl rounded-2xl border border-border bg-card p-6 shadow-2xl">
              <div className="mb-6 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                    <Edit className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-text-primary">
                      Edit Course
                    </h2>
                    <p className="text-xs text-text-secondary">
                      Update course details, lesson content, and attached media.
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingCourse(null);
                    setEditingThumbnailFile(null);
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-medium text-text-secondary">
                      Title
                    </label>
                    <Input
                      value={editingCourse.title}
                      onChange={(e) => updateEditingCourse({ title: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <label className="text-xs font-medium text-text-secondary">
                      Description
                    </label>
                    <textarea
                      value={editingCourse.description}
                      onChange={(e) =>
                        updateEditingCourse({ description: e.target.value })
                      }
                      rows={3}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                    />
                  </div>
                  <CourseThumbnailField
                    inputId="edit-course-thumbnail"
                    currentUrl={editingCourse.thumbnail}
                    file={editingThumbnailFile}
                    onFileChange={setEditingThumbnailFile}
                    onRemove={() => {
                      setEditingThumbnailFile(null);
                      updateEditingCourse({ thumbnail: "" });
                    }}
                  />
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text-secondary">
                      Category
                    </label>
                    <select
                      value={editingCourse.category}
                      onChange={(e) => updateEditingCourse({ category: e.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                    >
                      {categories.map((category) => (
                        <option key={category} value={category}>
                          {category}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text-secondary">
                      Difficulty
                    </label>
                    <select
                      value={editingCourse.difficulty}
                      onChange={(e) => updateEditingCourse({ difficulty: e.target.value })}
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                    >
                      {difficulties.map((difficulty) => (
                        <option key={difficulty} value={difficulty}>
                          {difficulty}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text-secondary">
                      Duration (minutes)
                    </label>
                    <Input
                      type="number"
                      value={editingCourse.duration}
                      onChange={(e) =>
                        updateEditingCourse({
                          duration: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-text-secondary">
                      XP Reward
                    </label>
                    <Input
                      type="number"
                      value={editingCourse.xp_reward}
                      onChange={(e) =>
                        updateEditingCourse({
                          xp_reward: parseInt(e.target.value, 10) || 0,
                        })
                      }
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  {editingCourse.modules.map((module, moduleIndex) => (
                    <div
                      key={module.id}
                      className="rounded-2xl border border-border bg-background p-5"
                    >
                      <div className="mb-4">
                        <h3 className="font-semibold text-text-primary">
                          Module {moduleIndex + 1}
                        </h3>
                      </div>
                      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-text-secondary">
                            Module Title
                          </label>
                          <Input
                            value={module.title}
                            onChange={(e) =>
                              updateEditingModule(module.id, { title: e.target.value })
                            }
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-text-secondary">
                            Module Order
                          </label>
                          <Input
                            type="number"
                            value={module.order}
                            onChange={(e) =>
                              updateEditingModule(module.id, {
                                order: parseInt(e.target.value, 10) || module.order,
                              })
                            }
                          />
                        </div>
                        <div className="space-y-2 md:col-span-2">
                          <label className="text-xs font-medium text-text-secondary">
                            Module Description
                          </label>
                          <textarea
                            value={module.description}
                            onChange={(e) =>
                              updateEditingModule(module.id, {
                                description: e.target.value,
                              })
                            }
                            rows={2}
                            className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm text-text-primary"
                          />
                        </div>
                      </div>

                      <div className="mt-5 space-y-4">
                        {module.lessons.map((lesson, lessonIndex) => (
                          <div
                            key={lesson.id}
                            className="rounded-xl border border-border bg-card p-4"
                          >
                            <div className="mb-4">
                              <h4 className="font-medium text-text-primary">
                                Lesson {lessonIndex + 1}
                              </h4>
                            </div>
                            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <label className="text-xs font-medium text-text-secondary">
                                  Lesson Title
                                </label>
                                <Input
                                  value={lesson.title}
                                  onChange={(e) =>
                                    updateEditingLesson(module.id, lesson.id, {
                                      title: e.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-xs font-medium text-text-secondary">
                                  Duration (minutes)
                                </label>
                                <Input
                                  type="number"
                                  value={lesson.duration}
                                  onChange={(e) =>
                                    updateEditingLesson(module.id, lesson.id, {
                                      duration: parseInt(e.target.value, 10) || 0,
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-2 md:col-span-2">
                                <label className="text-xs font-medium text-text-secondary">
                                  Lesson Summary
                                </label>
                                <textarea
                                  value={lesson.summary}
                                  onChange={(e) =>
                                    updateEditingLesson(module.id, lesson.id, {
                                      summary: e.target.value,
                                    })
                                  }
                                  rows={3}
                                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary"
                                />
                              </div>
                              <div className="space-y-2 md:col-span-2">
                                <label className="text-xs font-medium text-text-secondary">
                                  Video URL
                                </label>
                                <Input
                                  value={lesson.video_url || ""}
                                  onChange={(e) =>
                                    updateEditingLesson(module.id, lesson.id, {
                                      video_url: e.target.value || null,
                                    })
                                  }
                                  placeholder="https://..."
                                />
                              </div>
                            </div>

                            {lesson.resources.length > 0 && (
                              <div className="mt-4 rounded-xl border border-border bg-background p-3">
                                <p className="text-xs font-medium text-text-primary">
                                  Current Support Files
                                </p>
                                <ul className="mt-2 space-y-1 text-xs text-text-secondary">
                                  {lesson.resources.map((resource) => (
                                    <li key={`${lesson.id}-${resource.url}`}>
                                      {resource.title}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}

                            <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
                              <FilePickerCard
                                icon={<FileVideo className="h-4 w-4" />}
                                title="Replace / Add Video"
                                accept="video/mp4,video/webm,video/ogg"
                                buttonLabel="Choose Video"
                                files={lesson.newVideoFile ? [lesson.newVideoFile] : []}
                                emptyLabel="No new video selected"
                                inputId={`lesson-${lesson.id}-video`}
                                onChange={(files) =>
                                  updateEditingLesson(module.id, lesson.id, {
                                    newVideoFile: files?.[0] || null,
                                  })
                                }
                              />
                              <FilePickerCard
                                icon={<Upload className="h-4 w-4" />}
                                title="Add Support Files"
                                accept=".pdf,.png,.jpg,.jpeg,.gif,.webp,.ppt,.pptx,.doc,.docx,.txt,.csv,.xls,.xlsx,.zip"
                                multiple
                                buttonLabel="Choose Files"
                                files={lesson.newFiles}
                                emptyLabel="No new support files selected"
                                inputId={`lesson-${lesson.id}-files`}
                                onChange={(files) =>
                                  updateEditingLesson(module.id, lesson.id, {
                                    newFiles: Array.from(files || []),
                                  })
                                }
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowEditModal(false);
                    setEditingCourse(null);
                  }}
                >
                  Cancel
                </Button>
                <Button onClick={handleSaveEditor} disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        )}

        {showDeleteModal && selectedCourse && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
            <div className="w-full max-w-md rounded-2xl border border-border bg-card p-6 shadow-2xl">
              <div className="mb-6 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
                  <Trash2 className="h-5 w-5 text-destructive" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-text-primary">
                    Delete Course
                  </h2>
                  <p className="text-xs text-text-secondary">
                    This action cannot be undone
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-destructive/20 bg-destructive/10 p-4">
                <p className="text-sm text-text-primary">
                  Are you sure you want to delete{" "}
                  <span className="font-medium">{selectedCourse.title}</span>?
                </p>
              </div>

              <div className="mt-6 flex justify-end gap-3">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowDeleteModal(false);
                    setSelectedCourse(null);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleDelete}
                  disabled={isSubmitting}
                  className="bg-destructive hover:bg-destructive/90"
                >
                  {isSubmitting ? "Deleting..." : "Delete Course"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
