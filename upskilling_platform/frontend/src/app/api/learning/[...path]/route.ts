import {
  buildLearningApiPath,
  buildLearningServiceUrl,
  getLearningServiceAuthHeaders,
} from "@/app/lib/learning-service-proxy";
import { deleteManagedCourse } from "@/app/lib/course-deletion";

function buildTargetUrl(pathSegments: string[], request: Request) {
  const incomingUrl = new URL(request.url);
  const incomingPathname = incomingUrl.pathname;
  const path = `/${pathSegments.join("/")}`;
  const shouldKeepTrailingSlash =
    incomingPathname.endsWith("/") ||
    path === "/courses";
  const normalizedPath = shouldKeepTrailingSlash && !path.endsWith("/")
    ? `${path}/`
    : path;
  const apiPath = buildLearningApiPath(normalizedPath);
  const url = new URL(buildLearningServiceUrl(apiPath));
  url.search = incomingUrl.search;
  return url.toString();
}

async function proxyToLearning(request: Request, pathSegments: string[]) {
  const method = request.method.toUpperCase();
  const targetUrl = buildTargetUrl(pathSegments, request);
  const incomingHeaders = getLearningServiceAuthHeaders(request) as Record<string, string>;
  const outboundHeaders = new Headers();

  if (incomingHeaders.Authorization) {
    outboundHeaders.set("Authorization", incomingHeaders.Authorization);
  }

  const init: RequestInit = {
    method,
    headers: outboundHeaders,
    cache: "no-store",
    redirect: "follow",
  };

  if (!["GET", "HEAD"].includes(method)) {
    const contentType = request.headers.get("content-type") || "";
    if (contentType.toLowerCase().includes("multipart/form-data")) {
      const incomingFormData = await request.formData();
      const outboundFormData = new FormData();
      for (const [key, value] of incomingFormData.entries()) {
        if (typeof value === "string") {
          outboundFormData.append(key, value);
        } else {
          outboundFormData.append(key, value, value.name);
        }
      }
      init.body = outboundFormData;
    } else {
      const bodyBuffer = await request.arrayBuffer();
      if (bodyBuffer.byteLength > 0) {
        init.body = bodyBuffer;
      }
    }
    if (contentType && !contentType.toLowerCase().includes("multipart/form-data")) {
      outboundHeaders.set("Content-Type", contentType);
    }
  }

  const response = await fetch(targetUrl, init);
  const responseHeaders = new Headers();
  const contentType = response.headers.get("content-type");
  const contentDisposition = response.headers.get("content-disposition");

  if (contentType) {
    responseHeaders.set("Content-Type", contentType);
  }
  if (contentDisposition) {
    responseHeaders.set("Content-Disposition", contentDisposition);
  }

  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyToLearning(request, path);
}

export async function POST(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyToLearning(request, path);
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyToLearning(request, path);
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  return proxyToLearning(request, path);
}

export async function DELETE(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  if (path.length === 2 && path[0] === "courses" && path[1]) {
    return deleteManagedCourse(request, path[1]);
  }
  return proxyToLearning(request, path);
}
