import { buildPrompt, PROMPT_IDS } from '@/lib/prompts';
import { callLLM } from '@/lib/ai/llm';
import { createLogger } from '@/lib/logger';
import { apiSuccess } from '@/lib/server/api-response';
import { deleteDraft, plainTextToHtml, readDraft, saveDraft } from '@/lib/learing-expert-agent/draft-store';
import type {
  EditableBlock,
  EditableInteractiveInstructionBlock,
  EditableQuizQuestionBlock,
  EditableSceneDraft,
  EditableScriptBlock,
  EditableSlideTextBlock,
  LearningExpertDraft,
} from '@/lib/learing-expert-agent/types';
import { resolveModelFromRequest } from '@/lib/server/resolve-model';

const log = createLogger('LearningExpertDraftAPI');

type RevisionRequestBody = {
  sceneId?: string;
  instruction?: string;
  conversation?: Array<{ role: 'user' | 'assistant'; content: string }>;
};

type RevisedBlock =
  | {
      id: string;
      type: 'slide_text';
      plainText?: string;
    }
  | {
      id: string;
      type: 'script';
      text?: string;
    }
  | {
      id: string;
      type: 'quiz_question';
      question?: string;
      explanation?: string;
      correctAnswer?: string[];
      options?: Array<{ value: string; label: string }>;
    }
  | {
      id: string;
      type: 'interactive_instruction';
      text?: string;
    }
  | {
      id: string;
      type: string;
    };

type RevisionResponsePayload = {
  title?: string;
  changesSummary?: string;
  blocks?: RevisedBlock[];
};

type SceneRole = 'opening' | 'overview' | 'content' | 'practice' | 'summary';

const INTRO_DEFINITION_PATTERNS = [
  /\b(backbone|skeleton)\b/i,
  /\bframe of a house\b/i,
  /\blets browsers? (know|understand|display)\b/i,
  /\bgives? (a|the) page its basic structure\b/i,
];

const CONTENT_BAD_PATTERNS = [
  /^\s*(welcome|hi there|hello everyone)\b/i,
  /\b(backbone|skeleton)\b/i,
  /\*\*[^*]+\*\*/,
];

function extractJsonObject(text: string): RevisionResponsePayload {
  const trimmed = text.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) {
    throw new Error('The revision assistant did not return a valid JSON object.');
  }
  return JSON.parse(trimmed.slice(start, end + 1)) as RevisionResponsePayload;
}

function normalizeConversation(
  conversation: Array<{ role: 'user' | 'assistant'; content: string }> | undefined,
): string {
  if (!conversation || conversation.length === 0) return 'No prior assistant conversation.';
  return conversation
    .slice(-6)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join('\n');
}

function deriveSceneRole(scene: EditableSceneDraft): SceneRole {
  const blockText = scene.blocks
    .map((block) => {
      switch (block.type) {
        case 'slide_text':
          return block.plainText || '';
        case 'script':
          return block.text || '';
        case 'quiz_question':
          return `${block.question} ${block.explanation}`;
        case 'interactive_instruction':
          return block.text || '';
        default:
          return '';
      }
    })
    .join(' ');

  const haystack = `${scene.title} ${scene.type} ${blockText}`
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

  if (
    /\b(welcome|introduction|intro|course overview|overview|roadmap|objectives?|learning outcomes?)\b/.test(
      haystack,
    )
  ) {
    return haystack.includes('overview') || haystack.includes('roadmap') ? 'overview' : 'opening';
  }

  if (/\b(summary|recap|conclusion|wrap[- ]?up|key takeaways?)\b/.test(haystack)) {
    return 'summary';
  }

  if (
    scene.type === 'quiz' ||
    /\b(practice|exercise|quiz|activity|hands[- ]?on|challenge)\b/.test(haystack)
  ) {
    return 'practice';
  }

  return 'content';
}

function hasIntroDefinitionPattern(text: string): boolean {
  return INTRO_DEFINITION_PATTERNS.some((pattern) => pattern.test(text));
}

