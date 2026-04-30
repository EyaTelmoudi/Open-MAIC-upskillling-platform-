export const OPENMAIC_BASE_URL =
  process.env.OPENMAIC_BASE_URL || "http://localhost:3000";

export function buildOpenMAICUrl(path: string): string {
  const base = OPENMAIC_BASE_URL.replace(/\/$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${base}${normalizedPath}`;
}
