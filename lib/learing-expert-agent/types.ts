import type { Scene, Stage } from '@/lib/types/stage';

export type DraftStatus = 'generating' | 'draft' | 'approved' | 'finalized';
export type SceneDraftStatus = 'generating' | 'draft' | 'approved';

export interface EditableSlideTextBlock {
  id: string;
  type: 'slide_text';
  elementId: string;
  label: string;
  html: string;
  plainText: string;
}

export interface EditableScriptBlock {
  id: string;
  type: 'script';
  actionId: string;
  text: string;
}

export interface EditableQuizQuestionBlock {
  id: string;
  type: 'quiz_question';
  questionId: string;
  question: string;
  explanation: string;
  correctAnswer: string[];
  options: Array<{
    value: string;
    label: string;
  }>;
}

export interface EditableInteractiveInstructionBlock {
  id: string;
  type: 'interactive_instruction';
  text: string;
}

export type EditableBlock =
  | EditableSlideTextBlock
  | EditableScriptBlock
  | EditableQuizQuestionBlock
  | EditableInteractiveInstructionBlock;

export interface EditableSceneDraft {
  sceneId: string;
  sourceSceneId: string;
  order: number;
  type: Scene['type'];
  title: string;
  status: SceneDraftStatus;
  blocks: EditableBlock[];
  previewHtml?: string;
  readonlyHtml?: string;
}

export interface LearningExpertDraft {
  draftId: string;
  submissionId: string;
  classroomId: string;
  outputDir: string;
  outputDirRelative: string;
  createdAt: string;
  updatedAt: string;
  status: DraftStatus;
  stage: Stage;
  sourceScenes: Scene[];
  editableScenes: EditableSceneDraft[];
}

export interface DraftSummary {
  draftId: string;
  submissionId: string;
  classroomId: string;
  outputDirRelative: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  status: DraftStatus;
  scenesCount: number;
  approvedScenesCount: number;
}

export interface FinalizedCoursePackage {
  id: string;
  stage: Stage;
  scenes: Scene[];
  generatedAt: string;
}
