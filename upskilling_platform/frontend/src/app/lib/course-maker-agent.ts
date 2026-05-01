import { existsSync } from "node:fs";
import path from "node:path";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

type CourseMakerWorkflowPayload = {
  runId: string;
  pdfName: string;
  agentMode: string;
  enableWebSearch: boolean;
  enableImageGeneration: boolean;
  enableVideoGeneration: boolean;
  enableTTS: boolean;
  promptPreview: string;
};

type CourseMakerForwardPayload = CourseMakerWorkflowPayload & {
  pdfPath: string;
  requirement: string;
  openmaicUrl: string;
};

type CourseRefinementPayload = {
  action:
    | "open_draft_for_editor"
    | "save_refined_draft"
    | "confirm_refined_draft_saved"
    | "generate_final_course"
    | "confirm_final_course_generated"
    | "save_as_platform_course"
    | "confirm_platform_course_saved";
  draftId: string;
  title?: string | null;
  scenesCount?: number | null;
  source?: string | null;
  status?: string | null;
  platformCourseId?: string | null;
};

export type CourseMakerForwardResult = {
  success: boolean;
  workflowName: string;
  stage: string;
  status: number;
  contentType: string;
  bodyBase64: string;
  generatedDraftData?: {
    draftId?: string;
    [key: string]: unknown;
  } | null;
};

export type CourseRefinementResult = {
  success: boolean;
  workflowName: string;
  action: string;
  draftId: string;
  status?: string | null;
  source?: string | null;
};

const DEFAULT_SERVICE_URL = process.env.COURSE_MAKER_AGENT_URL || "http://127.0.0.1:8010";
const SERVICE_STATE_KEY = "__courseMakerAgentServiceState";

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
  return path.join(repoRoot, "agents", "course-maker");
}

function resolveAgentPython(repoRoot: string) {
  const venvPython = path.join(
    repoRoot,
    "agents",
    "course-maker",
    ".venv",
    "Scripts",
    "python.exe",
  );

  if (existsSync(venvPython)) {
    return venvPython;
  }

  return "python";
}

async function sleep(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function isServiceHealthy() {
  try {
    const response = await fetch(`${DEFAULT_SERVICE_URL}/health`, {
      cache: "no-store",
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function ensureCourseMakerAgentService() {
  if (await isServiceHealthy()) {
    return true;
  }

  const state = getServiceState();
  if (!state.process || state.process.killed) {
    const repoRoot = resolveRepoRoot();
    const pythonExecutable = resolveAgentPython(repoRoot);
    const workspace = resolveAgentWorkspace(repoRoot);
    const scriptPath = path.join(workspace, "app", "run_agent_os_service.py");

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
  }

  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await isServiceHealthy()) {
      return true;
    }
    await sleep(250);
  }

  return false;
}

export async function cancelCourseMakerGenerationService(runId: string) {
  if (!(await ensureCourseMakerAgentService())) {
    return false;
  }

  try {
    const response = await fetch(
      `${DEFAULT_SERVICE_URL}/v1/course-maker/runs/${runId}/cancel`,
      {
        method: "POST",
        cache: "no-store",
      },
    );
    return response.ok;
  } catch {
    return false;
  }
}

export async function runCourseRefinementAgentAction(
  payload: CourseRefinementPayload,
): Promise<CourseRefinementResult | null> {
  console.log(
    `[Agno Course Refinement Agent] Starting action "${payload.action}" for draft ${payload.draftId}.`,
  );

  if (!(await ensureCourseMakerAgentService())) {
    throw new Error("The Course Maker AgentOS service is not available.");
  }

  const response = await fetch(`${DEFAULT_SERVICE_URL}/v1/course-maker/refinement`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => null);
  if (!response.ok || !data) {
    throw new Error("The Course Refinement agent service did not return a valid response.");
  }

  console.log(
    `[Agno Course Refinement Agent] Finished action "${payload.action}" for draft ${payload.draftId}.`,
  );

  return data as CourseRefinementResult;
}

export async function startCourseGenerationThroughAgent(
  payload: CourseMakerForwardPayload,
) {
  console.log(
    `[Agno Course Maker Agent] Starting generation handoff for run ${payload.runId}.`,
  );

  if (!(await ensureCourseMakerAgentService())) {
    throw new Error("The Course Maker AgentOS service is not available.");
  }

  return fetch(`${DEFAULT_SERVICE_URL}/v1/course-maker/generate`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}
