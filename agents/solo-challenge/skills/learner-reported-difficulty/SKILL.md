---
name: learner-reported-difficulty
description: Generate one challenge that targets something the learner explicitly said they do not understand in the current course.
license: Apache-2.0
metadata:
  version: "1.0.0"
  owner: solo-challenge-agent
  tags: ["agno", "solo-challenge", "difficulty", "gamification"]
---

# Learner Reported Difficulty

Use this mode when the learner explicitly said they do not understand something in the current course.

## Goal

Create one short question that helps the learner check understanding of the reported weak point.

## Rules

1. Prefer the learner's explicitly reported confusion over generic reinforcement.
2. Turn the weak point into one concrete, answerable question.
3. Keep the wording simple and supportive.
4. Use exactly four options and exactly one correct answer.
5. Avoid concepts already clearly marked as mastered in learner memory.
6. Stay grounded in the current course memory only.
7. Do not invent lesson details that the course memory does not support.

## Output Focus

- `challenge_title` should reflect the weak point briefly.
- `intro` should sound like a quick confidence-building check.
- `question` should test one precise idea, not several at once.
- `explanation` should help the learner understand why the correct answer fits.
