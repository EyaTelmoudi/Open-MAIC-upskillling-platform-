import { existsSync } from "node:fs";
import path from "node:path";
import { spawn, spawnSync, type ChildProcessByStdio } from "node:child_process";
import type { Readable } from "node:stream";

const DEFAULT_SERVICE_URL =
  process.env.LEARNER_MEMORY_AGENT_URL || "http://127.0.0.1:8014";
const DEFAULT_HINDSIGHT_URL = process.env.HINDSIGHT_URL || "http://127.0.0.1:8888";
const DEFAULT_HINDSIGHT_API_KEY = process.env.HINDSIGHT_API_KEY || "";
const SERVICE_STATE_KEY = "__learnerMemoryAgentServiceState";
const LM_PREFIX = "🧠LM [Agno Learner Memory Agent]";

function lmMessage(message: string) {
  return message.replace("[Agno Learner Memory Agent]", "\u{1F9E0}LM [Agno Learner Memory Agent]");
}

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
  videoWatchPercent?: number | null;
  videoCurrentTimeSeconds?: number | null;
  wrongAnswers?: Array<Record<string, unknown>>;
  lessonReferenceIds?: string[];
  supportReferences?: Array<{
    title?: string | null;
    url?: string | null;
  }>;
  discussionMessage?: string | null;
  sessionId?: string | null;
  source?: string | null;
  preparedContextId?: string | null;
  preExtractedGeneralFacts?: string[];
  preExtractedCourseFacts?: string[];
  preExtractionReasoning?: string | null;
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
  generalFactsStored?: string[];
  courseFactsStored?: string[];
  duplicateGeneralFactsSkipped?: string[];
  duplicateCourseFactsSkipped?: string[];
  error?: string;
};

