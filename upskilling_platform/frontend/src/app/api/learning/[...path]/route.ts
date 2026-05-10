import path from "node:path";
import { spawn } from "node:child_process";

import {
  buildLearningApiPath,
  buildLearningServiceUrl,
  getLearningServiceAuthHeaders,
} from "@/app/lib/learning-service-proxy";
import {
  assemblePublishedCourseForMemory,
} from "@/app/lib/course-memory-agent";
import { deleteManagedCourse } from "@/app/lib/course-deletion";

const DEFAULT_HINDSIGHT_URL = process.env.HINDSIGHT_URL || "http://127.0.0.1:8888";
const DEFAULT_HINDSIGHT_API_KEY = process.env.HINDSIGHT_API_KEY || "";

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

async function extractPdfText(buffer: Buffer): Promise<string> {
  const scriptPath = path.join(
    process.cwd(),
    "src",
    "app",
    "lib",
    "scripts",
    "extract_pdf_text.py",
  );

  return new Promise((resolve, reject) => {
    const child = spawn("python", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.on("error", reject);

    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

      if (code !== 0) {
        reject(new Error(stderr || stdout || "Failed to extract PDF text."));
        return;
      }

      try {
        const payload = JSON.parse(stdout) as { text?: string; error?: string };
        if (payload.error) {
          reject(new Error(payload.error));
          return;
        }
        resolve((payload.text || "").trim());
      } catch {
        reject(new Error("The PDF extraction helper returned invalid JSON."));
      }
    });

    child.stdin.write(buffer);
    child.stdin.end();
  });
}

