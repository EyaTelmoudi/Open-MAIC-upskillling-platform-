import { LEARNING_URL } from "@/app/lib/api";

function encodeObjectPath(objectName: string) {
  return objectName
    .split("/")
    .map((part) => encodeURIComponent(decodeURIComponent(part)))
    .join("/");
}

export function buildStoredMediaReference(upload: { bucket: string; object_name: string }) {
  return `minio://${upload.bucket}/${upload.object_name}`;
}

export function resolveStoredMediaUrl(value?: string | null) {
  if (!value) {
    return "";
  }

  if (value.startsWith("minio://")) {
    const remainder = value.slice("minio://".length);
    const slashIndex = remainder.indexOf("/");
    if (slashIndex > 0) {
      const bucket = remainder.slice(0, slashIndex);
      const objectName = remainder.slice(slashIndex + 1);
      return `${LEARNING_URL}/api/v1/content/media/${bucket}/${encodeObjectPath(objectName)}`;
    }
  }

  return value;
}