export type LearnerDiscussionFactExtractionResult = {
  success: boolean;
  workflowName: string;
  action: string;
  tenantId: string;
  userId: string;
  courseId: string;
  lessonId: string;
  generalFacts: string[];
  courseFacts: string[];
  reasoning: string;
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
    path.join(repoRoot, "agents", "course-maker", ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, "agents", "chat-coach", ".venv", "Scripts", "python.exe"),
    path.join(repoRoot, "agents", "course-memory", ".venv", "Scripts", "python.exe"),
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
  const shouldAlwaysRestart = process.env.NODE_ENV !== "production";
  if (shouldAlwaysRestart) {
    await stopExistingLearnerMemoryService();
    killProcessOnPort(8014);
  } else if (await isServiceHealthy()) {
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

    console.log(lmMessage(`[Agno Learner Memory Agent] Booting AgentOS service with ${pythonExecutable}.`));

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
        lmMessage(
          `[Agno Learner Memory Agent] AgentOS service exited before becoming healthy. code=${code ?? "null"} signal=${signal ?? "null"}`,
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

  console.error(lmMessage("[Agno Learner Memory Agent] AgentOS health check timed out."));
  return false;
}

export async function retainLearnerLessonMemory(
  payload: LearnerLessonMemoryPayload,
): Promise<LearnerLessonMemoryResult> {
  if (!(await ensureLearnerMemoryAgentService())) {
    throw new Error("The Learner Memory AgentOS service is not available.");
  }

  if ((payload.eventType || "") === "coaching_discussion_message") {
    console.log(
      lmMessage(
        "[Agno Learner Memory Agent] Sending coaching discussion fact extraction request. "
          + `tenantId=${payload.tenantId} userId=${payload.userId} courseId=${payload.courseId} sessionId=${payload.sessionId || "none"}`,
      ),
    );
  } else {
    console.log(
      lmMessage(
        "[Agno Learner Memory Agent] Sending learner lesson memory capture request. "
          + `tenantId=${payload.tenantId} userId=${payload.userId} courseId=${payload.courseId} lessonId=${payload.lessonId} event=${payload.eventType || "lesson_opened"}`,
      ),
    );
  }
  console.log(
    lmMessage(
      "[Agno Learner Memory Agent] Lesson references prepared: "
        + `${oneLinePreview(JSON.stringify(payload.lessonReferenceIds || []))}`,
    ),
  );
  console.log(
    lmMessage(
      "[Agno Learner Memory Agent] Support references prepared: "
        + `${oneLinePreview(JSON.stringify(payload.supportReferences || []))}`,
    ),
  );
  if ((payload.eventType || "") === "quiz_completed") {
    console.log(
      lmMessage(
        "[Agno Learner Memory Agent] Quiz result prepared: "
          + `${oneLinePreview(JSON.stringify({
            quizId: payload.quizId || payload.assessmentId || null,
            quizPassed: payload.quizPassed ?? null,
            quizScore: payload.quizScore ?? null,
            wrongAnswersCount: Array.isArray(payload.wrongAnswers) ? payload.wrongAnswers.length : 0,
          }))}`,
      ),
    );
  }
  if ((payload.eventType || "") === "solo_challenge_answered") {
    console.log(
      lmMessage(
        "[Agno Learner Memory Agent] Solo challenge result prepared: "
          + `${oneLinePreview(JSON.stringify({
            quizId: payload.quizId || payload.assessmentId || null,
            quizPassed: payload.quizPassed ?? null,
            quizScore: payload.quizScore ?? null,
            wrongAnswersCount: Array.isArray(payload.wrongAnswers) ? payload.wrongAnswers.length : 0,
          }))}`,
      ),
    );
  }
  if ((payload.eventType || "") === "video_progress_checkpoint") {
    console.log(
      lmMessage(
        "[Agno Learner Memory Agent] Video progress checkpoint prepared: "
          + `${oneLinePreview(JSON.stringify({
            videoWatchPercent: payload.videoWatchPercent ?? null,
            videoCurrentTimeSeconds: payload.videoCurrentTimeSeconds ?? null,
            lessonId: payload.lessonId,
          }))}`,
      ),
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
    lmMessage(
      "[Agno Learner Memory Agent] Learner lesson memory capture finished successfully. "
        + `bankId=${result.bankId || "unknown"} bankCreated=${String(result.bankCreated ?? false)}`,
    ),
  );
  if ((payload.eventType || "") === "coaching_discussion_message") {
    console.log(
      lmMessage(`[Agno Learner Memory Agent] Final extracted general facts: ${JSON.stringify(result.generalFactsStored || [])}`),
    );
    console.log(
      lmMessage(`[Agno Learner Memory Agent] Final extracted course facts: ${JSON.stringify(result.courseFactsStored || [])}`),
    );
    console.log(
      lmMessage(`[Agno Learner Memory Agent] Duplicate general facts skipped: ${JSON.stringify(result.duplicateGeneralFactsSkipped || [])}`),
    );
    console.log(
      lmMessage(`[Agno Learner Memory Agent] Duplicate course facts skipped: ${JSON.stringify(result.duplicateCourseFactsSkipped || [])}`),
    );
  }
  if (result.memoryContent) {
    if ((payload.eventType || "") === "coaching_discussion_message") {
      console.log(lmMessage("[Agno Learner Memory Agent] Coaching discussion fact extraction summary:"));
    } else if ((payload.eventType || "") === "solo_challenge_answered") {
      console.log(lmMessage("[Agno Learner Memory Agent] Retained solo challenge result memory content:"));
    } else if ((payload.eventType || "") === "video_progress_checkpoint") {
      console.log(lmMessage("[Agno Learner Memory Agent] Retained video-progress memory content:"));
    } else if ((payload.eventType || "") === "course_enrollment_completed") {
      console.log(lmMessage("[Agno Learner Memory Agent] Retained course-completion memory content:"));
    } else if ((payload.eventType || "") === "quiz_completed") {
      console.log(lmMessage("[Agno Learner Memory Agent] Retained quiz-result memory content:"));
    } else {
      console.log(lmMessage("[Agno Learner Memory Agent] Retained lesson-completion memory content:"));
    }
    console.log(result.memoryContent);
  }

  return result;
}

export async function extractLearnerDiscussionFacts(
  payload: LearnerLessonMemoryPayload,
): Promise<LearnerDiscussionFactExtractionResult> {
  if (!(await ensureLearnerMemoryAgentService())) {
    throw new Error("The Learner Memory AgentOS service is not available.");
  }

  console.log(
    lmMessage(
      "[Agno Learner Memory Agent] Sending discussion fact extraction-only request. "
        + `tenantId=${payload.tenantId} userId=${payload.userId} courseId=${payload.courseId} sessionId=${payload.sessionId || "none"}`,
    ),
  );

  const response = await fetch(`${DEFAULT_SERVICE_URL}/v1/learner-memory/extract-discussion-facts`, {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...payload,
      eventType: payload.eventType || "coaching_discussion_message",
      hindsightApiUrl: DEFAULT_HINDSIGHT_URL,
      hindsightApiKey: DEFAULT_HINDSIGHT_API_KEY,
    }),
  });

  const data = await response.json().catch(() => null);
  if (!data) {
    throw new Error("The Learner Memory Agent extract service did not return a valid JSON response.");
  }

  const result = data as LearnerDiscussionFactExtractionResult;
  if (!response.ok) {
    throw new Error(result.error || "The Learner Memory Agent extract service returned an error.");
  }

  if (!result.success) {
    throw new Error(result.error || "The Learner Memory Agent extract workflow failed.");
  }

  console.log(
    lmMessage(
      `[Agno Learner Memory Agent] Extraction-only result ready. generalFacts=${JSON.stringify(result.generalFacts || [])} courseFacts=${JSON.stringify(result.courseFacts || [])}`,
    ),
  );

  return result;
}
