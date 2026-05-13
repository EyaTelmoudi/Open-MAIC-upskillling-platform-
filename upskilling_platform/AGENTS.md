# AGENTS.md — Project Memory for Upskilling Platform

> This file is maintained as the single source of truth for project decisions, architecture, and conventions.

---

## Project Overview

**Project Name:** Enterprise AI-Driven Upskilling & Mentorship Platform  
**Student:** Aya Telmoudi  
**Supervisor:** Hazem Raouafi  
**Defense Date:** June 2026

**Core Features:**
- Enterprise learning platform (B2B - no self-registration)
- AI-powered coaching with Hindsight memory + AGNO agent runtime
- 7 AI Agents: Chat Coach, Solo Challenge, Recommendation, Gamification, Course Maker, Content Librarian, Skill Gap Analyzer
- Personalized recommendation engine
- Gamification (XP, levels, badges, streaks, leaderboards)
- Course management with modules, lessons, assessments
- Team management and goal tracking
- Real-time notifications via Socket.io + RabbitMQ
- RabbitMQ message bus for inter-service communication

**Tech Stack:**
- **Frontend:** Next.js + React + TypeScript + shadcn/ui + Socket.io Client
- **Backend:** FastAPI (Python 3.12+) - 4 Microservices (DDD)
- **Database:** PostgreSQL + pg0
- **Message Broker:** RabbitMQ (AMQP)
- **Agent Orchestration:** AGNO (agent execution, workflows, tool calling, scheduling, monitoring)
- **Agent Memory:** Hindsight (vectorize-io/hindsight) — retain, recall, reflect
- **Object Storage:** MinIO (S3-compatible) — course videos, PDFs, slides, images, quiz media
- **Auth:** Azure Entra ID (OIDC/OAuth2) for enterprise users + Local email/password for admin
- **AI/LLM:** GROQ (with demo mode fallback)
- **Deployment:** Docker + Docker Compose + Kubernetes

---

## Architecture: DDD Bounded Contexts

### Microservices Architecture (4 Services - DDD)

| Service | Port | Bounded Context | Domain Responsibilities |
|---------|------|-----------------|----------------------|
| Identity & Access | 8001 | BC-1 | **Two-Tier Identity:** Super Admin manages Tenant Admins only; Tenant Admin manages own company users; JWT validation, Azure Entra ID (per-tenant), local admin auth, RBAC |
| Learning Platform | 8002 | BC-2 | Courses, enrollment, progress, gamification, teams, goals, analytics |
| AI Agents | 8003 | BC-3 | 7 AI agents (Chat Coach, Solo Challenge, Recommendation, Gamification, Course Maker, Content Librarian, Skill Gap Analyzer), AGNO orchestration, Hindsight memory |
| Notification | 8004 | BC-4 | Real-time WebSocket, email, push notifications |

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT (Next.js)                       │
│  Dashboard | Courses | AI Coach | Leaderboard | Teams | Goals│
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                    API Gateway (FastAPI)                     │
└────────────────────────────┬────────────────────────────────┘
                             │
     ┌───────────────┬───────┴───────┬───────────────┐
     ▼               ▼               ▼               ▼
┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐
│   Identity   │  │   Learning  │  │  AI Agents  │  │ Notification│
│   & Access   │  │   Platform  │  │   Service   │  │   Service   │
│   (FastAPI)  │  │   (FastAPI) │  │   (FastAPI) │  │   (FastAPI) │
│   Port: 8001 │  │   Port: 8002 │  │   Port: 8003 │  │   Port: 8004 │
└──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘
       │                │                │                │
       └────────────────┼────────────────┼────────────────┘
                        ▼
          ┌─────────────────────────────┐
          │    RabbitMQ (AMQP)          │
          │  auth.exchange, learning.ex │
          │  agents.exchange, notif.ex  │
          └──────────────┬──────────────┘
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│  PostgreSQL  │   │    MinIO    │   │  Hindsight  │
│  + pg0       │   │  (S3-compat │   │  (retain,   │
│  (Main DB)   │   │  object     │   │  recall,    │
│              │   │  storage)   │   │  reflect)   │
└─────────────┘   └─────────────┘   └──────┬──────┘
                                           │
                         ┌─────────────────┘
                         ▼
          ┌─────────────────────────────┐
          │    AGNO (Agent Runtime)     │
          │  7 Agents: Chat Coach,     │
          │  Solo Challenge, Recommend, │
          │  Gamifi, Course Maker,      │
          │  Content Lib, Skill Gap     │
          │  Analyzer                    │
          └─────────────────────────────┘
