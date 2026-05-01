# Enterprise AI-Driven Upskilling & Mentorship Platform — Master Plan

## Project Summary

- **Objective:** Build an enterprise B2B learning platform with AI-powered coaching (AGNO + Hindsight), personalized recommendations, and gamification
- **Tech Stack:** Next.js + React + TypeScript (Frontend), FastAPI + Python 3.12+ (4 Microservices), PostgreSQL + pg0, RabbitMQ, AGNO, Hindsight, MinIO
- **Architecture:** DDD with 4 bounded contexts (Identity & Access, Learning & Engagement, AI Agents, Notifications), Docker + Kubernetes, RabbitMQ for messaging, AGNO for agent orchestration
- **Constraints:** Solo developer, 5 sprints × 1 week = 5 weeks, multi-tenant enterprise B2B (Tenant = Company)
- **Out of Scope:** Self-registration, multi-language
- **Success Criteria:** Live demo with AI coaching (AGNO + Hindsight + 6 agents), recommendation engine, gamification (XP/badge/leaderboards), team management, RabbitMQ message bus, deployed on Docker/Azure
- **Total Sprints:** 5 sprints × 1 week = 5 weeks
- **Deadline:** June 2026 (University graduation defense)

---

## Approved Tool Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js, React, Socket.io (client) | UI + real-time updates |
| API Layer | FastAPI (Python 3.12+) | All microservices |
| Gateway | Traefik v3 (Docker) | Routing, CORS, rate limiting, path stripping |
| Microservices | 4 DDD bounded contexts | Business logic |
| Messaging | RabbitMQ (AMQP) | All inter-service events + real-time flow |
| Real-time | Socket.io server + RabbitMQ consumer | Live UI updates |
| Agent Orchestration | AGNO | Agent execution, workflows, tool calling, scheduling, monitoring |
| Memory | Hindsight (vectorize-io/hindsight) | Agent long-term memory and semantic course knowledge (Retain, Recall, Reflect) |
| Database | PostgreSQL + pg0 | Main source of truth: users, courses, lessons, quizzes, events, publishing state |
| File Storage | MinIO (S3-compatible) | Official course assets: videos, PDFs, slides, images, quiz media |
| Auth | Azure Entra ID (OIDC/OAuth2) for enterprise users + Local email/password for admin | Enterprise SSO + Admin access |
| Deployment | Docker, Kubernetes, GitHub Actions, Azure Cloud | CI/CD + hosting |

**Forbidden tools (never mention):** Redis, Qdrant, Neo4j, Mem0, Kafka, Redis Streams, Supabase, OpenAgent, PicoClaw, Prefect, LangChain, pgvector (replaced by Hindsight)

---

## Architecture Diagram (Text)

```
┌─────────────────────────────────────────────────────────────┐
│                      CLIENT (Next.js + Socket.io)           │
│  Dashboard | Courses | AI Coach | Leaderboard | Teams | Goals│
└────────────────────────────┬────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────┐
│                  Traefik v3 (Reverse Proxy)                 │
│  - Port 8000 → microservices                               │
│  - CORS + Rate limiting middlewares                       │
│  - Path stripping (/api/v1/{service})                   │
│  - Dashboard on port 8080 (dev mode)                   │
└────────────────────────────┬────────────────────────────────┘
                             │
      ┌───────────────┬───────┴───────┬───────────────┐
     ▼               ▼               ▼               ▼
┌─────────────┐  ┌───────────────┐  ┌─────────────┐  ┌─────────────┐
│   Identity   │  │   Learning    │  │  AI Agents  │  │ Notification│
│   & Access   │  │   & Engage    │  │   Service   │  │   Service   │
│   (FastAPI)  │  │   (FastAPI)   │  │  (FastAPI)  │  │  (FastAPI)  │
│   Port: 8001 │  │   Port: 8002  │  │  Port: 8003 │  │  Port: 8004 │
└──────┬──────┘  └──────┬────────┘  └──────┬──────┘  └──────┬──────┘
       │                │                  │                │
       └────────────────┼──────────────────┼────────────────┘
                        ▼
          ┌─────────────────────────────┐
          │    RabbitMQ (AMQP)          │
          │  auth.exchange              │
          │  learning.exchange          │
          │  agents.exchange            │
          │  notifications.exchange     │
          └──────────────┬──────────────┘
                         │
       ┌─────────────────┼─────────────────┐
       ▼                 ▼                 ▼
┌─────────────┐   ┌──────────────┐   ┌─────────────┐
│ PostgreSQL   │   │    MinIO     │   │  Hindsight  │
│ + pg0        │   │  (S3-compat  │   │  (retain,   │
│ (Main DB)    │   │  object      │   │  recall,    │
│              │   │  storage)    │   │  reflect)   │
└─────────────┘   └──────────────┘   └──────┬──────┘
                                            │
                          ┌─────────────────┘
                          ▼
           ┌─────────────────────────────┐
           │    AGNO (Agent Runtime)     │
           │  6 Agents: Chat Coach,     │
           │  Recommendation, Gamifi,   │
           │  Course Maker, Content Lib, │
           │  Skill Gap Analyzer         │
           └─────────────────────────────┘
```

