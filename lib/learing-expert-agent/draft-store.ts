import type { Action, SpeechAction, SpotlightAction, LaserAction } from '@/lib/types/action';
import type { SceneOutline } from '@/lib/types/generation';
import type { PPTElement, Slide, SlideTheme } from '@/lib/types/slides';
import type { QuizQuestion, Scene, Stage } from '@/lib/types/stage';
import { persistClassroom } from '@/lib/server/classroom-storage';
import { generateTTSForClassroom } from '@/lib/server/classroom-media-generation';
import {
  createOrUpdateLearningDraft,
  deleteLearningDraft,
  listLearningDraftSummaries,
  readFinalizedLearningCourse,
  readLearningDraft,
} from '@/lib/server/learning-storage';
import type {
  DraftSummary,
  EditableBlock,
  EditableInteractiveInstructionBlock,
  EditableQuizQuestionBlock,
  EditableSceneDraft,
  EditableScriptBlock,
  EditableSlideTextBlock,
  FinalizedCoursePackage,
  LearningExpertDraft,
} from './types';

const DEFAULT_SLIDE_THEME: SlideTheme = {
  backgroundColor: '#ffffff',
  themeColors: ['#5b9bd5', '#ed7d31', '#a5a5a5', '#ffc000', '#4472c4'],
  fontColor: '#333333',
  fontName: 'Microsoft YaHei',
  outline: { color: '#d14424', width: 2, style: 'solid' },
  shadow: { h: 0, v: 0, blur: 10, color: '#000000' },
};

function buildSceneSlotId(order: number): string {
  return `scene_slot_${order}`;
}

function createPlaceholderTextElement(sceneId: string, outline: SceneOutline): PPTElement {
  return {
    id: `${sceneId}_placeholder_text`,
    type: 'text',
    left: 80,
    top: 120,
    width: 840,
    height: 180,
    rotate: 0,
    content: `<p style="font-size:24px; text-align:center; color:#0f172a;"><strong>${escapeHtml(
      outline.title,
    )}</strong></p><p style="font-size:18px; text-align:center; color:#475569;">This scene is still being generated.</p>`,
    defaultFontName: 'Microsoft YaHei',
    defaultColor: '#0f172a',
  };
}

