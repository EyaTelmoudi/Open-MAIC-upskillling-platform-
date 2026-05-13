import { existsSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";

const DEFAULT_SERVICE_URL = process.env.CHAT_COACH_AGENT_URL || "http://127.0.0.1:8012";
const SERVICE_STATE_KEY = "__chatCoachAgentServiceState";

type ChatCoachPayload = {
  tenantId: string;
  courseId: string;
  userId?: string;
  question?: string;
  source?: "coach-page" | "course-lesson-coach";
  lessonId?: string;
  pagePath?: string;
  authToken?: string;
  conversationTurns?: number;
};

type ChatCoachResult = {
  success: boolean;
  workflowName: string;
  action: string;
  tenantId: string;
  courseId: string;
  userId?: string;
  bankId?: string;
  question?: string;
  answer?: string;
  validatedContext?: Record<string, unknown>;
  questionIntent?: Record<string, unknown>;
  basedOn?: Record<string, unknown>;
  supportingMemories?: Array<Record<string, unknown>>;
  trace?: Record<string, unknown>;
  usage?: Record<string, unknown>;
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
  return path.join(repoRoot, "agents", "chat-coach");
}

function pythonHasChatCoachRuntime(pythonExecutable: string) {
  const probe = spawnSync(
    pythonExecutable,
    ["-c", "import agno, fastapi, httpx, pydantic, uvicorn, sqlalchemy, jwt"],
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );

  return probe.status === 0;
}

function resolveAgentPython(repoRoot: string) {
  const candidates = [
    path.join(repoRoot, "agents", "chat-coach", ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, "agents", "course-memory", ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, "agents", "course-maker", ".venv", "Scripts", "python.exe"),
    "python",
  ];

  for (const candidate of candidates) {
    if (candidate !== "python" && !existsSync(candidate)) {
      continue;
    }
    if (pythonHasChatCoachRuntime(candidate)) {
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

async function stopExistingChatCoachService() {
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

export async function ensureChatCoachAgentService() {
  const shouldAlwaysRestart = process.env.NODE_ENV !== "production";
  if (shouldAlwaysRestart) {
    await stopExistingChatCoachService();
    killProcessOnPort(8012);
  } else if (await isServiceHealthy()) {
    return true;
  }

  const state = getServiceState();
  if (!state.process || state.process.killed || state.process.exitCode !== null) {
    const repoRoot = resolveRepoRoot();
    const pythonExecutable = resolveAgentPython(repoRoot);
    const workspace = resolveAgentWorkspace(repoRoot);
    const scriptPath = path.join(workspace, "app", "run_agent_os_service.py");

    console.log(`[Agno Chat Coach Agent] Booting AgentOS service with ${pythonExecutable}.`);

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
        `[Agno Chat Coach Agent] AgentOS service exited before becoming healthy. code=${code ?? "null"} signal=${signal ?? "null"}`,
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

  console.error("[Agno Chat Coach Agent] AgentOS health check timed out.");
  return false;
}

export async function askChatCoachQuestion(payload: ChatCoachPayload): Promise<ChatCoachResult> {
  if (!(await ensureChatCoachAgentService())) {
    throw new Error("The Chat Coach AgentOS service is not available.");
  }

  const response = await fetch(`${DEFAULT_SERVICE_URL}/v1/chat-coach/ask`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!data) {
    throw new Error("The Chat Coach Agent service did not return a valid JSON response.");
  }

  const result = data as ChatCoachResult;
  if (!response.ok) {
    throw new Error(result.error || "The Chat Coach Agent service returned an error.");
  }

  if (!result.success) {
    throw new Error(result.error || "The Chat Coach Agent workflow failed.");
  }

  return result;
}