---

## Bounded Contexts (DDD)

| BC | Service | Port | Domain Responsibilities |
|----|---------|------|------------------------|
| BC-0 | Tenant Management (Super Admin) | 8000 (via Traefik) | Tenant CRUD, Super Admin auth, cross-tenant analytics |
| BC-1 | Identity & Access | 8001 | **Two-Tier Identity Management:** (1) Super Admin level — manages Tenant Admin accounts only (tenantId=null), (2) Tenant Admin level — manages own company's users (tenantId in JWT); JWT validation, Azure Entra ID (per-tenant), local admin auth, RBAC |
| BC-2 | Learning & Engagement | 8002 | Courses, enrollment, progress, gamification, teams, goals, analytics |
| BC-3 | AI Agents | 8003 | 6 AI agents (Chat Coach, Recommendation, Gamification, Course Maker, Content Librarian, Skill Gap Analyzer), AGNO orchestration, Hindsight memory |
| BC-4 | Notifications | 8004 | Email, push, SMS, real-time (Socket.io + RabbitMQ) |

---

## Specs Index

| Spec | File | Description |
|------|------|-------------|
| SPEC-1 | [SPECS/SPEC-1-functional.md](SPECS/SPEC-1-functional.md) | Functional Requirements (Azure Entra ID, no self-registration) |
| SPEC-2 | [SPECS/SPEC-2-architecture.md](SPECS/SPEC-2-architecture.md) | Technical Architecture (4 DDD bounded contexts) |
| SPEC-3 | [SPECS/SPEC-3-data-model.md](SPECS/SPEC-3-data-model.md) | Data Model (PostgreSQL + pg0) |
| SPEC-4 | [SPECS/SPEC-4-api.md](SPECS/SPEC-4-api.md) | API Specification (FastAPI endpoints) |
| SPEC-5 | [SPECS/SPEC-5-ui-ux.md](SPECS/SPEC-5-ui-ux.md) | UI/UX Specification (pages, components) |
| SPEC-6 | [SPECS/SPEC-6-nonfunctional.md](SPECS/SPEC-6-nonfunctional.md) | Non-Functional Requirements |

---

## Sprint Status Tracker

| Sprint | Theme | Duration | File | Status | Visible Demo? |
|--------|-------|----------|------|--------|---------------|
| Sprint 1 | Project Setup + Identity & Access + Super Admin Features | 1 week | [SPRINTS/SPRINT-1-infrastructure.md](SPRINTS/SPRINT-1-infrastructure.md) | 🔄 Active (39 done + 54 SP pending) | ❌ Backend |
| Sprint 2 | Learning & Engagement (core) | 1 week | [SPRINTS/SPRINT-2-learning-platform.md](SPRINTS/SPRINT-2-learning-platform.md) | ✅ Done | ✅ Platform! |
| Sprint 3 | Gamification + Goals + Teams | 1 week | [SPRINTS/SPRINT-3-notifications-rabbitmq.md](SPRINTS/SPRINT-3-notifications-rabbitmq.md) | ⏳ Pending | ✅ Gamification! |
| Sprint 4 | AI Agents (AGNO + Hindsight + 6 Agents) | 1 week | [SPRINTS/SPRINT-4-ai-agents.md](SPRINTS/SPRINT-4-ai-agents.md) | ⏳ Pending | ✅ AI Coach! |
| Sprint 5 | Analytics + Notifications + Integration + Tests | 1 week | [SPRINTS/SPRINT-5-final-testing.md](SPRINTS/SPRINT-5-final-testing.md) | ⏳ Pending | 🎯 Defense! |

