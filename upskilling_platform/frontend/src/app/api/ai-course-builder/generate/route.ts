import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import os from "node:os";
import path from "node:path";

import {
  ensureCourseMakerAgentService,
  startCourseGenerationThroughAgent,
  type CourseMakerForwardResult,
} from "@/app/lib/course-maker-agent";
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
    const enableWebSearch = String(formData.get("enableWebSearch") || "false");
    const enableImageGeneration = String(
      formData.get("enableImageGeneration") || "false",
    );
    const enableVideoGeneration = String(
      formData.get("enableVideoGeneration") || "false",
    );
    const enableTTS = String(formData.get("enableTTS") || "false");
    const pdfFile =
      pdfEntry && typeof pdfEntry === "object" && "arrayBuffer" in pdfEntry
        ? pdfEntry
        : null;

    if (!pdfFile) {
      return Response.json(
        {
          success: false,
          error: "The platform did not receive a valid PDF file.",
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

    const tempDir = await mkdtemp(path.join(os.tmpdir(), "course-maker-agent-"));
    const pdfPath = path.join(tempDir, pdfName);
    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
    await writeFile(pdfPath, pdfBuffer);

    const agentServiceReady = await ensureCourseMakerAgentService();
    if (!agentServiceReady) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      return Response.json(
        {
          success: false,
          error: "The Course Maker AgentOS service could not be started.",
        },
        { status: 503 },
      );
    }

    const runId = randomUUID();

    const agentResponse = await startCourseGenerationThroughAgent({
      runId,
      pdfPath,
      requirement,
      openmaicUrl: buildOpenMAICUrl("/api/learing-expert-agent/generate"),
      pdfName,
      agentMode,
      enableWebSearch: enableWebSearch === "true",
      enableImageGeneration: enableImageGeneration === "true",
      enableVideoGeneration: enableVideoGeneration === "true",
      enableTTS: enableTTS === "true",
      promptPreview: requirement.slice(0, 140) || "(empty prompt)",
    });

    if (!agentResponse.body) {
      await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
      return Response.json(
        {
          success: false,
          error: "The Course Maker AgentOS service did not return a readable stream.",
        },
        { status: 502 },
      );
    }

    const encoder = new TextEncoder();
    let resultPayload: CourseMakerForwardResult | null = null;

    await setActiveGenerationRun({
      runId,
      active: true,
      status: "running",
      sourcePdfName: pdfName,
      promptPreview: requirement.slice(0, 140) || "(empty prompt)",
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: {
        step: "queued",
        progress: 0,
        message: "Waiting for the course generator agent to accept the generation request.",
      },
      result: null,
      error: null,
    });

    let controllerClosed = false;

    const stream = new ReadableStream({
      start(controller) {
        let stdoutBuffer = "";
        const reader = agentResponse.body!.getReader();

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
                      }
                    | { type: "done"; data: Record<string, unknown> }
                    | { type: "error"; error: string };

                  void (async () => {
                    const current = await getActiveGenerationRun();
                    if (!current || current.runId !== runId) return;
                    if (current.status === "cancelled") return;

                    if (eventData.type === "progress") {
                      await setActiveGenerationRun({
                        ...current,
                        updatedAt: new Date().toISOString(),
                        progress: {
                          step: eventData.step,
                          progress: eventData.progress,
                          message: eventData.message,
                          scenesGenerated: eventData.scenesGenerated,
                          totalScenes: eventData.totalScenes,
                        },
                      });
                    } else if (eventData.type === "done") {
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
                        success: true,
                        workflowName: "course-maker-openmaic-handoff",
                        stage: "generated_content_received",
                        status: agentResponse.status,
                        contentType:
                          agentResponse.headers.get("content-type") ||
                          "application/x-ndjson; charset=utf-8",
                        bodyBase64: "",
                        generatedDraftData: eventData.data,
                      };
                    } else if (eventData.type === "error") {
                      await setActiveGenerationRun({
                        ...current,
                        active: false,
                        status: "failed",
                        updatedAt: new Date().toISOString(),
                        error: eventData.error,
                      });
                    }
                  })();
                } catch {
                  // Ignore malformed lines but continue streaming them through.
                }

                safeEnqueue(`${line}\n`);
              }
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
                    : "Course Maker AgentOS service failed.",
              });
            }
            safeEnqueue(
              `${JSON.stringify({
                type: "error",
                error:
                  error instanceof Error
                    ? error.message
                    : "Course Maker AgentOS service failed.",
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
              await rm(tempDir, { recursive: true, force: true }).catch(() => undefined);
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
            : "Failed to forward request to OpenMAIC",
      },
      { status: 500 }
    );
  }
}
