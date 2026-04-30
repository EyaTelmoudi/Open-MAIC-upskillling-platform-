"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/app/components/layout/AdminShell";
import { Button } from "@/app/components/ui/Button";
import { api, LEARNING_URL } from "@/app/lib/api";
import { cn } from "@/app/lib/utils";
import {
  AlertCircle,
  CheckCircle,
  File,
  FileText,
  FileVideo,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  PlayCircle,
  Presentation,
  RefreshCw,
  Trash2,
  Upload,
  ExternalLink,
  X,
} from "lucide-react";

type BucketName =
  | "course-videos"
  | "course-pdfs"
  | "course-slides"
  | "course-images"
  | "course-files";

interface CourseSummary {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
}

interface ContentItem {
  object_name: string;
  bucket: BucketName;
  size: number;
  content_type: string;
  last_modified: string;
}

interface UploadResult {
  id: string;
  object_name: string;
  bucket: BucketName;
  filename: string;
  url: string;
}

interface CourseAsset extends ContentItem {
  courseId: string;
  filename: string;
}

interface CourseStats {
  totalFiles: number;
  totalSize: number;
  videos: number;
  pdfs: number;
  slides: number;
  images: number;
  otherFiles: number;
}

interface CourseContentGroup {
  course: CourseSummary;
  files: CourseAsset[];
  previewUrl: string | null;
  stats: CourseStats;
}

interface MediaPreviewState {
  title: string;
  url: string;
  type: "image" | "video";
}

const BUCKETS: Array<{
  name: BucketName;
  label: string;
  icon: typeof File;
  color: string;
}> = [
  { name: "course-videos", label: "Videos", icon: FileVideo, color: "text-emerald-700" },
  { name: "course-pdfs", label: "PDFs", icon: FileText, color: "text-rose-700" },
  { name: "course-slides", label: "Slides", icon: Presentation, color: "text-amber-700" },
  { name: "course-images", label: "Images", icon: ImageIcon, color: "text-sky-700" },
  { name: "course-files", label: "Files", icon: File, color: "text-slate-700" },
];

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function emptyStats(): CourseStats {
  return {
    totalFiles: 0,
    totalSize: 0,
    videos: 0,
    pdfs: 0,
    slides: 0,
    images: 0,
    otherFiles: 0,
  };
}

function parseCourseIdFromObjectName(objectName: string): string | null {
  const parts = objectName.split("/");
  const coursesIndex = parts.indexOf("courses");
  if (coursesIndex === -1 || parts.length <= coursesIndex + 1) {
    return null;
  }
  return parts[coursesIndex + 1];
}

function getFilename(objectName: string): string {
  const parts = objectName.split("/");
  return parts[parts.length - 1] || objectName;
}

