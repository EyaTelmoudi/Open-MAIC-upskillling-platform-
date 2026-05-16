---
name: discussion-fact-extractor
description: Extract durable learner facts from a coaching discussion message and separate tenant:user facts from tenant:user:course facts.
license: Apache-2.0
metadata:
  version: "1.0.0"
  owner: learner-memory-agent
  tags: ["agno", "learner-memory", "hindsight", "coaching"]
---

# Discussion Fact Extractor

Use this skill when a learner sends a message to the coaching agent and you need to decide what durable facts should be stored in memory.

## Goal

Read one learner message and produce two clean fact lists:

- `general_facts`: durable facts that belong in the learner profile bank `tenant:{tenant_id}:user:{user_id}`
- `course_facts`: durable facts specifically tied to the currently selected course and that belong in `tenant:{tenant_id}:user:{user_id}:course:{course_id}`

## When To Use

- A coaching discussion message arrives from the learner
- The message may reveal prior knowledge, preferences, skill level, struggles, goals, or course-specific understanding
- You need memory extraction, not answer generation

## Extraction Rules

1. Extract only durable facts likely to help future coaching.
2. Ignore temporary requests, greetings, or one-off phrasing with no future value.
3. Prefer short declarative facts.
4. Do not restate the entire user message.
5. Do not invent facts that are not supported by the message.
6. If no durable facts exist, return empty lists.

## General Facts

Store a fact in `general_facts` when it is useful across courses, for example:

- existing professional background
- stable communication preferences
- enduring prior knowledge
- general confidence level or learning style
- recurring goals not limited to one course

Examples:

- `Learner already knows Scrum`
- `Learner prefers short answers`
- `Learner has worked in agile teams`
- `Learner is a beginner in software architecture`

## Course Facts

Store a fact in `course_facts` when it is clearly tied to the selected course, for example:

- the learner is confused about a concept in this course
- the learner already understands a concept covered by this course
- the learner asks to skip known basics in this course
- the learner signals a course-specific gap or misconception

Examples:

- `Learner already knows Scrum before taking this course`
- `Learner wants to focus on what this course adds beyond Scrum`
- `Learner is confused about spec-driven development`
- `Learner struggles with user stories and acceptance criteria in this course`

## Output Contract

Return structured output with:

- `general_facts`: list of strings
- `course_facts`: list of strings
- `reasoning`: one short explanation of why these facts are worth storing

## Quality Checks

- Facts should be atomic and easy to retain as standalone memory items.
- Avoid duplicates between `general_facts` and `course_facts` unless the course-specific version adds real context.
- If a fact only matters for the selected course, keep it out of `general_facts`.

## Duplicate Detection

Before storing a fact, compare it against relevant memories already present in the target bank.

- If the same fact already exists, do not store it again.
- If the wording is different but the meaning is the same, treat it as a duplicate.
- Only store a new fact when it adds clearly new information or sharper specificity.
- Prefer skipping duplicates over creating noisy repeated memories.
