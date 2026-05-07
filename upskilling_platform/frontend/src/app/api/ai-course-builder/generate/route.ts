import { randomUUID } from "node:crypto";

import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";
import { safeUpsertAiCourseDraft } from "@/app/lib/safe-ai-course-db";
import {
  type ActiveGenerationRunRecord,
  getActiveGenerationRun,
  setActiveGenerationRun,
} from "@/app/lib/ai-course-active-run-store";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const requirement = String(formData.get("requirement") || "").trim();
    const pdfEntry = formData.get("pdf");
    const pdfName =
      pdfEntry && typeof pdfEntry === "object" && "name" in pdfEntry
        ? String(pdfEntry.name)
        : "unknown.pdf";
    const agentMode = String(formData.get("agentMode") || "default");
    const enableWebSearch = "true";
    const enableImageGeneration = String(
      formData.get("enableImageGeneration") || "false",
    );
    const enableVideoGeneration = String(
      formData.get("enableVideoGeneration") || "false",
    );
    const enableTTS = "true";
    const pdfFile = pdfEntry instanceof File ? pdfEntry : null;

    if (!pdfFile && !requirement) {
      return Response.json(
        {
          success: false,
          error: "Provide either a learning expert prompt, a PDF file, or both.",
        },
        { status: 400 },
      );
    }

    const existingRun = await getActiveGenerationRun();
    if (existingRun?.active) {
      return Response.json(
        {
          success: false,
          error:
            "A course generation run is already in progress. Wait for it to finish before starting a new one.",
        },
        { status: 409 },
      );
    }

    const runId = randomUUID();

    const upstreamFormData = new FormData();
    upstreamFormData.append("runId", runId);
    upstreamFormData.append("requirement", requirement);
    upstreamFormData.append("agentMode", agentMode);
    upstreamFormData.append("enableWebSearch", enableWebSearch);
    upstreamFormData.append("enableImageGeneration", enableImageGeneration);
    upstreamFormData.append("enableVideoGeneration", enableVideoGeneration);
    upstreamFormData.append("enableTTS", enableTTS);
    if (pdfFile) {
      upstreamFormData.append("pdf", pdfFile, pdfName);
    }

    const agentResponse = await fetch(buildOpenMAICUrl("/api/learing-expert-agent/generate"), {
      method: "POST",
      body: upstreamFormData,
      cache: "no-store",
    });

    if (!agentResponse.body) {
      return Response.json(
        {
          success: false,
          error: "OpenMAIC did not return a readable generation stream.",
        },
        { status: 502 },
      );
    }

    const encoder = new TextEncoder();
    let resultPayload: {
      generatedDraftData?: {
        draftId?: string;
        [key: string]: unknown;
      } | null;
    } | null = null;

    await setActiveGenerationRun({
      runId,
      active: true,
      status: "running",
      sourcePdfName: pdfFile ? pdfName : "No PDF attached",
      promptPreview:
        requirement.slice(0, 140) ||
        (pdfFile
          ? "Generate the course from the uploaded PDF."
          : "(prompt-only request)"),
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: {
        step: "queued",
        progress: 0,
        message: "Waiting for OpenMAIC to accept the generation request.",
      },
      result: null,
      error: null,
    });

    let controllerClosed = false;

    const stream = new ReadableStream({
      start(controller) {
        let stdoutBuffer = "";
        const reader = agentResponse.body!.getReader();
        let terminalEventSeen = false;

        const safeEnqueue = (line: string) => {
          if (controllerClosed) return;
          try {
            controller.enqueue(encoder.encode(line));
          } catch (error) {
            if (
              error instanceof TypeError &&
              error.message.includes("Controller is already closed")
            ) {
              controllerClosed = true;
              return;
            }
            throw error;
          }
        };

        const safeClose = () => {
          if (controllerClosed) return;
          controllerClosed = true;
          try {
            controller.close();
          } catch (error) {
            if (
              !(error instanceof TypeError) ||
              !error.message.includes("Controller is already closed")
            ) {
              throw error;
            }
          }
        };

        void (async () => {
          try {
            while (true) {
              const { value, done } = await reader.read();
              if (done) break;
              const chunk = new TextDecoder().decode(value, { stream: true });
              stdoutBuffer += chunk;
              const lines = stdoutBuffer.split("\n");
              stdoutBuffer = lines.pop() || "";

              for (const rawLine of lines) {
                const line = rawLine.trim();
                if (!line) continue;

                try {
                  const eventData = JSON.parse(line) as
                    | {
                        type: "progress";
                        step: string;
                        progress: number;
                        message: string;
                        scenesGenerated?: number;
                        totalScenes?: number;
                        draftId?: string;
                        classroomId?: string;
                      }
                    | { type: "done"; data: Record<string, unknown> }
                    | { type: "error"; error: string };

                  const current = await getActiveGenerationRun();
                  if (!current || current.runId !== runId || current.status === "cancelled") {
                    safeEnqueue(`${line}\n`);
                    continue;
                  }

                  if (eventData.type === "progress") {
                    if ("draftId" in eventData && eventData.draftId) {
                      try {
                        const draftResponse = await fetch(
                          buildOpenMAICUrl(
                            `/api/learing-expert-agent/drafts/${eventData.draftId}`,
                          ),
                          { cache: "no-store" },
                        );
                        const draftData = await draftResponse.json().catch(() => ({}));
                        if (draftResponse.ok && draftData?.success && draftData?.draft) {
                          await safeUpsertAiCourseDraft(request, {
                            draft: draftData.draft,
                            prompt: requirement,
                            sourcePdfName: pdfName,
                          });
                        }
                      } catch {
                        // Draft may not be ready yet through the upstream route.
                      }
                    }

                    await setActiveGenerationRun({
                      ...current,
                      updatedAt: new Date().toISOString(),
                      progress: {
                        step: eventData.step,
                        progress: eventData.progress,
                        message: eventData.message,
                        scenesGenerated: eventData.scenesGenerated,
                        totalScenes: eventData.totalScenes,
                        draftId: eventData.draftId,
                        classroomId: eventData.classroomId,
                      },
                    });
                  } else if (eventData.type === "done") {
                    terminalEventSeen = true;
                    await setActiveGenerationRun({
                      ...current,
                      active: false,
                      status: "completed",
                      updatedAt: new Date().toISOString(),
                      progress: {
                        step: "completed",
                        progress: 100,
                        message:
                          "The course generator agent finished the course draft successfully.",
                      },
                      result: eventData.data as ActiveGenerationRunRecord["result"],
                      error: null,
                    });
                    resultPayload = {
                      generatedDraftData: eventData.data,
                    };
                  } else if (eventData.type === "error") {
                    terminalEventSeen = true;
                    await setActiveGenerationRun({
                      ...current,
                      active: false,
                      status: "failed",
                      updatedAt: new Date().toISOString(),
                      error: eventData.error,
                    });
                  }
                } catch {
                  // Ignore malformed lines but continue streaming them through.
                }

                safeEnqueue(`${line}\n`);
              }
            }

            if (!terminalEventSeen) {
              const current = await getActiveGenerationRun();
              if (current?.runId === runId && current.status !== "cancelled") {
                await setActiveGenerationRun({
                  ...current,
                  active: false,
                  status: "failed",
                  updatedAt: new Date().toISOString(),
                  error:
                    "OpenMAIC stopped before returning a completion event.",
                });
              }

              safeEnqueue(
                `${JSON.stringify({
                  type: "error",
                  error:
                    "OpenMAIC stopped before returning a completion event.",
                })}\n`,
              );
            }
          } catch (error) {
            const current = await getActiveGenerationRun();
            if (current?.runId === runId && current.status !== "cancelled") {
              await setActiveGenerationRun({
                ...current,
                active: false,
                status: "failed",
                updatedAt: new Date().toISOString(),
                error:
                  error instanceof Error
                    ? error.message
                    : "OpenMAIC generation failed.",
              });
            }
            safeEnqueue(
              `${JSON.stringify({
                type: "error",
                error:
                  error instanceof Error
                    ? error.message
                    : "OpenMAIC generation failed.",
              })}\n`,
            );
          } finally {
            try {
              const current = await getActiveGenerationRun();
              if (current?.runId === runId && current.status === "cancelled") {
                return;
              }
              const generatedDraftId = resultPayload?.generatedDraftData?.draftId;
              if (generatedDraftId) {
                const draftResponse = await fetch(
                  buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${generatedDraftId}`),
                  { cache: "no-store" },
                );
                const draftData = await draftResponse.json().catch(() => ({}));

                if (!draftResponse.ok || !draftData?.success || !draftData?.draft) {
                  safeEnqueue(
                    `${JSON.stringify({
                      type: "error",
                      error:
                        "OpenMAIC returned generated content, but the platform could not load the created draft.",
                    })}\n`,
                  );
                } else {
                  const savedDraft = await safeUpsertAiCourseDraft(request, {
                    draft: draftData.draft,
                    prompt: requirement,
                    sourcePdfName: pdfName,
                  });

                  if (!savedDraft) {
                    const current = await getActiveGenerationRun();
                    if (current?.runId === runId) {
                      await setActiveGenerationRun({
                        ...current,
                        active: false,
                        status: "failed",
                        updatedAt: new Date().toISOString(),
                        error:
                          "The generated course was received, but saving the draft to PostgreSQL failed.",
                      });
                    }
                    safeEnqueue(
                      `${JSON.stringify({
                        type: "error",
                        error:
                          "The generated course was received, but saving the draft to PostgreSQL failed.",
                      })}\n`,
                    );
                  } else {
                    const current = await getActiveGenerationRun();
                    if (current?.runId === runId) {
                      await setActiveGenerationRun({
                        ...current,
                        updatedAt: new Date().toISOString(),
                        result: {
                          ...(current.result || {}),
                          draftId: generatedDraftId,
                        } as ActiveGenerationRunRecord["result"],
                      });
                    }
                    console.log(
                      `[Course Maker Workflow] Draft ${generatedDraftId} was saved to PostgreSQL successfully.`,
                    );
                  }
                }
              }
            } finally {
              safeClose();
            }
          }
        })();
      },
      cancel() {
        // The browser left the page or aborted the fetch. Keep the background
        // generation and active-run tracking alive, but stop writing to the
        // closed response stream.
        controllerClosed = true;
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "application/x-ndjson; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to start OpenMAIC generation",
      },
      { status: 500 }
    );
  }
}