```

### Key Decisions

- **Multi-tenant** architecture (Tenant = Company: 3S, Advancia, Smart UP, Global Net) — NEW
- **Row-Level Security (RLS)** for tenant isolation at database level — NEW
- **Super Admin** role for cross-tenant management (tenantId = null in JWT) — NEW
- **No self-registration** - users provisioned via Azure Entra ID (per-tenant config)
- **RabbitMQ** for all inter-service messaging (tenantId in payload)
- **AGNO** for agent execution, multi-agent coordination
- **Hindsight + pg0** for agent long-term memory
- **MinIO** (S3-compatible) for binary assets (tenant-prefixed paths)
- **Frontend-first** sprints for supervisor demos

### Identity & Access Governance (Two-Tier Model)

**Governance Principle:**
- **Super Admin** manages identity ONLY for Tenant Admins (platform operators)
- **Tenant Admin** manages identity for their OWN company's users exclusively
- **Super Admin has NO access** to individual user records within any tenant
- This improves GDPR compliance by ensuring platform operator cannot read individual employee data

**BC-1 (Identity & Access) Scope:**

| Level | Scope | What They Manage |
|-------|-------|-----------------|
| Super Admin | Platform-wide (tenantId=null) | Tenant Admin accounts only, platform-level role mapping rules, admin audit log |
| Tenant Admin | Company-scoped (tenantId in JWT) | Own company's users: pending users, role mapping rules, role override, access revocation, user audit log |

**Double Enforcement:** API validation (tenantId match) + RLS at DB layer

---

## Sprint Plan (5 Sprints × 1 week)

| Sprint | Theme | SP | Demo? |
|--------|-------|-----|-------|
| 1 | Project Setup + Identity + Auth UI + Multi-Tenancy | 66+31 | ❌ |
| 2 | Learning Platform + Course UI + AI Scaffolds | 53+17 | ✅ |
| 3 | Gamification + Teams + Goals | 58+8 | ✅ |
| 4 | AI Agents (AGNO + Hindsight) + Wiring | 82+13 | ✅ |
| 5 | Analytics + Notifications + Testing + Demo | 71+13 | 🎯 |

**Note:** Multi-tenancy adds ~79 SP across all sprints (23 new tasks added)

---

## Active Work

**Current Sprint:** Sprint 3 - Gamification + Teams
**Status:** 🔄 IN PROGRESS — Core gamification features implemented

**Sprint Status:**
- Sprint 1: ✅ Complete (Identity & Access)
- Sprint 2: ✅ Complete (Learning Platform core)
- Sprint 3: 🔄 In Progress (Gamification - Teams & Goals pending)
- Sprint 4: ⏳ Pending (AI Agents)
- Sprint 5: ⏳ Pending (Final integration)

**Multi-Tenancy Tasks Added:** All sprints now include multi-tenant tasks (GT-1.13, GT-1.14, GT-1.15, GT-2.8, GT-3.7, GT-4.11, GT-5.5)

**New Sprint 1 Tasks (GT-1.14, GT-1.15):**
- GT-1.14: Tenant-scoped identity endpoints (pending users, role override, status change, revocation, role mapping rules, audit log)
- GT-1.15: Super Admin identity management (tenant admin list, assign/unassign, suspend/reactivate, reset password, platform-level role mapping, admin audit log)

---

> **🔴 CRITICAL ARCHITECTURE NOTE (2026-04-17): Super Admin and Azure Entra ID**
> The Super Admin is a **platform-level identity** (3S Group level), NOT a company employee. He MUST NEVER authenticate through Azure Entra ID. His account lives exclusively in the platform's PostgreSQL database with `authProvider = local`. Azure Entra ID is configured **per company** (per tenant) for that company's employees only. This is explicitly documented in: SPEC-1 (FR-002c), SPEC-3 (User.authProvider), SPEC-4 (Auth endpoints).

---

## Code Conventions

### Project Structure
```
/upskilling_platform
├── services/
│   ├── identity/           # MS1: Identity & Access (FastAPI)
│   ├── learning/           # MS2: Learning Platform (FastAPI)
│   ├── agents/             # MS3: AI Agents (FastAPI)
│   └── notifications/      # MS4: Notifications (FastAPI)
├── packages/
│   └── common/             # Shared types, models, utilities
├── frontend/               # Next.js application
├── docker-compose.yml     # All services
├── pyproject.toml         # Root Python config
└── SPECS/                # Specification documents
```

### Naming
- Services: `services/{service-name}/`
- Routers: `services/{service}/routers/`
- Models: `packages/common/src/common/models.py`
- Schemas: `services/{service}/schemas/`
- Enums: `packages/common/src/common/enums.py`
- Auth: `packages/common/src/common/auth.py`
- Messaging: `packages/common/src/common/messaging.py`
- Database: `packages/common/src/common/database.py`

---

## Build / Test / Lint Commands

### Backend Services (FastAPI/Python)
```bash
# Install shared package (do this first)
pip install -e packages/common[dev]

# Install service dependencies
cd services/{service} && pip install -e .

# Run in development
uvicorn services.{service}.main:app --reload --port 800X

# Run tests
pytest services/{service}/tests/
pytest packages/common/tests/

# Format code
black services/ packages/
isort services/ packages/

# Lint
ruff check services/ packages/
```

### Frontend
```bash
# Install dependencies
cd frontend && npm install

# Run development server
npm run dev

# Build for production
npm run build
```

### Docker
```bash
# Build all services
docker-compose build

# Run all services
docker-compose up

