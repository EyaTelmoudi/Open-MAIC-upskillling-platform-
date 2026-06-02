"use client";

import { useEffect, useState } from "react";
import { ImagePlus, X } from "lucide-react";

import { Button } from "@/app/components/ui/Button";
import { resolveStoredMediaUrl } from "@/app/lib/media";

type CourseThumbnailFieldProps = {
  inputId: string;
  currentUrl?: string | null;
  file: File | null;
  onFileChange: (file: File | null) => void;
  onRemove: () => void;
};

export function CourseThumbnailField({
  inputId,
  currentUrl,
  file,
  onFileChange,
  onRemove,
}: CourseThumbnailFieldProps) {
  const [filePreviewUrl, setFilePreviewUrl] = useState("");

  useEffect(() => {
    if (!file) {
      setFilePreviewUrl("");
      return;
    }

    const nextPreviewUrl = URL.createObjectURL(file);
    setFilePreviewUrl(nextPreviewUrl);

    return () => URL.revokeObjectURL(nextPreviewUrl);
  }, [file]);

  const previewUrl = filePreviewUrl || resolveStoredMediaUrl(currentUrl);
  const hasThumbnail = Boolean(previewUrl);

  return (
    <div className="space-y-2 md:col-span-2">
      <label className="text-xs font-medium text-text-secondary">Course thumbnail</label>
      <div className="grid gap-3 rounded-2xl border border-border bg-background p-3 sm:grid-cols-[220px_1fr]">
        <div className="aspect-video overflow-hidden rounded-xl border border-border bg-card">
          {hasThumbnail ? (
            <img src={previewUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-[linear-gradient(135deg,rgba(14,163,122,0.08),rgba(14,165,233,0.08))] text-text-secondary">
              <ImagePlus className="h-8 w-8" />
            </div>
          )}
        </div>
        <div className="flex min-w-0 flex-col justify-center gap-3">
          <div>
            <p className="text-sm font-medium text-text-primary">Optional learner card image</p>
            <p className="mt-1 text-xs leading-5 text-text-secondary">
              Upload a 16:9 image. It will be saved in MinIO and shown on course cards.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input
              id={inputId}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(event) => onFileChange(event.target.files?.[0] || null)}
            />
            <label
              htmlFor={inputId}
              className="inline-flex h-9 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-border bg-transparent px-3 text-sm font-medium text-text-primary transition-colors hover:bg-card"
            >
              <ImagePlus className="h-4 w-4" />
              {hasThumbnail ? "Replace thumbnail" : "Choose thumbnail"}
            </label>
            {hasThumbnail ? (
              <Button type="button" variant="ghost" size="sm" onClick={onRemove}>
                <X className="mr-2 h-4 w-4" />
                Remove
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