function createPlaceholderScene(stage: Stage, outline: SceneOutline): Scene {
  const sceneId = buildSceneSlotId(outline.order);
  const now = Date.now();

  if (outline.type === 'slide') {
    const slide: Slide = {
      id: `${sceneId}_canvas`,
      viewportSize: 1000,
      viewportRatio: 0.5625,
      theme: DEFAULT_SLIDE_THEME,
      elements: [createPlaceholderTextElement(sceneId, outline)],
      background: {
        type: 'gradient',
        gradient: {
          type: 'linear',
          colors: [
            { color: '#f8fffd', pos: 0 },
            { color: '#eef6ff', pos: 100 },
          ],
          rotate: 135,
        },
      },
    };

    return {
      id: sceneId,
      stageId: stage.id,
      type: outline.type,
      title: outline.title,
      order: outline.order,
      content: {
        type: 'slide',
        canvas: slide,
      },
      actions: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  if (outline.type === 'quiz') {
    const questions: QuizQuestion[] = [
      {
        id: `${sceneId}_question_1`,
        type: 'single',
        question: 'Quiz content is still being generated.',
        options: [
          { value: 'A', label: 'Please wait for this scene to finish.' },
          { value: 'B', label: 'Open another ready scene in the meantime.' },
        ],
        answer: ['A'],
        analysis: '',
      },
    ];

    return {
      id: sceneId,
      stageId: stage.id,
      type: outline.type,
      title: outline.title,
      order: outline.order,
      content: {
        type: 'quiz',
        questions,
      },
      actions: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  if (outline.type === 'interactive') {
    return {
      id: sceneId,
      stageId: stage.id,
      type: outline.type,
      title: outline.title,
      order: outline.order,
      content: {
        type: 'interactive',
        url: '',
        html: `<section style="display:flex;align-items:center;justify-content:center;min-height:320px;font-family:Segoe UI, sans-serif;background:linear-gradient(135deg,#f8fffd,#eef6ff);color:#0f172a;"><div style="text-align:center;"><h2>${escapeHtml(
          outline.title,
        )}</h2><p>This interactive scene is still being generated.</p></div></section>`,
      },
      actions: [],
      createdAt: now,
      updatedAt: now,
    };
  }

  return {
    id: sceneId,
    stageId: stage.id,
    type: outline.type,
    title: outline.title,
    order: outline.order,
    content: {
      type: 'pbl',
      projectConfig: {
        projectInfo: {
          title: outline.title,
          description: outline.description || 'Project details are still being generated.',
        },
        agents: [],
        issueboard: {
          agent_ids: [],
          issues: [],
          current_issue_id: null,
        },
        chat: {
          messages: [],
        },
      },
    },
    actions: [],
    createdAt: now,
    updatedAt: now,
  };
}

function stripHtml(html: string): string {
  return decodeHtmlEntities(
    html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim(),
  );
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  };

  let decoded = value;
  for (let i = 0; i < 5; i += 1) {
    const next = decoded.replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity: string) => {
      if (entity[0] === '#') {
        const isHex = entity[1]?.toLowerCase() === 'x';
        const raw = isHex ? entity.slice(2) : entity.slice(1);
        const codePoint = Number.parseInt(raw, isHex ? 16 : 10);
        return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
      }
      return namedEntities[entity] ?? match;
    });

    if (next === decoded) {
      break;
    }
    decoded = next;
  }

  return decoded;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function textBlockLabel(index: number): string {
  return index === 0 ? 'Slide title/content block 1' : `Slide content block ${index + 1}`;
}

function speechBlocks(actions: Action[] | undefined): EditableScriptBlock[] {
  const blocks: EditableScriptBlock[] = [];
  let currentLinkedElementId: string | undefined;

  for (const action of actions || []) {
    if (action.type === 'spotlight' || action.type === 'laser') {
      currentLinkedElementId = (action as SpotlightAction | LaserAction).elementId;
      continue;
    }

    if (action.type !== 'speech') {
      continue;
    }

    blocks.push({
      id: `script_${blocks.length + 1}`,
      type: 'script',
      actionId: action.id,
      text: action.text,
      linkedElementId: currentLinkedElementId,
    });
  }

  return blocks;
}

function tokenizeForScriptMatching(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u00c0-\u017f\s]/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function splitTeacherScript(text: string): string[] {
  return text
    .replace(/。/g, '. ')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function bestScriptSegmentForText(text: string, segments: string[], fallbackIndex: number): string {
  if (segments.length === 0) return '';

  const textTokens = tokenizeForScriptMatching(text);
  let bestSegment = segments[Math.min(fallbackIndex, segments.length - 1)];
  let bestScore = -1;

  segments.forEach((segment) => {
    const segmentTokens = new Set(tokenizeForScriptMatching(segment));
    const score = textTokens.filter((token) => segmentTokens.has(token)).length;
    if (score > bestScore) {
      bestScore = score;
      bestSegment = segment;
    }
  });

  return bestSegment;
}

function ensureSlideScriptsPerContentBlock(
  textBlocks: EditableSlideTextBlock[],
  scripts: EditableScriptBlock[],
): EditableScriptBlock[] {
  const contentBlocks = textBlocks.length > 1 ? textBlocks.slice(1) : textBlocks;
  if (contentBlocks.length === 0 || scripts.length !== 1) {
    return scripts;
  }

  const [globalScript] = scripts;
  const segments = splitTeacherScript(globalScript.text);
  if (segments.length === 0) {
    return scripts;
  }

  const generatedScripts = contentBlocks.map((block, index) => ({
    id: `script_${index + 1}`,
    type: 'script' as const,
    actionId: `${globalScript.actionId}_${block.elementId}`,
    text: bestScriptSegmentForText(block.plainText, segments, index),
    linkedElementId: block.elementId,
  }));

  return generatedScripts;
}

function normalizeSlideScene(scene: Scene): EditableSceneDraft {
  const textElements = (scene.content.type === 'slide' ? scene.content.canvas.elements : [])
    .filter((element) => element.type === 'text' && 'content' in element)
    .map((element, index) => {
      const html = String(element.content || '');
      return {
        id: `slide_text_${index + 1}`,
        type: 'slide_text',
        elementId: element.id,
        label: textBlockLabel(index),
        html,
        plainText: stripHtml(html),
      } satisfies EditableSlideTextBlock;
    });
  const scriptElements = ensureSlideScriptsPerContentBlock(textElements, speechBlocks(scene.actions));

  return {
    sceneId: scene.id,
    sourceSceneId: scene.id,
    order: scene.order,
    type: scene.type,
    title: scene.title,
    status: 'draft',
    blocks: [...textElements, ...scriptElements],
  };
}

function normalizeQuizScene(scene: Scene): EditableSceneDraft {
  const questions = scene.content.type === 'quiz' ? scene.content.questions : [];
  const blocks: EditableBlock[] = [];

  questions.forEach((question, index) => {
    blocks.push({
      id: `quiz_question_${index + 1}`,
      type: 'quiz_question',
      questionId: question.id,
      question: question.question,
      explanation: question.analysis || '',
      correctAnswer: question.answer || [],
      options: (question.options || []).map((option) => ({
        value: option.value,
        label: option.label,
      })),
    } satisfies EditableQuizQuestionBlock);
  });

  blocks.push(...speechBlocks(scene.actions));

  return {
    sceneId: scene.id,
    sourceSceneId: scene.id,
    order: scene.order,
    type: scene.type,
    title: scene.title,
    status: 'draft',
    blocks,
  };
}

function normalizeInteractiveScene(scene: Scene): EditableSceneDraft {
  const blocks: EditableBlock[] = [];
  const instructions = (scene.actions || [])
    .filter((action): action is SpeechAction => action.type === 'speech')
    .map((action) => action.text)
    .join('\n\n');

  blocks.push({
    id: 'interactive_instructions',
    type: 'interactive_instruction',
    text: instructions,
  } satisfies EditableInteractiveInstructionBlock);

  blocks.push(...speechBlocks(scene.actions));

  return {
    sceneId: scene.id,
    sourceSceneId: scene.id,
    order: scene.order,
    type: scene.type,
    title: scene.title,
    status: 'draft',
    blocks,
    readonlyHtml: scene.content.type === 'interactive' ? scene.content.html || '' : '',
    previewHtml: scene.content.type === 'interactive' ? scene.content.html || '' : '',
  };
}

function normalizeScene(scene: Scene): EditableSceneDraft {
  switch (scene.type) {
    case 'slide':
      return normalizeSlideScene(scene);
    case 'quiz':
      return normalizeQuizScene(scene);
    case 'interactive':
      return normalizeInteractiveScene(scene);
    case 'pbl':
      return {
        sceneId: scene.id,
        sourceSceneId: scene.id,
        order: scene.order,
        type: scene.type,
        title: scene.title,
        status: 'draft',
        blocks: speechBlocks(scene.actions),
      };
    default:
      return {
        sceneId: scene.id,
        sourceSceneId: scene.id,
        order: scene.order,
        type: scene.type,
        title: scene.title,
        status: 'draft',
        blocks: [],
      };
  }
}

function normalizeSceneWithStatus(
  scene: Scene,
  status: EditableSceneDraft['status'],
): EditableSceneDraft {
  return {
    ...normalizeScene(scene),
    status,
  };
}

function sortScenesByOrder<T extends { order: number }>(scenes: T[]): T[] {
  return [...scenes].sort((a, b) => a.order - b.order);
}

function deriveDraftStatus(editableScenes: EditableSceneDraft[]): LearningExpertDraft['status'] {
  if (editableScenes.some((scene) => scene.status === 'generating')) {
    return 'generating';
  }
  if (editableScenes.length > 0 && editableScenes.every((scene) => scene.status === 'approved')) {
    return 'approved';
  }
  return 'draft';
}

function isCodeLikeText(text: string): boolean {
  return /<!doctype|<html>|<head>|<body>|<title>|<\/html>|<\/body>|<\/head>/i.test(text);
}

function isBulletLikeText(text: string): boolean {
  return (
    text.includes('\u2022') ||
    text.includes('â€¢') ||
    text.includes('â¢') ||
    /^\s*[-*]\s+/m.test(text)
  );
}

function normalizeBulletLines(text: string): string[] {
  const compact = text.replace(/\s*•\s*/g, '\n• ').trim();
  return compact
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatBulletHtml(text: string): string {
  const lines = normalizeBulletLines(text);
  return lines
    .map(
      (line) =>
        `<p style="font-size:18px; color:#1f2937; line-height:1.55; text-align:left;">${escapeHtml(line)}</p>`,
    )
    .join('');
}

function formatCodeHtml(text: string): string {
  const codeLines = text
    .replace(/>\s+</g, '>\n<')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return `<p style="font-size:14px; font-family:Consolas, 'Courier New', monospace; color:#0f172a; line-height:1.65; background:#ecfeff; padding:10px;">${codeLines
    .map((line) => escapeHtml(line))
    .join('<br/>')}</p>`;
}

function formatTitleHtml(text: string): string {
  return `<p style="font-size:32px; text-align:center; color:#0f766e;"><strong>${escapeHtml(
    text,
  )}</strong></p>`;
}

function normalizeSlideCanvasVisuals(scene: Scene): Scene {
  if (scene.content.type !== 'slide') return scene;

  const textElements = scene.content.canvas.elements
    .filter((element) => element.type === 'text' && 'content' in element)
    .slice()
    .sort((a, b) => a.top - b.top);

  const titleElementId = textElements[0]?.id;

  const updatedElements = scene.content.canvas.elements.map((element) => {
    if (element.type !== 'text' || !('content' in element)) return element;

    const text = stripHtml(String(element.content || ''));

    if (element.id === titleElementId) {
      return {
        ...element,
        left: 60,
        top: 50,
        width: 880,
        content: formatTitleHtml(text || scene.title),
        defaultColor: '#0f766e',
      };
    }

    if (isCodeLikeText(text)) {
      return {
        ...element,
        left: 80,
        width: 840,
        content: formatCodeHtml(text),
        defaultColor: '#0f172a',
      };
    }

    if (text.includes('•')) {
      return {
        ...element,
        left: 80,
        width: 840,
        content: formatBulletHtml(text),
        defaultColor: '#1f2937',
      };
    }

    return element;
  });

  const nextBackground =
    scene.content.canvas.background?.type === 'gradient'
      ? scene.content.canvas.background
      : {
          type: 'gradient' as const,
          gradient: {
            type: 'linear' as const,
            colors: [
              { color: '#f8fffd', pos: 0 },
              { color: '#eef6ff', pos: 100 },
            ],
            rotate: 135,
          },
        };

  return {
    ...scene,
    content: {
      ...scene.content,
      canvas: {
        ...scene.content.canvas,
        background: nextBackground,
        elements: updatedElements,
      },
    },
  };
}

function applySlideDraft(scene: Scene, draft: EditableSceneDraft): Scene {
  if (scene.content.type !== 'slide') return scene;

  const textBlocks = draft.blocks.filter(
    (block): block is EditableSlideTextBlock => block.type === 'slide_text',
  );
  const scriptBlocks = draft.blocks.filter(
    (block): block is EditableScriptBlock => block.type === 'script',
  );

  const elementMap = new Map(textBlocks.map((block) => [block.elementId, block]));
  const updatedElements = scene.content.canvas.elements.map((element) => {
    if (element.type !== 'text' || !('content' in element)) return element;
    const block = elementMap.get(element.id);
    if (!block) return element;
    const plainText = decodeHtmlEntities(block.plainText || stripHtml(block.html || ''));
    const safeHtml = isCodeLikeText(plainText)
      ? formatCodeHtml(plainText)
      : isBulletLikeText(plainText)
        ? formatBulletHtml(plainText)
        : plainTextToHtml(plainText);
    return {
      ...element,
      content: safeHtml,
    };
  });

  const updatedActions = (scene.actions || []).map((action) => {
    if (action.type !== 'speech') return action;
    const block = scriptBlocks.find((candidate) => candidate.actionId === action.id);
    if (!block) return action;
    return {
      ...action,
      text: block.text,
    };
  });

  const updatedScene = {
    ...scene,
    title: draft.title,
    content: {
      ...scene.content,
      canvas: {
        ...scene.content.canvas,
        elements: updatedElements,
      },
    },
    actions: updatedActions,
  };

  return normalizeSlideCanvasVisuals(updatedScene);
}

function applyQuizDraft(scene: Scene, draft: EditableSceneDraft): Scene {
  if (scene.content.type !== 'quiz') return scene;

  const questionBlocks = draft.blocks.filter(
    (block): block is EditableQuizQuestionBlock => block.type === 'quiz_question',
  );
  const scriptBlocks = draft.blocks.filter(
    (block): block is EditableScriptBlock => block.type === 'script',
  );

  const questionMap = new Map(questionBlocks.map((block) => [block.questionId, block]));
  const updatedQuestions: QuizQuestion[] = scene.content.questions.map((question) => {
    const block = questionMap.get(question.id);
    if (!block) return question;
    return {
      ...question,
      question: block.question,
      analysis: block.explanation,
      answer: block.correctAnswer,
      options: block.options.map((option) => ({
        value: option.value,
        label: option.label,
      })),
    };
  });

  const updatedActions = (scene.actions || []).map((action) => {
    if (action.type !== 'speech') return action;
    const block = scriptBlocks.find((candidate) => candidate.actionId === action.id);
    if (!block) return action;
    return { ...action, text: block.text };
  });

  return {
    ...scene,
    title: draft.title,
    content: {
      ...scene.content,
      questions: updatedQuestions,
    },
    actions: updatedActions,
  };
}

function applyInteractiveDraft(scene: Scene, draft: EditableSceneDraft): Scene {
  if (scene.content.type !== 'interactive') return scene;

  const instructionBlock = draft.blocks.find(
    (block): block is EditableInteractiveInstructionBlock => block.type === 'interactive_instruction',
  );
  const scriptBlocks = draft.blocks.filter(
    (block): block is EditableScriptBlock => block.type === 'script',
  );

  const updatedActions = (scene.actions || []).map((action, index) => {
    if (action.type !== 'speech') return action;
    const block = scriptBlocks.find((candidate) => candidate.actionId === action.id);
    if (block) {
      return { ...action, text: block.text };
    }
    if (index === 0 && instructionBlock) {
      return { ...action, text: instructionBlock.text };
    }
    return action;
  });

  return {
    ...scene,
    title: draft.title,
    actions: updatedActions,
  };
}

export function applyDraftToScenes(sourceScenes: Scene[], editableScenes: EditableSceneDraft[]): Scene[] {
  const draftMap = new Map(editableScenes.map((scene) => [scene.sourceSceneId, scene]));

  return sourceScenes.map((scene) => {
    const draft = draftMap.get(scene.id);
    if (!draft) return scene;
    switch (scene.type) {
      case 'slide':
        return applySlideDraft(scene, draft);
      case 'quiz':
        return applyQuizDraft(scene, draft);
      case 'interactive':
        return applyInteractiveDraft(scene, draft);
      default:
        return {
          ...scene,
          title: draft.title,
        };
    }
  });
}

export async function ensureDraftsDir(): Promise<void> {}

export async function createDraft(params: {
  draftId: string;
  submissionId: string;
  classroomId: string;
  outputDir: string;
  outputDirRelative: string;
  stage: Stage;
  scenes: Scene[];
}): Promise<LearningExpertDraft> {
  return createOrUpdateLearningDraft({
    draftId: params.draftId,
    submissionId: params.submissionId,
    classroomId: params.classroomId,
    status: 'draft',
    storageLocation: params.outputDirRelative,
    stage: params.stage,
    sourceScenes: params.scenes,
    editableScenes: params.scenes.map(normalizeScene),
  });
}

export async function createDraftWithPlaceholders(params: {
  draftId: string;
  submissionId: string;
  classroomId: string;
  outputDir: string;
  outputDirRelative: string;
  stage: Stage;
  outlines: SceneOutline[];
}): Promise<LearningExpertDraft> {
  const placeholderScenes = sortScenesByOrder(
    params.outlines.map((outline) => createPlaceholderScene(params.stage, outline)),
  );

  return createOrUpdateLearningDraft({
    draftId: params.draftId,
    submissionId: params.submissionId,
    classroomId: params.classroomId,
    status: 'generating',
    storageLocation: params.outputDirRelative,
    stage: params.stage,
    sourceScenes: placeholderScenes,
    editableScenes: placeholderScenes.map((scene) => normalizeSceneWithStatus(scene, 'generating')),
  });
}

export async function readDraft(draftId: string): Promise<LearningExpertDraft | null> {
  return readLearningDraft(draftId);
}

export async function saveDraft(draft: LearningExpertDraft): Promise<LearningExpertDraft> {
  const nextDraft: LearningExpertDraft = {
    ...draft,
    status: deriveDraftStatus(draft.editableScenes),
    updatedAt: new Date().toISOString(),
  };
  return createOrUpdateLearningDraft({
    draftId: nextDraft.draftId,
    submissionId: nextDraft.submissionId,
    classroomId: nextDraft.classroomId,
    status: nextDraft.status,
    storageLocation: nextDraft.outputDirRelative,
    stage: nextDraft.stage,
    sourceScenes: nextDraft.sourceScenes,
    editableScenes: nextDraft.editableScenes,
  });
}

export async function updateDraftScene(params: {
  draftId: string;
  scene: Scene;
}): Promise<LearningExpertDraft> {
  const draft = await readDraft(params.draftId);
  if (!draft) {
    throw new Error('Draft not found');
  }

  const sourceScenes = sortScenesByOrder(
    draft.sourceScenes.some((scene) => scene.id === params.scene.id)
      ? draft.sourceScenes.map((scene) => (scene.id === params.scene.id ? params.scene : scene))
      : [...draft.sourceScenes, params.scene],
  );

  const editableScene = normalizeSceneWithStatus(params.scene, 'draft');
  const editableScenes = sortScenesByOrder(
    draft.editableScenes.some((scene) => scene.sceneId === params.scene.id)
      ? draft.editableScenes.map((scene) =>
          scene.sceneId === params.scene.id ? editableScene : scene,
        )
      : [...draft.editableScenes, editableScene],
  );

  return createOrUpdateLearningDraft({
    draftId: draft.draftId,
    submissionId: draft.submissionId,
    classroomId: draft.classroomId,
    status: deriveDraftStatus(editableScenes),
    storageLocation: draft.outputDirRelative,
    stage: draft.stage,
    sourceScenes,
    editableScenes,
  });
}

export async function deleteDraft(draftId: string): Promise<boolean> {
  return deleteLearningDraft(draftId);
}

export async function listDraftSummaries(): Promise<DraftSummary[]> {
  return listLearningDraftSummaries();
}

export async function finalizeDraft(
  draftId: string,
  baseUrl = 'http://localhost:3000',
): Promise<{
  draft: LearningExpertDraft;
  finalPath: string;
  stage: Stage;
  scenes: Scene[];
  classroomUrl: string;
  platformUrl: string;
}> {
  const draft = await readDraft(draftId);
  if (!draft) {
    throw new Error('Draft not found');
  }
  if (draft.editableScenes.some((scene) => scene.status === 'generating')) {
    throw new Error('The draft is still generating scenes. Wait for completion before finalizing.');
  }

  const scenes = applyDraftToScenes(draft.sourceScenes, draft.editableScenes);
  const stage = {
    ...draft.stage,
    updatedAt: Date.now(),
  };

  await generateTTSForClassroom(scenes, draft.classroomId, baseUrl);

  const payload: FinalizedCoursePackage = {
    id: draft.classroomId,
    stage,
    scenes,
    generatedAt: new Date().toISOString(),
  };

  const persisted = await persistClassroom(
    {
      id: draft.classroomId,
      stage,
      scenes,
    },
    baseUrl,
  );

  const savedDraft = await createOrUpdateLearningDraft({
    draftId: draft.draftId,
    submissionId: draft.submissionId,
    classroomId: draft.classroomId,
    status: 'finalized',
    storageLocation: draft.outputDirRelative,
    stage,
    sourceScenes: draft.sourceScenes,
    editableScenes: draft.editableScenes,
    finalCourse: payload,
  });

  return {
    draft: savedDraft,
    finalPath: `postgres/final-courses/${draftId}`,
    stage,
    scenes,
    classroomUrl: persisted.url,
    platformUrl: `/learning-platform/courses/${draftId}`,
  };
}

export async function readFinalizedCourse(
  draftId: string,
): Promise<FinalizedCoursePackage | null> {
  return readFinalizedLearningCourse(draftId);
}

export function plainTextToHtml(text: string): string {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return '<p></p>';
  }

  return lines.map((line) => `<p>${escapeHtml(line)}</p>`).join('');
}
