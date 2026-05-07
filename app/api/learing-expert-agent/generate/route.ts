import { nanoid } from 'nanoid';
import { NextRequest } from 'next/server';
import { parsePDF } from '@/lib/pdf/pdf-providers';
import { createLogger } from '@/lib/logger';
import { generateClassroom } from '@/lib/server/classroom-generation';
import { buildRequestOrigin } from '@/lib/server/classroom-storage';
import {
  createDraft,
  createDraftWithPlaceholders,
  updateDraftScene,
} from '@/lib/learing-expert-agent/draft-store';
import {
  deleteLearningSubmission,
  upsertLearningSubmission,
} from '@/lib/server/learning-storage';
import { putObject } from '@/lib/server/object-storage';
import {
  cancelCourseMakerRun,
  CourseMakerRunCancelledError,
  finishCourseMakerRun,
  isCourseMakerRunCancelled,
  startCourseMakerRun,
} from '@/lib/server/course-maker-run-store';

const log = createLogger('LearningExpertAgentAPI');

export const maxDuration = 300;

function slugify(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return normalized || 'submission';
}

function safeFileName(value: string): string {
  return value.replace(/[\\/:*?"<>|]/g, '_');
}

function buildRequirementFromPdf(pdfName: string): string {
  const sanitizedName = pdfName.replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ').trim();
  return sanitizedName
    ? `Create a complete course based on the uploaded PDF "${sanitizedName}". Use the document as the primary source, infer the learning objectives, structure the lessons clearly, and include practical explanations and assessments.`
    : 'Create a complete course based on the uploaded PDF. Use the document as the primary source, infer the learning objectives, structure the lessons clearly, and include practical explanations and assessments.';
}

function inferImageExtension(dataUrl: string): string {
  const mime = dataUrl.match(/^data:([^;]+);base64,/)?.[1] || 'image/png';
  if (mime === 'image/jpeg') return 'jpg';
  if (mime === 'image/webp') return 'webp';
  return 'png';
}

async function uploadParsedPdfAssets(
  submissionId: string,
  parsedPdf: Awaited<ReturnType<typeof parsePDF>>,
): Promise<Record<string, unknown>> {
  const pdfImages = parsedPdf.metadata?.pdfImages || [];
  const uploadedImages = await Promise.all(
    (parsedPdf.images || []).map(async (dataUrl, index) => {
      const [header, base64] = dataUrl.split(',', 2);
      const mime = header?.match(/^data:([^;]+);base64$/)?.[1] || 'image/png';
      const ext = inferImageExtension(dataUrl);
      const imageId = pdfImages[index]?.id || `img_${index + 1}`;
      const objectKey = `submissions/${submissionId}/parsed-images/${imageId}.${ext}`;

      await putObject(objectKey, Buffer.from(base64 || '', 'base64'), {
        'Content-Type': mime,
      });

      return {
        ...(pdfImages[index] || {}),
        id: imageId,
        objectKey,
        mimeType: mime,
      };
    }),
  );

  return {
    text: parsedPdf.text,
    imagesCount: parsedPdf.images?.length ?? 0,
    metadata: {
      ...(parsedPdf.metadata || {}),
      pdfImages: uploadedImages,
    },
  };
}

type ProgressEvent =
  | {
      type: 'progress';
      step: string;
      progress: number;
      message: string;
      scenesGenerated?: number;
      totalScenes?: number;
      draftId?: string;
      classroomId?: string;
    }
  | {
      type: 'done';
      data: Record<string, unknown>;
    }
  | {
      type: 'error';
      error: string;
    };

function jsonLine(event: ProgressEvent): string {
  return `${JSON.stringify(event)}\n`;
}

export async function POST(req: NextRequest) {
  let requirementSnippet: string | undefined;
  let submissionId: string | null = null;
  let classroomId: string | null = null;
  let draftId: string | null = null;

  try {
    const contentType = req.headers.get('content-type') || '';
    if (
      !contentType.includes('multipart/form-data') &&
      !contentType.includes('application/x-www-form-urlencoded')
    ) {
      return new Response(
        jsonLine({
          type: 'error',
          error: `Invalid Content-Type: expected form data, got "${contentType}"`,
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-cache',
          },
        },
      );
    }

    const formData = await req.formData();
    const requirement = String(formData.get('requirement') || '').trim();
    const runId = String(formData.get('runId') || '').trim();
    const pdfEntry = formData.get('pdf');
    const pdfFile =
      pdfEntry && typeof pdfEntry === 'object' && 'arrayBuffer' in pdfEntry
        ? (pdfEntry as File)
        : null;

    if (!requirement && !pdfFile) {
      return new Response(
        jsonLine({
          type: 'error',
          error: 'Provide either a course request, a PDF file, or both.',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/x-ndjson; charset=utf-8',
            'Cache-Control': 'no-cache',
          },
        },
      );
    }

    const normalizedRequirement =
      requirement || buildRequirementFromPdf(pdfFile?.name || 'uploaded-course.pdf');
    requirementSnippet = normalizedRequirement.slice(0, 80);

    const enableWebSearch = true;
    const enableImageGeneration = String(formData.get('enableImageGeneration') || '') === 'true';
    const enableVideoGeneration = String(formData.get('enableVideoGeneration') || '') === 'true';
    const enableTTS = String(formData.get('enableTTS') || '') === 'true';
    const agentMode =
      String(formData.get('agentMode') || 'default') === 'generate' ? 'generate' : 'default';

    log.info('OpenMAIC generate endpoint received Course Maker workflow payload', {
      runId: runId || undefined,
      pdfName: pdfFile?.name || null,
      pdfSize: pdfFile?.size || null,
      pdfType: pdfFile?.type || null,
      requirementPreview: normalizedRequirement.slice(0, 140),
      options: {
        enableWebSearch,
        enableImageGeneration,
        enableVideoGeneration,
        enableTTS,
        agentMode,
      },
    });

    const pdfBuffer = pdfFile ? Buffer.from(await pdfFile.arrayBuffer()) : null;
    const encoder = new TextEncoder();
    if (runId) {
      startCourseMakerRun(runId);
    }

    const stream = new ReadableStream({
      start(controller) {
        let controllerClosed = false;

        const throwIfCancelled = () => {
          if (req.signal.aborted) {
            if (runId) {
              cancelCourseMakerRun(runId);
            }
            throw new CourseMakerRunCancelledError();
          }

          if (runId && isCourseMakerRunCancelled(runId)) {
            throw new CourseMakerRunCancelledError();
          }
        };

        const enqueue = (event: ProgressEvent) => {
          if (controllerClosed) return;
          try {
            controller.enqueue(encoder.encode(jsonLine(event)));
          } catch (error) {
            if (
              error instanceof TypeError &&
              error.message.includes('Controller is already closed')
            ) {
              controllerClosed = true;
              return;
            }
            throw error;
          }
        };

        const closeController = () => {
          if (controllerClosed) return;
          controllerClosed = true;
          try {
            controller.close();
          } catch (error) {
            if (
              !(error instanceof TypeError) ||
              !error.message.includes('Controller is already closed')
            ) {
              throw error;
            }
          }
        };

        req.signal.addEventListener('abort', () => {
          controllerClosed = true;
          if (runId) {
            cancelCourseMakerRun(runId);
          }
        });

        void (async () => {
          try {
            throwIfCancelled();
            enqueue({
              type: 'progress',
              step: 'preparing_request',
              progress: 2,
              message: 'Preparing the request for OpenMAIC',
            });

            submissionId = `${new Date().toISOString().replace(/[:.]/g, '-')}_${slugify(normalizedRequirement).slice(0, 40)}_${nanoid(6)}`;
            const storageLocation = `postgres/submissions/${submissionId}`;
            let sourcePdfObjectKey: string | null = null;

            if (pdfFile && pdfBuffer) {
              sourcePdfObjectKey = `submissions/${submissionId}/source/${safeFileName(pdfFile.name)}`;
              await putObject(sourcePdfObjectKey, pdfBuffer, {
                'Content-Type': pdfFile.type || 'application/pdf',
              });
            }

            await upsertLearningSubmission({
              submissionId,
              requirement: normalizedRequirement,
              options: {
                enableWebSearch,
                enableImageGeneration,
                enableVideoGeneration,
                enableTTS,
                agentMode,
              },
              sourcePdfFileName: pdfFile?.name || null,
              sourcePdfSize: pdfFile?.size || null,
              sourcePdfType: pdfFile?.type || null,
              sourcePdfObjectKey,
              storageLocation,
            });

            const parsedPdf = pdfBuffer
              ? await parsePDF(
                  {
                    providerId: 'unpdf',
                    apiKey: '',
                    baseUrl: undefined,
                  },
                  pdfBuffer,
                )
              : null;

            if (parsedPdf && submissionId) {
              const parsedPdfRecord = await uploadParsedPdfAssets(submissionId, parsedPdf);
              await upsertLearningSubmission({
                submissionId,
                requirement: normalizedRequirement,
                options: {
                  enableWebSearch,
                  enableImageGeneration,
                  enableVideoGeneration,
                  enableTTS,
                  agentMode,
                },
                parsedPdf: parsedPdfRecord,
              });
            }

            if (parsedPdf) {
              enqueue({
                type: 'progress',
                step: 'pdf_parsed',
                progress: 8,
                message: 'The PDF has been parsed successfully',
              });
            } else {
              enqueue({
                type: 'progress',
                step: 'prompt_prepared',
                progress: 8,
                message: 'Prompt-only generation request prepared successfully',
              });
            }

            enqueue({
              type: 'progress',
              step: 'calling_openmaic',
              progress: 10,
              message: 'OpenMAIC is starting the classroom generation',
            });

            draftId = nanoid(12);

            const result = await generateClassroom(
              {
                requirement: normalizedRequirement,
                ...(parsedPdf
                  ? {
                      pdfContent: {
                        text: parsedPdf.text,
                        images: parsedPdf.images ?? [],
                      },
                    }
                  : {}),
                enableWebSearch,
                enableImageGeneration,
                enableVideoGeneration,
                enableTTS,
                agentMode,
              },
              {
                baseUrl: buildRequestOrigin(req),
                throwIfCancelled,
                onOutlinesReady: async ({ stage, outlines }) => {
                  throwIfCancelled();
                  classroomId = stage.id;

                  const draft = await createDraftWithPlaceholders({
                    draftId: draftId!,
                    submissionId: submissionId!,
                    classroomId: stage.id,
                    outputDir: `postgres://openmaic/submissions/${submissionId}`,
                    outputDirRelative: storageLocation,
                    stage,
                    outlines,
                  });

                  await upsertLearningSubmission({
                    submissionId: submissionId!,
                    requirement: normalizedRequirement,
                    options: {
                      enableWebSearch,
                      enableImageGeneration,
                      enableVideoGeneration,
                      enableTTS,
                      agentMode,
                    },
                    classroomId: stage.id,
                    draftId: draft.draftId,
                    storageLocation,
                  });

                  enqueue({
                    type: 'progress',
                    step: 'draft_initialized',
                    progress: 32,
                    message: 'Draft created. You can open ready scenes as they arrive.',
                    scenesGenerated: 0,
                    totalScenes: outlines.length,
                    draftId: draft.draftId,
                    classroomId: stage.id,
                  });
                },
                onSceneReady: async ({ scene, generatedScenes, totalScenes }) => {
                  throwIfCancelled();
                  await updateDraftScene({
                    draftId: draftId!,
                    scene,
                  });
                  enqueue({
                    type: 'progress',
                    step: 'scene_ready',
                    progress: Math.min(90, 30 + Math.floor((generatedScenes / Math.max(totalScenes, 1)) * 60)),
                    message: `Scene ${scene.order + 1} is ready for review.`,
                    scenesGenerated: generatedScenes,
                    totalScenes,
                    draftId: draftId!,
                    classroomId: scene.stageId,
                  });
                },
                onProgress: async (progress) => {
                  throwIfCancelled();
                  enqueue({
                    type: 'progress',
                    step: progress.step,
                    progress: progress.progress,
                    message: progress.message,
                    scenesGenerated: progress.scenesGenerated,
                    totalScenes: progress.totalScenes,
                    draftId: draftId || undefined,
                    classroomId: classroomId || undefined,
                  });
                },
              },
            );

            throwIfCancelled();
            classroomId = result.id;
            const draft = await createDraft({
              draftId: draftId!,
              submissionId: submissionId!,
              classroomId: result.id,
              outputDir: `postgres://openmaic/submissions/${submissionId}`,
              outputDirRelative: storageLocation,
              stage: result.stage,
              scenes: result.scenes,
            });
            await upsertLearningSubmission({
              submissionId,
              requirement: normalizedRequirement,
              options: {
                enableWebSearch,
                enableImageGeneration,
                enableVideoGeneration,
                enableTTS,
                agentMode,
              },
              classroomId: result.id,
              draftId: draft.draftId,
              openmaicResponse: result as unknown as Record<string, unknown>,
            });

            enqueue({
              type: 'done',
              data: {
                success: true,
                draftId: draft.draftId,
                submissionId,
                outputDir: draft.outputDir,
                outputDirRelative: draft.outputDirRelative,
                classroomId: result.id,
                classroomUrl: result.url,
                scenesCount: result.scenesCount,
                stage: result.stage,
                scenes: result.scenes,
                draftStatus: draft.status,
              },
            });
          } catch (error) {
            if (error instanceof CourseMakerRunCancelledError) {
              log.info('Learning expert generation cancelled', {
                runId: runId || undefined,
                requirementPreview: requirementSnippet,
              });
              enqueue({
                type: 'error',
                error: 'Generation was cancelled by the learning expert.',
              });
              if (submissionId) {
                await deleteLearningSubmission(submissionId, classroomId).catch(() => undefined);
              }
              return;
            }

            log.error(
              `Learning expert generation failed [requirement="${requirementSnippet ?? 'unknown'}..."]:`,
              error,
            );

            enqueue({
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          } finally {
            if (runId) {
              finishCourseMakerRun(runId);
            }
            closeController();
          }
        })();
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
      },
    });
  } catch (error) {
    if (submissionId) {
      await deleteLearningSubmission(submissionId, classroomId).catch(() => undefined);
    }
    log.error(
      `Learning expert generation failed [requirement="${requirementSnippet ?? 'unknown'}..."]:`,
      error,
    );

    return new Response(
      jsonLine({
        type: 'error',
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/x-ndjson; charset=utf-8',
          'Cache-Control': 'no-cache',
        },
      },
    );
  }
}
