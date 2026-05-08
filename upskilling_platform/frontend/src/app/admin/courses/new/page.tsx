"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  FileImage,
  FileText,
  FileVideo,
  Layers3,
  ListOrdered,
  Plus,
  Sparkles,
  Upload,
} from "lucide-react";

import { CourseManagementNav } from "@/app/admin/courses/course-management-nav";
import { AdminShell } from "@/app/components/layout/AdminShell";
import {
  createCourse,
  createCourseAssessment,
  createCourseModule,
  createAssessmentQuestion,
  createModuleLesson,
  deleteCourseById,
  retainTraditionalCourseMemoryPdf,
  updateCourseById,
  updateModuleLesson,
  uploadCourseContent,
  type ContentUploadResponse,
  type Course,
} from "@/app/lib/api";
import { routes } from "@/app/lib/routes";

const categoryOptions = [
  "Technology",
  "Business",
  "Design",
  "Marketing",
  "Finance",
  "HR",
  "Leadership",
  "Programming",
];

const difficultyOptions = ["Beginner", "Intermediate", "Advanced"];

type LessonDraft = {
  id: string;
  title: string;
  summary: string;
  duration: number;
  videoFile: File | null;
  supportFiles: File[];
  quiz: LessonQuizDraft;
};

type QuizQuestionDraft = {
  id: string;
  prompt: string;
  type: "multiple_choice" | "true_false";
  options: string[];
  correctOptionIndex: number;
  points: number;
};

type LessonQuizDraft = {
  enabled: boolean;
  title: string;
  summary: string;
  duration: number;
  passingScore: number;
  questions: QuizQuestionDraft[];
};

type ModuleDraft = {
  id: string;
  title: string;
  description: string;
  lessonCount: number;
  lessons: LessonDraft[];
};

type ResourceLink = {
  title: string;
  url: string;
};

function createEmptyLesson(moduleIndex: number, lessonIndex: number): LessonDraft {
  return {
    id: `${Date.now()}-${moduleIndex}-${lessonIndex}`,
    title: `Lesson ${lessonIndex + 1}`,
    summary: "",
    duration: 30,
    videoFile: null,
    supportFiles: [],
    quiz: createEmptyLessonQuiz(lessonIndex),
  };
}

function createEmptyQuizQuestion(questionIndex: number): QuizQuestionDraft {
  return {
    id: `${Date.now()}-quiz-question-${questionIndex}`,
    prompt: "",
    type: "multiple_choice",
    options: ["Option 1", "Option 2"],
    correctOptionIndex: 0,
    points: 1,
  };
}

function createEmptyLessonQuiz(lessonIndex: number): LessonQuizDraft {
  return {
    enabled: false,
    title: `Lesson ${lessonIndex + 1} Quiz`,
    summary: "Complete this quiz to confirm the key takeaways from the lesson.",
    duration: 10,
    passingScore: 70,
    questions: [createEmptyQuizQuestion(0)],
  };
}

function createEmptyModule(index: number): ModuleDraft {
  return {
    id: `${Date.now()}-${index}`,
    title: `Module ${index + 1}`,
    description: "",
    lessonCount: 1,
    lessons: [createEmptyLesson(index, 0)],
  };
}

function calculateCourseDuration(modules: ModuleDraft[]) {
  return modules.reduce(
    (courseTotal, module) =>
      courseTotal +
      module.lessons.reduce(
        (lessonTotal, lesson) =>
          lessonTotal +
          Math.max(lesson.duration || 0, 0) +
          (lesson.quiz.enabled ? Math.max(lesson.quiz.duration || 0, 0) : 0),
        0
      ),
    0
  );
}

function normalizeQuizOptions(question: QuizQuestionDraft) {
  if (question.type === "true_false") {
    return ["True", "False"];
  }
  return question.options.map((option) => option.trim()).filter(Boolean);
}

function isQuizQuestionValid(question: QuizQuestionDraft) {
  if (!question.prompt.trim()) {
    return false;
  }

  const options = normalizeQuizOptions(question);
  if (options.length < 2 || new Set(options).size !== options.length) {
    return false;
  }

  return question.correctOptionIndex >= 0 && question.correctOptionIndex < options.length;
}

function isLessonQuizValid(quiz: LessonQuizDraft) {
  if (!quiz.enabled) {
    return true;
  }

  if (!quiz.title.trim() || quiz.duration <= 0) {
    return false;
  }

  if (!Number.isFinite(quiz.passingScore) || quiz.passingScore < 0 || quiz.passingScore > 100) {
    return false;
  }

  return quiz.questions.length > 0 && quiz.questions.every(isQuizQuestionValid);
}

