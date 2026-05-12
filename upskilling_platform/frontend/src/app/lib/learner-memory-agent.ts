import { existsSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";

const DEFAULT_SERVICE_URL = process.env.LEARNER_MEMORY_AGENT_URL || "http://127.0.0.1:8013";
const SERVICE_STATE_KEY = "__learnerMemoryAgentServiceState";

export type LearnerMemoryEventPayload = {
  tenantId: string;
  userId: string;
  courseId: string;
  eventType?:
    | "question"
    | "struggle"
    | "quiz_result"
    | "lesson_completion"
    | "session_summary"
    | "style_signal";
  lessonId?: string;
  quizId?: string;
  topic?: string;
  intent?: string;
  questionText?: string;
  sessionId?: string;
  sessionTurns?: Array<Record<string, unknown>>;
  scorePercent?: number;
  passed?: boolean;
  missedTopics?: string[];
  styleSignal?: string;
  source?: string;
};

export type LearnerMemoryResult = {
  success: boolean;
  workflowName: string;
  action: string;
  tenantId: string;
  userId: string;
  courseId: string;
  triggerEvent: string;
  triggerDescription: string;
  triggerSummary: Record<string, unknown>;
  nextPlannedAction: string;
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
  return path.join(repoRoot, "agents", "learner-memory");
}

function pythonHasLearnerMemoryRuntime(pythonExecutable: string) {
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
    path.join(repoRoot, "agents", "learner-memory", ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, "agents", "course-memory", ".venv", "Scripts", "python.exe"),
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

export async function ensureLearnerMemoryAgentService() {
  if (await isServiceHealthy()) {
    return true;
  }

  const state = getServiceState();
  if (!state.process || state.process.killed || state.process.exitCode !== null) {
    const repoRoot = resolveRepoRoot();
    const pythonExecutable = resolveAgentPython(repoRoot);
    const workspace = resolveAgentWorkspace(repoRoot);
    const scriptPath = path.join(workspace, "app", "run_agent_os_service.py");

    console.log(`[Agno Learner Memory Agent] Booting AgentOS service with ${pythonExecutable}.`);

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

export async function sendLearnerMemoryEvent(
  payload: LearnerMemoryEventPayload,
  endpoint = "/v1/learner-memory/events",
): Promise<LearnerMemoryResult> {
  if (!(await ensureLearnerMemoryAgentService())) {
    throw new Error("The Learner Memory AgentOS service is not available.");
  }

  const response = await fetch(`${DEFAULT_SERVICE_URL}${endpoint}`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!data) {
    throw new Error("The Learner Memory Agent service did not return a valid JSON response.");
  }

  const result = data as LearnerMemoryResult;
  if (!response.ok || !result.success) {
    throw new Error(result.error || "The Learner Memory Agent service returned an error.");
  }

  return result;
}

