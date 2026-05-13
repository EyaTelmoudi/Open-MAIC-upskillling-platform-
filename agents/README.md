## Agents Workspace

This folder is reserved for agent-related code and supporting files that will be introduced step by step.

Goals:
- keep agent work isolated from the existing platform implementation
- allow gradual Agno integration without breaking the current workflow
- make each new agent easier to understand, test, and evolve

Current planned areas:
- `course-maker/` for the Course Maker agent
- `solo-challenge/` for the Solo Challenge agent
- `learner-memory/` for learner course-history memory capture

Planned runtime notes:
- `solo-challenge/`
  - purpose: adaptive daily challenge agent for a single learner
  - port: `8013`
  - dependencies:
    - learner quiz history and progress state
    - Hindsight course bank recall
    - gamification / XP persistence
    - optional chat-coach handoff on weak depth scores
- `learner-memory/`
  - purpose: retain learner-course lesson history in a user-scoped Hindsight bank
  - port: `8014`
  - dependencies:
    - learner lesson entry events from the learning UI
    - Hindsight user-course bank creation/check
    - lesson references and support links from course content

At this stage, this workspace is only structural. No existing generation flow is replaced here yet.
