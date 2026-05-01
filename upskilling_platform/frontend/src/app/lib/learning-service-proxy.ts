export const LEARNING_SERVICE_BASE_URL =
  process.env.LEARNING_SERVICE_BASE_URL ||
  process.env.NEXT_PUBLIC_LEARNING_URL ||
  "http://localhost:8002";

export function buildLearningServiceUrl(path: string): string {
  const base = LEARNING_SERVICE_BASE_URL.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}

export function buildLearningApiPath(path: string): string {
  if (path.startsWith("/api/v1")) return path;
  return `/api/v1${path.startsWith("/") ? path : `/${path}`}`;
}

export function getLearningServiceAuthHeaders(request: Request): HeadersInit {
  const headers: HeadersInit = {
    "Content-Type": "application/json",
  };

  const authorization = request.headers.get("authorization");
  if (authorization) {
    headers.Authorization = authorization;
    return headers;
  }

  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
  if (match?.[1]) {
    headers.Authorization = `Bearer ${decodeURIComponent(match[1])}`;
  }

  return headers;
}
