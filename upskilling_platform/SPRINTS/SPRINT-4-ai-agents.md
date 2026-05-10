# Sprint 4: AI Agents Microservice (AGNO + Hindsight + 6 Agents)

## Context Required
> Load these files before starting any task in this sprint:
> - `PLAN.md` — project summary and architecture overview
> - `SPECS/SPEC-2-architecture.md` — BC-3 AI Agents Service
> - `SPECS/SPEC-4-api.md` — API endpoints (MS3 section)
> - `SPECS/SPEC-5-ui-ux.md` — Chat Coach, AI components
> - `UI-DESIGN-SYSTEM.md` — §8.1 (AI Coach section), §8.4 (Floating AI Button)

## Sprint Header
- **Sprint Goal:** AGNO integration (6 AI Agents), Hindsight memory (Retain/Recall/Reflect), Chat Coach AI with Hindsight context, Recommendations engine, Socket.io real-time streaming of agent responses, wire AI UI scaffolds to live APIs
- **Duration:** Week 4 (1 week)
- **Spec Coverage:** SPEC-2 (BC-3), SPEC-4 (AI Agents endpoints), SPEC-5 (AI UI wiring)
- **Previous Sprint:** Sprint 3 ✅ completed
- **Carry-overs from previous sprint:** CO-4.1 (Skill Graph, 5 SP), CO-4.2 (Skill Gap Dashboard scaffold, 3 SP)

---

## Carry-Over Tasks

**CO-4.1 — Skill graph in PostgreSQL (carried from Sprint 3)**
- **Reason for carry-over**: Deferred to reduce Sprint 3 load; feeds directly into Skill Gap Analyzer agent this sprint
- **What**: Create skill graph tables (Skill, SkillEdge) in pg0, implement path-finding queries for skill dependencies. Skills organized in hierarchical taxonomy.
- **Files**: `packages/common/src/models/skills.py`, `services/learning/analytics/skill_gap.py`
- **Spec Ref**: SPEC-2, SPEC-3
- **Verification**: Skill graph queries return correct dependency paths
- **Effort**: ~3h
- **Story Points**: 5

**CO-4.2 — Skill Gap Dashboard scaffold (carried from Sprint 3)**
- **Reason for carry-over**: Deferred to reduce Sprint 3 load; will be wired to Skill Gap Analyzer agent this sprint
- **What**: Build static skill gap dashboard component: skill radar/bar chart with mock data, gap list with severity indicators, "Recommended Actions" section with placeholder text. This scaffold gets wired to real API in DT-4.10.3 below.
- **Files**: `frontend/src/app/components/skillgap/SkillGapDashboard.tsx`, `frontend/src/app/components/skillgap/SkillRadarChart.tsx`, `frontend/src/app/components/skillgap/GapList.tsx`
- **Spec Ref**: SPEC-5 (Analytics Dashboard), SPEC-1 (FR-019)
- **Verification**: Dashboard renders with mock skill radar chart and gap list
- **Effort**: ~2h
- **Story Points**: 3

---

## General Tasks

### GT-4.1: AI Agents Service Core

**Spec Reference**: SPEC-2, SPEC-4

#### Detailed Tasks:

**DT-4.1.1 — Initialize AI Agents Service**
- **What**: Create FastAPI service at port 8003 with health check, AGNO runtime setup, Dockerfile.
- **Files**: `services/agents/main.py`, `Dockerfile`
- **Spec Ref**: SPEC-2
- **Verification**: Health endpoint at http://localhost:8003/health
- **Effort**: ~1h
- **Story Points**: 2

**DT-4.1.2 — GROQ integration**
- **What**: Set up GROQ LLM integration (Llama 3.3 70B for complex tasks, Llama 3.1 8B for lightweight tasks). Include demo mode fallback with mock responses when GROQ API unavailable.
- **Files**: `services/agents/llm/groq.py`
- **Spec Ref**: SPEC-2
- **Verification**: Can call GROQ API, fallback works in demo mode
- **Effort**: ~2h
- **Story Points**: 3

