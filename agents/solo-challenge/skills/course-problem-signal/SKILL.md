---
name: course-problem-signal
description: Generate one challenge from an active struggle signal in learner memory for the current course.
license: Apache-2.0
metadata:
  version: "1.0.0"
  owner: solo-challenge-agent
  tags: ["agno", "solo-challenge", "problem-signal", "gamification"]
---

# Course Problem Signal

Use this mode when learner memory shows an active struggle in the course even if the learner did not phrase it directly as a question.

## Goal

Convert a course-specific struggle signal into one focused reinforcement question.

## Rules

1. Use signals such as wrong solo challenge answers, repeated confusion, or similar struggle traces in the current course.
2. Focus on the strongest active problem signal, not on generic review.
3. Use exactly four options and exactly one correct answer.
4. Avoid concepts already clearly marked as mastered.
5. Keep the question targeted and practical.
6. Stay inside the current course scope only.
7. Do not restate raw memory logs in the question.

## Output Focus

- `challenge_title` should name the idea being reinforced.
- `intro` should feel like a short guided retry.
- `question` should test the problematic concept directly.
- `explanation` should resolve the confusion in plain language.
