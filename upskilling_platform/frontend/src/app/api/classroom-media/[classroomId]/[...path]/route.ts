import fs from "node:fs";
import path from "node:path";

import { Client as MinioClient } from "minio";

const MIME_TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".ogg": "audio/ogg",
  ".aac": "audio/aac",
};

let minioClient: MinioClient | null = null;
let dotenvCache: Record<string, string> | null = null;

function env(name: string) {
  const value = process.env[name];
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return readDotenvValue(name);
}

function readDotenvValue(name: string) {
  if (!dotenvCache) {
    dotenvCache = {};
    const candidateFiles = [
      path.join(process.cwd(), "..", ".env"),
      path.join(process.cwd(), "..", ".env.local"),
      path.join(process.cwd(), "..", ".env.example"),
      path.join(process.cwd(), "..", "..", ".env"),
      path.join(process.cwd(), "..", "..", ".env.local"),
    ];

    for (const filePath of candidateFiles) {
      if (!fs.existsSync(filePath)) {
        continue;
      }

      const content = fs.readFileSync(filePath, "utf8");
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) {
          continue;
        }
        const separatorIndex = trimmed.indexOf("=");
        if (separatorIndex <= 0) {
          continue;
        }
        const key = trimmed.slice(0, separatorIndex).trim();
        const rawValue = trimmed.slice(separatorIndex + 1).trim();
        const unquoted = rawValue.replace(/^['"]|['"]$/g, "");
        if (key && !(key in dotenvCache)) {
          dotenvCache[key] = unquoted;
        }
      }
    }
  }

  return dotenvCache[name] || "";
}

function getBucketName() {
  return env("OPENMAIC_MINIO_BUCKET") || env("MINIO_BUCKET_OPENMAIC") || "openmaic-assets";
}

function getMinioClient() {
  if (minioClient) {
    return minioClient;
  }

  const rawEndpoint =
    env("OPENMAIC_MINIO_ENDPOINT") || env("MINIO_ENDPOINT_LOCAL") || env("MINIO_ENDPOINT");
  if (!rawEndpoint) {
    throw new Error("OpenMAIC MinIO endpoint is not configured.");
  }

  const normalized = rawEndpoint.replace(/^https?:\/\//i, "");
  const [hostPart, portPart] = normalized.split(":", 2);
  const host =
    !env("OPENMAIC_MINIO_ENDPOINT") && !env("MINIO_ENDPOINT_LOCAL") && hostPart === "minio"
      ? "localhost"
      : hostPart;
  const port = Number(portPart || env("OPENMAIC_MINIO_PORT") || 9000);
  const accessKey = env("OPENMAIC_MINIO_ACCESS_KEY") || env("MINIO_ACCESS_KEY");
  const secretKey = env("OPENMAIC_MINIO_SECRET_KEY") || env("MINIO_SECRET_KEY");
  const useSSL = (env("OPENMAIC_MINIO_USE_SSL") || env("MINIO_SECURE") || "false").toLowerCase() === "true";

  if (!host || !accessKey || !secretKey) {
    throw new Error("OpenMAIC MinIO credentials are incomplete.");
  }

  minioClient = new MinioClient({
    endPoint: host,
    port,
    useSSL,
    accessKey,
    secretKey,
  });

  return minioClient;
}

function getContentType(objectKey: string) {
  const extensionIndex = objectKey.lastIndexOf(".");
  const extension = extensionIndex >= 0 ? objectKey.slice(extensionIndex).toLowerCase() : "";
  return MIME_TYPES[extension] || "application/octet-stream";
}

function isValidClassroomId(classroomId: string) {
  return /^[A-Za-z0-9_-]+$/.test(classroomId);
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ classroomId: string; path: string[] }> },
) {
  try {
    const { classroomId, path } = await params;
    if (!isValidClassroomId(classroomId)) {
      return Response.json({ error: "Invalid classroom ID" }, { status: 400 });
    }

    const joinedPath = path.join("/");
    if (!joinedPath || joinedPath.includes("..") || path.some((segment) => segment.includes("\0"))) {
      return Response.json({ error: "Invalid classroom media path" }, { status: 400 });
    }

    const topDir = path[0];
    if (topDir !== "audio" && topDir !== "media" && topDir !== "references") {
      return Response.json({ error: "Invalid classroom media path" }, { status: 404 });
    }

    const objectKey = `classrooms/${classroomId}/${joinedPath}`;
    const client = getMinioClient();
    const bucket = getBucketName();
    const stat = await client.statObject(bucket, objectKey);
    const stream = await client.getObject(bucket, objectKey);
    const headers = new Headers({
      "Content-Type": getContentType(objectKey),
      "Content-Length": String(stat.size),
      "Cache-Control": "public, max-age=86400, immutable",
    });

    const webStream = new ReadableStream<Uint8Array>({
      start(controller) {
        stream.on("data", (chunk: Buffer | string) => {
          controller.enqueue(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        });
        stream.on("end", () => controller.close());
        stream.on("error", (error) => controller.error(error));
      },
      cancel() {
        stream.destroy?.();
      },
    });

    return new Response(webStream, {
      status: 200,
      headers,
    });
  } catch (error) {
    const code =
      error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code || "") : "";
    if (code === "NotFound" || code === "NoSuchKey" || code === "ENOENT") {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    console.error("[Classroom Media] Failed to serve classroom media:", error);
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Failed to serve classroom media",
      },
      { status: 500 },
    );
  }
}
