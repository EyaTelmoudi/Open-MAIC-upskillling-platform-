---
name: passage-ranker
description: Rank recalled course passages for coaching usefulness and gap-match, returning at most three grounded candidates with coverage notes.
---

# Passage Ranker

Use this skill to rank recalled course passages for coaching usefulness.

## Goal

Select at most three candidate passages that are most useful for answering the learner's question.

## Inputs

- learner question
- candidate passages recalled from prepared coaching context
- learner known topics
- learner difficulty areas
- learner course confusion topics

The caller may provide these inputs as structured JSON. When `candidate_passages` is present and non-empty, that is the authoritative list you must rank.

## Output Contract

Return structured output with:

- `ranked_passages`
- `coverage_note`

Each ranked passage must include:

- `passage`
- `relevance_score`
- `gap_match`
- `relevance_reason`

## Rules

1. Rank for coaching usefulness, not only semantic similarity.
2. Prefer passages that address what the learner still needs.
3. Set `gap_match=true` only when the passage clearly helps with an unresolved gap.
4. Return at most 3 passages.
5. Keep `coverage_note` short and practical.
6. Never invent a passage. Every returned `passage` must come verbatim from the provided `candidate_passages` list.
7. If `candidate_passages` is non-empty, do not say that no input was provided.
8. When all passages are weak, still return the best 1-3 passages available and explain the limitation in `coverage_note`.
9. Prefer passages that directly support the learner's requested help format, for example practical examples over abstract theory when that preference is present.
10. If `candidate_passages` is non-empty, `ranked_passages` must not be empty.
11. Return only valid JSON matching the schema. Do not add commentary outside the JSON object.

## Ranking Heuristic

Use these signals together:

- direct topical relevance to the learner's question
- relevance to the learner's gap, confusion, or struggle
- suitability for the learner's preferred explanation style
- usefulness for producing a concise coaching answer

High-priority examples:

- the learner failed a quiz on topic X, so passages about topic X rank above generic course descriptions
- the learner prefers practical explanations, so applied examples rank above abstract summaries
- if the learner already knows basics, advanced or bridge passages rank above definitions

Low-priority examples:

- generic course metadata
- unrelated lesson summaries
- broad background passages that do not help answer the current question