# Run specific service
docker-compose up identity
```

---

## Active Work

**Current Sprint:** Sprint 3 - Gamification + Teams
**Status:** 🔄 IN PROGRESS

**Sprint Status:**
- Sprint 1: ✅ Complete (Identity & Access)
- Sprint 2: ✅ Complete (Learning Platform core)
- Sprint 3: 🔄 In Progress (Gamification - Teams & Goals pending)
- Sprint 4: ⏳ Pending (AI Agents)
- Sprint 5: ⏳ Pending (Final integration)

**Multi-Tenancy Added (in all sprints):**
- GT-1.13: Tenant entity, RLS, JWT tenantId, Super Admin API + UI (31 SP pending)
- GT-2.8: tenant_id to learning entities, tenant-scoped catalog/enrollment (17 SP pending)
- GT-3.7: tenant-scoped teams/goals (8 SP pending)
- GT-4.11: RabbitMQ tenantId, tenant-scoped AI agents (13 SP pending)
- GT-5.5: Super Admin analytics, multi-tenant E2E tests (13 SP pending)

**Still Pending:**
- Teams management (create teams, join/leave, team goals)
- User/Team goals API and UI
- Skill gap analyzer UI and API
- Socket.io real-time notifications
- RabbitMQ event consumers in notification service
- Sprint 4: AI Agents (AGNO + Hindsight)
- Sprint 5: Final integration and testing

---

## Recent Implementation Details

### Architecture Principles
- **Orchestration:** AGNO for agent execution, multi-agent coordination, tool calling, workflow orchestration, task scheduling, monitoring
- **LLM calls:** GROQ (Llama 3.3 70B for complex tasks, Llama 3.1 8B for lightweight tasks)
- **Inter-agent communication:** RabbitMQ message broker + AGNO team workflows
- **Agent Memory:** Hindsight (retain, recall, reflect operations)
- **Agent Runtime:** AGNO agents with structured team workflows
- **Real-time delivery:** Socket.IO rooms keyed by user_id
- **Object Storage:** MinIO (S3-compatible) — agents retrieve file URLs to inject into context

### Agent 1: Chat Coach AI (Learner-Facing)

**Role:** 24/7 conversational tutor, guidance, motivation

**Capabilities:**
- Answer learning questions with Bloom's Taxonomy-aware responses
- Context-aware tutoring based on learner progress and skill gaps
- Deliver recommendations from Recommendation AI through conversation
- Personalized motivational coaching

**Hindsight Usage:**
- `recall()` learner history + course content on every turn
- `retain()` conversation summaries and detected struggles
- `reflect()` to generate coaching insights after sessions

**Endpoints:**
- `POST /coach/chat` — Send message to AI coach
- `GET /coach/conversations` — List chat conversations
- `GET /coach/conversations/{conv_id}` — Get conversation messages
- `DELETE /coach/conversations/{conv_id}` — Delete conversation

### Agent 2: Solo Challenge AI

**Role:** Adaptive personal trainer for one learner at a time

**Capabilities:**
- Launch a personalized challenge flow when the learner signs in or opens the challenge widget
- Read quiz history, weak topics, learner progress, XP tier, and streak state
- Generate timed free-text challenges grounded in the actual course memory bank
- Score answers on accuracy, depth, and application with specific lesson citations
- Increase or decrease per-topic difficulty based on performance
- Award XP, update daily mission progress, maintain streaks, and trigger mastery badges
- Hand low-depth weak areas to Chat Coach AI for follow-up coaching

**Planned runtime:**
- workspace: `agents/solo-challenge/`
- port: `8013`

**Workflow design:**
- validate tenant, course, enrollment, progress, quiz history, and Hindsight bank presence
- run parallel weak-spot analysis:
  - quiz-score scan for failures and low scores
  - Hindsight learner-memory recall for confusion flags and known difficulties
- merge both signals into ranked weak topics
- choose challenge type and difficulty `1..5`
- retrieve relevant course passages from Hindsight
- generate a timed challenge with no hallucinated content
- score the learner response and produce a structured debrief
- update XP, streak, daily mission progress, and optional coach handoff

**Challenge formats:**
- Explain in your own words
- Spot the mistake
- Apply to scenario
- Rank / order concepts
- Teach it back
- True / false + justify

**Hindsight Usage:**
- `recall()` course memory passages for the selected weak topic
- `recall()` learner memory flags such as confusion or repeated struggles
- `retain()` challenge attempts, scores, and per-topic mastery progression
- `reflect()` to detect persistent weak spots and suggest coaching escalation

**Planned endpoints:**
- `GET /solo-challenges/today` — Get current daily mission state and next challenge
- `POST /solo-challenges/generate` — Generate a challenge for a learner/course/topic
- `POST /solo-challenges/submit` — Submit free-text answer and receive grounded scoring
- `GET /solo-challenges/history` — Get recent attempts, streaks, and topic levels

### Agent 3: Recommendation AI

**Role:** Personalized learning path and course recommendation

**Capabilities:**
- Suggest courses based on role, goals, skill gaps, and performance
- Adapt difficulty and sequencing dynamically
- Prioritize learning aligned with business needs
- Feed recommendations into Chat Coach AI

**Hindsight Usage:**
- `recall()` learner skill profile + past recommendations
- `reflect()` to evaluate what recommendations worked vs failed
- `retain()` new recommendation decisions with outcome metadata

**Endpoints:**
- `GET /recommendations` — Get personalized course recommendations
- `GET /recommendations/learning-path` — Get suggested learning path
- `POST /recommendations/feedback` — Submit recommendation feedback

### Agent 4: Gamification AI

**Role:** Manage XP, badges, streaks, daily challenges, leaderboards

**Capabilities:**
- Generate challenges aligned with learner goals and skill gaps
- Track XP, badges, streaks in real time
- Adapt challenge difficulty dynamically
- Support team challenges and tournaments

**Hindsight Usage:**
- `retain()` every XP event, badge award, challenge completion
- `recall()` learner engagement history to adapt challenge difficulty
- `reflect()` to detect disengagement patterns early

**Gamification System:**
- XP system with multipliers, streaks, anti-gaming rules
- Exponential leveling curve with unlockable features
- Badge system: completion, streak, mastery, social, milestone, challenge with bronze/silver/gold/platinum tiers + hidden badges
- Leaderboards: global, team, individual — daily/weekly/monthly/all-time

### Agent 5: Course Maker AI

**Role:** Automate course creation and adapt content delivery

**Capabilities:**
- Generate course outlines, lessons, quizzes, and exercises via LLM
- Suggest prerequisites and learning objectives
- Adapt content depth and sequencing per learner
- Support human-in-the-loop review workflow
- Store generated content in MinIO

**Hindsight Usage:**
- `retain()` all generated course content and instructor feedback
- `recall()` existing content to avoid duplication before generating
- `reflect()` on learner performance per generated content to improve quality

### Agent 6: Content Librarian AI

**Role:** Content organization, semantic search, curation, quality control

**Capabilities:**
- Semantic search across all learning content (via Hindsight recall)
- Automatic tagging and categorization of content
- Detect duplicate or outdated content
- Curate and maintain learning paths

**Hindsight Usage:**
- `retain()` all content metadata and tagging decisions
- `recall()` to power semantic search across the content library
- `reflect()` to detect content gaps and quality issues at scale

### Agent 7: Skill Gap Analyzer AI

**Role:** Analyze learner performance and detect skill gaps

**Capabilities:**
- Analyze assessments, retries, and learning behavior
- Map performance to a hierarchical skill taxonomy graph
- Estimate skill mastery levels (Bayesian Knowledge Tracing or analytics)
- Prioritize gaps by business relevance
- Generate learner-facing AND manager-facing reports
- Feed gap data to Recommendation AI and Gamification AI

**Hindsight Usage:**
- `retain()` every assessment result, retry, and behavior signal
- `reflect()` to compute mastery trajectory per skill per learner
- `recall()` full learner history for gap analysis reports

### Hindsight Memory System

**Operations:**
```python
from hindsight import Hindsight

h = Hindsight()

# Store memory
h.retain(
    user_id="user-123",
    content="User struggled with async/await concepts",
    metadata={"topic": "javascript", "context": "chat"}
)

# Retrieve memories
memories = h.recall(
    user_id="user-123",
    query="What topics is the user good at?",
    limit=5
)

