---
name: discussion-fact-structurer
description: Classify a durable learner fact into the structured learner-memory schema used before Hindsight retention.
license: Apache-2.0
metadata:
  version: "1.0.0"
  owner: learner-memory-agent
  tags: ["agno", "learner-memory", "structured-memory", "hindsight", "coaching"]
---

# Discussion Fact Structurer

Use this skill after a learner fact has already been extracted and approved for retention.

## Goal

Convert one learner fact into a structured memory classification so it can be retained in Hindsight as a structured fact object instead of a raw sentence.

## Inputs

You will receive:

- one learner fact string
- the memory scope:
  - `tenant:user`
  - `tenant:user:course`
- the learner's original message for context
- course context if relevant

## Output Contract

Return structured output with exactly these fields:

- `fact_category`
- `fact_value`
- `fact_label`
- `fact_confidence`

## Allowed Categories

For general learner profile memories in `tenant:user`, prefer:

- `style_preference`
- `communication_preference`
- `known_topic`
- `difficulty_area`
- `background`
- `learner_profile_fact`

For course-scoped memories in `tenant:user:course`, prefer:

- `confusion_topic`
- `known_topic`
- `course_relevant_fact`
- `background`

## Category Meanings

### `style_preference`

Use for stable learning or explanation preferences.

Examples:

- learner prefers diagrams first
- learner likes step-by-step explanations
- learner prefers real examples

### `communication_preference`

Use for language, simplicity, tone, or communication constraints.

Examples:

- learner prefers simple direct explanations
- learner's first language is not English
- learner wants less jargon

### `known_topic`

Use when the learner already knows or understands a topic.

Examples:

- learner knows Scrum
- learner understands the coding part

### `confusion_topic`

Use for a course-specific confusion, misunderstanding, or unclear topic.

Examples:

- learner does not understand how this course expects requirements to be structured
- learner is confused about architecture notes in this course

### `difficulty_area`

Use for a durable difficulty that is not tied only to the current course.

Examples:

- learner struggles with software architecture concepts
- learner is generally confused about specifications before coding

### `background`

Use for professional background, prior experience, or durable learner profile facts.

Examples:

- learner has two years of experience as a QA analyst
- learner has led small product teams before

### `learner_profile_fact`

Fallback for general durable learner facts that do not fit better categories.

### `course_relevant_fact`

Fallback for course-scoped learner facts that do not fit better categories.

## `fact_value`

Return a compact normalized identifier:

- lowercase
- underscores
- no punctuation
- topic-style wording

Examples:

- `reading_diagrams_before_long_text`
- `simple_direct_english`
- `scrum`
- `requirements_structuring`

## `fact_label`

Return a clean human-readable label that preserves the meaning of the fact.

## `fact_confidence`

Choose one:

- `high`
- `medium`
- `low`

Use `high` for direct self-reported statements.
Use `medium` when the interpretation is clear but slightly inferred.
Use `low` only when the signal is weak.

## Rules

1. Respect the scope.
2. Prefer the most specific category.
3. Do not invent meaning not present in the fact.
4. Keep `fact_value` short and normalized.
5. Keep `fact_label` faithful to the fact text.
6. If the fact mentions confusion and the scope is `tenant:user:course`, prefer `confusion_topic`.
