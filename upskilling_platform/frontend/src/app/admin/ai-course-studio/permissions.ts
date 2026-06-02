const COURSE_AUTHORING_ROLES = new Set(["Admin", "LearningExpert", "SuperAdmin"]);

export function canAccessCourseAuthoring(role: string | null | undefined) {
  return COURSE_AUTHORING_ROLES.has(role || "");
}
