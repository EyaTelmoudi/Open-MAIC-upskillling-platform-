---
name: failed-quiz-reformulation
description: Generate one fresh reinforcement question from a real failed quiz in the current course.
license: Apache-2.0
metadata:
  version: "1.0.0"
  owner: solo-challenge-agent
  tags: ["agno", "solo-challenge", "failed-quiz", "gamification"]
---

# Failed Quiz Reformulation

Use this mode only when there is a real failed quiz for the current course and the failed concept is still unresolved.

## Goal

Reinforce the same concept as the failed quiz without copying the original wording.

## Rules

1. Stay on the same concept as the failed quiz.
2. Do not copy the original failed question wording exactly.
3. Keep the question easier to parse than the failed one.
4. Use exactly four options and exactly one correct answer.
5. Make distractors plausible, especially close to the learner's earlier wrong answer.
6. If lesson context is available, align the wording with that lesson.
7. Do not mention internal labels like failed quiz, attempt id, remediation, or memory.

## Output Focus

- `challenge_title` should sound encouraging and concise.
- `intro` should frame the challenge as a short second chance.
- `question` should target the same idea with fresher wording.
- `explanation` should clarify the concept simply.