**Status legend:** ⏳ Pending | 🔄 Active | ✅ Done | 🚧 Blocked

**Sprint 1 New Tasks Added (2026-04-16):**
- GT-1.18: Super Admin Getting Started Checklist (10 SP) — system_config fields, checklist endpoints, UI component, middleware
- GT-1.19: Super Admin Dashboard Full Widget Layout (9 SP) — stats cards, tenant activity table, quick actions + alerts
- GT-1.20: Platform Settings Page Full Specification (13 SP) — settings endpoints, 5-tab UI
- GT-1.21: Tenant Detail Setup Progress Section (5 SP) — setup progress endpoint and UI
- GT-1.22: Post-Setup Redirect Logic (3 SP) — redirect_to response, success animation

**Sprint 1 New Tasks Added (2026-04-17):**
- GT-1.23: OrganizationGroup Configuration (3S Group) (8 SP) — Group entity above tenants, Step 3 in setup wizard
- GT-1.24: Company Domain Field (2 SP) — emailDomain for auto-detection on login
- GT-1.25: Admin Invitation Workflow (11 SP) — Invite new admins with welcome email
- GT-1.26: Test Azure Entra ID Connection (5 SP) — Verify Entra ID credentials
- GT-1.27: Admin Password Set / First-Login (9 SP) — One-time password token for new admins
- GT-1.28: Super Admin Audit Log (10 SP) — Platform-level audit trail
- GT-1.29: Seat Limit Enforcement (5 SP) — Prevent enrollment at limit
- GT-1.30: Company Suspension Notification (4 SP) — Email admin on company suspension

---

## Python Dependencies (by Service)

### Common / All Services
```
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
pydantic>=2.5.3
sqlalchemy>=2.0.25
psycopg2-binary>=2.9.9
python-jose[cryptography]>=3.3.0
python-multipart>=0.0.6
pika>=1.3.2
amqp>=5.2.0
httpx>=0.26.0
pytest>=8.0.0
pytest-asyncio>=0.23.3
python-dotenv>=1.0.0
socketio>=5.11.0
aiohttp>=3.9.0
```

### Identity & Access Service (MS1)
```
msal>=1.28.0
passlib>=1.7.4
bcrypt>=4.1.2
```

### Learning & Engagement Service (MS2)
```
alembic>=1.13.1
```

### AI Agents Service (MS3)
```
agno>=0.1.0
hindsight>=0.1.0
groq>=0.4.0
```

### Notification Service (MS4)
```
sse-starlette>=2.0.0
twilio>=9.0.0
aiosmtplib>=3.0.0
```

---

## External Dependencies

| Service | Purpose | Configuration Sprint |
|---------|---------|---------------------|
| Azure Entra ID | Enterprise authentication (OIDC) - per-tenant configuration | Sprint 1 |
| PostgreSQL + pg0 | Database + memory with RLS | Sprint 1 |
| RabbitMQ | Message broker (all events) | Sprint 1 |
| MinIO | Object storage (videos, PDFs, slides, images) - tenant-prefixed paths | Sprint 1 |
| Hindsight | Agent memory (retain, recall, reflect) | Sprint 4 |
| AGNO | Agent runtime, orchestration, workflows | Sprint 4 |
| GROQ | LLM API (with demo mode fallback) | Sprint 4 |

---

## Storage Responsibility Split

The platform uses a deliberate split between authoritative storage and AI memory:

