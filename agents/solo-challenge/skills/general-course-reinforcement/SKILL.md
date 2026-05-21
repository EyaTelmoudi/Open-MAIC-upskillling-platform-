---
name: general-course-reinforcement
description: Generate one general reinforcement question from the current course when no active failed or weak concept needs priority.
license: Apache-2.0
metadata:
  version: "1.0.0"
  owner: solo-challenge-agent
  tags: ["agno", "solo-challenge", "reinforcement", "gamification"]
---

# General Course Reinforcement

Use this mode only when there is no active failed quiz and no active learner difficulty that should take priority.

## Goal

Create one grounded general reinforcement question from the current course.

## Rules

1. Choose a useful concept from the current course that is supported by course memory.
2. Prefer a concept the learner has seen but not clearly mastered.
3. Avoid concepts already marked as mastered in learner memory.
4. Use exactly four options and exactly one correct answer.
5. Keep the question beginner-friendly and course-grounded.
6. Do not drift into unrelated trivia.

## Output Focus

- `challenge_title` should sound like a lightweight review.
- `intro` should invite the learner to do a quick check-in.
- `question` should reinforce a meaningful course concept.
- `explanation` should be short, clear, and confidence-building.
