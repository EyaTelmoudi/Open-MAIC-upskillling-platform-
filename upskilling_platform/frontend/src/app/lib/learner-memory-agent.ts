import { existsSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

const DEFAULT_SERVICE_URL =
  process.env.LEARNER_MEMORY_AGENT_URL || "http://127.0.0.1:8014";
const DEFAULT_HINDSIGHT_URL = process.env.HINDSIGHT_URL || "http://127.0.0.1:8888";
const DEFAULT_HINDSIGHT_API_KEY = process.env.HINDSIGHT_API_KEY || "";
const SERVICE_STATE_KEY = "__learnerMemoryAgentServiceState";

function oneLinePreview(value: unknown, limit = 320) {
  const text = String(value ?? "").replace(/\r/g, " ").replace(/\n/g, " ").trim();
  if (text.length <= limit) {
    return text;
  }
  return `${text.slice(0, limit - 3)}...`;
}

export type LearnerLessonMemoryPayload = {
  tenantId: string;
  userId: string;
  courseId: string;
  courseTitle?: string | null;
  lessonId: string;
  lessonTitle?: string | null;
  moduleId?: string | null;
  moduleTitle?: string | null;
  lessonContentType?: string | null;
  lessonDurationMinutes?: number | null;
  lessonOrder?: number | null;
  assessmentId?: string | null;
  eventType?: string | null;
  quizId?: string | null;
  quizPassed?: boolean | null;
  quizScore?: number | null;
  wrongAnswers?: Array<Record<string, unknown>>;
  lessonReferenceIds?: string[];
  supportReferences?: Array<{
    title?: string | null;
    url?: string | null;
  }>;
};

type LearnerLessonMemoryResult = {
  success: boolean;
  workflowName: string;
  action: string;
  tenantId: string;
  userId: string;
  courseId: string;
  lessonId: string;
  bankId?: string;
  bankCreated?: boolean;
  capturedAt?: string;
  memoryContent?: string;
  error?: string;
};

type ServiceState = {
  process: ChildProcessByStdio<null, Readable, Readable> | null;
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
  return path.join(repoRoot, "agents", "learner-memory");
}

function pythonHasLearnerMemoryRuntime(pythonExecutable: string) {
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
  const candidates = [
    path.join(repoRoot, "agents", "learner-memory", ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, "agents", "course-memory", ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, "agents", "chat-coach", ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, "agents", "course-maker", ".venv", "Scripts", "python.exe"),
    "python",
  ];

  for (const candidate of candidates) {
    if (candidate !== "python" && !existsSync(candidate)) {
      continue;
    }
    if (pythonHasLearnerMemoryRuntime(candidate)) {
      return candidate;
    }
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

function killProcessOnPort(port: number) {
  if (process.platform !== "win32") {
    return;
  }

  const lookup = spawnSync(
    "powershell",
    [
      "-NoProfile",
      "-Command",
      `Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess`,
    ],
    {
      encoding: "utf8",
      windowsHide: true,
    },
  );

  if (lookup.status !== 0 || !lookup.stdout) {
    return;
  }

  const processIds = Array.from(
    new Set(
      lookup.stdout
        .split(/\r?\n/)
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );

  for (const processId of processIds) {
    spawnSync("taskkill", ["/PID", processId, "/F"], {
      stdio: "ignore",
      windowsHide: true,
    });
  }
}

async function stopExistingLearnerMemoryService() {
  const state = getServiceState();
  const activeProcess = state.process;
  if (!activeProcess || activeProcess.killed || activeProcess.exitCode !== null) {
    state.process = null;
    return;
  }

  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (!settled) {
        settled = true;
        resolve();
      }
    };

    activeProcess.once("exit", () => {
      state.process = null;
      finish();
    });

    try {
      activeProcess.kill();
    } catch {
      finish();
      return;
    }

    setTimeout(() => {
      state.process = null;
      finish();
    }, 1500);
  });
}

export async function ensureLearnerMemoryAgentService() {
  if (await isServiceHealthy()) {
    return true;
  }

  const state = getServiceState();
  if (state.process && !state.process.killed && state.process.exitCode === null) {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      if (await isServiceHealthy()) {
        return true;
      }
      await sleep(250);
    }
  }

  await stopExistingLearnerMemoryService();
  killProcessOnPort(8014);

  if (!state.process || state.process.killed || state.process.exitCode !== null) {
    const repoRoot = resolveRepoRoot();
    const pythonExecutable = resolveAgentPython(repoRoot);
    const workspace = resolveAgentWorkspace(repoRoot);
    const scriptPath = path.join(workspace, "app", "run_agent_os_service.py");

    console.log(`[Agno Learner Memory Agent] Booting AgentOS service with ${pythonExecutable}.`);

    const child = spawn(pythonExecutable, [scriptPath], {
      cwd: workspace,
      stdio: ["ignore", "pipe", "pipe"],
    });
    state.process = child;

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");

    child.stdout.on("data", (chunk: string) => {
      process.stdout.write(chunk);
    });

    child.stderr.on("data", (chunk: string) => {
      process.stdout.write(chunk);
    });

    child.on("exit", (code, signal) => {
      console.error(
        `[Agno Learner Memory Agent] AgentOS service exited before becoming healthy. code=${code ?? "null"} signal=${signal ?? "null"}`,
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

  console.error("[Agno Learner Memory Agent] AgentOS health check timed out.");
  return false;
}

export async function retainLearnerLessonMemory(
  payload: LearnerLessonMemoryPayload,
): Promise<LearnerLessonMemoryResult> {
  if (!(await ensureLearnerMemoryAgentService())) {
    throw new Error("The Learner Memory AgentOS service is not available.");
  }

  console.log(
    "[Agno Learner Memory Agent] Sending learner lesson memory capture request. "
      + `tenantId=${payload.tenantId} userId=${payload.userId} courseId=${payload.courseId} lessonId=${payload.lessonId} event=${payload.eventType || "lesson_opened"}`,
  );
  console.log(
    "[Agno Learner Memory Agent] Lesson references prepared: "
      + `${oneLinePreview(JSON.stringify(payload.lessonReferenceIds || []))}`,
  );
  console.log(
    "[Agno Learner Memory Agent] Support references prepared: "
      + `${oneLinePreview(JSON.stringify(payload.supportReferences || []))}`,
  );
  if ((payload.eventType || "") === "quiz_completed") {
    console.log(
      "[Agno Learner Memory Agent] Quiz result prepared: "
        + `${oneLinePreview(JSON.stringify({
          quizId: payload.quizId || payload.assessmentId || null,
          quizPassed: payload.quizPassed ?? null,
          quizScore: payload.quizScore ?? null,
          wrongAnswersCount: Array.isArray(payload.wrongAnswers) ? payload.wrongAnswers.length : 0,
        }))}`,
    );
  }

  const response = await fetch(`${DEFAULT_SERVICE_URL}/v1/learner-memory/retain-lesson-event`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      eventType: payload.eventType || "lesson_opened",
      hindsightApiUrl: DEFAULT_HINDSIGHT_URL,
      hindsightApiKey: DEFAULT_HINDSIGHT_API_KEY,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!data) {
    throw new Error("The Learner Memory Agent service did not return a valid JSON response.");
  }

  const result = data as LearnerLessonMemoryResult;
  if (!response.ok) {
    throw new Error(result.error || "The Learner Memory Agent service returned an error.");
  }

  if (!result.success) {
    throw new Error(result.error || "The Learner Memory Agent workflow failed.");
  }

  console.log(
    "[Agno Learner Memory Agent] Learner lesson memory capture finished successfully. "
      + `bankId=${result.bankId || "unknown"} bankCreated=${String(result.bankCreated ?? false)}`,
  );
  if (result.memoryContent) {
    if ((payload.eventType || "") === "course_enrollment_completed") {
      console.log("[Agno Learner Memory Agent] Retained course-completion memory content:");
    } else if ((payload.eventType || "") === "quiz_completed") {
      console.log("[Agno Learner Memory Agent] Retained quiz-result memory content:");
    } else {
      console.log("[Agno Learner Memory Agent] Retained lesson-completion memory content:");
    }
    console.log(result.memoryContent);
  }

  return result;
}