**DT-4.1.3 — AGNO agent runtime setup**
- **What**: Integrate AGNO as agent runtime — agent lifecycle management, tool calling interface, workflow orchestration, scheduling, monitoring dashboard.
- **Files**: `services/agents/runtime/agno_runtime.py`
- **Spec Ref**: SPEC-2
- **Verification**: AGNO agent runtime operational, can create and run agents
- **Effort**: ~3h
- **Story Points**: 5

---

### GT-4.2: Hindsight Memory System

**Spec Reference**: SPEC-2 (Agent Memory)

#### Current Implementation Note: Course Memory Agent

The Sprint 4 memory work now includes an operational `course memory agent` built as a separate AgentOS workflow. It is no longer limited to a conceptual memory sync.

- **Runtime**
  - `agents/course-memory/app/agent_os_service.py`
  - `agents/course-memory/app/workflow.py`

- **Current supported platform triggers**
  - publish a course
  - edit and save a course
  - unpublish a course
  - delete a course

- **Current behavior by trigger**
  - `publish`
    - checks whether `tenant:{tenantId}:course:{courseId}` already exists in Hindsight
    - skips retain if the course already exists
    - otherwise assembles and retains the full course knowledge set
  - `edit`
    - reuses the same assembly and retain workflow
    - forces retain even when the course bank already exists
    - keeps Hindsight aligned with the latest course edits
  - `unpublish`
    - performs no Hindsight deletion
    - leaves course memory stored while the platform course returns to draft state
  - `delete`
    - deletes retained documents
    - deletes the main course bank
    - deletes the requester-scoped course bank when present

- **Current retained document structure**
  - overview:
    - `course:{courseId}:overview`
  - lesson content:
    - `course:{courseId}:lesson:{lessonId}`
  - quiz content:
    - `course:{courseId}:lesson:{lessonId}:quiz`
  - supplemental source:
    - `course:{courseId}:source:{index}`

- **Current lesson/quiz distinction**
  - the workflow treats a lesson as a quiz when:
    - `assessmentId` is present, or
    - `quizQuestions` is not empty, or
    - `contentType == "quiz"`
  - otherwise the lesson is retained as lesson content

- **Current observability**
  - the terminal shows:
    - request start
    - course bank existence checks
    - prepared document previews
    - lesson retain operations
    - quiz retain operations
    - supplemental source retain operations
    - delete workflow progress

#### Detailed Tasks:

**DT-4.2.1 — Hindsight setup**
- **What**: Set up Hindsight (vectorize-io/hindsight) for agent memory using pg0 — retain (store), recall (retrieve), reflect (generate insights) operations.
- **Files**: `services/agents/memory/hindsight_client.py`
- **Spec Ref**: SPEC-2
- **Verification**: Can store and retrieve memories via Hindsight, reflect generates summary
- **Effort**: ~3h
- **Story Points**: 5

**DT-4.2.2 — Memory API endpoints**
- **What**: Expose memory endpoints: POST /memory/retain, GET /memory/recall, POST /memory/reflect, GET /memory/stats. All require JWT auth.
- **Files**: `services/agents/memory/router.py`
- **Spec Ref**: SPEC-4 (Memory Endpoints)
- **Verification**: Memory endpoints work, retain stores data, recall returns relevant memories
- **Effort**: ~2h
- **Story Points**: 3

**DT-4.2.3 — Per-agent memory bank configuration**
- **What**: Configure memory banks per agent per scope as defined in AGENTS.md: Chat Coach (per-user), Recommendation (per-user), Gamification (per-user), Course Maker (global), Content Librarian (global), Skill Gap Analyzer (per-user).
- **Files**: `services/agents/memory/banks.py`
- **Spec Ref**: SPEC-2
- **Verification**: Each agent has correct memory scope, cross-contamination prevented
- **Effort**: ~2h
- **Story Points**: 3

---

### GT-4.3: Chat Coach Agent (Agent 1)

**Spec Reference**: SPEC-4 API (AI Coach endpoints), SPEC-1 (FR-014)

#### Detailed Tasks:

**DT-4.3.1 — Chat Coach AGNO agent**
- **What**: Implement Chat Coach as AGNO agent with Bloom's Taxonomy-aware responses, Hindsight context injection (recall learner history on every turn), retain conversation summaries and detected struggles after sessions.
- **Files**: `services/agents/agents/chat_coach.py`
- **Spec Ref**: SPEC-1 (FR-014)
- **Verification**: Agent responds with context-aware coaching referencing learner history
- **Effort**: ~3h
- **Story Points**: 5

**DT-4.3.2 — Chat API endpoints**
- **What**: Implement: POST /coach/chat (send message), GET /coach/conversations (list), GET /coach/conversations/{conv_id} (messages), DELETE /coach/conversations/{conv_id}.
- **Files**: `services/agents/coach/router.py`, `services/agents/coach/service.py`
- **Spec Ref**: SPEC-4 (AI Coach Endpoints)
- **Verification**: All 4 chat endpoints work, conversations persist
- **Effort**: ~2h
- **Story Points**: 3

**DT-4.3.3 — Real-time Socket.io streaming**
- **What**: Stream agent responses token-by-token to frontend via Socket.io rooms keyed by user_id. Handle streaming errors and completion signals.
- **Files**: `services/agents/coach/streaming.py`
- **Spec Ref**: SPEC-2
- **Verification**: AI responses stream in real-time to frontend chat UI
- **Effort**: ~2h
- **Story Points**: 3

---

### GT-4.4: Recommendation Agent (Agent 2)

**Spec Reference**: SPEC-4 API (Recommendations endpoints), SPEC-1 (FR-015)

#### Detailed Tasks:

**DT-4.4.1 — Recommendation AGNO agent**
- **What**: Implement Recommendation agent — personalized course suggestions based on Hindsight recall (skill profile, past recommendations, outcomes), adapt difficulty dynamically, prioritize by business relevance.
- **Files**: `services/agents/agents/recommendation.py`
- **Spec Ref**: SPEC-1 (FR-015)
- **Verification**: Agent returns personalized recommendations with relevance scores
- **Effort**: ~3h
- **Story Points**: 5

**DT-4.4.2 — Recommendations API**
- **What**: Implement: GET /recommendations (personalized list), GET /recommendations/learning-path (sequenced path), POST /recommendations/feedback (thumbs up/down for Hindsight reflect).
- **Files**: `services/agents/recommendations/router.py`
- **Spec Ref**: SPEC-4 (Recommendations Endpoints)
- **Verification**: All 3 endpoints return correct data, feedback stored
- **Effort**: ~2h
- **Story Points**: 3

---

### GT-4.5: Remaining Agents (Agents 3–6)

**Spec Reference**: SPEC-1 (FR-016, FR-017, FR-018, FR-019)

#### Detailed Tasks:

**DT-4.5.1 — Gamification AGNO agent (Agent 3)**
- **What**: Implement Gamification agent — generate daily challenges aligned with learner goals, track XP events via Hindsight retain, detect disengagement patterns via Hindsight reflect, adapt challenge difficulty.
- **Files**: `services/agents/agents/gamification.py`
- **Spec Ref**: SPEC-1 (FR-018)
- **Verification**: Agent generates challenges, stores XP events, detects disengagement
- **Effort**: ~3h
- **Story Points**: 5

**DT-4.5.2 — Course Maker AGNO agent (Agent 4)**
- **What**: Implement Course Maker agent — generate course outlines, lessons, quizzes via GROQ LLM, store generated content in MinIO, support human-in-the-loop review workflow.
- **Files**: `services/agents/agents/course_maker.py`
- **Spec Ref**: SPEC-1 (FR-016)
- **Verification**: Agent generates course from topic prompt, content stored in MinIO
- **Effort**: ~3h
- **Story Points**: 5

**DT-4.5.3 — Content Librarian AGNO agent (Agent 5)**
- **What**: Implement Content Librarian agent — semantic search via Hindsight recall(), auto-tagging of uploaded content, duplicate detection, content curation recommendations.
- **Files**: `services/agents/agents/content_librarian.py`
- **Spec Ref**: SPEC-1 (FR-017)
- **Verification**: Agent performs semantic search, auto-tags content, detects duplicates
- **Effort**: ~3h
- **Story Points**: 5