# Generate insights
insights = h.reflect(user_id="user-123")
```

**Memory Bank Design (per-agent, per-scope):**
| Agent | Scope | retain() | recall() | reflect() |
|-------|-------|----------|----------|-----------|
| Chat Coach | per-user | Conversation summaries, struggles | Learner history + course content | Coaching insights after sessions |
| Solo Challenge | per-user + per-topic | Challenge attempts, topic difficulty, streak outcomes | Course memory + learner weak spots | Persistent weak-topic escalation |
| Recommendation | per-user | Recommendation decisions + outcomes | Skill profile + past recommendations | Evaluate what worked vs failed |
| Gamification | per-user | XP events, badge awards, challenge completions | Engagement history | Disengagement pattern detection |
| Course Maker | global | Generated content, instructor feedback | Existing content (avoid duplication) | Content quality based on learner performance |
| Content Librarian | global | Content metadata, tagging decisions | Semantic search across library | Content gaps and quality issues |
| Skill Gap Analyzer | per-user | Assessment results, retries, behavior signals | Full learner history | Mastery trajectory per skill |

**Storage:**
- Development: pg0 (embedded PostgreSQL)
- Production: PostgreSQL + pgvector

---

## RabbitMQ Message Bus

### Exchanges & Queues

| Exchange | Type | Queues | Purpose |
|----------|------|--------|---------|
| auth.exchange | topic | auth.notifications, auth.onboarding | Authentication + onboarding events |
| learning.exchange | topic | learning.progress, learning.enrollment | Learning events |
| agents.exchange | topic | agents.tasks, agents.recall | AI agent tasks |
| notifications.exchange | fanout | notif.email, notif.push, notif.websocket | Notification dispatch |

### Onboarding Event (user.onboarding.completed)
```json
{
  "event": "user.onboarding.completed",
  "userId": "user-123",
  "email": "user@company.com",
  "role": "TeamMember",
  "department": "Engineering",
  "timestamp": "2026-04-10T14:00:00Z"
}
```

### Event Payloads
```json
{
  "event": "lesson.completed",
  "userId": "user-123",
  "courseId": "course-456",
  "lessonId": "lesson-789",
  "timestamp": "2026-03-26T14:00:00Z"
}
```

---

## History

### Session 2026-04-17 — Super Admin Experience & Tenant Governance (COMPLETE)

**Backend Features (GT-1.27 - GT-1.30):**
- **DT-1.27.1**: Created `services/identity/auth/tokens.py` for secure, one-time invitation token generation.
- **DT-1.27.2**: Implemented `POST /auth/set-password` in `services/identity/routers/auth.py` for admin account activation.
- **DT-1.28.1**: Added `SuperAdminAuditLog` model to `packages/common/src/common/models.py`.
- **DT-1.28.2**: Implemented `log_superadmin_action` helper in `services/identity/middleware/audit.py` and integrated into Tenant CRUD and Settings APIs.
- **DT-1.28.3**: Created `GET /superadmin/audit-log` retrieval endpoint in `services/identity/routers/superadmin.py`.
- **DT-1.29.1**: Implemented `seat_limit` enforcement in `services/learning/routers/enrollment.py` (403 Forbidden on limit reach).
- **DT-1.29.2**: Added RabbitMQ event publishing for `tenant.seat_limit_warning` (90%) and `tenant.seat_limit_reached` (100%).
- **DT-1.30.1**: Added `tenant.suspended` event publishing in identity service.
- **DT-1.30.2**: Updated Notification service to consume `tenant.suspended` events and trigger notifications.

**Frontend Features:**
- **CREATED**: `frontend/src/app/set-password/page.tsx` — Password setup page for newly invited admins.
- **CREATED**: `frontend/src/app/superadmin/audit/page.tsx` — Platform-level audit trail with action filtering and pagination.

**Files Created/Modified:**
- `services/identity/auth/tokens.py` — NEW
- `services/identity/schemas/auth.py` — Added password set and audit response schemas
- `services/identity/routers/auth.py` — Added set-password endpoint
- `services/identity/routers/tenants.py` — Added audit logs and suspension events
- `services/identity/routers/settings.py` — Added audit logs
- `services/identity/routers/superadmin.py` — NEW (audit log retrieval)
- `services/identity/middleware/audit.py` — NEW
- `services/learning/routers/enrollment.py` — Added seat limit enforcement
- `services/notifications/main.py` — Added suspension event consumer
- `frontend/src/app/set-password/page.tsx` — NEW
- `frontend/src/app/superadmin/audit/page.tsx` — NEW

### Session 2026-04-10 — Onboarding Role & Access Gating System (COMPLETE)

**Backend Features (MS1 - Identity Service):**
- **UPDATED:** `packages/common/src/common/models.py` — Added `onboarded` Boolean column to User model (default=False)
- **UPDATED:** `packages/common/src/common/auth.py` — JWT now includes `status` and `onboarded` fields in payload
- **UPDATED:** `services/identity/auth/jwt.py` — `generate_token_response()` now accepts `status` and `onboarded` params
- **UPDATED:** `services/identity/auth/azure.py` — First login creates user with status=pending, onboarded=False. Subsequent logins sync role from Azure JWT claims (role sync).
- **CREATED:** `services/identity/schemas/onboarding.py` — Onboarding step schemas (ProfileStep, SkillsStep, GoalsStep, RecommendationStep, OnboardingProgress, OnboardingComplete)
- **CREATED:** `services/identity/routers/onboarding.py` — 4-step onboarding endpoints:
  - POST `/onboarding/step/profile` — Step 1: Profile setup
  - POST `/onboarding/step/skills` — Step 2: Skills selection
  - POST `/onboarding/step/goals` — Step 3: Goal setting
  - POST `/onboarding/step/recommendation` — Step 4: First course recommendation
  - POST `/onboarding/complete` — Mark onboarded=true, status=active, publish event to RabbitMQ
  - GET `/onboarding/progress` — Get current onboarding progress
  - GET `/onboarding/check` — Check if user needs onboarding

**Frontend Features:**
- **CREATED:** `frontend/src/middleware.ts` — Access gate middleware that intercepts all authenticated routes. Redirects to /onboarding if user.onboarded=false OR status=pending. Allows /onboarding/*, /auth/*, /api/* paths through.
- **CREATED:** `frontend/src/app/onboarding/page.tsx` — 4-step onboarding wizard (Welcome → Profile Setup → Skills → Goals). Each step saves progress to backend, supports resume if interrupted.

**RabbitMQ Events:**
- **UPDATED:** `packages/common/src/common/messaging.py` — Added `auth.onboarding` queue
- **UPDATED:** `services/identity/routers/onboarding.py` — On completion, publishes `user.onboarding.completed` event to auth.exchange with routing key `user.onboarding.completed`

**Notification Service:**
- **UPDATED:** `services/notifications/main.py` — Added RabbitMQ consumer that listens to auth.onboarding queue. When user.onboarding.completed event received, logs notification for tenant admin (in production: sends email/push notification)

**Event Payload:**
```json
{
  "event": "user.onboarding.completed",
  "userId": "uuid-123",
  "email": "user@company.com",
  "role": "TeamMember",
  "department": "Engineering",
  "timestamp": "2026-04-10T14:00:00Z"
}
```

**Files Created/Modified:**
- `packages/common/src/common/models.py` — Added onboarded column
- `packages/common/src/common/auth.py` — Added status/onboarded to JWT payload
- `packages/common/src/common/messaging.py` — Added auth.onboarding queue
- `services/identity/auth/jwt.py` — Updated generate_token_response
- `services/identity/auth/azure.py` — First login logic + role sync
- `services/identity/routers/auth.py` — Updated to use authenticate_azure_with_roles
- `services/identity/schemas/onboarding.py` — NEW
- `services/identity/routers/onboarding.py` — NEW
- `services/identity/main.py` — Added onboarding router
- `services/notifications/main.py` — Added RabbitMQ consumer for onboarding events
- `frontend/src/middleware.ts` — NEW
- `frontend/src/app/onboarding/page.tsx` — NEW

**Sprint Status:**
- Sprint 3: 🔄 In Progress (Onboarding now implemented)

### Session 2026-04-07 — Course Rating & Review + Bookmarking Implementation (COMPLETE)

**Frontend Features Added:**
- `BookmarkButton.tsx` — Reusable toggle button component with loading states
- Course catalog (`/courses`) — Bookmark button on each course card (grid & list view)
- Course detail (`/courses/[id]`) — Bookmark button next to course title
- Lesson player (`/learn/[courseId]/[lessonId]`) — Bookmark button in top bar
- `/bookmarks` page — Dedicated bookmarks page with Courses/Lessons tabs
- Sidebar — Added "Bookmarks" navigation item
- Reviews tab on course detail page with rating statistics
- Preview button on course cards (eye icon)
- API helpers: `getCourseBookmarks`, `createBookmark`, `deleteBookmark`, `checkCourseBookmarked`

**Backend Features:**
- Course review endpoints: POST/GET/PUT `/courses/{id}/reviews`, GET `/courses/{id}/reviews/stats`, GET `/courses/{id}/my-review`
- Bookmark endpoints: POST/GET/DELETE `/bookmarks`, GET `/bookmarks/courses`, GET `/bookmarks/lessons`
- Course rating auto-update on review submission
- CORS configuration on API Gateway (wildcard origins, OPTIONS handler)

**Files Created/Modified:**
- `frontend/src/app/components/ui/BookmarkButton.tsx` — NEW
- `frontend/src/app/bookmarks/page.tsx` — NEW
- `frontend/src/app/components/layout/Sidebar.tsx` — Added Bookmarks nav
- `frontend/src/app/lib/api.ts` — Added bookmark/review API helpers
- `frontend/src/app/lib/routes.ts` — Added bookmarks route
- `frontend/src/app/courses/page.tsx` — Added bookmark button
- `frontend/src/app/courses/[id]/page.tsx` — Added bookmark & reviews
- `frontend/src/app/learn/[courseId]/[lessonId]/page.tsx` — Added bookmark
- `services/learning/routers/reviews.py` — NEW
- `services/learning/schemas/review.py` — NEW
- `services/learning/routers/bookmark.py` — Already existed
- `services/gateway/main.py` — CORS configuration

**Sprint Status:**
- Sprint 1: ✅ COMPLETE
- Sprint 2: ✅ COMPLETE (52/64 SP done, remaining deferred to future sprints)

### Session 2026-04-06 — CSV Import 3-Status Logic + Company Email Domain
- **UPDATED:** `packages/common/src/common/enums.py` — Added `provisioned` status to UserStatus enum
- **UPDATED:** `services/identity/schemas/user.py` — CSVImportResult now returns `provisioned_count`, `pending_count`, `skipped_count`, `errors`
- **CREATED:** `services/identity/auth/azure.py` — Added `check_azure_user_exists(email)` to call Microsoft Graph API, `send_invite_email(email, invited_by)` for pending users, `is_company_email(email)` for domain validation fallback
- **UPDATED:** `services/identity/routers/users.py` — Import endpoint now:
  1. Check Azure via Graph API → if found → status=provisioned, auth_provider=azure_entra
  2. Check company email domain via is_company_email() → if matches → status=provisioned
  3. If neither → status=pending_invitation, auth_provider=local, send invite email
  4. Publish user.created event to RabbitMQ auth.exchange
- **UPDATED:** `.env` — Added COMPANY_EMAIL_DOMAIN=techcorp.com
- **UPDATED:** `frontend/src/app/admin/users/page.tsx` — Import modal now shows "provisioned — log in via Azure SSO" and "pending — invite emails sent" breakdown
- **VERIFIED:** Python syntax compiles without errors

### Session 2026-04-02 — Profile Picture Upload Fix (MinIO + CORS)
- **PROBLEM:** Avatar upload returned "Profile picture updated!" but image never displayed in frontend
- **ROOT CAUSE 1:** MinIO has no CORS config by default — browser at localhost:3000 blocked loading images from localhost:9000
- **ROOT CAUSE 2:** Gateway wrapped ALL responses in `JSONResponse`, corrupting binary image data (0 bytes returned)
- **ROOT CAUSE 3:** Old code stored presigned MinIO URLs in DB; new code stores MinIO object names
- **FIXED:** `services/identity/routers/users.py` — stores object name; added public `GET /avatar/{object_name:path}` proxy endpoint (no auth, browsers can't send headers on `<img src>`)
- **FIXED:** `services/gateway/main.py` — non-JSON responses now returned as raw `Response` instead of JSON-wrapped
- **FIXED:** `frontend/src/app/lib/api.ts` — added `getAvatarUrl()` helper to construct proxy URL from stored object name
- **FIXED:** `frontend/src/app/profile/page.tsx` + `Sidebar.tsx` — use `getAvatarUrl()` for `<img src>`
- **ADDED:** `.jfif` to `AVATAR_CONTENT_TYPES` mapping (image/jpeg)
- **UPDATED:** DB record for admin user — avatar changed from presigned URL to object name format
- **VERIFIED:** `curl` through gateway returns HTTP 200, image/jpeg, 66779 bytes, valid JPEG 1200x1600
- **VERIFIED:** 39/39 identity tests pass
- **NOTE:** MinIO does NOT log individual API calls by default (only startup/shutdown) — this is normal

### Session 2026-04-01 — DT-1.5.1 CI/CD Pipeline (COMPLETE)
- **UPDATED:** `.github/workflows/ci.yml` — 3 jobs (lint, test, docker build matrix)
- **LINT:** ruff + black on services/ and packages/
- **TEST:** pytest with PostgreSQL (pgvector), RabbitMQ, MinIO service containers
- **DOCKER:** matrix build for gateway, identity, learning, agents, notifications
- **VERIFIED:** Trigger on push/PR to main/develop branches
- **UPDATED:** `SPRINTS/SPRINT-1-infrastructure.md` — DT-1.5.1 marked DONE, progress 33/58 SP (57%)

### Session 2026-04-01 — DT-1.4.2-6 Identity Service Complete (COMPLETE)
- **CREATED:** `services/identity/auth/jwt.py` — JWT token management (generate_token_response, validate_token, validate_refresh_token, refresh_access_token)
- **CREATED:** `services/identity/auth/local.py` — Local admin authentication (authenticate_local with bcrypt, admin-only check)
- **CREATED:** `services/identity/auth/azure.py` — Azure Entra ID integration (authenticate_azure, get_azure_auth_url, demo mode fallback)
- **CREATED:** `services/identity/middleware/rbac.py` — RBAC middleware (get_current_user, require_role, require_min_role, 6 roles with hierarchy)
- **CREATED:** `services/identity/routers/auth.py` — Auth router (POST /login/local, /login/azure, /refresh)
- **CREATED:** `services/identity/routers/users.py` — User management router (GET /users/, /users/me, /users/{id}, PUT /users/{id}, POST /users/{id}/deactivate)
- **CREATED:** `services/identity/schemas/user.py` — User schemas (UserUpdate, UserDeactivate, RefreshTokenRequest)
- **UPDATED:** `services/identity/main.py` — Added auth and users routers
- **VERIFIED:** All 14 routes registered (health + 3 auth + 5 user endpoints)
- **VERIFIED:** JWT generation and validation working
- **VERIFIED:** RBAC with 6-role hierarchy operational
- **VERIFIED:** 94/95 tests pass (1 skipped: pg0 unavailable on Windows)
- **UPDATED:** `SPRINTS/SPRINT-1-infrastructure.md` — GT-1.3 and GT-1.4 marked DONE, progress 31/58 SP (53%)

### Session 2026-03-31 — DT-1.3.1 API Gateway + DT-1.4.1 Identity Service (COMPLETE)
- **CREATED:** `services/gateway/main.py` — FastAPI gateway with health endpoint + proxy routing to 4 microservices
- **CREATED:** `services/gateway/Dockerfile` — python:3.12-slim with fastapi+uvicorn+httpx
- **UPDATED:** `docker-compose.yml` — gateway service added (port 8000), identity service container verified
- **UPDATED:** `.env` — added GATEWAY_PORT=8000
- **VERIFIED:** Gateway health endpoint at http://localhost:8000/health
- **VERIFIED:** Gateway routes to identity service via http://localhost:8000/api/v1/identity/health
- **VERIFIED:** Unknown service returns 404
- **VERIFIED:** Identity service health endpoint at http://localhost:8001/health
- **UPDATED:** `SPRINTS/SPRINT-1-infrastructure.md` — DT-1.2.1, DT-1.2.2, DT-1.3.1, DT-1.4.1 marked DONE, progress 18/58 SP (31%)
- **NOTE:** DT-1.2.1 and DT-1.2.2 were already implemented in messaging.py from DT-1.1.5/DT-1.1.2

### Session 2026-03-31 — DT-1.1.5 RabbitMQ Setup (COMPLETE)
- **VERIFIED:** Docker RabbitMQ container running (healthy, ports 5672/15672)
- **VERIFIED:** 4 exchanges declared (auth.exchange, learning.exchange, agents.exchange, notifications.exchange)
- **VERIFIED:** 9 queues declared (auth.notifications, learning.progress, learning.enrollment, learning.gamification, agents.tasks, agents.recall, notif.email, notif.push, notif.websocket)
- **VERIFIED:** Management UI accessible at http://localhost:15672
- **VERIFIED:** Publish/consume operations working
- **UPDATED:** `packages/common/tests/test_messaging.py` — added 3 integration tests (connection, setup_infrastructure, publish_consume)
- **UPDATED:** `SPRINTS/SPRINT-1-infrastructure.md` — DT-1.1.5 marked DONE, progress 15/58 SP (26%)
- **NOTE:** All infrastructure tasks (DT-1.1.1 through DT-1.1.5) are now complete — full stack operational (PostgreSQL, MinIO, RabbitMQ)

### Session 2026-03-31 — DT-1.1.4 MinIO Object Storage Setup (COMPLETE)
- **VERIFIED:** Docker MinIO container running (healthy, ports 9000/9001)
- **VERIFIED:** 6 default buckets created (course-videos, course-pdfs, course-slides, course-images, quiz-media, user-avatars)
- **VERIFIED:** All storage operations working (upload, download, list, delete, presigned URL, exists)
- **CREATED:** `packages/common/src/common/storage.py` — MinIO client utility (get_minio_client, ensure_buckets, upload_file, download_file, delete_file, list_files, get_presigned_url, file_exists)
- **CREATED:** `scripts/init_buckets.py` — Bucket initialization script
- **CREATED:** `packages/common/tests/test_storage.py` — 8 storage tests (all passing)
- **UPDATED:** `packages/common/pyproject.toml` — added minio>=7.0 dependency
- **UPDATED:** `SPRINTS/SPRINT-1-infrastructure.md` — DT-1.1.4 marked DONE, progress 13/58 SP (22%)
- **FIXED:** presigned URL function needed timedelta instead of int for expires parameter

### Session 2026-03-31 — DT-1.1.3 PostgreSQL + pgvector Setup (COMPLETE)
- **VERIFIED:** Docker PostgreSQL container running (`pgvector/pgvector:pg16` image, pgvector 0.8.2)
- **VERIFIED:** `vector` and `uuid-ossp` extensions active in database
- **VERIFIED:** 24 tables created from init scripts (including agent_memories with vector(1536), content_chunks, skill_graph tables)
- **VERIFIED:** pgvector similarity search operations work correctly
- **VERIFIED:** SQLAlchemy + pg8000 connection to Docker PostgreSQL from host (port 5433)
- **UPDATED:** `docker-compose.yml` — postgres port remapped to 5433 (local PostgreSQL occupies 5432)
- **UPDATED:** `.env` — added DATABASE_URL_LOCAL for local development
- **UPDATED:** `packages/common/src/common/database.py` — default driver changed to pg8000 (Windows psycopg2 encoding compat)
- **UPDATED:** `packages/common/pyproject.toml` — added pg8000>=1.31 dependency
- **UPDATED:** `packages/common/tests/test_pg0_pgvector.py` — fixed agent memory vector test (1536-dim), updated Docker URI
- **VERIFIED:** 83/84 tests pass (1 skipped: pg0 unavailable on Windows)
- **UPDATED:** `SPRINTS/SPRINT-1-infrastructure.md` — DT-1.1.3 marked DONE, progress 11/58 SP (19%)
- **NOTE:** Local PostgreSQL installation on Windows occupies port 5432; Docker PostgreSQL mapped to 5433

### Session 2026-03-31 — DT-1.1.2 Shared Python Packages (COMPLETE)
- **CREATED:** `packages/common/` — Shared Python package with pyproject.toml, installable via `pip install -e packages/common[dev]`
- **CREATED:** `packages/common/src/common/enums.py` — 19 enums from SPEC-3 (UserRole, UserStatus, AuthProvider, CourseDifficulty, ContentType, LessonStatus, EnrollmentStatus, QuestionType, GoalStatus, NotificationType, AgentType, MemoryType, ContentSourceType, ContentSourceStatus, EvidenceType, SkillEdgeType, SkillGapStatus, LeaderboardType, TeamMemberRole, WorkflowStatus)
- **CREATED:** `packages/common/src/common/models.py` — 16 SQLAlchemy models (User, Course, Module, Lesson, Assessment, Question, Enrollment, UserProgress, XPTransaction, UserLevel, Team, TeamMembership, UserGoal, TeamGoal, Notification, Base)
- **CREATED:** `packages/common/src/common/schemas.py` — 8 Pydantic schemas (TokenPayload, TokenResponse, UserCreate, UserResponse, LoginRequest, AzureLoginRequest, HealthResponse, PaginationParams)
- **CREATED:** `packages/common/src/common/auth.py` — JWT utilities (create_access_token, create_refresh_token, decode_token) + bcrypt password hashing (hash_password, verify_password)
- **CREATED:** `packages/common/src/common/messaging.py` — RabbitMQClient with publish/consume/setup_infrastructure + 4 exchanges, 9 queues defined
- **CREATED:** `packages/common/src/common/database.py` — SQLAlchemy engine, SessionLocal, get_db FastAPI dependency
- **CREATED:** `packages/common/tests/` — 70 tests across 5 test files (test_enums, test_auth, test_schemas, test_models, test_messaging, test_database) — all passing
- **DECISION:** Used bcrypt directly instead of passlib due to passlib+bcrypt>=4.0 incompatibility on Python 3.11
- **DECISION:** Set requires-python>=3.11 in pyproject.toml (environment has 3.11.9; spec targets 3.12+)
- **UPDATED:** `SPRINTS/SPRINT-1-infrastructure.md` — DT-1.1.2 marked DONE, task matrix updated, progress 8/58 SP (10%), critical path updated
- **UNBLOCKED:** DT-1.2.2, DT-1.4.4, DT-1.4.5, DT-1.4.6 (all depend on shared packages)
- **VERIFIED:** `pip install -e packages/common[dev]` succeeds, all imports work, 70/70 tests pass, ruff lint clean

### Session 2026-03-31 — Sprint Restructuring (4 Improvements)
- **NEW:** Story Points (Fibonacci 1/2/3/5/8) added to every detailed task across all 5 sprints
- **NEW:** Frontend UI tasks added to every sprint — if backend feature built in Sprint N, UI also built in Sprint N
- **NEW:** Testing tasks added to every sprint — unit tests per sprint + integration tests at bounded context boundaries; Sprint 5 limited to E2E and demo reliability only
- **NEW:** AI UI scaffolds added in Sprint 2 (Chat Coach + Recommendations panel) and Sprint 3 (Skill Gap Dashboard) — static mocks wired to live APIs in Sprint 4
- **RENAMED:** SPRINT-3-notifications-rabbitmq.md → SPRINT-3-gamification-teams.md (filename now matches actual content)
- **UPDATED:** All 5 sprint files rewritten with sprint-level summary tables (total SP, estimated hours, velocity, capacity warnings)
- **IDENTIFIED:** All sprints exceed 40 SP sustainable velocity; each sprint file includes specific deferral recommendations
- **IDENTIFIED:** Total project is 322 SP across 5 weeks (64.4 SP/week required vs 40 SP/week sustainable) — 60% over capacity
- **RESULT:** Sprint structure is now transparent with per-task story points, incremental testing, UI-first delivery, and AI scaffold preparation; capacity gap documented with deferral options

### Session 2026-03-31 — Dual Authentication (Azure + Local Admin)
- **NEW:** Local email/password authentication for platform admin (alongside Azure Entra ID for enterprise users)
- **UPDATED:** SPEC-1 — Added FR-002b: Local Admin Authentication, updated FR-002 title
- **UPDATED:** SPEC-2 — Security Architecture rewritten with dual auth (Azure OIDC + Local bcrypt)
- **UPDATED:** SPEC-3 — Added authProvider field to User model (Enum: azure_entra, local), AuthProvider enum
- **UPDATED:** SPEC-4 — Split /auth/login into /auth/login/azure + /auth/login/local with request/response details
- **UPDATED:** SPEC-6 — Auth requirements updated for dual auth
- **UPDATED:** SPRINT-1 — Added DT-1.4.3 Local admin authentication task, renumbered tasks
- **UPDATED:** PLAN.md — Auth tool stack updated, BC-1 updated
- **RESULT:** Platform supports Azure Entra ID for enterprise users AND local email/password for admin — shared JWT format

### Session 2026-03-30 — Architecture Tool Replacements
- **REPLACED:** Supabase → MinIO (S3-compatible object storage for binary assets)
- **REPLACED:** OpenAgent/PicoClaw + Prefect → AGNO (agent orchestration, workflows, scheduling, monitoring)
- **REPLACED:** RAG pipeline (pgvector chunking/embedding) → Hindsight (vectorize-io/hindsight) for agent memory
- **NEW:** 7 AI Agents fully specified: Chat Coach, Solo Challenge, Recommendation, Gamification, Course Maker, Content Librarian, Skill Gap Analyzer
- **UPDATED:** AGENTS.md — Architecture diagram, tech stack, agents section, external dependencies
- **UPDATED:** All specs and sprints to reflect new tool stack
- **RESULT:** Consistent stack — PostgreSQL + pg0, MinIO, RabbitMQ, AGNO, Hindsight, GROQ

### Session 2026-03-30 — Full Plan Cleanup (Forbidden Tools Removal)
- **UPDATED:** SPEC-1 — Replaced Redis, Qdrant, Neo4j, Mem0 in FR-014–FR-019 implementation details
- **UPDATED:** SPEC-3 — Replaced Mem0/Qdrant in UserMemory (now Hindsight+pgvector), ContentChunk (now pgvector)
- **UPDATED:** SPEC-6 — Removed Redis references, updated Prisma→SQLAlchemy, Pino→Python logging
- **UPDATED:** AGENTS.md — Removed Redis from tech stack/diagram, updated sprint plan to match 5-sprint structure, OpenClaw→OpenAgent
- **VERIFIED:** All sprint files and SPEC-2, SPEC-4, SPEC-5 are clean of forbidden tool references
- **RESULT:** All files now consistently use approved stack (PostgreSQL, pg0+pgvector, RabbitMQ, Supabase)

### Session 2026-03-26 — Major Architecture Revision (Supervisor Feedback)
- **NEW:** DDD with 4 bounded contexts (was 10 microservices)
- **NEW:** FastAPI (Python) instead of Node.js/Express
- **NEW:** Azure Entra ID (no self-registration)
- **NEW:** RabbitMQ for all messaging (replaced Redis Streams)
- **NEW:** Prefect for workflow orchestration
- **NEW:** Hindsight for agent memory (pg0 + pgvector)
- **NEW:** OpenAgent/PicoClaw for agent runtime
- **NEW:** 5 sprints × 1 week (was 13 sprints × 1.5 weeks)

### Session 2026-03-24 — Plan Revision
- Revised from 8 sprints to 13 sprints
- Every sprint now has visible UI output
- Split AI agents into dedicated sprints

---

## External Dependencies

| Service | Purpose | Status |
|---------|---------|--------|
| Azure Entra ID | Enterprise SSO (OIDC) | Sprint 1 |
| PostgreSQL + pg0 | Database + memory | Sprint 1 |
| RabbitMQ | Message broker (all events) | Sprint 1 |
| MinIO | Object storage (videos, PDFs, slides, images) | Sprint 1 |
| Hindsight | Agent memory (retain, recall, reflect) | Sprint 4 |
| AGNO | Agent runtime, orchestration, workflows | Sprint 4 |
| GROQ | LLM API (with demo mode fallback) | Sprint 4 |

---

## Updated Sidebar Navigation (2026-04-10)

### Super Admin Panel (Revised)
```
├── Dashboard           /superadmin/dashboard
├── Companies         /superadmin/tenants
├── Admins & Identity /superadmin/identity     ← renamed (manage Tenant Admins only)
├── Audit Log        /superadmin/audit        ← NEW (platform-level audit trail)
├── Analytics        /superadmin/analytics
└── Platform Settings /superadmin/settings
```

### Tenant Admin Panel (NEW section)
```
[existing: Dashboard, Users, Courses, Teams, Goals, Gamification, Analytics]
├── Identity & Access /admin/identity         ← NEW (badge: pending user count)
│     Pending Users    /admin/identity/pending
│     Role Mapping    /admin/identity/role-mapping
│     Manual Override /admin/identity/override
│     Access Revocation /admin/identity/revocation
│     Audit Log      /admin/identity/audit
└── [existing: Settings]
```

**Note:** Super Admin Identity section manages Tenant Admin accounts ONLY — no access to individual user data (GDPR compliance).

---

## Settings Page — Platform Admin UI

### Overview
The Settings page provides comprehensive administrative controls for the SkillForge platform. It uses a horizontal tab navigation with role-based visibility.

### Tabs
| Tab | Icon | Visibility |
|-----|------|-----------|
| Profile | User | All users |
| Security | Shield | All users |
| Notifications | Bell | All users |
| Preferences | Settings | All users |
| Enterprise | Building2 | Admin + Manager |
| Platform Admin | Server | Admin only |

### Platform Admin Tab — 7 Collapsible Sections

#### 1. Platform Identity (Electric Violet #6C63FF)
- Platform Name, Company Name, Support Email, Default Language, Welcome Message
- Two-column grid layout, Save Changes button

#### 2. Authentication (Mint Green #00D4AA)
- Azure Entra ID (SSO): Tenant ID, Client ID, Redirect URI, Auto-provision toggle, Domain restriction toggle
- Local Authentication: Strong password toggle, Session timeout with duration input
- Save Authentication Settings button

#### 3. Admins & Roles (Gold #FFD700)
- Current Admins list with avatar cards (name, email, department, role badge, Edit button)
- Invite Admin button
- Role Permissions Matrix table (Super Admin, Dept Admin, Trainer columns)
  - Permissions: Manage all users, Manage dept users only, Create & edit courses, View analytics, Change platform settings

#### 4. Notifications (Red #FF6B6B)
- Sender Name, Sender Email fields
- 6 Email Trigger toggle cards: Welcome email, Course assigned, Deadline reminder, Course completion, Certificate issued, Inactivity alert
- Save Notification Settings button

#### 5. Event System / RabbitMQ (Electric Violet #6C63FF)
- Broker Connection input + Test Connection button
- Connection status display (Connected/Healthy badge)
- 6 Published Events cards: user.logged_in, user.created, course.assigned, course.completed, certificate.issued, user.deactivated

#### 6. Certificates (Gold #FFD700)
- Issuing Organisation Name, Signatory Name, Certificate Validity (months)
- 3 Toggle options: Auto-generate, Email PDF, Notify dept admin
- Save Certificate Settings button

#### 7. Danger Zone (Red #FF6B6B)
- Red-bordered container with destructive actions
- Deactivate All Employee Accounts (Lock icon)
- Reset All Course Progress (Activity icon)
- Purge Platform Data (Trash2 icon, thicker border)
- Warning notice about confirmation requirements

### Design System
- Background: `#0F1117`, Card: `#1A1D27`, Border: `#2A2D3E`
- Primary: `#6C63FF`, Secondary: `#00D4AA`, Destructive: `#FF6B6B`, Gold: `#FFD700`
- Font: Inter (primary), JetBrains Mono (code/technical)
- Border radius: `rounded-2xl` (cards), `rounded-xl` (inner), `rounded-lg` (inputs/buttons)
- Max width: 1200px, centered

### File Locations
- Main: `frontend/src/app/settings/page.tsx`
- Context: `frontend/src/app/context/AuthContext.tsx`
- UI Components: `frontend/src/app/components/ui/`
- Theme: `frontend/src/app/globals.css`

### State Management
- Each section has independent expand/collapse state (boolean)
- Form data stored as objects per section
- Role-based visibility via `user.role === "Admin"` check

---

## Notes

- Solo developer project
- **Multi-tenant** enterprise model (Tenant = Company: 3S, Advancia, Smart UP, Global Net)
- B2B enterprise model - no public self-registration
- Demo mode with fallback responses for AI when external APIs unavailable
- Local Docker backup for defense presentation
- Recorded demo video as final fallback
- All AI agents use GROQ with fallback to mock responses
- **bcrypt used directly** (not passlib) due to passlib+bcrypt>=4.0 incompatibility on Python 3.11
- **CORS Configuration:** Gateway uses wildcard origins with explicit OPTIONS handler for preflight requests. Middleware adds CORS headers to all responses for cross-origin API calls.
