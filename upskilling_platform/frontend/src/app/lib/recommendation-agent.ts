import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";

const DEFAULT_SERVICE_URL = process.env.RECOMMENDATION_AGENT_URL || "http://127.0.0.1:8016";
const SERVICE_STATE_KEY = "__recommendationAgentServiceState";
const AGENT_PREFIX = "[Agno Recommendation Agent]";

export type RecommendationSkillGapStartPayload = {
  tenantId?: string | null;
  userId?: string | null;
  source?: "recommendations-page";
  pagePath?: string;
};

export type RecommendationSkillGapStartResult = {
  success: boolean;
  workflowName: string;
  action: string;
  tenantId?: string | null;
  userId?: string | null;
  source?: string | null;
  pagePath?: string | null;
  startedAt?: string;
  status?: string;
  message?: string;
  nextStep?: string;
  skillProfileBankId?: string;
  storagePlan?: {
    hindsightBankId?: string;
    databaseRecordType?: string;
    profileKind?: string;
  };
  error?: string;
};

export type RecommendationFeedStartPayload = {
  tenantId: string;
  userId: string;
  source?: "recommendations-page";
  pagePath?: string;
  skillRadar: Array<{
    skill_domain: string;
    status: string;
    evidence_summary?: string[];
  }>;
  courses: Array<{
    id: string;
    title: string;
    description?: string | null;
    category?: string | null;
    difficulty?: string | null;
    isPublished?: boolean;
  }>;
  enrollments: Array<{
    courseId: string;
    status: string;
    enrolledAt?: string | null;
    completedAt?: string | null;
  }>;
  learnerContexts: Array<{
    courseId: string;
    courseTitle?: string | null;
    currentLessonId?: string | null;
    currentLessonTitle?: string | null;
    lastOpenedLessonId?: string | null;
    lastOpenedLessonTitle?: string | null;
    latestFailedQuizLessonId?: string | null;
    latestFailedQuizLessonTitle?: string | null;
    failedQuizCount?: number;
    progressPercent?: number | null;
  }>;
};

export type RecommendationFeedResult = {
  success: boolean;
  workflowName: string;
  action: string;
  generatedAt?: string;
  recommendations?: Array<Record<string, unknown>>;
  summary?: {
    total?: number;
    highPriority?: number;
    mediumPriority?: number;
    lowPriority?: number;
  };
  error?: string;
};

type ServiceState = {
  process: ChildProcessWithoutNullStreams | null;
};

function agentMessage(message: string) {
  return message.replace("[Agno Recommendation Agent]", AGENT_PREFIX);
}

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
  let current = process.cwd();
  for (let depth = 0; depth < 6; depth += 1) {
    if (
      existsSync(path.join(current, "agents")) &&
      existsSync(path.join(current, "upskilling_platform"))
    ) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  return process.cwd();
}

function resolveAgentWorkspace(repoRoot: string) {
  return path.join(repoRoot, "agents", "recommendation");
}

function loadAgentEnv(repoRoot: string) {
  const envFiles = [
    path.join(repoRoot, ".env.local"),
    path.join(repoRoot, "upskilling_platform", ".env"),
    path.join(repoRoot, "agents", "chat-coach", ".env"),
  ];

  const mergedEnv: Record<string, string> = {};
  for (const envFile of envFiles) {
    if (!existsSync(envFile)) {
      continue;
    }

    const content = readFileSync(envFile, "utf8");
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#") || !line.includes("=")) {
        continue;
      }

      const separatorIndex = line.indexOf("=");
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      if (!key) {
        continue;
      }
      mergedEnv[key] = value;
    }
  }

  return mergedEnv;
}

function pythonHasRecommendationRuntime(pythonExecutable: string) {
  const probe = spawnSync(
    pythonExecutable,
    ["-c", "import agno, fastapi, pydantic, uvicorn, httpx"],
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );

  return probe.status === 0;
}

