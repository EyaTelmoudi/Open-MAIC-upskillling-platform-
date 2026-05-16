# Fact Scope Rules

## Tenant User Bank

Use `tenant:{tenant_id}:user:{user_id}` for facts that should follow the learner across courses.

Good fits:

- background knowledge
- general learning preferences
- communication style
- long-term goals
- stable confidence or experience signals

## Tenant User Course Bank

Use `tenant:{tenant_id}:user:{user_id}:course:{course_id}` for facts tied to the selected course.

Good fits:

- already knows a course topic
- confusion about a course concept
- wants depth on a specific course lesson
- specific course misconception
- course-specific prior knowledge or gap

## Borderline Cases

- `I already know Scrum`:
  - general if treated as broad prior knowledge
  - course-specific too if the selected course is using Scrum as a baseline and the learner wants to skip it
- `Keep the answer short`:
  - general, because it affects coaching style across courses
- `I do not understand spec-driven development`:
  - course-specific when that concept belongs to the selected course

## What Not To Store

- greetings
- raw questions copied verbatim
- temporary scheduling statements
- facts unsupported by the message
- noisy wording instead of normalized facts

## Duplicate Memory Rule

Do not retain a fact when the target bank already contains the same meaning, even if the sentence is phrased differently.

Examples of duplicates:

- `Learner prefers visual explanations`
- `Learner learns better from very visual explanations`

- `Learner already has QA analyst experience`
- `Learner has worked as a QA analyst for two years`

Store the new fact only if it adds real new detail instead of repeating the same idea.