function encodeObjectPath(objectName: string): string {
  return objectName
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function getProxyMediaUrl(bucket: BucketName, objectName: string): string {
  return `${LEARNING_URL}/api/v1/content/media/${bucket}/${encodeObjectPath(objectName)}`;
}

function bucketToStatKey(bucket: BucketName): keyof CourseStats {
  switch (bucket) {
    case "course-videos":
      return "videos";
    case "course-pdfs":
      return "pdfs";
    case "course-slides":
      return "slides";
    case "course-images":
      return "images";
    default:
      return "otherFiles";
  }
}

function SectionCard({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string;
  value: string | number;
  icon: typeof File;
  color: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50", color)}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-slate-500">{label}</p>
          <p className="text-xl font-bold text-slate-950">{value}</p>
        </div>
      </div>
    </div>
  );
}

export default function ContentManagementPage() {
  const [courses, setCourses] = useState<CourseContentGroup[]>([]);
  const [selectedCourseId, setSelectedCourseId] = useState("");
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<MediaPreviewState | null>(null);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const selectedCourse = useMemo(
    () => courses.find((course) => course.course.id === selectedCourseId) || null,
    [courses, selectedCourseId]
  );

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setMessage(null);
    try {
      const [courseResponse, ...bucketResponses] = await Promise.all([
        api.get<{ items: CourseSummary[] }>("/api/v1/learning/courses/?page=1&page_size=100"),
        ...BUCKETS.map((bucket) =>
          api.get<{ items: ContentItem[] }>(`/api/v1/learning/content/list/${bucket.name}`)
        ),
      ]);

      const courseItems = Array.isArray(courseResponse.items) ? courseResponse.items : [];
      const grouped = new Map<string, CourseContentGroup>();

      courseItems.forEach((course) => {
        grouped.set(course.id, {
          course,
          files: [],
          previewUrl: null,
          stats: emptyStats(),
        });
      });

      bucketResponses.forEach((response) => {
        const files = Array.isArray(response.items) ? response.items : [];
        files.forEach((item) => {
          const courseId = parseCourseIdFromObjectName(item.object_name);
          if (!courseId) {
            return;
          }

          const target = grouped.get(courseId);
          if (!target) {
            return;
          }

          const asset: CourseAsset = {
            ...item,
            courseId,
            filename: getFilename(item.object_name),
          };

          target.files.push(asset);
          target.stats.totalFiles += 1;
          target.stats.totalSize += item.size;
          target.stats[bucketToStatKey(item.bucket)] += 1;
        });
      });

      Array.from(grouped.values()).forEach((group) => {
        const image = group.files.find((file) => file.bucket === "course-images");
        if (image) {
          group.previewUrl = getProxyMediaUrl(image.bucket, image.object_name);
        }
      });

      const nextCourses = courseItems.map((course) => grouped.get(course.id)!);
      setCourses(nextCourses);
      setSelectedCourseId((current) => {
        if (current && nextCourses.some((course) => course.course.id === current)) {
          return current;
        }
        return nextCourses.find((course) => course.stats.totalFiles > 0)?.course.id || nextCourses[0]?.course.id || "";
      });
    } catch (error) {
      console.error("Failed to fetch content data:", error);
      setCourses([]);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Failed to load content data.",
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !selectedCourse) {
      return;
    }

    setUploading(true);
    setMessage(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("course_id", selectedCourse.course.id);
      await api.postForm<UploadResult>("/api/v1/learning/content/upload", formData);
      setMessage({
        type: "success",
        text: `${file.name} was uploaded to ${selectedCourse.course.title}.`,
      });
      await fetchAll();
    } catch (error) {
      console.error("Upload failed:", error);
      setMessage({
        type: "error",
        text: error instanceof Error ? error.message : "Upload failed.",
      });
    } finally {
      setUploading(false);
      event.target.value = "";
    }
  };

  const handleDelete = async (asset: CourseAsset) => {
    if (!confirm(`Delete ${asset.filename}?`)) {
      return;
    }

    try {
      await api.delete(
        `/api/v1/learning/content/${asset.bucket}/${encodeObjectPath(asset.object_name)}`
      );
      setMessage({ type: "success", text: `${asset.filename} was deleted.` });
      await fetchAll();
    } catch (error) {
      console.error("Delete failed:", error);
      setMessage({ type: "error", text: "Failed to delete file." });
    }
  };

  const handleOpenAsset = async (asset: CourseAsset) => {
    try {
      window.open(
        getProxyMediaUrl(asset.bucket, asset.object_name),
        "_blank",
        "noopener,noreferrer"
      );
    } catch (error) {
      console.error("Open asset failed:", error);
      setMessage({ type: "error", text: "Failed to open file." });
    }
  };

  const handlePreviewAsset = async (asset: CourseAsset) => {
    try {
      setMediaPreview({
        title: asset.filename,
        url: getProxyMediaUrl(asset.bucket, asset.object_name),
        type: asset.bucket === "course-videos" ? "video" : "image",
      });
    } catch (error) {
      console.error("Preview asset failed:", error);
      setMessage({ type: "error", text: "Failed to preview media." });
    }
  };

  return (
    <AdminShell>
      <div className="space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => void fetchAll()}
              disabled={loading}
              className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            >
              <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
              Refresh
            </Button>
            <label
              className={cn(
                "inline-flex cursor-pointer items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white",
                (!selectedCourse || uploading) && "cursor-not-allowed opacity-60"
              )}
            >
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading..." : "Upload to Course"}
              <input
                type="file"
                onChange={handleUpload}
                disabled={!selectedCourse || uploading}
                className="hidden"
                accept="video/*,application/pdf,image/*,.ppt,.pptx,.doc,.docx,.xls,.xlsx,.zip,.csv,.txt"
              />
            </label>
          </div>
        </div>

        {message && (
          <div
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-3 text-sm",
              message.type === "success"
                ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border border-red-200 bg-red-50 text-red-700"
            )}
          >
            {message.type === "success" ? (
              <CheckCircle className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        <div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 px-5 py-4">
              <h2 className="text-lg font-semibold text-slate-950">Courses</h2>
              <p className="mt-1 text-sm text-slate-500">
                {courses.length} course(s) in the content library
              </p>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : courses.length === 0 ? (
              <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
                <FolderOpen className="mb-3 h-12 w-12 text-slate-300" />
                <p className="text-lg font-medium text-slate-950">No courses found</p>
                <p className="mt-1 text-sm text-slate-500">
                  Create courses first to organize platform content by course.
                </p>
              </div>
            ) : (
              <div className="max-h-[75vh] space-y-3 overflow-y-auto p-4">
                {courses.map((group) => (
                  <button
                    key={group.course.id}
                    onClick={() => setSelectedCourseId(group.course.id)}
                    className={cn(
                      "w-full rounded-2xl border p-3 text-left transition-colors",
                      selectedCourseId === group.course.id
                        ? "border-emerald-300 bg-emerald-50"
                        : "border-slate-200 bg-slate-50/70 hover:border-emerald-300 hover:bg-white"
                    )}
                  >
                    <div className="mb-3 overflow-hidden rounded-xl bg-slate-100">
                      {group.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={group.previewUrl}
                          alt={group.course.title}
                          className="h-36 w-full cursor-zoom-in object-cover"
                          onClick={(event) => {
                            event.stopPropagation();
                            setMediaPreview({
                              title: group.course.title,
                              url: group.previewUrl!,
                              type: "image",
                            });
                          }}
                        />
                      ) : (
                        <div className="flex h-36 items-center justify-center bg-gradient-to-br from-emerald-100 via-sky-100 to-amber-100">
                          <ImageIcon className="h-10 w-10 text-slate-500" />
                        </div>
                      )}
                    </div>
                    <h3 className="line-clamp-2 text-sm font-semibold text-slate-950">
                      {group.course.title}
                    </h3>
                    <p className="mt-1 text-xs text-slate-500">
                      {group.stats.totalFiles} file(s) • {formatBytes(group.stats.totalSize)}
                    </p>
                  </button>
                ))}
              </div>
            )}
          </aside>

          <section className="space-y-6">
            {!selectedCourse ? (
              <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 text-center shadow-sm">
                <FolderOpen className="mb-4 h-12 w-12 text-slate-300" />
                <h2 className="text-xl font-semibold text-slate-950">Select a course</h2>
                <p className="mt-2 max-w-md text-sm text-slate-500">
                  Choose a course from the left side to see its media summary and attached files.
                </p>
              </div>
            ) : (
              <>
                <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-slate-950">
                        {selectedCourse.course.title}
                      </h2>
                      <p className="mt-2 text-sm text-slate-600">
                        {selectedCourse.course.description || "No description available for this course yet."}
                      </p>
                    </div>
                    {selectedCourse.previewUrl && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={selectedCourse.previewUrl}
                        alt={selectedCourse.course.title}
                        className="hidden h-28 w-44 cursor-zoom-in rounded-xl object-cover lg:block"
                        onClick={() =>
                          setMediaPreview({
                            title: selectedCourse.course.title,
                            url: selectedCourse.previewUrl!,
                            type: "image",
                          })
                        }
                      />
                    )}
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6">
                  <SectionCard label="Total Files" value={selectedCourse.stats.totalFiles} icon={HardDrive} color="text-primary" />
                  <SectionCard label="Total Size" value={formatBytes(selectedCourse.stats.totalSize)} icon={FolderOpen} color="text-secondary" />
                  <SectionCard label="Videos" value={selectedCourse.stats.videos} icon={FileVideo} color="text-primary" />
                  <SectionCard label="PDFs" value={selectedCourse.stats.pdfs} icon={FileText} color="text-destructive" />
                  <SectionCard label="Slides" value={selectedCourse.stats.slides} icon={Presentation} color="text-amber-500" />
                  <SectionCard label="Images" value={selectedCourse.stats.images} icon={ImageIcon} color="text-secondary" />
                </div>

                <div className="space-y-4">
                  {BUCKETS.map((bucket) => {
                    const sectionFiles = selectedCourse.files.filter((file) => file.bucket === bucket.name);
                    if (sectionFiles.length === 0) {
                      return null;
                    }

                    const Icon = bucket.icon;

                      return (
                      <div key={bucket.name} className="rounded-2xl border border-slate-200 bg-white shadow-sm">
                        <div className="border-b border-slate-200 px-5 py-4">
                          <div className="flex items-center gap-2">
                            <Icon className={cn("h-5 w-5", bucket.color)} />
                            <h3 className="text-lg font-semibold text-slate-950">{bucket.label}</h3>
                          </div>
                          <p className="mt-1 text-sm text-slate-500">
                            {sectionFiles.length} item(s)
                          </p>
                        </div>

                        <div className="divide-y divide-slate-200">
                          {sectionFiles.map((asset) => (
                            <div
                              key={`${asset.bucket}-${asset.object_name}`}
                              className="flex flex-col gap-4 px-5 py-4 lg:flex-row lg:items-center lg:justify-between"
                            >
                              <div className="flex items-center gap-4">
                                {asset.bucket === "course-images" && selectedCourse.previewUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={selectedCourse.previewUrl}
                                    alt={asset.filename}
                                    className="h-14 w-20 cursor-zoom-in rounded-lg object-cover"
                                    onClick={() =>
                                      setMediaPreview({
                                        title: asset.filename,
                                        url: selectedCourse.previewUrl!,
                                        type: "image",
                                      })
                                    }
                                  />
                                ) : (
                                  <div
                                    className={cn(
                                      "flex h-12 w-12 items-center justify-center rounded-xl bg-slate-50",
                                      asset.bucket === "course-videos" && "cursor-pointer"
                                    )}
                                    onClick={() => {
                                      if (asset.bucket === "course-videos") {
                                        void handlePreviewAsset(asset);
                                      }
                                    }}
                                  >
                                    <Icon className={cn("h-5 w-5", bucket.color)} />
                                  </div>
                                )}
                                <div>
                                  <p className="font-medium text-slate-950">{asset.filename}</p>
                                  <p className="text-sm text-slate-500">
                                    {formatBytes(asset.size)} • {asset.last_modified?.split("T")[0] || "Unknown date"}
                                  </p>
                                </div>
                              </div>

                              <div className="flex items-center gap-2">
                                {(asset.bucket === "course-images" || asset.bucket === "course-videos") && (
                                  <Button
                                    variant="outline"
                                    className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                                    onClick={() => void handlePreviewAsset(asset)}
                                  >
                                    {asset.bucket === "course-videos" ? (
                                      <PlayCircle className="h-4 w-4" />
                                    ) : (
                                      <ImageIcon className="h-4 w-4" />
                                    )}
                                    Preview
                                  </Button>
                                )}
                                <Button
                                  variant="outline"
                                  className="border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-slate-900"
                                  onClick={() => void handleOpenAsset(asset)}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                  Open
                                </Button>
                                <Button
                                  variant="outline"
                                  className="border-rose-200 bg-white text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                                  onClick={() => void handleDelete(asset)}
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}

                  {selectedCourse.stats.totalFiles === 0 && (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
                      <FolderOpen className="mb-3 h-12 w-12 text-slate-300" />
                      <p className="text-lg font-medium text-slate-950">No media in this course yet</p>
                      <p className="mt-1 text-sm text-slate-500">
                        Use the upload button above to attach files directly to this course.
                      </p>
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </div>

      {mediaPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-6 py-8 backdrop-blur-sm"
          onClick={() => setMediaPreview(null)}
        >
          <div
            className="w-full max-w-5xl rounded-2xl border border-white/10 bg-[#0f172a] p-4 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-white">
                  {mediaPreview.title}
                </p>
                <p className="text-xs text-slate-300">
                  {mediaPreview.type === "video" ? "Video preview" : "Image preview"}
                </p>
              </div>
              <Button variant="outline" onClick={() => setMediaPreview(null)}>
                <X className="h-4 w-4" />
                Close
              </Button>
            </div>

            <div className="overflow-hidden rounded-xl bg-black">
              {mediaPreview.type === "video" ? (
                <video
                  src={mediaPreview.url}
                  controls
                  autoPlay
                  className="max-h-[75vh] w-full bg-black"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mediaPreview.url}
                  alt={mediaPreview.title}
                  className="max-h-[75vh] w-full object-contain"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
