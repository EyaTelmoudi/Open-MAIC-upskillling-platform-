import { promises as fs } from 'fs';
import path from 'path';
import { nanoid } from 'nanoid';
import { NextRequest } from 'next/server';
import { parsePDF } from '@/lib/pdf/pdf-providers';
import { createLogger } from '@/lib/logger';
import { generateClassroom } from '@/lib/server/classroom-generation';
import { buildRequestOrigin, CLASSROOMS_DIR, writeJsonFileAtomic } from '@/lib/server/classroom-storage';
import { createDraft } from '@/lib/learing-expert-agent/draft-store';

const log = createLogger('LearningExpertAgentAPI');

export const maxDuration = 300;

const OUTPUT_ROOT = path.join(process.cwd(), 'learing expert agent', 'outputs');

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

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

type ProgressEvent =
  | {
      type: 'progress';
      step: string;
      progress: number;
      message: string;
      scenesGenerated?: number;
      totalScenes?: number;
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

  try {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      return new Response(
        jsonLine({
          type: 'error',
          error: `Invalid Content-Type: expected multipart/form-data, got "${contentType}"`,
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
    const pdfFile = formData.get('pdf') as File | null;

    if (!requirement || !pdfFile) {
      return new Response(
        jsonLine({
          type: 'error',
          error: !requirement ? 'The course request is required' : 'The PDF file is required',
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

    requirementSnippet = requirement.slice(0, 80);

    const enableWebSearch = String(formData.get('enableWebSearch') || '') === 'true';
    const enableImageGeneration = String(formData.get('enableImageGeneration') || '') === 'true';
    const enableVideoGeneration = String(formData.get('enableVideoGeneration') || '') === 'true';
    const enableTTS = String(formData.get('enableTTS') || '') === 'true';
    const agentMode =
      String(formData.get('agentMode') || 'default') === 'generate' ? 'generate' : 'default';

    const pdfBuffer = Buffer.from(await pdfFile.arrayBuffer());
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      start(controller) {
        const enqueue = (event: ProgressEvent) => {
          controller.enqueue(encoder.encode(jsonLine(event)));
        };

        void (async () => {
          try {
            enqueue({
              type: 'progress',
              step: 'preparing_request',
              progress: 2,
              message: 'Preparing the request for OpenMAIC',
            });

            const parsedPdf = await parsePDF(
              {
                providerId: 'unpdf',
                apiKey: '',
                baseUrl: undefined,
              },
              pdfBuffer,
            );

            enqueue({
              type: 'progress',
              step: 'pdf_parsed',
              progress: 8,
              message: 'The PDF has been parsed successfully',
            });

            const submissionId = `${new Date().toISOString().replace(/[:.]/g, '-')}_${slugify(requirement).slice(0, 40)}_${nanoid(6)}`;
            const outputDir = path.join(OUTPUT_ROOT, submissionId);
            await fs.mkdir(outputDir, { recursive: true });

            await fs.writeFile(path.join(outputDir, safeFileName(pdfFile.name)), pdfBuffer);

            await writeJsonFileAtomic(path.join(outputDir, 'request.json'), {
              requirement,
              options: {
                enableWebSearch,
                enableImageGeneration,
                enableVideoGeneration,
                enableTTS,
                agentMode,
              },
              pdf: {
                fileName: pdfFile.name,
                size: pdfFile.size,
                type: pdfFile.type,
              },
              createdAt: new Date().toISOString(),
            });

            await writeJsonFileAtomic(path.join(outputDir, 'parsed-pdf.json'), {
              text: parsedPdf.text,
              imagesCount: parsedPdf.images?.length ?? 0,
              metadata: parsedPdf.metadata ?? {},
            });

            enqueue({
              type: 'progress',
              step: 'calling_openmaic',
              progress: 10,
              message: 'OpenMAIC is starting the classroom generation',
            });

            const result = await generateClassroom(
              {
                requirement,
                pdfContent: {
                  text: parsedPdf.text,
                  images: parsedPdf.images ?? [],
                },
                enableWebSearch,
                enableImageGeneration,
                enableVideoGeneration,
                enableTTS,
                agentMode,
              },
              {
                baseUrl: buildRequestOrigin(req),
                onProgress: async (progress) => {
                  enqueue({
                    type: 'progress',
                    step: progress.step,
                    progress: progress.progress,
                    message: progress.message,
                    scenesGenerated: progress.scenesGenerated,
                    totalScenes: progress.totalScenes,
                  });
                },
              },
            );

            const classroomJsonPath = path.join(CLASSROOMS_DIR, `${result.id}.json`);
            if (await pathExists(classroomJsonPath)) {
              await fs.copyFile(classroomJsonPath, path.join(outputDir, 'classroom.json'));
            }

            const classroomAssetsDir = path.join(CLASSROOMS_DIR, result.id);
            if (await pathExists(classroomAssetsDir)) {
              await fs.cp(classroomAssetsDir, path.join(outputDir, 'classroom-assets'), {
                recursive: true,
              });
            }

            await writeJsonFileAtomic(path.join(outputDir, 'openmaic-response.json'), result);

            const draftId = nanoid(12);
            const draft = await createDraft({
              draftId,
              submissionId,
              classroomId: result.id,
              outputDir,
              outputDirRelative: path.relative(process.cwd(), outputDir),
              stage: result.stage,
              scenes: result.scenes,
            });

            enqueue({
              type: 'done',
              data: {
                success: true,
                draftId: draft.draftId,
                submissionId,
                outputDir,
                outputDirRelative: path.relative(process.cwd(), outputDir),
                classroomId: result.id,
                classroomUrl: result.url,
                scenesCount: result.scenesCount,
                stage: result.stage,
                scenes: result.scenes,
                draftStatus: draft.status,
              },
            });
          } catch (error) {
            log.error(
              `Learning expert generation failed [requirement="${requirementSnippet ?? 'unknown'}..."]:`,
              error,
            );

            enqueue({
              type: 'error',
              error: error instanceof Error ? error.message : 'Unknown error',
            });
          } finally {
            controller.close();
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
