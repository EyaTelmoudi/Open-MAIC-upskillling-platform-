import { describe, expect, it } from "vitest";

import { resolveCourseCompletionXp } from "@/app/lib/course-completion-celebration";

describe("resolveCourseCompletionXp", () => {
  it("prefers the configured course xp over the observed total delta", () => {
    expect(resolveCourseCompletionXp(500, 575)).toBe(500);
  });

  it("falls back to the observed delta when the course xp is not configured", () => {
    expect(resolveCourseCompletionXp(0, 75)).toBe(75);
  });

  it("never returns a negative xp amount", () => {
    expect(resolveCourseCompletionXp(-10, -20)).toBe(0);
  });
});
