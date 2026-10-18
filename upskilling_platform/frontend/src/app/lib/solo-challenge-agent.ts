import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";

const DEFAULT_SERVICE_URL = process.env.SOLO_CHALLENGE_AGENT_URL || "http://127.0.0.1:8013";
const SERVICE_STATE_KEY = "__soloChallengeAgentServiceState";

export type SoloChallengeStartPayload = {
  tenantId?: string | null;
  userId?: string | null;
  role?: string | null;
  source?: "learning-shell";
  pagePath?: string;
};

export type SoloChallengeStartResult = {
  success: boolean;
  challengeId?: string;
  workflowName: string;
  action: string;
  tenantId?: string | null;
  userId?: string | null;
  role?: string | null;
  source?: string;
  pagePath?: string;
  startedAt?: string;
  status?: string;
  message?: string;
  nextStep?: string;
  recreatedQuiz?: {
    courseId?: string | null;
    courseTitle?: string | null;
    lessonId?: string | null;
    lessonTitle?: string | null;
    assessmentId?: string | null;
    source?: string;
    focusMode?: string;
    questionCount?: number;
    questions?: Array<{
      questionId: string;
      text: string;
      questionType: string;
      displayOrder: number;
      generationMode?: string;
      explanation?: string | null;
      options: Array<{
        id: string;
        value: string;
        label: string;
      }>;
    }>;
  };
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
  return path.join(repoRoot, "agents", "solo-challenge");
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

  if (mergedEnv.HINDSIGHT_URL === "http://hindsight:8888") {
    mergedEnv.HINDSIGHT_URL = "http://127.0.0.1:8888";
  }
  if (mergedEnv.HINDSIGHT_API_URL === "http://hindsight:8888") {
    mergedEnv.HINDSIGHT_API_URL = "http://127.0.0.1:8888";
  }

  return mergedEnv;
}

function pythonHasSoloChallengeRuntime(pythonExecutable: string) {
  const probe = spawnSync(
    pythonExecutable,
    ["-c", "import agno, fastapi, pydantic, uvicorn"],
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );

  return probe.status === 0;
}

function resolveAgentPython(repoRoot: string) {
  const candidates = [
    path.join(repoRoot, "agents", "solo-challenge", ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, "agents", "chat-coach", ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, "agents", "course-memory", ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, "agents", "course-maker", ".venv", "Scripts", "python.exe"),
    "python",
  ];

  for (const candidate of candidates) {
    if (candidate !== "python" && !existsSync(candidate)) {
      continue;
    }
    if (pythonHasSoloChallengeRuntime(candidate)) {
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

async function stopExistingSoloChallengeService() {
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

export async function ensureSoloChallengeAgentService() {
  const shouldAlwaysRestart = process.env.NODE_ENV !== "production";
  if (shouldAlwaysRestart) {
    await stopExistingSoloChallengeService();
    killProcessOnPort(8013);
  } else if (await isServiceHealthy()) {
    return true;
  }

  const state = getServiceState();
  if (!state.process || state.process.killed || state.process.exitCode !== null) {
    const repoRoot = resolveRepoRoot();
    const pythonExecutable = resolveAgentPython(repoRoot);
    const workspace = resolveAgentWorkspace(repoRoot);
    const scriptPath = path.join(workspace, "app", "run_agent_os_service.py");
    const agentEnv = loadAgentEnv(repoRoot);

    console.log(`[Agno Solo Challenge Agent] Booting AgentOS service with ${pythonExecutable}.`);

    state.process = spawn(pythonExecutable, [scriptPath], {
      cwd: workspace,
      env: {
        ...process.env,
        ...agentEnv,
      },
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
        `[Agno Solo Challenge Agent] AgentOS service exited before becoming healthy. code=${code ?? "null"} signal=${signal ?? "null"}`,
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

  console.error("[Agno Solo Challenge Agent] AgentOS health check timed out.");
  return false;
}

export async function startSoloChallengeWorkflow(
  payload: SoloChallengeStartPayload,
): Promise<SoloChallengeStartResult> {
  if (!(await ensureSoloChallengeAgentService())) {
    throw new Error("The Solo Challenge AgentOS service is not available.");
  }

  const response = await fetch(`${DEFAULT_SERVICE_URL}/v1/solo-challenge/start`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!data) {
    throw new Error("The Solo Challenge Agent service did not return a valid JSON response.");
  }

  const result = data as SoloChallengeStartResult;
  if (!response.ok) {
    throw new Error(result.error || "The Solo Challenge Agent service returned an error.");
  }

  if (!result.success) {
    throw new Error(result.error || "The Solo Challenge Agent workflow failed.");
  }

  return result;
}