function isRevisionPayloadAcceptable(
  role: SceneRole,
  payload: RevisionResponsePayload,
): boolean {
  const scriptTexts = (payload.blocks || [])
    .filter((block): block is Extract<RevisedBlock, { type: 'script' }> => block.type === 'script')
    .map((block) => block.text || '')
    .filter(Boolean);
  if (role === 'opening' || role === 'overview') {
    if (scriptTexts.some((text) => hasIntroDefinitionPattern(text))) {
      return false;
    }
  }
  if (role === 'content') {
    if (scriptTexts.some((text) => CONTENT_BAD_PATTERNS.some((pattern) => pattern.test(text)))) {
      return false;
    }
  }
  return true;
}

function mergeBlock(original: EditableBlock, revised: RevisedBlock | undefined): EditableBlock {
  if (!revised || revised.id !== original.id || revised.type !== original.type) {
    return original;
  }

  switch (original.type) {
    case 'slide_text': {
      const revisedSlide = revised as Extract<RevisedBlock, { type: 'slide_text' }>;
      const nextPlainText =
        typeof revisedSlide.plainText === 'string' ? revisedSlide.plainText.trim() : '';
      if (!nextPlainText) return original;
      return {
        ...(original as EditableSlideTextBlock),
        plainText: nextPlainText,
        html: plainTextToHtml(nextPlainText),
      };
    }
    case 'script': {
      const revisedScript = revised as Extract<RevisedBlock, { type: 'script' }>;
      const nextText = typeof revisedScript.text === 'string' ? revisedScript.text.trim() : '';
      if (!nextText) return original;
      return {
        ...(original as EditableScriptBlock),
        text: nextText,
      };
    }
    case 'quiz_question': {
      const quizBlock = original as EditableQuizQuestionBlock;
      const revisedQuiz = revised as Extract<RevisedBlock, { type: 'quiz_question' }>;
      const optionLabelMap = new Map(
        (revisedQuiz.options || [])
          .filter((option) => option && typeof option.value === 'string')
          .map((option) => [option.value, typeof option.label === 'string' ? option.label : '']),
      );

      return {
        ...quizBlock,
        question:
          typeof revisedQuiz.question === 'string' && revisedQuiz.question.trim()
            ? revisedQuiz.question.trim()
            : quizBlock.question,
        explanation:
          typeof revisedQuiz.explanation === 'string'
            ? revisedQuiz.explanation.trim()
            : quizBlock.explanation,
        correctAnswer:
          Array.isArray(revisedQuiz.correctAnswer) && revisedQuiz.correctAnswer.length > 0
            ? revisedQuiz.correctAnswer.map((value) => String(value).trim()).filter(Boolean)
            : quizBlock.correctAnswer,
        options: quizBlock.options.map((option) => ({
          ...option,
          label:
            optionLabelMap.has(option.value) && optionLabelMap.get(option.value)?.trim()
              ? String(optionLabelMap.get(option.value)).trim()
              : option.label,
        })),
      };
    }
    case 'interactive_instruction': {
      const revisedInstruction = revised as Extract<
        RevisedBlock,
        { type: 'interactive_instruction' }
      >;
      const nextText =
        typeof revisedInstruction.text === 'string' ? revisedInstruction.text.trim() : '';
      if (!nextText) return original;
      return {
        ...(original as EditableInteractiveInstructionBlock),
        text: nextText,
      };
    }
    default:
      return original;
  }
}

