import { existsSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";

const DEFAULT_SERVICE_URL = process.env.COURSE_MEMORY_AGENT_URL || "http://127.0.0.1:8011";
const SERVICE_STATE_KEY = "__courseMemoryAgentServiceState";
const DEFAULT_LEARNING_URL =
  process.env.NEXT_PUBLIC_LEARNING_URL || process.env.LEARNING_URL || "http://localhost:8002";
const DEFAULT_HINDSIGHT_URL = process.env.HINDSIGHT_URL || "http://127.0.0.1:8888";
const DEFAULT_HINDSIGHT_API_KEY = process.env.HINDSIGHT_API_KEY || "";

type CourseMemoryPayload = {
  courseId: string;
  learningApiUrl: string;
  authToken: string;
  tenantId?: string | null;
  requesterUserId?: string | null;
  requesterName?: string | null;
  supplementalSources?: Array<{
    kind?: string | null;
    title?: string | null;
    text: string;
  }>;
};

type CourseMemoryResult = {
  success: boolean;
  workflowName: string;
  action: string;
  courseId: string;
  bankId?: string;
  isAsync?: boolean;
  operationId?: string;
  operationIds?: string[];
  retainResponse?: Record<string, unknown>;
  assembledPayload?: Record<string, unknown>;
  error?: string;
};

type HindsightDocumentListResponse = {
  items?: Array<{ document_id?: string }>;
  documents?: Array<{ document_id?: string }>;
};

function parseSceneLikeContent(rawContent: unknown): Record<string, unknown> | null {
  if (typeof rawContent !== "string") {
    return rawContent && typeof rawContent === "object" ? (rawContent as Record<string, unknown>) : null;
  }

  const trimmed = rawContent.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

function getPredictedCourseDocumentIds(
  courseId: string,
  courseDetails?: {
    modules?: Array<{
      lessons?: Array<{ id?: string; content?: string | null }>;
    }>;
  } | null,
) {
  const documentIds = new Set<string>([
    `course:${courseId}:overview`,
    `course:${courseId}:source:1`,
  ]);

  for (const module of courseDetails?.modules || []) {
    for (const lesson of module.lessons || []) {
      const lessonId = String(lesson.id || "").trim();
      if (!lessonId) continue;

      documentIds.add(`course:${courseId}:lesson:${lessonId}`);

      const parsed = parseSceneLikeContent(lesson.content);
      const contentBlock =
        parsed && typeof parsed.content === "object" && parsed.content
          ? (parsed.content as Record<string, unknown>)
          : null;
      const questions = Array.isArray(contentBlock?.questions)
        ? (contentBlock?.questions as Array<Record<string, unknown>>)
        : [];

      for (const question of questions) {
        const questionId = String(question?.id || "").trim();
        if (!questionId) continue;
        documentIds.add(`course:${courseId}:lesson:${lessonId}:quiz:${questionId}`);
      }
    }
  }

  return Array.from(documentIds);
}

type ServiceState = {
  process: ChildProcessWithoutNullStreams | null;
};

function getServiceState() {
  const globalScope = globalThis as typeof globalThis & {
    [SERVICE_STATE_KEY]?: ServiceState;
  };

  if (!globalScope[SERVICE_STATE_KEY]) {
    globalScope[SERVICE_STATE_KEY] = { process: null };
  }

  return globalScope[SERVICE_STATE_KEY];
}

function resolveRepoRoot() {
  return path.resolve(process.cwd(), "..", "..");
}

function resolveAgentWorkspace(repoRoot: string) {
  return path.join(repoRoot, "agents", "course-memory");
}

function pythonHasCourseMemoryRuntime(pythonExecutable: string) {
  const probe = spawnSync(
    pythonExecutable,
    ["-c", "import agno, fastapi, httpx, pydantic, uvicorn"],
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );

  return probe.status === 0;
}

function resolveAgentPython(repoRoot: string) {
  const courseMemoryPython = path.join(
    repoRoot,
    "agents",
    "course-memory",
    ".venv",
    "Scripts",
    "python.exe",
  );

  if (existsSync(courseMemoryPython) && pythonHasCourseMemoryRuntime(courseMemoryPython)) {
    return courseMemoryPython;
  }

  const courseMakerPython = path.join(
    repoRoot,
    "agents",
    "course-maker",
    ".venv",
    "Scripts",
    "python.exe",
  );

  if (existsSync(courseMakerPython) && pythonHasCourseMemoryRuntime(courseMakerPython)) {
    return courseMakerPython;
  }

  if (pythonHasCourseMemoryRuntime("python")) {
    return "python";
  }

  return "python";
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServiceHealthy() {
  try {
    const response = await fetch(`${DEFAULT_SERVICE_URL}/health`, { cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}

export async function ensureCourseMemoryAgentService() {
  if (await isServiceHealthy()) {
    return true;
  }

  const state = getServiceState();
  if (!state.process || state.process.killed || state.process.exitCode !== null) {
    const repoRoot = resolveRepoRoot();
    const pythonExecutable = resolveAgentPython(repoRoot);
    const workspace = resolveAgentWorkspace(repoRoot);
    const scriptPath = path.join(workspace, "app", "run_agent_os_service.py");

    console.log(
      `[Agno Course Memory Agent] Booting AgentOS service with ${pythonExecutable}.`,
    );

    state.process = spawn(pythonExecutable, [scriptPath], {
      cwd: workspace,
      stdio: ["ignore", "pipe", "pipe"],
    });

    state.process.stdout.setEncoding("utf8");
    state.process.stderr.setEncoding("utf8");

    state.process.stdout.on("data", (chunk: string) => {
      process.stdout.write(chunk);
    });

    state.process.stderr.on("data", (chunk: string) => {
      process.stdout.write(chunk);
    });

    state.process.on("exit", (code, signal) => {
      console.error(
        `[Agno Course Memory Agent] AgentOS service exited before becoming healthy. code=${code ?? "null"} signal=${signal ?? "null"}`,
      );
      state.process = null;
    });
  }

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await isServiceHealthy()) {
      return true;
    }
    await sleep(250);
  }

  console.error("[Agno Course Memory Agent] AgentOS health check timed out.");
  return false;
}

function getTokenFromRequest(request: Request) {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length);
  }

  const cookie = request.headers.get("cookie") || "";
  const match = cookie.match(/(?:^|;\s*)access_token=([^;]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

function decodeJwtClaims(token: string | null): { sub?: string; email?: string; role?: string } | null {
  if (!token) {
    return null;
  }

  try {
    const [, payload] = token.split(".");
    if (!payload) {
      return null;
    }

    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as { sub?: string; email?: string; role?: string };
  } catch {
    return null;
  }
}

function getHindsightHeaders() {
  const headers: HeadersInit = {};
  if (DEFAULT_HINDSIGHT_API_KEY) {
    headers["Authorization"] = `Bearer ${DEFAULT_HINDSIGHT_API_KEY}`;
  }
  return headers;
}

function buildCourseBankId(tenantId: string, courseId: string) {
  return `tenant:${tenantId.trim()}:course:${courseId}`;
}

function buildLegacyTenantCoursesBankId(tenantId: string) {
  return `tenant:${tenantId.trim()}:courses`;
}

export async function assemblePublishedCourseForMemory(
  request: Request,
  courseId: string,
  tenantId?: string | null,
  supplementalSources?: Array<{
    kind?: string | null;
    title?: string | null;
    text: string;
  }>,
): Promise<CourseMemoryResult> {
  console.log(
    `[Agno Course Memory Agent] Starting action "retain_published_course_knowledge" for course ${courseId}.`,
  );

  if (!(await ensureCourseMemoryAgentService())) {
    throw new Error("The Course Memory AgentOS service is not available.");
  }

  const authToken = getTokenFromRequest(request);
  if (!authToken) {
    throw new Error("The Course Memory Agent could not find the current auth token.");
  }
  const claims = decodeJwtClaims(authToken);

  const payload: CourseMemoryPayload = {
    courseId,
    learningApiUrl: `${DEFAULT_LEARNING_URL}/api/v1/courses/${courseId}`,
    authToken,
    tenantId,
    requesterUserId: claims?.sub ?? null,
    requesterName: claims?.email ?? null,
    supplementalSources:
      supplementalSources?.filter((source) => source.text.trim()).map((source) => ({
        kind: source.kind?.trim() || "supplemental_course_source",
        title: source.title?.trim() || null,
        text: source.text.trim(),
      })) || [],
  };

  const response = await fetch(`${DEFAULT_SERVICE_URL}/v1/course-memory/assemble`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error("The Course Memory Agent service did not return a valid response.");
  }

  const result = data as CourseMemoryResult;
  if (!result.success) {
    throw new Error(result.error || "The Course Memory Agent workflow failed.");
  }

  if (result.bankId && result.isAsync && result.operationId) {
    console.log(
      `[Agno Course Memory Agent] Hindsight retain queued for course ${courseId}. Bank: ${result.bankId}. Operation: ${result.operationId}.`,
    );
  } else if (result.bankId) {
    console.log(
      `[Agno Course Memory Agent] Hindsight retain succeeded for course ${courseId}. Bank: ${result.bankId}.`,
    );
  }

  console.log(
    `[Agno Course Memory Agent] Finished action "retain_published_course_knowledge" for course ${courseId}.`,
  );

  return result;
}

export async function deletePublishedCourseMemory(
  courseId: string,
  tenantId?: string | null,
  courseDetails?: {
    modules?: Array<{
      lessons?: Array<{ id?: string; content?: string | null }>;
    }>;
  } | null,
): Promise<{ success: boolean; deletedDocuments: string[]; bankId?: string }> {
  if (!tenantId?.trim()) {
    return { success: true, deletedDocuments: [] };
  }

  const predictedDocumentIds = getPredictedCourseDocumentIds(courseId, courseDetails);
  const bankIds = [
    buildCourseBankId(tenantId, courseId),
    buildLegacyTenantCoursesBankId(tenantId),
  ];
  const deletedDocuments = new Set<string>();

  for (const bankId of bankIds) {
    const query = new URLSearchParams({
      q: `course:${courseId}:`,
      limit: "200",
      offset: "0",
    });

    let listedDocumentIds: string[] = [];
    try {
      const listResponse = await fetch(
        `${DEFAULT_HINDSIGHT_URL}/v1/default/banks/${encodeURIComponent(bankId)}/documents?${query.toString()}`,
        {
          method: "GET",
          cache: "no-store",
          headers: getHindsightHeaders(),
        },
      );

      if (listResponse.ok) {
        const listed = (await listResponse.json().catch(() => null)) as HindsightDocumentListResponse | null;
        const rawDocuments = listed?.items || listed?.documents || [];
        listedDocumentIds = rawDocuments
          .map((item) => String(item?.document_id || "").trim())
          .filter((documentId) => documentId.startsWith(`course:${courseId}:`));
      } else {
        console.warn(
          `[Agno Course Memory Agent] Failed to list Hindsight documents in bank ${bankId} for course ${courseId}. Falling back to predicted document IDs.`,
        );
      }
    } catch {
      console.warn(
        `[Agno Course Memory Agent] Hindsight document listing failed in bank ${bankId} for course ${courseId}. Falling back to predicted document IDs.`,
      );
    }

    const documentIds = Array.from(new Set([...predictedDocumentIds, ...listedDocumentIds]));

    for (const documentId of documentIds) {
      try {
        const deleteResponse = await fetch(
          `${DEFAULT_HINDSIGHT_URL}/v1/default/banks/${encodeURIComponent(bankId)}/documents/${encodeURIComponent(documentId)}`,
          {
            method: "DELETE",
            cache: "no-store",
            headers: getHindsightHeaders(),
          },
        );

        if (deleteResponse.ok) {
          deletedDocuments.add(`${bankId}:${documentId}`);
        } else if (deleteResponse.status !== 404) {
          console.warn(
            `[Agno Course Memory Agent] Failed to delete Hindsight document ${documentId} from bank ${bankId} for course ${courseId}. status=${deleteResponse.status}`,
          );
        }
      } catch (error) {
        console.warn(
          `[Agno Course Memory Agent] Failed to delete Hindsight document ${documentId} from bank ${bankId} for course ${courseId}.`,
          error,
        );
      }
    }
  }

  return {
    success: true,
    deletedDocuments: Array.from(deletedDocuments),
    bankId: buildCourseBankId(tenantId, courseId),
  };
}
