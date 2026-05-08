export function resolveCourseCompletionXp(
  expectedCourseXp: number,
  observedXpDelta: number,
): number {
  const normalizedExpected = Number.isFinite(expectedCourseXp)
    ? Math.max(0, Math.trunc(expectedCourseXp))
    : 0;
  const normalizedObserved = Number.isFinite(observedXpDelta)
    ? Math.max(0, Math.trunc(observedXpDelta))
    : 0;

  if (normalizedExpected > 0) {
    return normalizedExpected;
  }

  return normalizedObserved;
}
