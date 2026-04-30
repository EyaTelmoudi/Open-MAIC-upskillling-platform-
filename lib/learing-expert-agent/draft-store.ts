import { promises as fs } from 'fs';
import path from 'path';
import type { Action, SpeechAction } from '@/lib/types/action';
import type { QuizQuestion, Scene, Stage } from '@/lib/types/stage';
import { persistClassroom } from '@/lib/server/classroom-storage';
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

const ROOT_DIR = path.join(process.cwd(), 'learing expert agent');
const DRAFTS_DIR = path.join(ROOT_DIR, 'drafts');

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
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
  return (actions || [])
    .filter((action): action is SpeechAction => action.type === 'speech')
    .map((action, index) => ({
      id: `script_${index + 1}`,
      type: 'script',
      actionId: action.id,
      text: action.text,
    }));
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

  return {
    sceneId: scene.id,
    sourceSceneId: scene.id,
    order: scene.order,
    type: scene.type,
    title: scene.title,
    status: 'draft',
    blocks: [...textElements, ...speechBlocks(scene.actions)],
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
    return {
      ...element,
      content: block.html,
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

  return {
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

export async function ensureDraftsDir(): Promise<void> {
  await fs.mkdir(DRAFTS_DIR, { recursive: true });
}

function draftPath(draftId: string): string {
  return path.join(DRAFTS_DIR, `${draftId}.json`);
}

function finalCoursePath(draftId: string): string {
  return path.join(DRAFTS_DIR, `${draftId}.final-course.json`);
}

export async function createDraft(params: {
  draftId: string;
  submissionId: string;
  classroomId: string;
  outputDir: string;
  outputDirRelative: string;
  stage: Stage;
  scenes: Scene[];
}): Promise<LearningExpertDraft> {
  await ensureDraftsDir();
  const now = new Date().toISOString();
  const draft: LearningExpertDraft = {
    draftId: params.draftId,
    submissionId: params.submissionId,
    classroomId: params.classroomId,
    outputDir: params.outputDir,
    outputDirRelative: params.outputDirRelative,
    createdAt: now,
    updatedAt: now,
    status: 'draft',
    stage: params.stage,
    sourceScenes: params.scenes,
    editableScenes: params.scenes.map(normalizeScene),
  };
  await fs.writeFile(draftPath(draft.draftId), JSON.stringify(draft, null, 2), 'utf8');
  return draft;
}

export async function readDraft(draftId: string): Promise<LearningExpertDraft | null> {
  try {
    const raw = await fs.readFile(draftPath(draftId), 'utf8');
    return JSON.parse(raw) as LearningExpertDraft;
  } catch {
    return null;
  }
}

export async function saveDraft(draft: LearningExpertDraft): Promise<LearningExpertDraft> {
  await ensureDraftsDir();
  const nextDraft = {
    ...draft,
    updatedAt: new Date().toISOString(),
  };
  await fs.writeFile(draftPath(draft.draftId), JSON.stringify(nextDraft, null, 2), 'utf8');
  return nextDraft;
}

export async function listDraftSummaries(): Promise<DraftSummary[]> {
  await ensureDraftsDir();
  const entries = await fs.readdir(DRAFTS_DIR);
  const drafts = await Promise.all(
    entries
      .filter((entry) => entry.endsWith('.json') && !entry.endsWith('.final-course.json'))
      .map(async (entry) => {
        const raw = await fs.readFile(path.join(DRAFTS_DIR, entry), 'utf8');
        const draft = JSON.parse(raw) as LearningExpertDraft;
        const approvedScenesCount = draft.editableScenes.filter((scene) => scene.status === 'approved').length;
        return {
          draftId: draft.draftId,
          submissionId: draft.submissionId,
          classroomId: draft.classroomId,
          outputDirRelative: draft.outputDirRelative,
          title: draft.stage.name,
          createdAt: draft.createdAt,
          updatedAt: draft.updatedAt,
          status: draft.status,
          scenesCount: draft.editableScenes.length,
          approvedScenesCount,
        } satisfies DraftSummary;
      }),
  );
  return drafts.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function finalizeDraft(draftId: string): Promise<{
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

  const scenes = applyDraftToScenes(draft.sourceScenes, draft.editableScenes);
  const stage = {
    ...draft.stage,
    updatedAt: Date.now(),
  };

  const payload: FinalizedCoursePackage = {
    id: draft.classroomId,
    stage,
    scenes,
    generatedAt: new Date().toISOString(),
  };

  const outputPath = finalCoursePath(draftId);
  await fs.writeFile(outputPath, JSON.stringify(payload, null, 2), 'utf8');

  const persisted = await persistClassroom(
    {
      id: draft.classroomId,
      stage,
      scenes,
    },
    'http://localhost:3000',
  );

  draft.status = 'finalized';
  await saveDraft(draft);

  return {
    draft,
    finalPath: outputPath,
    stage,
    scenes,
    classroomUrl: persisted.url,
    platformUrl: `/learning-platform/courses/${draftId}`,
  };
}

export async function readFinalizedCourse(
  draftId: string,
): Promise<FinalizedCoursePackage | null> {
  try {
    const raw = await fs.readFile(finalCoursePath(draftId), 'utf8');
    return JSON.parse(raw) as FinalizedCoursePackage;
  } catch {
    return null;
  }
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