async function getVideoDurationInMinutes(file: File) {
  if (typeof window === "undefined") {
    return 0;
  }

  const video = document.createElement("video");
  const objectUrl = URL.createObjectURL(file);

  try {
    const durationSeconds = await new Promise<number>((resolve, reject) => {
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve(video.duration || 0);
      video.onerror = () => reject(new Error("Failed to read video metadata."));
      video.src = objectUrl;
    });

    return Math.max(1, Math.ceil(durationSeconds / 60));
  } catch {
    return 0;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function resolveLessonDuration(lesson: LessonDraft) {
  if (!lesson.videoFile) {
    return Math.max(lesson.duration || 0, 0);
  }

  const detectedDuration = await getVideoDurationInMinutes(lesson.videoFile);
  return detectedDuration || Math.max(lesson.duration || 0, 0);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildLessonContent(
  summary: string,
  uploads: ContentUploadResponse[]
): string {
  return buildLessonContentFromResources(
    summary,
    uploads.map((upload) => ({
      title: upload.filename,
      url: upload.url,
    }))
  );
}

function buildLessonContentFromResources(
  summary: string,
  resources: ResourceLink[]
): string {
  const parts: string[] = [];

  if (summary.trim()) {
    parts.push(`<p>${escapeHtml(summary.trim())}</p>`);
  }

  if (resources.length > 0) {
    const links = resources
      .map(
        (resource) =>
          `<li><a href="${resource.url}" target="_blank" rel="noopener noreferrer">${escapeHtml(resource.title)}</a></li>`
      )
      .join("");
    parts.push(`<h3>Learning Materials</h3><ul>${links}</ul>`);
  }

  return parts.join("");
}

function buildStoredVideoReference(upload: ContentUploadResponse | null): string | null {
  if (!upload) {
    return null;
  }
  return `minio://${upload.bucket}/${upload.object_name}`;
}

function normalizeXpReward(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.round(value));
}

function SelectedFilesList({
  files,
  emptyLabel,
}: {
  files: File[];
  emptyLabel: string;
}) {
  if (files.length === 0) {
    return <p className="mt-2 text-xs text-slate-500">{emptyLabel}</p>;
  }

  return (
    <ul className="mt-2 space-y-1 text-xs text-slate-500">
      {files.map((file) => (
        <li key={`${file.name}-${file.size}`}>{file.name}</li>
      ))}
    </ul>
  );
}

function FilePickerCard({
  icon,
  title,
  accept,
  multiple = false,
  buttonLabel,
  files,
  emptyLabel,
  inputId,
  helperText,
  onChange,
}: {
  icon: React.ReactNode;
  title: string;
  accept: string;
  multiple?: boolean;
  buttonLabel: string;
  files: File[];
  emptyLabel: string;
  inputId: string;
  helperText: string;
  onChange: (files: FileList | null) => void;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600">
        {icon}
        {title}
      </div>
      <label
        htmlFor={inputId}
        className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
      >
        <Upload className="h-4 w-4" />
        {buttonLabel}
      </label>
      <input
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(e) => onChange(e.target.files)}
        className="sr-only"
      />
      <p className="mt-3 text-xs text-slate-500">{helperText}</p>
      <SelectedFilesList files={files} emptyLabel={emptyLabel} />
    </div>
  );
}

export default function AdminCreateCoursePage() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [step, setStep] = useState(1);
  const [moduleCount, setModuleCount] = useState(1);
  const [activeModuleIndex, setActiveModuleIndex] = useState(0);
  const [activeLessonIndex, setActiveLessonIndex] = useState(0);
  const [courseMemoryPdf, setCourseMemoryPdf] = useState<File | null>(null);
  const [form, setForm] = useState({
    title: "",
    description: "",
    category: "Technology",
    difficulty: "Beginner",
    xp_reward: 100,
  });
  const [modules, setModules] = useState<ModuleDraft[]>([createEmptyModule(0)]);
  const computedCourseDuration = calculateCourseDuration(modules);

  const canMoveToModules = Boolean(
    form.title.trim() &&
      form.description.trim() &&
      form.category &&
      form.difficulty &&
      normalizeXpReward(form.xp_reward) >= 0
  );

  const currentModule = modules[activeModuleIndex];
  const currentLesson = currentModule?.lessons[activeLessonIndex];

  const allModuleDetailsValid = modules.every(
    (module) =>
      module.title.trim() &&
      module.description.trim() &&
      module.lessonCount > 0 &&
      module.lessons.length === module.lessonCount
  );

  const allLessonsValid = modules.every((module) =>
    module.lessons.every(
      (lesson) =>
        lesson.title.trim() &&
        lesson.duration > 0 &&
        (lesson.videoFile || lesson.supportFiles.length > 0) &&
        isLessonQuizValid(lesson.quiz)
    )
  );

  function syncLessons(moduleIndex: number, nextCount: number) {
    const normalizedCount = Math.max(1, Math.min(30, nextCount || 1));
    setModules((current) =>
      current.map((module, index) => {
        if (index !== moduleIndex) {
          return module;
        }
        const currentLessons = module.lessons;
        let nextLessons = currentLessons;
        if (currentLessons.length > normalizedCount) {
          nextLessons = currentLessons.slice(0, normalizedCount);
        } else if (currentLessons.length < normalizedCount) {
          nextLessons = [
            ...currentLessons,
            ...Array.from(
              { length: normalizedCount - currentLessons.length },
              (_, lessonOffset) =>
                createEmptyLesson(moduleIndex, currentLessons.length + lessonOffset)
            ),
          ];
        }
        return {
          ...module,
          lessonCount: normalizedCount,
          lessons: nextLessons,
        };
      })
    );
    setActiveLessonIndex((current) => Math.min(current, normalizedCount - 1));
  }

  function syncModules(nextCount: number) {
    const normalizedCount = Math.max(1, Math.min(20, nextCount || 1));
    setModuleCount(normalizedCount);
    setModules((current) => {
      if (current.length === normalizedCount) {
        return current;
      }
      if (current.length > normalizedCount) {
        return current.slice(0, normalizedCount);
      }
      const additions = Array.from(
        { length: normalizedCount - current.length },
        (_, index) => createEmptyModule(current.length + index)
      );
      return [...current, ...additions];
    });
    setActiveModuleIndex((current) => Math.min(current, normalizedCount - 1));
    setActiveLessonIndex(0);
  }

  function updateModule(index: number, changes: Partial<ModuleDraft>) {
    setModules((current) =>
      current.map((module, moduleIndex) =>
        moduleIndex === index ? { ...module, ...changes } : module
      )
    );
  }

  function updateLesson(
    moduleIndex: number,
    lessonIndex: number,
    changes: Partial<LessonDraft>
  ) {
    setModules((current) =>
      current.map((module, currentModuleIndex) =>
        currentModuleIndex === moduleIndex
          ? {
              ...module,
              lessons: module.lessons.map((lesson, currentLessonIndex) =>
                currentLessonIndex === lessonIndex
                  ? { ...lesson, ...changes }
                  : lesson
              ),
            }
          : module
      )
    );
  }

  function updateLessonQuiz(
    moduleIndex: number,
    lessonIndex: number,
    changes: Partial<LessonQuizDraft>
  ) {
    const lesson = modules[moduleIndex]?.lessons[lessonIndex];
    if (!lesson) {
      return;
    }

    updateLesson(moduleIndex, lessonIndex, {
      quiz: {
        ...lesson.quiz,
        ...changes,
      },
    });
  }

  function updateQuizQuestion(
    moduleIndex: number,
    lessonIndex: number,
    questionIndex: number,
    changes: Partial<QuizQuestionDraft>
  ) {
    const lesson = modules[moduleIndex]?.lessons[lessonIndex];
    if (!lesson) {
      return;
    }

    updateLessonQuiz(moduleIndex, lessonIndex, {
      questions: lesson.quiz.questions.map((question, currentIndex) => {
        if (currentIndex !== questionIndex) {
          return question;
        }

        const nextQuestion = { ...question, ...changes };
        if (nextQuestion.type === "true_false") {
          nextQuestion.options = ["True", "False"];
          nextQuestion.correctOptionIndex = Math.min(nextQuestion.correctOptionIndex, 1);
        }
        return nextQuestion;
      }),
    });
  }

  function addQuizQuestion(moduleIndex: number, lessonIndex: number) {
    const lesson = modules[moduleIndex]?.lessons[lessonIndex];
    if (!lesson) {
      return;
    }

    updateLessonQuiz(moduleIndex, lessonIndex, {
      questions: [...lesson.quiz.questions, createEmptyQuizQuestion(lesson.quiz.questions.length)],
    });
  }

  function removeQuizQuestion(moduleIndex: number, lessonIndex: number, questionIndex: number) {
    const lesson = modules[moduleIndex]?.lessons[lessonIndex];
    if (!lesson || lesson.quiz.questions.length <= 1) {
      return;
    }

    const nextQuestions = lesson.quiz.questions
      .filter((_, currentIndex) => currentIndex !== questionIndex)
      .map((question) => ({
        ...question,
        correctOptionIndex: Math.min(
          question.correctOptionIndex,
          normalizeQuizOptions(question).length - 1
        ),
      }));

    updateLessonQuiz(moduleIndex, lessonIndex, {
      questions: nextQuestions,
    });
  }

  async function handleCreateCourse() {
    if (!form.title.trim()) {
      setError("Course title is required.");
      return;
    }
    if (!allModuleDetailsValid) {
      setError("Please complete every module and define its lesson count before creating the course.");
      return;
    }
    if (!allLessonsValid) {
      setError("Please complete every lesson and attach a main video or support files before creating the course.");
      return;
    }

    let createdCourse: Course | null = null;
    try {
      setSubmitting(true);
      setError(null);
      setSuccess(null);

      const preparedModules = await Promise.all(
        modules.map(async (module) => ({
          ...module,
          lessons: await Promise.all(
            module.lessons.map(async (lesson) => ({
              ...lesson,
              duration: await resolveLessonDuration(lesson),
            }))
          ),
        }))
      );
      const preparedCourseDuration = calculateCourseDuration(preparedModules);

      createdCourse = await createCourse({
        title: form.title.trim(),
        description: form.description.trim() || null,
        category: form.category,
        difficulty: form.difficulty,
        duration: preparedCourseDuration,
        xp_reward: normalizeXpReward(form.xp_reward),
        is_published: false,
      });

      for (const [moduleIndex, module] of preparedModules.entries()) {
        const createdModule = await createCourseModule(createdCourse.id, {
          title: module.title.trim(),
          description: module.description.trim() || null,
          order: moduleIndex + 1,
        });

        let nextLessonOrder = 1;
        for (const lesson of module.lessons) {
          const uploads: ContentUploadResponse[] = [];

          if (lesson.videoFile) {
            uploads.push(
              await uploadCourseContent(lesson.videoFile, {
                courseId: createdCourse.id,
                moduleId: createdModule.id,
              })
            );
          }

          for (const file of lesson.supportFiles) {
            uploads.push(
              await uploadCourseContent(file, {
                courseId: createdCourse.id,
                moduleId: createdModule.id,
              })
            );
          }

          const videoUpload =
            uploads.find((upload) => upload.bucket === "course-videos") || null;

          await createModuleLesson(createdModule.id, {
            title: lesson.title.trim(),
            content: buildLessonContent(lesson.summary, uploads),
            video_url: buildStoredVideoReference(videoUpload),
            content_type: videoUpload ? "video" : "resource",
            duration: lesson.duration,
            order: nextLessonOrder,
          });
          nextLessonOrder += 1;

          if (lesson.quiz.enabled) {
            const createdAssessment = await createCourseAssessment(createdCourse.id, {
              module_id: createdModule.id,
              title: lesson.quiz.title.trim(),
              passing_score: Math.round(lesson.quiz.passingScore),
              time_limit: null,
            });

            for (const [questionIndex, question] of lesson.quiz.questions.entries()) {
              const options = normalizeQuizOptions(question);
              await createAssessmentQuestion(createdCourse.id, createdAssessment.id, {
                text: question.prompt.trim(),
                type: question.type,
                options,
                correct_answer: options[question.correctOptionIndex],
                points: Math.max(1, Math.round(question.points || 1)),
                order: questionIndex + 1,
              });
            }

            const createdQuizLesson = await createModuleLesson(createdModule.id, {
              title: lesson.quiz.title.trim(),
              content: buildLessonContentFromResources(lesson.quiz.summary, []),
              video_url: null,
              content_type: "quiz",
              duration: lesson.quiz.duration,
              order: nextLessonOrder,
              assessment_id: createdAssessment.id,
            });

            await updateModuleLesson(createdQuizLesson.id, {
              assessment_id: createdAssessment.id,
            });
            nextLessonOrder += 1;
          }
        }
      }

      await updateCourseById(createdCourse.id, {
        duration: preparedCourseDuration,
      });

      if (courseMemoryPdf) {
        await retainTraditionalCourseMemoryPdf(createdCourse.id, courseMemoryPdf);
      }

      setSuccess("Course created successfully.");
      setForm({
        title: "",
        description: "",
        category: "Technology",
        difficulty: "Beginner",
        xp_reward: 100,
      });
      setStep(1);
      setModuleCount(1);
      setModules([createEmptyModule(0)]);
      setActiveModuleIndex(0);
      setActiveLessonIndex(0);
      setCourseMemoryPdf(null);
      router.push(routes.adminCourses);
    } catch (err: any) {
      if (createdCourse?.id) {
        try {
          await deleteCourseById(createdCourse.id);
        } catch {
          // Keep the original creation error as the user-facing failure.
        }
      }
      setError(err?.message || "Failed to create course.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AdminShell>
      <div className="space-y-6">
        <CourseManagementNav />

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {success && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </div>
        )}

        <div className="rounded-[28px] border border-slate-200/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.98)_0%,rgba(248,250,252,0.96)_100%)] p-6 shadow-[0_20px_50px_rgba(15,23,42,0.08)]">
          <div className="mb-6 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700">
              {step === 1 ? (
                <Sparkles className="h-5 w-5" />
              ) : step === 3 ? (
                <ListOrdered className="h-5 w-5" />
              ) : step === 5 ? (
                <FileText className="h-5 w-5" />
              ) : (
                <Layers3 className="h-5 w-5" />
              )}
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-950">
                {step === 1
                  ? "Step 1: Course Basics"
                  : step === 2
                    ? "Step 2: Module Count"
                    : step === 3
                      ? `Step 3: Module Details (${activeModuleIndex + 1}/${modules.length})`
                      : step === 4
                        ? `Step 4: Lesson Details (${activeModuleIndex + 1}/${modules.length} modules, lesson ${activeLessonIndex + 1}/${currentModule?.lessonCount || 1})`
                        : "Step 5: Course Memory Source"}
              </h2>
              <p className="text-sm text-slate-600">
                {step === 1
                  ? "Start with the core course information your learners will see."
                  : step === 2
                    ? "Decide how many modules the course should contain."
                    : step === 3
                      ? "Fill the module details and define how many lessons each module contains."
                      : step === 4
                      ? "Complete each lesson one by one, attach the learning content, and optionally add a quiz after the lesson."
                        : "Add the private course-content PDF that will help the AI coach answer detailed questions about this course."}
              </p>
            </div>
          </div>

          <div className="mb-6 flex flex-wrap gap-3">
            {[
              { index: 1, label: "Basics" },
              { index: 2, label: "Modules" },
              { index: 3, label: "Structure" },
              { index: 4, label: "Lessons & Quizzes" },
              { index: 5, label: "Memory" },
            ].map((item) => (
              <div
                key={item.index}
                className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${
                  step === item.index
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-slate-100 text-slate-500"
                }`}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-full border border-current text-[11px]">
                  {item.index}
                </span>
                {item.label}
              </div>
            ))}
          </div>

          {step === 1 && (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Title</span>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((current) => ({ ...current, title: e.target.value }))}
                  placeholder="Course title"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Category</span>
                <select
                  value={form.category}
                  onChange={(e) => setForm((current) => ({ ...current, category: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                >
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Difficulty</span>
                <select
                  value={form.difficulty}
                  onChange={(e) => setForm((current) => ({ ...current, difficulty: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                >
                  {difficultyOptions.map((difficulty) => (
                    <option key={difficulty} value={difficulty}>
                      {difficulty}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">XP Reward</span>
                <input
                  type="number"
                  min={0}
                  value={form.xp_reward}
                  onChange={(e) =>
                    setForm((current) => ({
                      ...current,
                      xp_reward: normalizeXpReward(Number(e.target.value)),
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
              <label className="space-y-2 md:col-span-2 xl:col-span-3">
                <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Description</span>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((current) => ({ ...current, description: e.target.value }))}
                  rows={5}
                  placeholder="Course description"
                  className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                />
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                <p className="text-sm text-slate-700">
                  Define how many modules the course should contain. You will then describe each module and define its lesson count.
                </p>
                <div className="mt-5 max-w-xs space-y-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Number of Modules</span>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={moduleCount}
                    onChange={(e) => syncModules(Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {modules.map((module, index) => (
                  <div
                    key={module.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <p className="text-sm font-semibold text-slate-900">Module {index + 1}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      {module.title.trim() || "Title will be defined in the next step."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 3 && currentModule && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {modules.map((module, index) => (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => {
                      setActiveModuleIndex(index);
                      setActiveLessonIndex(0);
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeModuleIndex === index
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500 hover:text-slate-800"
                    }`}
                  >
                    Module {index + 1}
                  </button>
                ))}
              </div>

              <div className="grid gap-4">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Module Title</span>
                  <input
                    type="text"
                    value={currentModule.title}
                    onChange={(e) => updateModule(activeModuleIndex, { title: e.target.value })}
                    placeholder={`Module ${activeModuleIndex + 1} title`}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Module Description</span>
                  <textarea
                    value={currentModule.description}
                    onChange={(e) => updateModule(activeModuleIndex, { description: e.target.value })}
                    rows={5}
                    placeholder="Describe the purpose and learning outcome of this module."
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <label className="space-y-2 max-w-xs">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Number of Lessons</span>
                  <input
                    type="number"
                    min={1}
                    max={30}
                    value={currentModule.lessonCount}
                    onChange={(e) => syncLessons(activeModuleIndex, Number(e.target.value))}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                  <p className="text-sm font-semibold text-slate-900">Lesson plan</p>
                  <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                    {currentModule.lessons.map((lesson, lessonIndex) => (
                      <div
                        key={lesson.id}
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-500 shadow-sm"
                      >
                        <p className="font-medium text-slate-900">
                          Lesson {lessonIndex + 1}
                        </p>
                        <p className="mt-1 truncate">
                          {lesson.title.trim() || "Lesson title pending"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && currentModule && currentLesson && (
            <div className="space-y-5">
              <div className="flex flex-wrap gap-2">
                {modules.map((module, moduleIndex) => (
                  <button
                    key={module.id}
                    type="button"
                    onClick={() => {
                      setActiveModuleIndex(moduleIndex);
                      setActiveLessonIndex(0);
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      activeModuleIndex === moduleIndex
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-slate-100 text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    Module {moduleIndex + 1}
                  </button>
                ))}
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4">
                <p className="text-sm font-semibold text-slate-900">
                  {currentModule.title || `Module ${activeModuleIndex + 1}`}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Define the lessons for this module one by one.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {currentModule.lessons.map((lesson, lessonIndex) => (
                    <button
                      key={lesson.id}
                      type="button"
                      onClick={() => setActiveLessonIndex(lessonIndex)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        activeLessonIndex === lessonIndex
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-white text-slate-500 shadow-sm hover:text-slate-900"
                      }`}
                    >
                      Lesson {lessonIndex + 1}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-4">
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Lesson Title</span>
                  <input
                    type="text"
                    value={currentLesson.title}
                    onChange={(e) =>
                      updateLesson(activeModuleIndex, activeLessonIndex, {
                        title: e.target.value,
                      })
                    }
                    placeholder={`Lesson ${activeLessonIndex + 1}`}
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Lesson Summary</span>
                  <textarea
                    value={currentLesson.summary}
                    onChange={(e) =>
                      updateLesson(activeModuleIndex, activeLessonIndex, {
                        summary: e.target.value,
                      })
                    }
                    rows={4}
                    placeholder="Summarize the lesson and explain what the learner will gain from it."
                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                  />
                </label>
                <div className="grid gap-4 md:grid-cols-2">
                  <FilePickerCard
                    icon={<FileVideo className="h-4 w-4" />}
                    title="Main Lesson Video"
                    accept="video/mp4,video/webm,video/ogg"
                    buttonLabel="Choose Video"
                    files={currentLesson.videoFile ? [currentLesson.videoFile] : []}
                    emptyLabel="No video selected"
                    inputId={`module-${currentModule.id}-lesson-${currentLesson.id}-video`}
                    helperText="Upload the main video that represents the core learning content for this lesson."
                    onChange={async (files) => {
                      const nextVideo = files?.[0] || null;
                      if (!nextVideo) {
                        updateLesson(activeModuleIndex, activeLessonIndex, {
                          videoFile: null,
                        });
                        return;
                      }

                      const detectedDuration = await getVideoDurationInMinutes(nextVideo);
                      updateLesson(activeModuleIndex, activeLessonIndex, {
                        videoFile: nextVideo,
                        duration: detectedDuration || currentLesson.duration,
                      });
                    }}
                  />
                  <FilePickerCard
                    icon={<FileImage className="h-4 w-4" />}
                    title="Support Files"
                    accept=".pdf,.png,.jpg,.jpeg,.gif,.webp"
                    multiple
                    buttonLabel="Choose Files"
                    files={currentLesson.supportFiles}
                    emptyLabel="No support files selected"
                    inputId={`module-${currentModule.id}-lesson-${currentLesson.id}-support`}
                    helperText="Add PDF documents or images that support the lesson content."
                    onChange={(files) =>
                      updateLesson(activeModuleIndex, activeLessonIndex, {
                        supportFiles: Array.from(files || []),
                      })
                    }
                  />
                </div>
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-start gap-3">
                    <FileText className="mt-0.5 h-4 w-4 text-emerald-700" />
                    <div className="text-xs text-slate-600">
                      <p className="font-medium text-slate-900">Lesson Content Rule</p>
                      <p className="mt-1">
                        Each lesson should include at least one main video or one support file so the course is created with real learning content.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">Optional lesson quiz</p>
                      <p className="mt-1 text-xs text-slate-500">
                        Add a scored quiz that will appear as the next lesson after this teaching lesson.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        updateLessonQuiz(activeModuleIndex, activeLessonIndex, {
                          enabled: !currentLesson.quiz.enabled,
                        })
                      }
                      className={`rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
                        currentLesson.quiz.enabled
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-slate-100 text-slate-600 hover:text-slate-900"
                      }`}
                    >
                      {currentLesson.quiz.enabled ? "Quiz Enabled" : "Enable Quiz"}
                    </button>
                  </div>

                  {currentLesson.quiz.enabled ? (
                    <div className="mt-5 space-y-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Quiz Title</span>
                          <input
                            type="text"
                            value={currentLesson.quiz.title}
                            onChange={(e) =>
                              updateLessonQuiz(activeModuleIndex, activeLessonIndex, {
                                title: e.target.value,
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Quiz Duration (minutes)</span>
                          <input
                            type="number"
                            min={1}
                            value={currentLesson.quiz.duration}
                            onChange={(e) =>
                              updateLessonQuiz(activeModuleIndex, activeLessonIndex, {
                                duration: Math.max(1, Number(e.target.value) || 1),
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                          />
                        </label>
                      </div>

                      <div className="grid gap-4 md:grid-cols-2">
                        <label className="space-y-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Passing Score (%)</span>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            value={currentLesson.quiz.passingScore}
                            onChange={(e) =>
                              updateLessonQuiz(activeModuleIndex, activeLessonIndex, {
                                passingScore: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                          />
                        </label>
                        <label className="space-y-2">
                          <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Quiz Summary</span>
                          <textarea
                            rows={3}
                            value={currentLesson.quiz.summary}
                            onChange={(e) =>
                              updateLessonQuiz(activeModuleIndex, activeLessonIndex, {
                                summary: e.target.value,
                              })
                            }
                            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                          />
                        </label>
                      </div>

                      <div className="space-y-4">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-slate-900">Quiz questions</p>
                          <button
                            type="button"
                            onClick={() => addQuizQuestion(activeModuleIndex, activeLessonIndex)}
                            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-100"
                          >
                            <Plus className="h-4 w-4" />
                            Add Question
                          </button>
                        </div>

                        {currentLesson.quiz.questions.map((question, questionIndex) => {
                          const displayedOptions =
                            question.type === "true_false" ? ["True", "False"] : question.options;
                          return (
                            <div
                              key={question.id}
                              className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-sm font-semibold text-slate-900">
                                  Question {questionIndex + 1}
                                </p>
                                <button
                                  type="button"
                                  onClick={() =>
                                    removeQuizQuestion(activeModuleIndex, activeLessonIndex, questionIndex)
                                  }
                                  disabled={currentLesson.quiz.questions.length <= 1}
                                  className="text-xs font-medium text-slate-500 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  Remove
                                </button>
                              </div>

                              <div className="mt-4 grid gap-4">
                                <label className="space-y-2">
                                  <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Question Prompt</span>
                                  <textarea
                                    rows={3}
                                    value={question.prompt}
                                    onChange={(e) =>
                                      updateQuizQuestion(activeModuleIndex, activeLessonIndex, questionIndex, {
                                        prompt: e.target.value,
                                      })
                                    }
                                    className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none placeholder:text-slate-400 shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                                  />
                                </label>

                                <div className="grid gap-4 md:grid-cols-2">
                                  <label className="space-y-2">
                                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Question Type</span>
                                    <select
                                      value={question.type}
                                      onChange={(e) =>
                                        updateQuizQuestion(activeModuleIndex, activeLessonIndex, questionIndex, {
                                          type: e.target.value as "multiple_choice" | "true_false",
                                        })
                                      }
                                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                                    >
                                      <option value="multiple_choice">Multiple Choice</option>
                                      <option value="true_false">True / False</option>
                                    </select>
                                  </label>
                                  <label className="space-y-2">
                                    <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Points</span>
                                    <input
                                      type="number"
                                      min={1}
                                      value={question.points}
                                      onChange={(e) =>
                                        updateQuizQuestion(activeModuleIndex, activeLessonIndex, questionIndex, {
                                          points: Math.max(1, Number(e.target.value) || 1),
                                        })
                                      }
                                      className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100"
                                    />
                                  </label>
                                </div>

                                <div className="space-y-3">
                                  <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Answer Options</p>
                                  {displayedOptions.map((option, optionIndex) => (
                                    <div key={`${question.id}-option-${optionIndex}`} className="grid gap-3 md:grid-cols-[minmax(0,1fr)_160px]">
                                      <input
                                        type="text"
                                        value={question.type === "true_false" ? option : question.options[optionIndex] || ""}
                                        disabled={question.type === "true_false"}
                                        onChange={(e) => {
                                          const nextOptions = [...question.options];
                                          nextOptions[optionIndex] = e.target.value;
                                          updateQuizQuestion(activeModuleIndex, activeLessonIndex, questionIndex, {
                                            options: nextOptions,
                                          });
                                        }}
                                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none shadow-sm focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 disabled:bg-slate-100 disabled:text-slate-500"
                                      />
                                      <label className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-700">
                                        <input
                                          type="radio"
                                          checked={question.correctOptionIndex === optionIndex}
                                          onChange={() =>
                                            updateQuizQuestion(activeModuleIndex, activeLessonIndex, questionIndex, {
                                              correctOptionIndex: optionIndex,
                                            })
                                          }
                                        />
                                        Correct answer
                                      </label>
                                    </div>
                                  ))}

                                  {question.type === "multiple_choice" ? (
                                    <div className="flex flex-wrap gap-2">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          updateQuizQuestion(activeModuleIndex, activeLessonIndex, questionIndex, {
                                            options: [...question.options, `Option ${question.options.length + 1}`],
                                          })
                                        }
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                                      >
                                        Add Option
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          if (question.options.length <= 2) {
                                            return;
                                          }
                                          const nextOptions = question.options.slice(0, -1);
                                          updateQuizQuestion(activeModuleIndex, activeLessonIndex, questionIndex, {
                                            options: nextOptions,
                                            correctOptionIndex: Math.min(
                                              question.correctOptionIndex,
                                              nextOptions.length - 1
                                            ),
                                          });
                                        }}
                                        disabled={question.options.length <= 2}
                                        className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        Remove Option
                                      </button>
                                    </div>
                                  ) : null}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="space-y-5">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5">
                <p className="text-sm font-semibold text-slate-900">Private Course Memory Source</p>
                <p className="mt-2 text-sm text-slate-600">
                  Upload one PDF that contains the full transcript, detailed course script, or the complete
                  teaching content of this traditional course. It will not be shown to learners in the platform.
                  It will only be used by the AI coach agent to answer detailed questions about this course.
                </p>
              </div>

              <FilePickerCard
                icon={<FileText className="h-4 w-4" />}
                title="Course Content PDF"
                accept="application/pdf,.pdf"
                buttonLabel="Choose PDF"
                files={courseMemoryPdf ? [courseMemoryPdf] : []}
                emptyLabel="No memory-source PDF selected"
                inputId="course-memory-source-pdf"
                helperText="Recommended: upload the PDF that contains the full spoken content or transcript of the course so the coaching agent can answer detailed questions later."
                onChange={(files) => setCourseMemoryPdf(files?.[0] || null)}
              />
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-end gap-3">
            <Link
              href={routes.adminCourses}
              className="inline-flex items-center rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
            >
              Cancel
            </Link>
            {step > 1 && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep((current) => Math.max(1, current - 1));
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </button>
            )}
            {step < 5 ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  if (step === 1) {
                    if (!canMoveToModules) {
                      setError("Please complete the course basics before continuing.");
                      return;
                    }
                    setStep(2);
                    return;
                  }
                  if (step === 2) {
                    setStep(3);
                    return;
                  }
                  if (step === 3) {
                    if (!allModuleDetailsValid) {
                      setError("Please complete every module and define its lesson count before continuing.");
                      return;
                    }
                    setActiveLessonIndex(0);
                    setStep(4);
                    return;
                  }
                  if (!allLessonsValid) {
                    setError("Please complete every lesson and attach a main video or support files before continuing.");
                    return;
                  }
                  setStep(5);
                }}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
              >
                Next
                <ChevronRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={handleCreateCourse}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {submitting ? "Creating..." : "Create Course"}
              </button>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