function mergeSceneRevision(
  scene: EditableSceneDraft,
  revision: RevisionResponsePayload,
): EditableSceneDraft {
  const revisedBlocks = new Map((revision.blocks || []).map((block) => [block.id, block]));

  return {
    ...scene,
    title:
      typeof revision.title === 'string' && revision.title.trim()
        ? revision.title.trim()
        : scene.title,
    blocks: scene.blocks.map((block) => mergeBlock(block, revisedBlocks.get(block.id))),
  };
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const draft = await readDraft(draftId);
    if (!draft) {
      return Response.json({ success: false, error: 'Draft not found' }, { status: 404 });
    }
    return apiSuccess({ draft });
  } catch (error) {
    log.error('Failed to read learning expert draft:', error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const body = (await request.json()) as { draft: LearningExpertDraft };
    if (!body.draft || body.draft.draftId !== draftId) {
      return Response.json({ success: false, error: 'Invalid draft payload' }, { status: 400 });
    }

    const normalizedDraft: LearningExpertDraft = {
      ...body.draft,
      editableScenes: body.draft.editableScenes.map((scene) => ({
        ...scene,
        blocks: scene.blocks.map((block) => {
          if (block.type === 'slide_text') {
            return {
              ...block,
              html: plainTextToHtml(block.plainText),
            };
          }
          return block;
        }),
      })),
    };

    const savedDraft = await saveDraft(normalizedDraft);
    return apiSuccess({ draft: savedDraft });
  } catch (error) {
    log.error('Failed to save learning expert draft:', error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const body = (await request.json()) as RevisionRequestBody;
    const sceneId = String(body?.sceneId || '').trim();
    const instruction = String(body?.instruction || '').trim();

    if (!sceneId || !instruction) {
      return Response.json(
        { success: false, error: 'Scene id and revision instruction are required.' },
        { status: 400 },
      );
    }

    const draft = await readDraft(draftId);
    if (!draft) {
      return Response.json({ success: false, error: 'Draft not found' }, { status: 404 });
    }

    const selectedScene = draft.editableScenes.find((scene) => scene.sceneId === sceneId);
    if (!selectedScene) {
      return Response.json({ success: false, error: 'Scene not found' }, { status: 404 });
    }

    const prompts = buildPrompt(PROMPT_IDS.DRAFT_SCENE_REVISION, {
      sceneRole: deriveSceneRole(selectedScene),
      courseTitle: draft.stage.name || draft.draftId,
      languageDirective: draft.stage.languageDirective || 'Follow the current course language.',
      sceneType: selectedScene.type,
      sceneOrder: selectedScene.order,
      sceneTitle: selectedScene.title,
      instruction: `${instruction}\n\nRecent conversation:\n${normalizeConversation(body.conversation)}`,
      sceneJson: JSON.stringify(selectedScene, null, 2),
    });

    if (!prompts) {
      throw new Error('The draft-scene-revision prompt could not be loaded.');
    }

    const nextRequest = request as import('next/server').NextRequest;
    const { model, modelInfo, thinkingConfig } = await resolveModelFromRequest(nextRequest, body);
    const sceneRole = deriveSceneRole(selectedScene);
    const result = await callLLM(
      {
        model,
        messages: [
          { role: 'system', content: prompts.system },
          { role: 'user', content: prompts.user },
        ],
        maxOutputTokens: modelInfo?.outputWindow,
      },
      'draft-scene-revision',
      {
        retries: 1,
        validate: (text) => {
          if (!text.trim()) return false;
          try {
            const payload = extractJsonObject(text);
            return isRevisionPayloadAcceptable(sceneRole, payload);
          } catch {
            return false;
          }
        },
      },
      thinkingConfig,
    );

    const revisionPayload = extractJsonObject(result.text);
    const revision = mergeSceneRevision(selectedScene, revisionPayload);
    const nextDraft = {
      ...draft,
      editableScenes: draft.editableScenes.map((scene) =>
        scene.sceneId === sceneId ? revision : scene,
      ),
    };
    const savedDraft = await saveDraft(nextDraft);

    return apiSuccess({
      draft: savedDraft,
      revisedScene: revision,
      assistantMessage:
        revisionPayload.changesSummary || 'The selected scene was revised and saved.',
    });
  } catch (error) {
    log.error('Failed to revise learning expert draft scene:', error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const deleted = await deleteDraft(draftId);
    if (!deleted) {
      return Response.json({ success: false, error: 'Draft not found' }, { status: 404 });
    }
    return apiSuccess({ deleted: true, draftId });
  } catch (error) {
    log.error('Failed to delete learning expert draft:', error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    );
  }
}
