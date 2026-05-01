type CourseMakerRunStatus = "running" | "cancelled";

type CourseMakerRunRecord = {
  status: CourseMakerRunStatus;
  updatedAt: string;
};

const STORE_KEY = "__courseMakerRunStore";

function getStore() {
  const globalScope = globalThis as typeof globalThis & {
    [STORE_KEY]?: Map<string, CourseMakerRunRecord>;
  };

  if (!globalScope[STORE_KEY]) {
    globalScope[STORE_KEY] = new Map<string, CourseMakerRunRecord>();
  }

  return globalScope[STORE_KEY];
}

export class CourseMakerRunCancelledError extends Error {
  constructor(message = "Generation was cancelled by the learning expert.") {
    super(message);
    this.name = "CourseMakerRunCancelledError";
  }
}

export function startCourseMakerRun(runId: string) {
  getStore().set(runId, {
    status: "running",
    updatedAt: new Date().toISOString(),
  });
}

export function cancelCourseMakerRun(runId: string) {
  getStore().set(runId, {
    status: "cancelled",
    updatedAt: new Date().toISOString(),
  });
}

export function isCourseMakerRunCancelled(runId: string) {
  return getStore().get(runId)?.status === "cancelled";
}

export function finishCourseMakerRun(runId: string) {
  getStore().delete(runId);
}