function normalizeExtractedPdfText(value: string) {
  return value
    .replace(/\s*\n\s*/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function decodeHtmlEntities(value: string) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

function stripHtml(value?: string | null) {
  if (!value) {
    return "";
  }
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function extractSupportDocumentsFromHtml(content?: string | null) {
  const source = String(content || "");
  const links = Array.from(
    source.matchAll(/<a[^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi),
  );

  return links.map((match) => {
    const url = decodeHtmlEntities(match[1] || "").trim();
    const title = decodeHtmlEntities(stripHtml(match[2] || "")).trim();
    const lowerUrl = url.toLowerCase();
    const lowerTitle = title.toLowerCase();
    const kind = lowerUrl.includes(".pdf") || lowerTitle.endsWith(".pdf")
      ? "pdf"
      : lowerUrl.includes(".mp4") || lowerTitle.endsWith(".mp4")
        ? "video"
        : "resource";

    return {
      title: title || url.split("/").pop() || "resource",
      url,
      kind,
    };
  });
}

function resolveSupportDocumentFetchUrl(documentUrl: string) {
  try {
    const parsed = new URL(documentUrl);
    if (parsed.hostname !== "minio") {
      return documentUrl;
    }

    const pathname = parsed.pathname.replace(/^\/+/, "");
    if (!pathname) {
      return documentUrl;
    }

    return buildLearningServiceUrl(buildLearningApiPath(`/content/media/${pathname}`));
  } catch {
    return documentUrl;
  }
}

async function enrichSupportDocumentsWithPdfText(
  supportDocuments: Array<{ title: string; url: string; kind: string }>,
): Promise<Array<{ title: string; url: string; kind: string; extractedText?: string | null }>> {
  const enriched: Array<{ title: string; url: string; kind: string; extractedText?: string | null }> = [];

  for (const document of supportDocuments) {
    if (document.kind !== "pdf") {
      enriched.push(document);
      continue;
    }

    try {
      const response = await fetch(resolveSupportDocumentFetchUrl(document.url), {
        method: "GET",
        cache: "no-store",
      });
      if (!response.ok) {
        enriched.push({ ...document, extractedText: null });
        continue;
      }

      const pdfBuffer = Buffer.from(await response.arrayBuffer());
      const extractedText = normalizeExtractedPdfText(await extractPdfText(pdfBuffer));
      enriched.push({
        ...document,
        extractedText: extractedText || null,
      });
    } catch {
      enriched.push({ ...document, extractedText: null });
    }
  }

  return enriched;
}

async function loadCourseContextForLog(
  request: Request,
  courseId: string,
): Promise<{
  courseType: "traditional" | "ai_generated";
  tenantId: string | null;
}> {
  const incomingHeaders = getLearningServiceAuthHeaders(request) as Record<string, string>;
  const headers = new Headers();
  if (incomingHeaders.Authorization) {
    headers.set("Authorization", incomingHeaders.Authorization);
  }

  try {
    const response = await fetch(
      buildLearningServiceUrl(buildLearningApiPath(`/courses/${courseId}`)),
      {
        method: "GET",
        headers,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return { courseType: "traditional", tenantId: null };
    }

    const course = (await response.json().catch(() => null)) as
      | {
          tenant_id?: string | null;
          category?: string | null;
          description?: string | null;
        }
      | null;

    const category = String(course?.category || "").toLowerCase();
    const description = String(course?.description || "").toLowerCase();
    return {
      courseType:
        category.includes("ai") || description.includes("ai-generated") ? "ai_generated" : "traditional",
      tenantId: String(course?.tenant_id || "").trim() || null,
    };
  } catch {
    return { courseType: "traditional", tenantId: null };
  }
}

async function loadPublishedCourseDataForLog(request: Request, courseId: string): Promise<Record<string, unknown> | null> {
  const incomingHeaders = getLearningServiceAuthHeaders(request) as Record<string, string>;
  const headers = new Headers();
  if (incomingHeaders.Authorization) {
    headers.set("Authorization", incomingHeaders.Authorization);
  }

  try {
    const response = await fetch(
      buildLearningServiceUrl(buildLearningApiPath(`/courses/${courseId}/memory-curriculum`)),
      {
        method: "GET",
        headers,
        cache: "no-store",
      },
    );

    if (!response.ok) {
      return null;
    }

    const course = (await response.json().catch(() => null)) as
      | {
              id?: string;
              tenant_id?: string | null;
              title?: string | null;
              description?: string | null;
          category?: string | null;
          difficulty?: string | null;
          duration?: number | null;
          xp_reward?: number | null;
          modules?: Array<{
            id?: string;
            title?: string | null;
            description?: string | null;
            order?: number | null;
              lessons?: Array<{
                id?: string;
                title?: string | null;
                content?: string | null;
                video_url?: string | null;
                content_type?: string | null;
                duration?: number | null;
                order?: number | null;
                assessment_id?: string | null;
                quiz_questions?: Array<{
                  id?: string;
                  text?: string | null;
                  type?: string | null;
                  options?: string[] | null;
                  correct_answer?: string | null;
                  points?: number | null;
                  order?: number | null;
                }>;
              }>;
          }>;
        }
      | null;

    if (!course) {
      return null;
    }

    const modules = [];
    for (const module of course.modules || []) {
      const lessons = [];
      for (const lesson of module.lessons || []) {
        const supportDocuments = await enrichSupportDocumentsWithPdfText(
          extractSupportDocumentsFromHtml(lesson.content),
        );

        lessons.push({
          lessonId: lesson.id || null,
          title: lesson.title || null,
          content: lesson.content || null,
          videoUrl: lesson.video_url || null,
          contentType: lesson.content_type || null,
          duration: lesson.duration ?? null,
          order: lesson.order ?? null,
          assessmentId: lesson.assessment_id || null,
          quizQuestions: (lesson.quiz_questions || []).map((question) => ({
            questionId: question.id || null,
            question: question.text || null,
            type: question.type || null,
            options: question.options || [],
            correctAnswer: question.correct_answer || null,
            points: question.points ?? null,
            order: question.order ?? null,
          })),
          supportDocuments,
        });
      }

      modules.push({
        moduleId: module.id || null,
        title: module.title || null,
        description: module.description || null,
        order: module.order ?? null,
        lessonCount: lessons.length,
        lessons,
      });
    }

    return {
      courseId: course.id || courseId,
      tenantId: course.tenant_id || null,
      title: course.title || null,
      description: course.description || null,
      category: course.category || null,
      difficulty: course.difficulty || null,
      duration: course.duration ?? null,
      xpReward: course.xp_reward ?? null,
      modulesCount: modules.length,
      lessonsCount: modules.reduce((total, module) => total + Number(module.lessonCount || 0), 0),
      modules,
    };
  } catch {
    return null;
  }
}

function buildCourseBankId(tenantId: string, courseId: string) {
  return `tenant:${tenantId}:course:${courseId}`;
}

async function ensurePublishedCourseBankProfile(
  tenantId: string,
  courseId: string,
  headers: Headers,
) {
  const bankId = buildCourseBankId(tenantId, courseId);
  await fetch(`${DEFAULT_HINDSIGHT_URL}/v1/default/banks/${encodeURIComponent(bankId)}`, {
    method: "PUT",
    cache: "no-store",
    headers,
    body: JSON.stringify({
      name: `Tenant ${tenantId} Course ${courseId}`,
      background: `Published course knowledge for course ${courseId} in tenant ${tenantId}.`,
      retain_mission:
        "Store published course knowledge for this single course so future course support agents can answer learner questions accurately without mixing other courses.",
      reflect_mission:
        "Answer course questions using retained published course knowledge for this course only.",
      metadata: {
        tenantId,
        courseId,
        isPublished: true,
      },
      isPublished: true,
    }),
  });
}

function extractSupplementalSourceFromOriginalText(originalText: string) {
  const text = String(originalText || "").trim();
  if (!text.includes("Supplemental Course Source:")) {
    return null;
  }

  const lines = text.split(/\r?\n/);
  const sourceTitleLine = lines.find((line) => line.startsWith("Supplemental Course Source:")) || "";
  const title = sourceTitleLine.split(":", 2)[1]?.trim() || "Supplemental Source";
  const sourceIndex = lines.findIndex((line) => line === sourceTitleLine);
  const content = lines.slice(sourceIndex + 1).join("\n").trim();

  return {
    title,
    text: content ? normalizeExtractedPdfText(content) : null,
  };
}

async function loadSupplementalSourcesForLog(
  tenantId: string,
  courseId: string,
): Promise<Array<{ title: string; text: string | null }>> {
  const headers = new Headers();
  if (DEFAULT_HINDSIGHT_API_KEY) {
    headers.set("Authorization", `Bearer ${DEFAULT_HINDSIGHT_API_KEY}`);
  }

  try {
    const bankId = buildCourseBankId(tenantId, courseId);
    const listResponse = await fetch(
      `${DEFAULT_HINDSIGHT_URL}/v1/default/banks/${bankId}/documents?limit=200&offset=0`,
      {
        method: "GET",
        headers,
        cache: "no-store",
      },
    );

    if (!listResponse.ok) {
      return [];
    }

    const listed = (await listResponse.json().catch(() => null)) as
      | { items?: Array<{ id?: string }> }
      | null;
    const sourceDocumentIds = (listed?.items || [])
      .map((item) => String(item?.id || "").trim())
      .filter((id) => id.includes(":source:"));

    const sources: Array<{ title: string; text: string | null }> = [];
    for (const documentId of sourceDocumentIds) {
      const detailResponse = await fetch(
        `${DEFAULT_HINDSIGHT_URL}/v1/default/banks/${bankId}/documents/${documentId}`,
        {
          method: "GET",
          headers,
          cache: "no-store",
        },
      );

      if (!detailResponse.ok) {
        continue;
      }

      const detail = (await detailResponse.json().catch(() => null)) as
        | { original_text?: string | null }
        | null;
      const source = extractSupplementalSourceFromOriginalText(detail?.original_text || "");
      if (source) {
        sources.push(source);
      }
    }

    return sources;
  } catch {
    return [];
  }
}

function isCoursePublishMutation(pathSegments: string[]) {
  return pathSegments[0] === "courses" && pathSegments[2] === "publish" && Boolean(pathSegments[1]);
}

function isCourseEditMutation(pathSegments: string[]) {
  return pathSegments[0] === "courses" && pathSegments.length === 2 && Boolean(pathSegments[1]);
}

function buildCourseOverviewRetainPreviewLog(publishedCourseData: Record<string, unknown>) {
  const courseId = String(publishedCourseData.courseId || "").trim() || "unknown";
  const modules = Array.isArray(publishedCourseData.modules) ? publishedCourseData.modules : [];
  const moduleTitles = modules
    .map((module) =>
      module && typeof module === "object" ? String((module as { title?: unknown }).title || "").trim() : "",
    )
    .filter(Boolean);
  const objectives = moduleTitles.length
    ? moduleTitles.map((title) => `Understand ${title}`)
    : ["Aucun objectif global explicite"];

  return [
    "Contenu du premier retain de course overview",
    "Course Overview",
    `document_id: course:${courseId}:overview`,
    "update_mode: replace",
    `titre: ${String(publishedCourseData.title || "Untitled course")}`,
    `description: ${String(publishedCourseData.description || "Aucune description")}`,
    `difficulte: ${String(publishedCourseData.difficulty || "Unknown")}`,
    `duree: ${
      publishedCourseData.duration !== null && publishedCourseData.duration !== undefined
        ? String(publishedCourseData.duration)
        : "Unknown"
    }`,
    "modules:",
    ...(moduleTitles.length ? moduleTitles.map((title) => `- ${title}`) : ["- Aucun module"]),
    "objectifs pedagogiques globaux:",
    ...objectives.map((objective) => `- ${objective}`),
  ].join("\n");
}

function isQuizEntry(lesson: Record<string, unknown>) {
  if (String(lesson.assessmentId || "").trim()) {
    return true;
  }
  if (Array.isArray(lesson.quizQuestions) && lesson.quizQuestions.length > 0) {
    return true;
  }
  return String(lesson.contentType || "").trim().toLowerCase() === "quiz";
}

function buildLessonRetainPreviewLogs(publishedCourseData: Record<string, unknown>) {
  const courseId = String(publishedCourseData.courseId || "").trim() || "unknown";
  const modules = Array.isArray(publishedCourseData.modules) ? publishedCourseData.modules : [];
  const lessons: Array<Record<string, unknown>> = [];

  for (const module of modules) {
    if (!module || typeof module !== "object") {
      continue;
    }
    const moduleLessons = Array.isArray((module as { lessons?: unknown[] }).lessons)
      ? ((module as { lessons?: unknown[] }).lessons as Array<Record<string, unknown>>)
      : [];
    lessons.push(...moduleLessons);
  }

  return lessons.map((lesson, index) => {
    if (isQuizEntry(lesson)) {
      return null;
    }
    const lessonId = String(lesson.lessonId || "").trim() || "unknown";
    const supportDocuments = Array.isArray(lesson.supportDocuments)
      ? (lesson.supportDocuments as Array<Record<string, unknown>>)
      : [];
    const supportLines: string[] = [];
    if (supportDocuments.length) {
      supportLines.push("supports:");
      for (const document of supportDocuments) {
        supportLines.push(
          `- ${String(document.title || "Support document")} (${String(document.kind || "resource")})`,
        );
        const extractedText = stripHtml(String(document.extractedText || ""));
        if (extractedText) {
          supportLines.push(`  contenu extrait: ${extractedText}`);
        }
      }
    }

    return {
      label: `[Agno Course Memory Agent] Prepared lesson ${index + 1} retain preview:`,
      content: [
        "Lesson Content",
        `document_id: course:${courseId}:lesson:${lessonId}`,
        "update_mode: replace",
        `titre: ${String(lesson.title || "Untitled lesson")}`,
        `contenu HTML nettoye: ${stripHtml(String(lesson.content || "")) || "No cleaned lesson content"}`,
        `type: ${String(lesson.contentType || "unknown")}`,
        `duree: ${
          lesson.duration !== null && lesson.duration !== undefined ? String(lesson.duration) : "Unknown"
        }`,
        ...supportLines,
      ].join("\n"),
    };
  }).filter((value): value is { label: string; content: string } => Boolean(value));
}

function buildQuizRetainPreviewLogs(publishedCourseData: Record<string, unknown>) {
  const courseId = String(publishedCourseData.courseId || "").trim() || "unknown";
  const modules = Array.isArray(publishedCourseData.modules) ? publishedCourseData.modules : [];
  const quizzes: Array<Record<string, unknown>> = [];

  for (const module of modules) {
    if (!module || typeof module !== "object") {
      continue;
    }
    const moduleLessons = Array.isArray((module as { lessons?: unknown[] }).lessons)
      ? ((module as { lessons?: unknown[] }).lessons as Array<Record<string, unknown>>)
      : [];
    quizzes.push(...moduleLessons.filter((lesson) => lesson && typeof lesson === "object" && isQuizEntry(lesson as Record<string, unknown>)));
  }

  return quizzes.map((lesson, index) => {
    const lessonId = String(lesson.lessonId || "").trim() || "unknown";
    const quizQuestions = Array.isArray(lesson.quizQuestions)
      ? (lesson.quizQuestions as Array<Record<string, unknown>>)
      : [];
    const questionLines: string[] = [];
    for (const [questionIndex, question] of quizQuestions.entries()) {
      questionLines.push(`question ${questionIndex + 1}: ${String(question.question || "")}`);
      const options = Array.isArray(question.options) ? question.options.map((value) => String(value || "").trim()).filter(Boolean) : [];
      if (options.length) {
        questionLines.push(`options: ${options.join(", ")}`);
      }
      if (String(question.correctAnswer || "").trim()) {
        questionLines.push(`bonne reponse: ${String(question.correctAnswer || "").trim()}`);
      }
    }

    return {
      label: `[Agno Course Memory Agent] Prepared quiz ${index + 1} retain preview:`,
      content: [
        "Quiz Content",
        `document_id: course:${courseId}:lesson:${lessonId}:quiz`,
        "update_mode: replace",
        `titre: ${String(lesson.title || "Untitled quiz")}`,
        `duree: ${lesson.duration !== null && lesson.duration !== undefined ? String(lesson.duration) : "Unknown"}`,
        ...questionLines,
      ].join("\n"),
    };
  });
}

function buildSupplementalSourceRetainPreviewLogs(publishedCourseData: Record<string, unknown>) {
  const courseId = String(publishedCourseData.courseId || "").trim() || "unknown";
  const supplementalSources = Array.isArray(publishedCourseData.supplementalSources)
    ? (publishedCourseData.supplementalSources as Array<Record<string, unknown>>)
    : [];

  return supplementalSources.map((source, index) => ({
    label: `[Agno Course Memory Agent] Prepared supplemental source ${index + 1} retain preview:`,
    content: [
      "Supplemental Source",
      `document_id: course:${courseId}:source:${index + 1}`,
      "update_mode: replace",
      `titre: ${String(source.title || "Supplemental Source")}`,
      `contenu: ${String(source.text || "").trim() || "No supplemental source content"}`,
    ].join("\n"),
  }));
}

function buildLessonRetainDocuments(publishedCourseData: Record<string, unknown>) {
  const courseId = String(publishedCourseData.courseId || "").trim() || "unknown";
  const tenantId = String(publishedCourseData.tenantId || "").trim() || "unknown";
  const courseTitle = String(publishedCourseData.title || "").trim() || "Untitled course";
  const modules = Array.isArray(publishedCourseData.modules) ? publishedCourseData.modules : [];
  const documents: Array<Record<string, unknown>> = [];

  for (const module of modules) {
    if (!module || typeof module !== "object") {
      continue;
    }
    const moduleId = String((module as { moduleId?: unknown }).moduleId || "").trim();
    const moduleTitle = String((module as { title?: unknown }).title || "").trim();
    const moduleLessons = Array.isArray((module as { lessons?: unknown[] }).lessons)
      ? ((module as { lessons?: unknown[] }).lessons as Array<Record<string, unknown>>)
      : [];

    for (const lesson of moduleLessons) {
      if (isQuizEntry(lesson)) {
        continue;
      }
      const lessonId = String(lesson.lessonId || "").trim();
      if (!lessonId) {
        continue;
      }

      const supportDocuments = Array.isArray(lesson.supportDocuments)
        ? (lesson.supportDocuments as Array<Record<string, unknown>>)
        : [];
      const supportLines: string[] = [];
      if (supportDocuments.length) {
        supportLines.push("Lesson Support Materials:");
        for (const document of supportDocuments) {
          supportLines.push(
            `- Title: ${String(document.title || "Support document")}`,
          );
          supportLines.push(
            `  Kind: ${String(document.kind || "resource")}`,
          );
          const extractedText = stripHtml(String(document.extractedText || ""));
          if (extractedText) {
            supportLines.push(`  Extracted Content: ${extractedText}`);
          }
        }
      }

      documents.push({
        content: [
          `Lesson Title: ${String(lesson.title || "Untitled lesson")}`,
          `Lesson Content: ${stripHtml(String(lesson.content || "")) || "No cleaned lesson content"}`,
          `Lesson Type: ${String(lesson.contentType || "unknown")}`,
          `Lesson Duration (minutes): ${
            lesson.duration !== null && lesson.duration !== undefined ? String(lesson.duration) : "Unknown"
          }`,
          ...supportLines,
        ].join("\n"),
        context: "published course lesson knowledge",
        document_id: `course:${courseId}:lesson:${lessonId}`,
        update_mode: "replace",
        metadata: {
          tenantId,
          courseId,
          courseTitle,
          lessonId,
          lessonTitle: String(lesson.title || ""),
          moduleId,
          moduleTitle,
          assessmentId: String(lesson.assessmentId || ""),
          contentType: String(lesson.contentType || "lesson_knowledge"),
        },
        tags: [
          `tenant:${tenantId}`,
          `course:${courseId}`,
          `lesson:${lessonId}`,
          "content:lesson_knowledge",
        ],
      });
    }
  }

  return documents;
}

function buildQuizRetainDocuments(publishedCourseData: Record<string, unknown>) {
  const courseId = String(publishedCourseData.courseId || "").trim() || "unknown";
  const tenantId = String(publishedCourseData.tenantId || "").trim() || "unknown";
  const courseTitle = String(publishedCourseData.title || "").trim() || "Untitled course";
  const modules = Array.isArray(publishedCourseData.modules) ? publishedCourseData.modules : [];
  const documents: Array<Record<string, unknown>> = [];

  for (const module of modules) {
    if (!module || typeof module !== "object") {
      continue;
    }
    const moduleId = String((module as { moduleId?: unknown }).moduleId || "").trim();
    const moduleTitle = String((module as { title?: unknown }).title || "").trim();
    const moduleLessons = Array.isArray((module as { lessons?: unknown[] }).lessons)
      ? ((module as { lessons?: unknown[] }).lessons as Array<Record<string, unknown>>)
      : [];

    for (const lesson of moduleLessons) {
      if (!isQuizEntry(lesson)) {
        continue;
      }
      const lessonId = String(lesson.lessonId || "").trim();
      if (!lessonId) {
        continue;
      }
      const quizQuestions = Array.isArray(lesson.quizQuestions)
        ? (lesson.quizQuestions as Array<Record<string, unknown>>)
        : [];
      const questionLines: string[] = [];
      for (const [questionIndex, question] of quizQuestions.entries()) {
        questionLines.push(`Question ${questionIndex + 1}: ${String(question.question || "")}`);
        const options = Array.isArray(question.options) ? question.options.map((value) => String(value || "").trim()).filter(Boolean) : [];
        if (options.length) {
          questionLines.push(`Options: ${options.join(", ")}`);
        }
        if (String(question.correctAnswer || "").trim()) {
          questionLines.push(`Correct Answer: ${String(question.correctAnswer || "").trim()}`);
        }
      }

      documents.push({
        content: [
          `Course Title: ${courseTitle}`,
          `Quiz Title: ${String(lesson.title || "Untitled quiz")}`,
          `Quiz Duration (minutes): ${
            lesson.duration !== null && lesson.duration !== undefined ? String(lesson.duration) : "Unknown"
          }`,
          ...questionLines,
        ].join("\n"),
        context: "published course quiz knowledge",
        document_id: `course:${courseId}:lesson:${lessonId}:quiz`,
        update_mode: "replace",
        metadata: {
          tenantId,
          courseId,
          courseTitle,
          lessonId,
          lessonTitle: String(lesson.title || ""),
          moduleId,
          moduleTitle,
          assessmentId: String(lesson.assessmentId || ""),
          contentType: "quiz_knowledge",
        },
        tags: [
          `tenant:${tenantId}`,
          `course:${courseId}`,
          `lesson:${lessonId}`,
          "content:quiz_knowledge",
        ],
      });
    }
  }

  return documents;
}

function buildSupplementalSourceRetainDocuments(publishedCourseData: Record<string, unknown>) {
  const courseId = String(publishedCourseData.courseId || "").trim() || "unknown";
  const tenantId = String(publishedCourseData.tenantId || "").trim() || "unknown";
  const courseTitle = String(publishedCourseData.title || "").trim() || "Untitled course";
  const supplementalSources = Array.isArray(publishedCourseData.supplementalSources)
    ? (publishedCourseData.supplementalSources as Array<Record<string, unknown>>)
    : [];

  return supplementalSources.map((source, index) => ({
    content: [
      `Course Title: ${courseTitle}`,
      `Supplemental Course Source: ${String(source.title || "Supplemental Source")}`,
      String(source.text || "").trim() || "No supplemental source content",
    ].join("\n"),
    context: "supplemental course source knowledge",
    document_id: `course:${courseId}:source:${index + 1}`,
    update_mode: "replace",
    metadata: {
      tenantId,
      courseId,
      courseTitle,
      sourceTitle: String(source.title || "Supplemental Source"),
      contentType: "supplemental_course_source",
    },
    tags: [
      `tenant:${tenantId}`,
      `course:${courseId}`,
      "content:supplemental_course_source",
    ],
  }));
}

async function retainLessonDocumentsInHindsight(
  publishedCourseData: Record<string, unknown>,
  onBeforeRetain?: (document: Record<string, unknown>, index: number) => void,
) {
  const tenantId = String(publishedCourseData.tenantId || "").trim();
  const courseId = String(publishedCourseData.courseId || "").trim();
  if (!tenantId || !courseId) {
    return [];
  }

  const bankId = buildCourseBankId(tenantId, courseId);
  const headers = new Headers({ "Content-Type": "application/json" });
  if (DEFAULT_HINDSIGHT_API_KEY) {
    headers.set("Authorization", `Bearer ${DEFAULT_HINDSIGHT_API_KEY}`);
  }

  await ensurePublishedCourseBankProfile(tenantId, courseId, headers);

  const lessonDocuments = buildLessonRetainDocuments(publishedCourseData);
  const operationIds: string[] = [];

  for (const [index, lessonDocument] of lessonDocuments.entries()) {
    const documentId = String(lessonDocument.document_id || "").trim();
    onBeforeRetain?.(lessonDocument, index);
    console.log(`[Agno Course Memory Agent] Starting lesson retain operation for ${documentId}.`);
    const retainResponse = await fetch(
      `${DEFAULT_HINDSIGHT_URL}/v1/default/banks/${encodeURIComponent(bankId)}/memories`,
      {
        method: "POST",
        cache: "no-store",
        headers,
        body: JSON.stringify({
          items: [lessonDocument],
          async: true,
        }),
      },
    );

    const retainPayload = (await retainResponse.json().catch(() => null)) as
      | { operation_id?: string; operation_ids?: string[] }
      | null;
    if (!retainResponse.ok) {
      throw new Error(`Lesson retain failed for ${documentId} with status ${retainResponse.status}`);
    }

    const ids = [
      String(retainPayload?.operation_id || "").trim(),
      ...((retainPayload?.operation_ids || []).map((value) => String(value || "").trim())),
    ].filter(Boolean);
    operationIds.push(...ids);
    console.log(
      `[Agno Course Memory Agent] Completed lesson retain operation for ${documentId}. operation_ids=${
        ids.length ? ids.join(", ") : "none"
      }`,
    );
  }

  return Array.from(new Set(operationIds));
}

async function retainQuizDocumentsInHindsight(
  publishedCourseData: Record<string, unknown>,
  onBeforeRetain?: (document: Record<string, unknown>, index: number) => void,
) {
  const tenantId = String(publishedCourseData.tenantId || "").trim();
  const courseId = String(publishedCourseData.courseId || "").trim();
  if (!tenantId || !courseId) {
    return [];
  }

  const bankId = buildCourseBankId(tenantId, courseId);
  const headers = new Headers({ "Content-Type": "application/json" });
  if (DEFAULT_HINDSIGHT_API_KEY) {
    headers.set("Authorization", `Bearer ${DEFAULT_HINDSIGHT_API_KEY}`);
  }
  await ensurePublishedCourseBankProfile(tenantId, courseId, headers);

  const quizDocuments = buildQuizRetainDocuments(publishedCourseData);
  const operationIds: string[] = [];

  for (const [index, quizDocument] of quizDocuments.entries()) {
    const documentId = String(quizDocument.document_id || "").trim();
    onBeforeRetain?.(quizDocument, index);
    console.log(`[Agno Course Memory Agent] Starting quiz retain operation for ${documentId}.`);
    const retainResponse = await fetch(
      `${DEFAULT_HINDSIGHT_URL}/v1/default/banks/${encodeURIComponent(bankId)}/memories`,
      {
        method: "POST",
        cache: "no-store",
        headers,
        body: JSON.stringify({
          items: [quizDocument],
          async: true,
        }),
      },
    );

    const retainPayload = (await retainResponse.json().catch(() => null)) as
      | { operation_id?: string; operation_ids?: string[] }
      | null;
    if (!retainResponse.ok) {
      throw new Error(`Quiz retain failed for ${documentId} with status ${retainResponse.status}`);
    }

    const ids = [
      String(retainPayload?.operation_id || "").trim(),
      ...((retainPayload?.operation_ids || []).map((value) => String(value || "").trim())),
    ].filter(Boolean);
    operationIds.push(...ids);
    console.log(
      `[Agno Course Memory Agent] Completed quiz retain operation for ${documentId}. operation_ids=${
        ids.length ? ids.join(", ") : "none"
      }`,
    );
  }

  return Array.from(new Set(operationIds));
}

async function retainSupplementalSourceDocumentsInHindsight(
  publishedCourseData: Record<string, unknown>,
  onBeforeRetain?: (document: Record<string, unknown>, index: number) => void,
) {
  const tenantId = String(publishedCourseData.tenantId || "").trim();
  const courseId = String(publishedCourseData.courseId || "").trim();
  if (!tenantId || !courseId) {
    return [];
  }

  const bankId = buildCourseBankId(tenantId, courseId);
  const headers = new Headers({ "Content-Type": "application/json" });
  if (DEFAULT_HINDSIGHT_API_KEY) {
    headers.set("Authorization", `Bearer ${DEFAULT_HINDSIGHT_API_KEY}`);
  }
  await ensurePublishedCourseBankProfile(tenantId, courseId, headers);

  const sourceDocuments = buildSupplementalSourceRetainDocuments(publishedCourseData);
  const operationIds: string[] = [];

  for (const [index, sourceDocument] of sourceDocuments.entries()) {
    const documentId = String(sourceDocument.document_id || "").trim();
    onBeforeRetain?.(sourceDocument, index);
    console.log(`[Agno Course Memory Agent] Starting supplemental source retain operation for ${documentId}.`);
    const retainResponse = await fetch(
      `${DEFAULT_HINDSIGHT_URL}/v1/default/banks/${encodeURIComponent(bankId)}/memories`,
      {
        method: "POST",
        cache: "no-store",
        headers,
        body: JSON.stringify({
          items: [sourceDocument],
          async: true,
        }),
      },
    );

    const retainPayload = (await retainResponse.json().catch(() => null)) as
      | { operation_id?: string; operation_ids?: string[] }
      | null;
    if (!retainResponse.ok) {
      throw new Error(`Supplemental source retain failed for ${documentId} with status ${retainResponse.status}`);
    }

    const ids = [
      String(retainPayload?.operation_id || "").trim(),
      ...((retainPayload?.operation_ids || []).map((value) => String(value || "").trim())),
    ].filter(Boolean);
    operationIds.push(...ids);
    console.log(
      `[Agno Course Memory Agent] Completed supplemental source retain operation for ${documentId}. operation_ids=${
        ids.length ? ids.join(", ") : "none"
      }`,
    );
  }

  return Array.from(new Set(operationIds));
}

async function syncCourseMemoryAfterMutation(
  request: Request,
  method: string,
  pathSegments: string[],
  response: Response,
): Promise<void> {
  if (!response.ok) {
    return;
  }

  const isPublishMutation = isCoursePublishMutation(pathSegments);
  const isEditMutation = isCourseEditMutation(pathSegments) && method.toUpperCase() === "PUT";
  if (!isPublishMutation && !isEditMutation) {
    return;
  }

  const courseId = pathSegments[1];
  if (!courseId) {
    return;
  }

  const { courseType, tenantId: courseTenantId } = await loadCourseContextForLog(request, courseId);

  if (isEditMutation) {
    console.log(
      `[Agno Course Memory Agent] Course-memory workflow launched successfully for editing course ${courseId}.`,
    );
  } else {
    const publishPayload = (await response.clone().json().catch(() => null)) as Record<string, unknown> | null;
    if (publishPayload?.is_published !== true) {
      console.log(
        `[Agno Course Memory Agent] Course-memory workflow launched successfully for unpublished ${courseType} course ${courseId}.`,
      );
      return;
    }

    console.log(
      `[Agno Course Memory Agent] Course-memory workflow launched successfully for published ${courseType} course ${courseId}.`,
    );
  }

  try {
    const courseMemoryResult = await assemblePublishedCourseForMemory(
      request,
      courseId,
      courseTenantId || null,
      undefined,
      undefined,
      isEditMutation,
    );
    if (courseMemoryResult.skipCourseRetention) {
      return;
    }
    return;
  } catch (error) {
    console.error(
      `[Agno Course Memory Agent] Retain workflow failed for course ${courseId}: ${
        error instanceof Error ? error.message : "Unknown error"
      }`,
    );
  }
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
  const response = await proxyToLearning(request, path);
  await syncCourseMemoryAfterMutation(request, request.method, path, response);
  return response;
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const response = await proxyToLearning(request, path);
  await syncCourseMemoryAfterMutation(request, request.method, path, response);
  return response;
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
) {
  const { path } = await context.params;
  const response = await proxyToLearning(request, path);
  await syncCourseMemoryAfterMutation(request, request.method, path, response);
  return response;
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
