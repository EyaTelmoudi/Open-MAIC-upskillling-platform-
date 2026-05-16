---
name: synthesis-parser
description: Parse a prose learner synthesis into a typed learner profile with stable enum fields and safe defaults.
---

# Synthesis Parser

Use this skill to convert a prose learner synthesis into a typed learner profile.

## Goal

Produce a stable learner profile that downstream coaching steps can reason about deterministically.

## Inputs

- one prose learner synthesis

## Output Contract

Return structured output with:

- `goals`
- `learning_style`
- `experience_level`
- `struggles`
- `engagement_level`
- `communication_preference`

## Rules

1. Use only these enum values for `learning_style`:
   - `visual`
   - `step_by_step`
   - `example_first`
   - `theory_first`
2. Use only these enum values for `experience_level`:
   - `beginner`
   - `intermediate`
   - `advanced`
3. Use only these enum values for `engagement_level`:
   - `high`
   - `medium`
   - `low`
4. Use only these enum values for `communication_preference`:
   - `concise`
   - `detailed`
   - `conversational`
5. If the synthesis is weak, keep safe defaults and avoid over-claiming.