**DT-4.5.4 — Skill Gap Analyzer AGNO agent (Agent 6)**
- **What**: Implement Skill Gap Analyzer agent — analyze assessments and learning behavior via Hindsight recall, map to skill taxonomy (CO-4.1), estimate mastery levels, generate learner and manager reports, publish `skill_gap.detected` to RabbitMQ. Include department-level aggregation endpoint GET /skill-gap/department for managers to view aggregated skill gaps for their department.
- **Files**: `services/agents/agents/skill_gap.py`, `services/agents/skill_gap/router.py`
- **Spec Ref**: SPEC-1 (FR-019, FR-013f), SPEC-4 (GET /skill-gap/department)
- **Verification**: Agent identifies gaps using skill graph, publishes RabbitMQ events, department endpoint returns aggregated gaps filtered by manager's dept_id from token
- **Effort**: ~3h
- **Story Points**: 5

---

### GT-4.6: AGNO Team Workflow Integration

**Spec Reference**: SPEC-2 (Agent Orchestration)

#### Detailed Tasks:

**DT-4.6.1 — Inter-agent team workflows**
- **What**: Configure AGNO team workflows: Chat Coach receives recommendations from Recommendation agent, Gamification reacts to skill gaps, Skill Gap feeds Recommendation with gap data.
- **Files**: `services/agents/workflows/team.py`
- **Spec Ref**: SPEC-2
- **Verification**: Agents communicate through structured AGNO team workflows
- **Effort**: ~3h
- **Story Points**: 5

**DT-4.6.2 — RabbitMQ event routing for agents**
- **What**: Wire RabbitMQ consumers/producers for agent events: `coaching.session.completed`, `skill_gap.detected`, `recommendation.generated`, `challenge.completed`.
- **Files**: `services/agents/events/rabbitmq_handlers.py`
- **Spec Ref**: SPEC-2
- **Verification**: Agent events flow through RabbitMQ to correct queues
- **Effort**: ~2h
- **Story Points**: 3

---

### GT-4.7: Frontend UI — Wire AI Scaffolds to Live APIs

**Spec Reference**: SPEC-5 (Chat Coach, Recommendations, Skill Gap), UI-DESIGN-SYSTEM.md

#### Detailed Tasks:

**DT-4.7.1 — Wire Chat Coach UI to live API**
- **What**: Connect Chat Coach scaffold (built in Sprint 2 DT-2.6.1) to `POST /coach/chat` and `GET /coach/conversations`. Implement real-time message streaming via Socket.io (token-by-token display). Add context indicator (current course/topic). Wire typing indicator to streaming state.
- **Files**: `frontend/src/app/pages/coach/page.tsx` (update), `frontend/src/app/components/coach/ChatMessages.tsx` (update), `frontend/src/app/lib/api.ts` (add coach endpoints)
- **Spec Ref**: SPEC-5 (Chat Coach), SPEC-4 (POST /coach/chat)
- **Verification**: Chat sends messages to API, responses stream in real-time, conversations persist
- **Effort**: ~3h
- **Story Points**: 5

**DT-4.7.2 — Wire Recommendations panel to live API**
- **What**: Connect Recommendations scaffold (built in Sprint 2 DT-2.6.2) to `GET /recommendations` and `GET /recommendations/learning-path`. Replace mock data with live API responses. Add feedback buttons (thumbs up/down) wired to `POST /recommendations/feedback`.
- **Files**: `frontend/src/app/components/recommendations/RecommendationCard.tsx` (update), `frontend/src/app/components/recommendations/RecommendationsPanel.tsx` (update)
- **Spec Ref**: SPEC-5 (AI components), SPEC-4 (Recommendations endpoints)
- **Verification**: Recommendations load from API, feedback buttons work
- **Effort**: ~2h
- **Story Points**: 3

