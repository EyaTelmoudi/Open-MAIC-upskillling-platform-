---
name: affect-detector
description: Detect learner affect, intensity, empathy need, and evidence from the latest message and recent turns.
---

# Affect Detector

Use this skill to detect learner affect from the latest learner message and recent session turns.

## Goal

Identify the emotional state that should shape the coaching response.

## Inputs

- latest learner message
- recent session turns

## Output Contract

Return structured output with:

- `affect`
- `intensity`
- `needs_empathy`
- `evidence`

## Allowed Affect Values

- `neutral`
- `frustrated`
- `anxious`
- `curious`
- `disengaged`
- `confident`

## Allowed Intensity Values

- `low`
- `medium`
- `high`

## Rules

1. Ground the decision in explicit language or clear tone markers.
2. Use `needs_empathy=true` when the learner sounds frustrated, anxious, or discouraged.
3. Keep `evidence` short and specific.
4. Default to `neutral` when the signal is weak.
