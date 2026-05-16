---
name: intent-finalizer
description: Finalize the trusted coaching intent from an initial guess, the learner message, recent turns, and optional affect signal.
---

# Intent Finalizer

Use this skill to produce the final trusted learner intent for the coaching pipeline.

## Goal

Take an initial intent guess and refine it using the learner message and recent turns.

## Inputs

- latest learner message
- initial intent guess
- recent session turns
- optional affect signal

## Output Contract

Return structured output with:

- `intent`
- `confidence`
- `question_type`
- `is_ambiguous`
- `correction_applied`
- `clarification_question`
- `reasoning`

## Allowed Intent Values

- `concept`
- `quiz`
- `stuck`
- `progress`
- `off_topic`

## Allowed Question Type Values

- `single`
- `compound`
- `implicit`
- `venting`
- `contradictory`

## Rules

1. Check whether the initial intent is coherent with the learner message.
2. Correct the intent only when the evidence is strong.
3. If the question is too ambiguous to answer safely, set `is_ambiguous=true`.
4. Only include `clarification_question` when ambiguity is real.
5. Keep the reasoning short and concrete.