function resolveAgentPython(repoRoot: string) {
  const candidates = [
    path.join(repoRoot, "agents", "recommendation", ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, "agents", "chat-coach", ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, "agents", "course-maker", ".venv", "Scripts", "python.exe"),
    "python",
  ];

  for (const candidate of candidates) {
    if (candidate !== "python" && !existsSync(candidate)) {
      continue;
    }
    if (pythonHasRecommendationRuntime(candidate)) {
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

async function stopExistingRecommendationService() {
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

export async function ensureRecommendationAgentService() {
  const shouldAlwaysRestart = process.env.NODE_ENV !== "production";
  if (shouldAlwaysRestart) {
    await stopExistingRecommendationService();
    killProcessOnPort(8016);
  } else if (await isServiceHealthy()) {
    console.log(agentMessage(`[Agno Recommendation Agent] AgentOS service already healthy on ${DEFAULT_SERVICE_URL}.`));
    return true;
  }

  const state = getServiceState();
  if (!state.process || state.process.killed || state.process.exitCode !== null) {
    const repoRoot = resolveRepoRoot();
    const pythonExecutable = resolveAgentPython(repoRoot);
    const workspace = resolveAgentWorkspace(repoRoot);
    const scriptPath = path.join(workspace, "app", "run_agent_os_service.py");
    const agentEnv = loadAgentEnv(repoRoot);

    console.log(agentMessage(`[Agno Recommendation Agent] Booting AgentOS service with ${pythonExecutable}.`));

    const processHandle = spawn(pythonExecutable, [scriptPath], {
      cwd: workspace,
      stdio: ["ignore", "pipe", "pipe"],
      env: {
        ...process.env,
        ...agentEnv,
      },
    });

    state.process = processHandle;

    processHandle.stdout?.setEncoding("utf8");
    processHandle.stderr?.setEncoding("utf8");

    processHandle.stdout?.on("data", (chunk: string) => {
      process.stdout.write(chunk);
    });

    processHandle.stderr?.on("data", (chunk: string) => {
      process.stdout.write(chunk);
    });

    processHandle.on("exit", (code, signal) => {
      console.error(
        agentMessage(
          `[Agno Recommendation Agent] AgentOS service exited before becoming healthy. code=${code ?? "null"} signal=${signal ?? "null"}`,
        ),
      );
      state.process = null;
    });
  }

  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (await isServiceHealthy()) {
      console.log(agentMessage(`[Agno Recommendation Agent] AgentOS service is healthy on ${DEFAULT_SERVICE_URL}.`));
      return true;
    }
    await sleep(250);
  }

  console.error(agentMessage("[Agno Recommendation Agent] AgentOS health check timed out."));
  return false;
}

export async function startRecommendationSkillGapWorkflow(
  payload: RecommendationSkillGapStartPayload,
): Promise<RecommendationSkillGapStartResult> {
  if (!(await ensureRecommendationAgentService())) {
    throw new Error("The Recommendation AgentOS service is not available.");
  }

  console.log(
    agentMessage(
      `[Agno Recommendation Agent] POST ${DEFAULT_SERVICE_URL}/v1/recommendation/skill-gap/start tenantId=${payload.tenantId || "unknown"} userId=${payload.userId || "unknown"} pagePath=${payload.pagePath || "/recommendations/skill-gap"}`,
    ),
  );

  const response = await fetch(`${DEFAULT_SERVICE_URL}/v1/recommendation/skill-gap/start`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error("The Recommendation Agent service did not return a valid JSON response.");
  }

  const result = data as RecommendationSkillGapStartResult;
  if (!result.success) {
    throw new Error(result.error || "The Recommendation Agent returned an error.");
  }

  console.log(
    agentMessage(
      `[Agno Recommendation Agent] Skill-gap workflow response action=${result.action} status=${result.status || "unknown"} startedAt=${result.startedAt || "n/a"}`,
    ),
  );

  return result;
}

export async function startRecommendationFeedWorkflow(
  payload: RecommendationFeedStartPayload,
): Promise<RecommendationFeedResult> {
  if (!(await ensureRecommendationAgentService())) {
    throw new Error("The Recommendation AgentOS service is not available.");
  }

  console.log(
    agentMessage(
      `[Agno Recommendation Agent] POST ${DEFAULT_SERVICE_URL}/v1/recommendation/feed tenantId=${payload.tenantId} userId=${payload.userId} skillRadar=${payload.skillRadar.length} courses=${payload.courses.length} enrollments=${payload.enrollments.length}`,
    ),
  );

  const response = await fetch(`${DEFAULT_SERVICE_URL}/v1/recommendation/feed`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error("The Recommendation Agent service did not return a valid recommendations response.");
  }

  const result = data as RecommendationFeedResult;
  if (!result.success) {
    throw new Error(result.error || "The Recommendation Agent returned an error.");
  }

  console.log(
    agentMessage(
      `[Agno Recommendation Agent] Recommendation feed response action=${result.action} generatedAt=${result.generatedAt || "n/a"} recommendations=${result.recommendations?.length || 0}`,
    ),
  );

  return result;
}