**DT-4.7.3 — Wire Skill Gap Dashboard to live API**
- **What**: Connect Skill Gap Dashboard scaffold (carried as CO-4.2) to `GET /skill-gap/profile` and `GET /skill-gap/gaps`. Replace mock data with live API responses. Add "Generate Report" button wired to `GET /skill-gap/report`.
- **Files**: `frontend/src/app/components/skillgap/SkillGapDashboard.tsx` (update), `frontend/src/app/components/skillgap/SkillRadarChart.tsx` (update), `frontend/src/app/components/skillgap/GapList.tsx` (update)
- **Spec Ref**: SPEC-5 (Analytics Dashboard), SPEC-4 (Skill Gap endpoints)
- **Verification**: Skill radar chart and gap list load from API, report generation works
- **Effort**: ~2h
- **Story Points**: 3

**DT-4.7.4 — Dashboard page with AI widgets**
- **What**: Build `/dashboard` page with: welcome banner (user name, level), stats cards (XP This Week, Current Streak, Courses Completed, Team Rank), Continue Learning section (in-progress courses), Today's Challenge card, Recommended by AI section (wired to recommendations API), Team Activity Feed. Follow `UI-DESIGN-SYSTEM.md` §8.1.
- **Files**: `frontend/src/app/pages/dashboard/page.tsx`, `frontend/src/app/components/dashboard/WelcomeBanner.tsx`, `frontend/src/app/components/dashboard/StatsCards.tsx`, `frontend/src/app/components/dashboard/ContinueLearning.tsx`, `frontend/src/app/components/dashboard/TodaysChallenge.tsx`, `frontend/src/app/components/dashboard/TeamActivityFeed.tsx`
- **Spec Ref**: SPEC-5 (Dashboard), UI-DESIGN-SYSTEM.md §8.1
- **Verification**: Dashboard renders all sections, AI recommendations load from API, stats cards show data
- **Effort**: ~3h
- **Story Points**: 5

---

### GT-4.8: Testing — AI Agents

**Spec Reference**: SPEC-2, SPEC-4

#### Detailed Tasks:

