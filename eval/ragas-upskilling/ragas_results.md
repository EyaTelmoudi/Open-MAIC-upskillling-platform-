# RAGAS evaluation - Upskilling Platform AI agents

- Date: 2026-06-09T22:38:10.905909+00:00
- RAGAS dataset size: 5 samples
- Metrics: faithfulness, factual correctness, pedagogical usefulness, platform alignment, overall quality

## Summary

| Metric | Score |
|---|---:|
| faithfulness | 0.643 |
| pedagogical_usefulness | 1.000 |
| platform_alignment | 1.000 |
| overall_quality | 5.000 |
| factual_correctness | 0.744 |

## Per-agent scores

| Agent | Faithfulness | Factual correctness | Pedagogical usefulness | Platform alignment | Overall quality |
|---|---:|---:|---:|---:|---:|
| course_generation | 0.833 | 0.910 | 1.000 | 1.000 | 5.000 |
| learner_memory | 0.571 | 1.000 | 1.000 | 1.000 | 5.000 |
| ai_coaching | 0.833 | 0.910 | 1.000 | 1.000 | 5.000 |
| recommendation | 0.600 | 0.500 | 1.000 | 1.000 | 5.000 |
| solo_challenge | 0.375 | 0.400 | 1.000 | 1.000 | 5.000 |

## Interpretation

- Faithfulness measures whether the answer stays supported by the provided context.
- Factual correctness compares the answer with the reference expected behavior.
- Pedagogical usefulness checks whether the answer is actionable for learning.
- Platform alignment checks whether the answer respects the platform workflows.
- Overall quality is a 1 to 5 rubric score.
