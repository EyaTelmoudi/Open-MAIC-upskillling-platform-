import { existsSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";

const DEFAULT_SERVICE_URL = process.env.COURSE_MEMORY_AGENT_URL || "http://127.0.0.1:8011";
const SERVICE_STATE_KEY = "__courseMemoryAgentServiceState";
const DEFAULT_LEARNING_URL =
  process.env.NEXT_PUBLIC_LEARNING_URL || process.env.LEARNING_URL || "http://localhost:8002";

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