- **PostgreSQL + MinIO = source of truth**
  - PostgreSQL stores official course structure, modules, lessons, quizzes, publishing states, and workflow metadata.
  - MinIO stores the official files and generated assets associated with those courses.
- **Hindsight = memory and semantic retrieval layer**
  - Hindsight stores searchable course knowledge, expert feedback history, generation decisions, summaries, and reusable insights for AI agents.
  - Hindsight is not the primary system of record for published courses.

### AI Course Generation Storage Flow

When a Learning Expert approves an AI-generated course:

1. The official course draft/final version is saved into PostgreSQL.
2. Course files and generated media are saved into MinIO.
3. A Hindsight memory bank is created or updated for that course.
4. The Hindsight bank stores summaries, learning objectives, quiz concepts, expert-approved edits, and generation/reflection notes.

This allows the platform to keep reliable operational data in PostgreSQL/MinIO while still enabling AI agents to recall and reason over course knowledge later.

---

## Data Model: Tenant

| Entity | Description |
|--------|-------------|
| Tenant | Company/organization (e.g., 3S, Advancia, Smart UP, Global Net) |

## Data Model: User Entity Fields (Extended for Entra ID Sync)

| Field Count | Description |
|-------------|-------------|
| 26 fields | Base User entity (before additions) |
| 10 new fields | Entra ID sync fields added: jobTitle, displayName, officeLocation, preferredLanguage, entraAccountEnabled, entraEmail, emailMismatch, entraGroups, managerEntraOid, lastEntraSync |
| 36 fields | Total User entity (after additions) |

---

## Risk Mitigation

| Risk | Mitigation |
|------|-------------|
| Azure Entra ID not available | Use mock OAuth server for demo |
| AI services fail during demo | Demo mode with fallback responses |
| RabbitMQ issues | Fallback to synchronous REST calls |
| Deployment issues | Local Docker backup; recorded demo video |

---

## Environment Variables

### Certificate & Security
| Variable | Description | Example |
|----------|-------------|---------|
| CERT_PRIVATE_KEY | RSA private key in PEM format used to sign certificate payloads with RS256. Must never be logged or returned by any API. | `-----BEGIN PRIVATE KEY----- ...` |
| CERT_PUBLIC_KEY | RSA public key in PEM format used by the public verification endpoint to validate certificate signatures. | `-----BEGIN PUBLIC KEY----- ...` |

**Key generation:**
```bash
openssl genrsa -out private.pem 4096
openssl rsa -in private.pem -pubout -out public.pem
```

**Secure certificate validity system (NEW):**
- Certificates are generated automatically when a learner completes a course
- Each certificate gets a UUID `certificate_id`
- A canonical certificate payload is signed with `RS256`
- Public verification URL:
  - `https://{YOUR_DOMAIN}/verify/{certificate_id}`
- Public verification endpoint:
  - `GET /verify/{certificate_id}`
- Admin revocation endpoint:
  - `PATCH /admin/certificates/{certificate_id}/revoke`
- Verification attempts are logged for fraud monitoring
- Public verification must be rate-limited to `30 requests/minute per IP`

### Video Completion Settings
| Variable | Description | Default |
|----------|-------------|---------|
| VIDEO_COMPLETION_THRESHOLD | Percentage of unique video segments required for completion credit | 0.80 (80%) |
| MAX_PLAYBACK_RATE | Maximum playback speed that counts toward completion | 2.0 |
| TEXT_SCROLL_THRESHOLD | Minimum scroll depth required for text lesson completion | 0.85 (85%) |

### Learning Service
| Variable | Description |
|----------|-------------|
| MINIO_ENDPOINT | MinIO server endpoint |
| MINIO_ACCESS_KEY | MinIO access key |
| MINIO_SECRET_KEY | MinIO secret key |
| MINIO_BUCKET_COURSES | Bucket for course content |
| MINIO_BUCKET_AVATARS | Bucket for user avatars |

---

> ⚠️ All detailed tasks, general tasks, and sprint checklists live in their respective sprint files under `SPRINTS/`.
> This file is a navigation index only — do not add task content here.
