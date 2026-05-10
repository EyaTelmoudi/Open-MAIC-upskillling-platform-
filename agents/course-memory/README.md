# Course Memory Agent

This workspace hosts the separate AgentOS service for the Course Memory Agent.

Current responsibilities:
- react when a course is published
- react when a course is edited and saved
- react when a course is unpublished
- react when a course is deleted
- load the official course payload from the platform learning API
- assemble the memory-ready course payload
- distinguish lesson content from quiz content
- recover supplemental sources when needed
- prepare deterministic Hindsight documents
- retain course knowledge into Hindsight
- delete retained course knowledge and banks on course deletion
- log the full workflow in the terminal

## Runtime

- AgentOS service: `app/agent_os_service.py`
- Workflow: `app/workflow.py`

## Supported workflows

### Publish

- checks whether the course bank already exists:
  - `tenant:{tenantId}:course:{courseId}`
- if the course already exists in Hindsight:
  - logs the existence check
  - skips collection and retain
- if the course does not exist:
  - loads the course payload
  - prepares overview, lesson, quiz, and supplemental source documents
  - retains them into the dedicated course bank

### Edit

- uses the same assembly and retain workflow as publish
- forces retain even if the course bank already exists
- updates Hindsight with the edited course content

### Unpublish

- does not delete the course bank
- does not run a retain update
- leaves the memory stored in Hindsight while the platform course returns to draft

### Delete

- removes retained documents from the course bank
- deletes the main bank:
  - `tenant:{tenantId}:course:{courseId}`
- deletes the requester-scoped bank when present:
  - `tenant:{tenantId}:user:{userId}:course:{courseId}`

## Retained document layout

- course overview:
  - `course:{courseId}:overview`
- lesson content:
  - `course:{courseId}:lesson:{lessonId}`
- quiz content:
  - `course:{courseId}:lesson:{lessonId}:quiz`
- supplemental source:
  - `course:{courseId}:source:{index}`

## Lesson versus quiz classification

A lesson is treated as a quiz when at least one of these is true:

- `assessmentId` exists
- `quizQuestions` is not empty
- `contentType == "quiz"`

Otherwise it is retained as lesson content.
