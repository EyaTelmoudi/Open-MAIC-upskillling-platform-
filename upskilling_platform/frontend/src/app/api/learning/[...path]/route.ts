import {
  buildLearningApiPath,
  buildLearningServiceUrl,
  getLearningServiceAuthHeaders,
} from "@/app/lib/learning-service-proxy";

function buildTargetUrl(pathSegments: string[], request: Request) {
  const path = `/${pathSegments.join("/")}`;
  const apiPath = buildLearningApiPath(path);
  const url = new URL(buildLearningServiceUrl(apiPath));
  const incomingUrl = new URL(request.url);
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
    if (contentType.includes("multipart/form-data")) {
      init.body = await request.formData();
    } else {
      const bodyText = await request.text();
      if (bodyText) {
        init.body = bodyText;
      }
      if (contentType) {
        outboundHeaders.set("Content-Type", contentType);
      }
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
  return proxyToLearning(request, path);
}