**DT-4.8.1 — Agent service unit tests**
- **What**: Write pytest unit tests for: Chat Coach agent (Bloom's Taxonomy response structure, Hindsight context injection), Recommendation agent (personalization logic), Gamification agent (challenge generation), Hindsight memory client (retain/recall/reflect operations). Mock GROQ API and Hindsight.
- **Files**: `services/agents/tests/test_chat_coach.py`, `services/agents/tests/test_recommendation.py`, `services/agents/tests/test_hindsight.py`
- **Spec Ref**: SPEC-1 (FR-014, FR-015, FR-018), SPEC-4
- **Verification**: `pytest services/agents/tests/ -v` passes, >75% coverage on agents module
- **Effort**: ~3h
- **Story Points**: 5

**DT-4.8.2 — Learning + Agents integration test**
- **What**: Write integration test verifying: (1) Lesson completion event triggers Gamification agent → XP awarded, (2) Skill gap data flows from Learning to Skill Gap Analyzer agent, (3) Recommendation agent uses skill profile from Hindsight recall, (4) Chat Coach agent recalls learner history on conversation start.
- **Files**: `tests/integration/test_learning_agents.py`
- **Spec Ref**: SPEC-2 (BC-2 + BC-3 integration)
- **Verification**: `pytest tests/integration/test_learning_agents.py -v` passes
- **Effort**: ~2h
- **Story Points**: 3

**DT-4.8.3 — Chat Coach end-to-end flow test**
- **What**: Write integration test verifying full chat flow: (1) User sends message via API, (2) Chat Coach agent recalls Hindsight memories, (3) Agent generates Bloom's Taxonomy-aware response, (4) Response streamed via Socket.io, (5) Conversation summary retained in Hindsight.
- **Files**: `tests/integration/test_chat_coach_flow.py`
- **Spec Ref**: SPEC-2 (BC-3 end-to-end)
- **Verification**: `pytest tests/integration/test_chat_coach_flow.py -v` passes
- **Effort**: ~2h
- **Story Points**: 3

**DT-4.8.4 — Hindsight memory persistence test**
- **What**: Write integration test verifying: (1) retain() stores memory with correct user_id and scope, (2) recall() returns relevant memories ranked by relevance, (3) reflect() generates meaningful summary, (4) per-agent memory banks prevent cross-contamination.
- **Files**: `tests/integration/test_hindsight_memory.py`
- **Spec Ref**: SPEC-2 (Hindsight + pg0)
- **Verification**: `pytest tests/integration/test_hindsight_memory.py -v` passes
- **Effort**: ~1h
- **Story Points**: 2

---

## Sprint 4 Summary

| Metric | Value |
|--------|-------|
| **Total Story Points** | 82 |
| **Total Estimated Hours** | ~56h |
| **Average Velocity Assumption** | 40 SP/solo dev/week |
| **Capacity Status** | 🔴 CRITICALLY OVERLOADED by 42 SP |

### Capacity Analysis
Sprint 4 is the most overloaded sprint — it contains all 6 AI agents, Hindsight memory, AGNO runtime, frontend wiring, and testing. **This is the project's critical sprint. Recommended actions:**

**Mandatory deferrals to reduce to ≤40 SP:**
- **Defer DT-4.5.1 (Gamification Agent, 5 SP)** → Move to Sprint 5. The Gamification *backend* (XP, badges, leaderboard) already works from Sprint 3; the AI agent layer is a nice-to-have enhancement. Saves 5 SP.
- **Defer DT-4.5.2 (Course Maker Agent, 5 SP)** → Move to Sprint 5. Course creation works manually; AI generation is an enhancement. Saves 5 SP.
- **Defer DT-4.5.3 (Content Librarian Agent, 5 SP)** → Move to Sprint 5. Content search works via basic DB queries; semantic search is an enhancement. Saves 5 SP.
- **Defer DT-4.6.1 (Inter-agent team workflows, 5 SP)** → Move to Sprint 5. Individual agents work without orchestration; team workflows are coordination layer. Saves 5 SP.
- **Defer DT-4.7.4 (Dashboard page, 5 SP)** → Move to Sprint 5. Dashboard is a composite page; individual AI features work without it. Saves 5 SP.
- **Defer CO-4.1 (Skill Graph, 5 SP)** → Move to Sprint 5. Basic gap computation works without the full graph. Saves 5 SP.

With all six deferrals: **82 - 30 = 52 SP** (still over).

**Additional deferrals:**
- **Defer DT-4.8.4 (Hindsight persistence test, 2 SP)** → Move to Sprint 5. Saves 2 SP.
- **Defer DT-4.8.3 (Chat Coach E2E test, 3 SP)** → Move to Sprint 5. Saves 3 SP.
- **Defer DT-4.7.3 (Skill Gap Dashboard wiring, 3 SP)** → Move to Sprint 5 (alongside Skill Graph). Saves 3 SP.
- **Defer DT-4.8.2 (Learning + Agents integration test, 3 SP)** → Move to Sprint 5. Saves 3 SP.

**Final: 82 - 41 = 41 SP.** Marginally acceptable. The Sprint 4 demo focuses on: Chat Coach working, Recommendations working, Hindsight memory operational. Other agents demo in Sprint 5.

### Carry-Overs to Sprint 5
The following tasks are deferred and will appear as CO- entries in Sprint 5:
- CO-5.1: Gamification Agent (Agent 3) — 5 SP
- CO-5.2: Course Maker Agent (Agent 4) — 5 SP
- CO-5.3: Content Librarian Agent (Agent 5) — 5 SP
- CO-5.4: Inter-agent team workflows — 5 SP
- CO-5.5: Dashboard page — 5 SP
- CO-5.6: Skill Graph in PostgreSQL — 5 SP
- CO-5.7: Skill Gap Dashboard wiring — 3 SP
- CO-5.8: Hindsight persistence test — 2 SP
- CO-5.9: Chat Coach E2E test — 3 SP
- CO-5.10: Learning + Agents integration test — 3 SP
- **Total carry-over: 41 SP** (Sprint 5 will need significant scope management)

---

## Sprint 4 Checklist

- [ ] All detailed tasks completed and verified
- [ ] AI Agents Service at port 8003 working
- [ ] AGNO runtime operational (agent execution, tool calling, workflows, scheduling, monitoring)
- [ ] Chat Coach agent implemented and responding with Hindsight context
- [ ] Recommendation agent returning personalized suggestions
- [ ] Skill Gap Analyzer agent identifying gaps and publishing RabbitMQ events
- [ ] Hindsight memory (Retain/Recall/Reflect) operational with per-agent memory banks
- [ ] Chat Coach UI wired to live API with real-time streaming
- [ ] Recommendations panel wired to live API with feedback
- [ ] Skill Gap Dashboard wired to live API
- [ ] Agent service unit tests passing (>75% coverage)
- [ ] Sprint demo: Live chat with AI coach (streaming responses), personalized recommendations, skill gap analysis visible in dashboard

---

## Sprint 4 Multi-Tenant Extension

### GT-4.11: Multi-Tenant AI Agents

**Spec Reference**: SPEC-1 (FR-001b), SPEC-2 (RabbitMQ tenantId in payload)

#### Detailed Tasks:

**DT-4.11.1 — RabbitMQ event payload tenantId**
- **Status:** ⏳ Pending
- **What**: Update all RabbitMQ event payloads to include tenantId. All learning.*, agents.*, auth.* events now carry tenantId for filtering. Consuming services validate tenant context.
- **Files**: `packages/common/src/common/messaging.py`, `services/learning/routers/progress.py`, `services/learning/gamification/*.py`, `services/agents/routers/*.py`
- **Spec Ref**: SPEC-2 (RabbitMQ events)
- **Verification**: All events include tenantId, consumers filter by tenant
- **Effort**: ~2h
- **Story Points**: 3

**DT-4.11.2 — Tenant-scoped Chat Coach**
- **Status:** ⏳ Pending
- **What**: Update Chat Coach to scope conversations to tenant. User can only chat about courses within their tenant. Add tenant_id to ChatConversation. Hindsight memory already scoped by userId — verify no cross-tenant leakage.
- **Files**: `packages/common/src/common/models.py`, `services/agents/routers/coach.py`
- **Spec Ref**: SPEC-1 (FR-014), SPEC-3 (ChatConversation)
- **Verification**: Chat scoped to tenant, no cross-tenant conversation access
- **Effort**: ~2h
- **Story Points**: 3

**DT-4.11.3 — Tenant-scoped Recommendations**
- **Status:** ⏳ Pending
- **What**: Update Recommendation agent to only recommend courses from user's tenant. Add tenant_id to UserRecommendation. Filter recommendations by tenant context.
- **Files**: `packages/common/src/common/models.py`, `services/agents/routers/recommendations.py`
- **Spec Ref**: SPEC-1 (FR-015), SPEC-3 (UserRecommendation)
- **Verification**: Recommendations only from user's tenant
- **Effort**: ~1h
- **Story Points**: 2

**DT-4.11.4 — Tenant-scoped Skill Gap**
- **Status:** ⏳ Pending
- **What**: Update Skill Gap Analyzer to scope analysis to tenant. Add tenant_id to SkillGap. Manager can only view skill gaps for users in their tenant.
- **Files**: `packages/common/src/common/models.py`, `services/agents/routers/skillgap.py`
- **Spec Ref**: SPEC-1 (FR-019), SPEC-3 (SkillGap)
- **Verification**: Skill gaps scoped to tenant
- **Effort**: ~1h
- **Story Points**: 2

**DT-4.11.5 — Demo mode with seeded tenants**
- **Status:** ⏳ Pending
- **What**: Seed database with at least 2 demo tenants (e.g., "3S", "Advancia") with different users and courses. Ensure demo mode works with multi-tenant isolation demonstrable.
- **Files**: `scripts/seed_demo_tenants.py`
- **Spec Ref**: SPEC-6 (Demo mode)
- **Verification**: Two tenants accessible, data isolated between them
- **Effort**: ~2h
- **Story Points**: 3
