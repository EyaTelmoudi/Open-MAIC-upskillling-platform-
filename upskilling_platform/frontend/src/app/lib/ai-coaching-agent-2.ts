import { existsSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const DEFAULT_SERVICE_URL = process.env.AI_COACHING_AGENT_2_URL || "http://127.0.0.1:8015";
const SERVICE_STATE_KEY = "__aiCoachingAgent2ServiceState";
const AGENT_PREFIX = "[AI Coaching Agent 2]";

type AICoachingAgent2Payload = {
  tenantId: string;
  courseId: string;
  userId: string;
  question: string;
  lessonId?: string;
  pagePath?: string;
  sessionId?: string;
  hindsightApiUrl?: string;
  hindsightApiKey?: string;
};

type AICoachingAgent2Result = {
  success: boolean;
  workflowName: string;
  action: string;
  tenantId: string;
  courseId: string;
  userId: string;
  question: string;
  answer?: string;
  bankId?: string;
  basedOn?: Record<string, unknown>;
  supportingMemories?: Array<Record<string, unknown>>;
  error?: string;
};

type AgentProcess = ReturnType<typeof spawn>;

type ServiceState = {
  process: AgentProcess | null;
};

function agentMessage(message: string) {
  return message.replace("[AI Coaching Agent 2]", AGENT_PREFIX);
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
    if (existsSync(path.join(current, "agents")) && existsSync(path.join(current, "upskilling_platform"))) {
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
  return path.join(repoRoot, "agents", "ai-coaching-agent-2");
}

function pythonHasAgentRuntime(pythonExecutable: string) {
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
    path.join(repoRoot, "agents", "ai-coaching-agent-2", ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, "agents", "chat-coach", ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, "agents", "course-maker", ".venv", "Scripts", "python.exe"),
    "python",
  ];

  for (const candidate of candidates) {
    if (candidate !== "python" && !existsSync(candidate)) {
      continue;
    }
    if (pythonHasAgentRuntime(candidate)) {
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

async function stopExistingService() {
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

export async function ensureAICoachingAgent2Service() {
  const shouldAlwaysRestart = process.env.NODE_ENV !== "production";
  if (shouldAlwaysRestart) {
    await stopExistingService();
    killProcessOnPort(8015);
  } else if (await isServiceHealthy()) {
    return true;
  }

  const state = getServiceState();
  if (!state.process || state.process.killed || state.process.exitCode !== null) {
    const repoRoot = resolveRepoRoot();
    const pythonExecutable = resolveAgentPython(repoRoot);
    const workspace = resolveAgentWorkspace(repoRoot);
    const scriptPath = path.join(workspace, "app", "run_agent_os_service.py");

    console.log(agentMessage("[AI Coaching Agent 2] Booting AgentOS service."));

    const processHandle = spawn(pythonExecutable, [scriptPath], {
      cwd: workspace,
      stdio: ["ignore", "pipe", "pipe"],
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
          `[AI Coaching Agent 2] AgentOS service exited before becoming healthy. code=${code ?? "null"} signal=${signal ?? "null"}`,
        ),
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

  console.error(agentMessage("[AI Coaching Agent 2] AgentOS health check timed out."));
  return false;
}

export async function askAICoachingAgent2(payload: AICoachingAgent2Payload): Promise<AICoachingAgent2Result> {
  if (!(await ensureAICoachingAgent2Service())) {
    throw new Error("AI Coaching Agent 2 is not available.");
  }

  const response = await fetch(`${DEFAULT_SERVICE_URL}/v1/ai-coaching-agent-2/ask`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!data) {
    throw new Error("AI Coaching Agent 2 did not return valid JSON.");
  }

  const result = data as AICoachingAgent2Result;
  if (!response.ok) {
    throw new Error(result.error || "AI Coaching Agent 2 returned an error.");
  }

  if (!result.success) {
    throw new Error(result.error || "AI Coaching Agent 2 workflow failed.");
  }

  return result;
}
