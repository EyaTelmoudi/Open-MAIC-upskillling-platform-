---
name: solo-challenge-mode-selector
description: Choose the best solo challenge mode for the learner's latest course and generate one grounded gamified question.
license: Apache-2.0
metadata:
  version: "1.0.0"
  owner: solo-challenge-agent
  tags: ["agno", "solo-challenge", "hindsight", "gamification"]
---

# Solo Challenge Mode Selector

Use this skill when the Solo Challenge Agent needs to decide which challenge mode should be used for the learner's latest active course.

## Goal

Choose the best challenge mode from the available learner and course context.

## Inputs

- latest enrolled course
- learner-course Hindsight memories for that same course
- latest failed quiz for that same course when available
- course-bank memory for the same course

## Operating Modes

You must choose exactly one mode:

- `failed_quiz_reformulation`
- `learner_reported_difficulty`
- `course_problem_signal`
- `general_course_reinforcement`

## Decision Policy

1. Choose `failed_quiz_reformulation` only when there is a real failed quiz for the same current course and the failed concept has not already been remediated by a later correct solo challenge.
2. Choose `learner_reported_difficulty` when the learner explicitly said they do not understand something in this course.
3. Choose `course_problem_signal` when the learner history shows a struggle, confusion, wrong solo challenge answer, or another active problem signal in this course even if the learner did not phrase it directly as a question.
4. Choose `general_course_reinforcement` only when there is no active failed quiz and no active learner difficulty signal worth targeting.

## Exclusion Rules

1. Do not use a failed quiz from another course to generate a challenge for the current course.
2. Do not choose a concept that the learner has already demonstrated mastery of in a later solo challenge or another clear success signal.
3. If learner memory says the concept was already answered correctly and framed as mastered, avoid asking about that concept again unless there is a newer failure on the same concept.
4. Do not ask the exact same question wording as a prior failed quiz or prior solo challenge.
5. Do not generate a challenge on a concept that is unsupported by the current course memory.

## Output Contract

Return valid JSON only with exactly these keys:

- `mode`
- `mode_reason`
- The chosen mode must match the evidence in learner memory.
