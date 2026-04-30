# Sprint 5: Analytics + Notifications + Integration + Final Tests

## Context Required
> Load these files before starting any task in this sprint:
> - `PLAN.md` — project summary and architecture overview
> - `SPECS/SPEC-2-architecture.md` — All bounded contexts
> - `SPECS/SPEC-4-api.md` — All API endpoints
> - `SPECS/SPEC-5-ui-ux.md` — All pages
> - `UI-DESIGN-SYSTEM.md` — Full design system

## Sprint Header
- **Sprint Goal:** Analytics dashboards, Notification Service (Email, Socket.io), Dashboard page live, remaining AI agents, end-to-end testing (including setup wizard E2E), deployment to Docker, demo preparation with fallback scenarios — DEFENSE READY
- **Duration:** Week 5 (1 week)
- **Spec Coverage:** All specs — final integration (includes FR-000 Setup Wizard tests)
- **Previous Sprint:** Sprint 4 ✅ completed
- **Carry-overs from previous sprint:** CO-5.1 through CO-5.6 (see below)

---

## Carry-Over Tasks

**CO-5.1 — Gamification AGNO Agent (Agent 3) (carried from Sprint 4)**
- **Reason for carry-over**: Sprint 4 capacity exceeded; Chat Coach + Recommendation + Hindsight were prioritized
- **What**: Implement Gamification agent — generate daily challenges aligned with learner goals, track XP events via Hindsight retain, detect disengagement patterns via Hindsight reflect, adapt challenge difficulty. Expose GET /gamification/challenges, POST /gamification/challenges/{id}/complete, GET /gamification/daily.
- **Files**: `services/agents/agents/gamification.py`, `services/agents/gamification/router.py`
- **Spec Ref**: SPEC-1 (FR-018), SPEC-4 (Gamification Agent Endpoints)
- **Verification**: Agent generates challenges, stores XP events in Hindsight, daily challenge endpoint works
- **Effort**: ~3h
- **Story Points**: 5

**CO-5.2 — Course Maker AGNO Agent (Agent 4) (carried from Sprint 4)**
- **Reason for carry-over**: Sprint 4 capacity exceeded; core agents prioritized
- **What**: Implement Course Maker agent — generate course outlines, lessons, quizzes via GROQ LLM, store generated content in MinIO, support human-in-the-loop review workflow. Expose POST /course-maker/generate, GET /course-maker/status/{job_id}, POST /course-maker/review/{job_id}.
- **Files**: `services/agents/agents/course_maker.py`, `services/agents/coursemaker/router.py`
- **Spec Ref**: SPEC-1 (FR-016), SPEC-4 (Course Maker Agent Endpoints)
- **Verification**: Agent generates course from topic prompt, content stored in MinIO, review endpoint works
- **Effort**: ~3h
- **Story Points**: 5

**CO-5.3 — Content Librarian AGNO Agent (Agent 5) (carried from Sprint 4)**
- **Reason for carry-over**: Sprint 4 capacity exceeded; core agents prioritized
- **What**: Implement Content Librarian agent — semantic search via Hindsight recall(), auto-tagging, duplicate detection, content curation. Expose POST /librarian/search, POST /librarian/ingest, GET /librarian/sources.
- **Files**: `services/agents/agents/content_librarian.py`, `services/agents/librarian/router.py`
- **Spec Ref**: SPEC-1 (FR-017), SPEC-4 (Content Librarian Agent Endpoints)
- **Verification**: Agent performs semantic search, auto-tags content, detects duplicates
- **Effort**: ~3h
- **Story Points**: 5

**CO-5.4 — AGNO Inter-Agent Team Workflows (carried from Sprint 4)**
- **Reason for carry-over**: Sprint 4 capacity exceeded; individual agents prioritized over orchestration
- **What**: Configure AGNO team workflows: Chat Coach receives recommendations from Recommendation agent, Gamification reacts to skill gaps, Skill Gap feeds Recommendation with gap data. Wire RabbitMQ consumers/producers for agent events.
- **Files**: `services/agents/workflows/team.py`, `services/agents/events/rabbitmq_handlers.py`
- **Spec Ref**: SPEC-2 (Agent Orchestration)
- **Verification**: Agents communicate through structured AGNO team workflows, RabbitMQ events route correctly
- **Effort**: ~3h
- **Story Points**: 5

---

## General Tasks

### GT-5.1: Analytics Service

**Spec Reference**: SPEC-4 (Analytics endpoints)

#### Detailed Tasks:

**DT-5.1.1 — Analytics dashboards API**
- **What**: Implement user analytics endpoints (overview, weekly, monthly, skills) and admin analytics endpoints (course popularity, user activity). Aggregate data from gamification, enrollment, and progress tables.
- **Files**: `services/learning/analytics/router.py`, `services/learning/analytics/admin.py`
- **Spec Ref**: SPEC-4 (GET /analytics/overview, /weekly, /monthly, /skills, /team/{id}, /courses)
- **Verification**: Analytics endpoints return correct aggregated data
- **Effort**: ~3h
- **Story Points**: 5

**DT-5.1.2 — AGNO batch workflow for analytics**
- **What**: Create AGNO scheduled workflow for weekly analytics aggregation — computes weekly summaries, skill progress deltas, team rankings, and stores results for fast dashboard loading.
- **Files**: `services/agents/workflows/analytics.py`
- **Spec Ref**: SPEC-2
- **Verification**: Batch workflow runs on schedule, analytics tables updated
- **Effort**: ~2h
- **Story Points**: 3

**DT-5.1.3 — Per-department analytics**
- **Status:** ⏳ Pending
- **What**: Add `GET /analytics/department/{dept_id}` endpoint to get learning statistics broken down by department. Aggregates enrollment and progress by user department. Shows: enrolled count, completion rate %, avg score, avg time spent. Includes comparison to organization average.
- **Files**: `services/learning/routers/analytics.py`
- **Spec Ref**: SPEC-1 (FR-035c), SPEC-4 (/analytics/department/{id})
- **Verification**: Department filter returns correct aggregated data, comparison view works
- **Effort**: ~2h
- **Story Points**: 3

**DT-5.1.4 — Export analytics report**
- **Status:** ⏳ Pending
- **What**: Add `GET /analytics/export` endpoint to export analytics report as PDF or CSV. Supports date range filter (start_date, end_date). PDF: formatted with charts (via reportlab or similar), company header. CSV: raw data for further analysis.
- **Files**: `services/learning/routers/analytics.py`
- **Spec Ref**: SPEC-1 (FR-035b), SPEC-4 (/analytics/export)
- **Verification**: Export downloads correct file, PDF renders charts, CSV has correct data
- **Effort**: ~2h
- **Story Points**: 3

---

### GT-5.2: Notification Service

**Spec Reference**: SPEC-4 (Notification endpoints), SPEC-2 (Socket.io + RabbitMQ)

#### Detailed Tasks:

**DT-5.2.1 — Email notifications**
- **What**: Implement email notification dispatch via SMTP/aiosmtplib. Templates for: enrollment confirmation, badge earned, level up, weekly digest.
- **Files**: `services/notifications/email.py`, `services/notifications/templates/`
- **Spec Ref**: SPEC-4
- **Verification**: Email notifications sent successfully (test with Mailhog or similar)
- **Effort**: ~2h
- **Story Points**: 3

**DT-5.2.2 — Real-time Socket.io notifications**
- **What**: Complete Socket.io consumer that listens to all RabbitMQ notification events (xp:gained, level:up, badge:earned, streak:update, notification:new) and pushes to user rooms. Implement notification persistence (store in DB, mark as read).
- **Files**: `services/notifications/consumer.py`, `services/notifications/websocket.py`, `services/notifications/routers/notifications.py`
- **Spec Ref**: SPEC-2, SPEC-4 (GET /notifications, PUT /notifications/{id}/read, PUT /notifications/read-all)
- **Verification**: Real-time notifications arrive via Socket.io, notification CRUD works
- **Effort**: ~2h
- **Story Points**: 3

**DT-5.2.3 — Notification preferences and routing**
- **What**: Implement notification routing logic — determine channel (email, Socket.io, push) based on notification type and user preferences. Store notification in DB for notification center.
- **Files**: `services/notifications/router.py`, `services/notifications/preferences.py`
- **Spec Ref**: SPEC-4
- **Verification**: Notifications route to correct channels, preferences respected
- **Effort**: ~2h
- **Story Points**: 3

---

### GT-5.3: Frontend UI — Dashboard, Analytics, Integration Polish

**Spec Reference**: SPEC-5 (Dashboard, Analytics, Notifications), UI-DESIGN-SYSTEM.md

#### Detailed Tasks:

**DT-5.3.1 — Dashboard page**
- **What**: Build `/dashboard` page per `UI-DESIGN-SYSTEM.md` §8.1: welcome banner (user name, level), 4 stats cards (XP This Week with sparkline, Current Streak with fire icon, Courses Completed, Team Rank), Continue Learning section (in-progress courses with progress bars), Today's Challenge card (difficulty badge, XP reward, timer), Recommended by AI section (wired to `GET /recommendations`), Team Activity Feed (from `GET /teams/{id}/activity`).
- **Files**: `frontend/src/app/pages/dashboard/page.tsx`, `frontend/src/app/components/dashboard/WelcomeBanner.tsx`, `frontend/src/app/components/dashboard/StatsCards.tsx`, `frontend/src/app/components/dashboard/ContinueLearning.tsx`, `frontend/src/app/components/dashboard/TodaysChallenge.tsx`, `frontend/src/app/components/dashboard/RecommendedByAI.tsx`, `frontend/src/app/components/dashboard/TeamActivityFeed.tsx`
- **Spec Ref**: SPEC-5 (Dashboard), UI-DESIGN-SYSTEM.md §8.1
- **Verification**: Dashboard renders all sections, data loads from APIs, AI recommendations display
- **Effort**: ~3h
- **Story Points**: 5

**DT-5.3.2 — Analytics page**
- **What**: Build `/analytics` page with: header ("Your learning insights"), charts section (Weekly XP bar chart, Progress Over Time line chart), stats grid (Total Learning Time, Avg Session, Completion Rate, Quiz Average). Wire to `GET /analytics/overview`, `GET /analytics/weekly`. Use shadcn/ui Chart component.
- **Files**: `frontend/src/app/pages/analytics/page.tsx`, `frontend/src/app/components/analytics/XPChart.tsx`, `frontend/src/app/components/analytics/StatsGrid.tsx`
- **Spec Ref**: SPEC-5 (Analytics Dashboard), SPEC-4 (Analytics endpoints)
- **Verification**: Analytics page renders charts and stats from API data
- **Effort**: ~2h
- **Story Points**: 3

**DT-5.3.3 — Teams page**
- **What**: Build `/teams` page with team grid (team cards: name, member count, total XP, avg streak), create team button (Manager+), team detail view with member list (avatar, LevelBadge, stats). Wire to `GET /teams`, `GET /teams/{id}`, `POST /teams`. Follow `UI-DESIGN-SYSTEM.md` §8.8.
- **Files**: `frontend/src/app/pages/teams/page.tsx`, `frontend/src/app/components/teams/TeamCard.tsx`, `frontend/src/app/components/teams/TeamDetail.tsx`, `frontend/src/app/components/teams/MemberCard.tsx`
- **Spec Ref**: SPEC-5 (Teams), SPEC-4 (Team endpoints)
- **Verification**: Teams render with stats, create team works, member list displays
- **Effort**: ~2h
- **Story Points**: 3

**DT-5.3.4 — Goals page**
- **What**: Build `/goals` page with personal goals list (card with icon, title, deadline, XP reward, progress bar, status badge), "New Goal" button with form modal, team goals section. Wire to `GET /goals`, `POST /goals`, `GET /goals/team`. Follow `UI-DESIGN-SYSTEM.md` §8.7.
- **Files**: `frontend/src/app/pages/goals/page.tsx`, `frontend/src/app/components/goals/GoalCard.tsx`, `frontend/src/app/components/goals/NewGoalModal.tsx`, `frontend/src/app/components/goals/TeamGoals.tsx`
- **Spec Ref**: SPEC-5 (Goals), SPEC-4 (Goals endpoints)
- **Verification**: Goals render with progress, create goal form works, team goals section visible
- **Effort**: ~2h
- **Story Points**: 3

**DT-5.3.5 — Notification center component**
- **What**: Build notification bell icon in TopBar with unread count badge, dropdown panel showing recent notifications (grouped by date), mark-as-read functionality. Wire to `GET /notifications/unread`, `PUT /notifications/{id}/read`. Use Socket.io for real-time notification arrival (update count without refresh).
- **Files**: `frontend/src/app/components/layout/NotificationBell.tsx`, `frontend/src/app/components/notifications/NotificationDropdown.tsx`, `frontend/src/app/components/notifications/NotificationItem.tsx`
- **Spec Ref**: SPEC-5 (Notifications), SPEC-4 (Notification endpoints)
- **Verification**: Notification bell shows unread count, dropdown lists notifications, mark-as-read works, real-time updates arrive
- **Effort**: ~2h
- **Story Points**: 3

**DT-5.3.6 — Demo mode UI fallbacks**
- **What**: Implement demo mode across all pages: when API calls fail or external services (GROQ, Azure) are unavailable, show cached/mock data with a subtle "Demo Mode" indicator banner. Ensure every page degrades gracefully — no blank screens or error crashes during live demo.
- **Files**: `frontend/src/app/lib/demo-mode.ts`, `frontend/src/app/components/layout/DemoBanner.tsx`, update all page components with fallback data
- **Spec Ref**: All specs (risk mitigation)
- **Verification**: Disable backend services → all frontend pages still render with mock data, "Demo Mode" banner visible
- **Effort**: ~2h
- **Story Points**: 3

---

### GT-5.4: Testing — End-to-End Full-Stack Flows & Demo Reliability

**Spec Reference**: All specs

> Per improvement 3: Sprint 5 testing covers ONLY end-to-end full-stack flows and demo reliability testing. Unit tests and integration tests were completed incrementally in Sprints 1–4.

#### Detailed Tasks:

**DT-5.4.1 — Authentication E2E flow test**
- **What**: Write E2E test covering: (1) User hits login page, (2) Azure Entra ID login flow (mocked) → JWT issued, (3) Local admin login → JWT issued, (4) JWT used to access protected API Gateway routes, (5) Token refresh works, (6) Logout invalidates session. Test both auth paths.
- **Files**: `tests/e2e/test_auth_flow.py`
- **Spec Ref**: SPEC-1, SPEC-4 (Auth endpoints)
- **Verification**: `pytest tests/e2e/test_auth_flow.py -v` passes — both Azure and local auth paths verified
- **Effort**: ~2h
- **Story Points**: 3

**DT-5.4.2 — Course lifecycle E2E flow test**
- **What**: Write E2E test covering: (1) Admin creates course with modules and lessons, (2) User enrolls in course, (3) User completes lessons → progress tracked, (4) Lesson completion → XP awarded → level check → badge check → leaderboard update. Verify the full chain from course creation through gamification.
- **Files**: `tests/e2e/test_course_flow.py`
- **Spec Ref**: SPEC-1, SPEC-2, SPEC-4 (Course → Enrollment → Progress → Gamification)
- **Verification**: `pytest tests/e2e/test_course_flow.py -v` passes — full course lifecycle verified
- **Effort**: ~2h
- **Story Points**: 3

**DT-5.4.3 — AI Coach E2E flow test**
- **What**: Write E2E test covering: (1) User opens chat, (2) Sends message → Chat Coach agent recalls Hindsight memories, (3) Agent generates response with Bloom's Taxonomy structure, (4) Response streams via Socket.io, (5) Conversation retained in Hindsight, (6) Recommendations agent returns suggestions based on skill profile. Test with GROQ demo mode fallback.
- **Files**: `tests/e2e/test_ai_coach_flow.py`
- **Spec Ref**: SPEC-2, SPEC-4 (AI Coach + Recommendations)
- **Verification**: `pytest tests/e2e/test_ai_coach_flow.py -v` passes — AI coaching flow verified with fallback
- **Effort**: ~2h
- **Story Points**: 3

**DT-5.4.4 — Demo reliability stress test**
- **What**: Write E2E test simulating the exact demo script flow: (1) Login → (2) Dashboard loads → (3) Browse courses → (4) Enroll → (5) Complete lesson → (6) XP gain toast → (7) Check leaderboard → (8) Chat with AI coach → (9) View recommendations → (10) Check skill gaps → (11) View analytics. Assert no errors, all data renders, timing under 30s total. Run with all services in Docker Compose.
- **Files**: `tests/e2e/test_demo_reliability.py`
- **Spec Ref**: All specs
- **Verification**: `pytest tests/e2e/test_demo_reliability.py -v` passes — full demo flow under 30s, no errors
- **Effort**: ~2h
- **Story Points**: 3

**DT-5.4.5 — Hindsight memory persistence test**
- **What**: Write integration test verifying: (1) retain() stores memory with correct user_id and scope, (2) recall() returns relevant memories ranked by relevance, (3) reflect() generates meaningful summary, (4) per-agent memory banks prevent cross-contamination between Chat Coach and Recommendation memories.
- **Files**: `tests/integration/test_hindsight_memory.py`
- **Spec Ref**: SPEC-2 (Hindsight + pg0)
- **Verification**: `pytest tests/integration/test_hindsight_memory.py -v` passes
- **Effort**: ~1h
- **Story Points**: 2

**DT-5.4.6 ⭐ NEW — Setup wizard E2E test**
- **What**: Write E2E test covering: (1) Fresh database, system_config.setup_completed=false, (2) GET /api/setup/status returns setup_completed=false, (3) Middleware blocks non-setup routes, (4) Complete 5-step wizard, (5) Verify setup_completed=true in DB, (6) Verify /api/setup/* returns 410 Gone, (7) Verify /setup redirects to /superadmin/login. Test on fresh database with isolated test DB.
- **Files**: `tests/e2e/test_setup_wizard.py`
- **Spec Ref**: SPEC-1 (FR-000), SPEC-4 (Setup Endpoints)
- **Verification**: `pytest tests/e2e/test_setup_wizard.py -v` passes — full flow verified
- **Effort**: ~2h
- **Story Points**: 3

**DT-5.4.7 ⭐ NEW — Demo reset-setup script**
- **What**: Add `--reset-setup` option to demo seed script that resets system_config for demo purposes. Resets setup_completed=false, clears all SuperAdmin and Tenant records, allows re-running the setup wizard for repeated demos without DB recreation.
- **Files**: `scripts/seed_demo.py`
- **Spec Ref**: SPEC-1 (FR-000)
- **Verification**: `python scripts/seed_demo.py --reset-setup` → system_config.reset, wizard accessible again
- **Effort**: ~1h
- **Story Points**: 2

---

### GT-5.5: Deployment to Docker

**Spec Reference**: SPEC-2 (Deployment)

#### Detailed Tasks:

**DT-5.5.1 — Docker images and Compose finalization**
- **What**: Build production Docker images for all 4 services + Traefik. Finalize docker-compose.yml with all services, health checks, dependency ordering, environment variables. Ensure `docker-compose up` brings up the entire stack.
- **Files**: `services/*/Dockerfile` (finalize), `docker-compose.yml` (finalize), `traefik-dynamic.yml`
- **Spec Ref**: SPEC-2
- **Verification**: `docker-compose build && docker-compose up` — all services healthy, accessible on ports 8000-8004
- **Effort**: ~2h
- **Story Points**: 3

**DT-5.5.2 — Local deployment verification**
- **What**: Verify full stack runs locally: all 4 services + Traefik + PostgreSQL + RabbitMQ + MinIO + Next.js frontend. Create startup script that initializes everything. Document any manual steps required.
- **Files**: `scripts/start-dev.sh`, `README.md` (deployment section)
- **Spec Ref**: SPEC-2
- **Verification**: Fresh machine can run `docker-compose up && cd frontend && npm run dev` and access full platform
- **Effort**: ~1h
- **Story Points**: 2

**DT-5.5.3 ⭐ NEW — Certificate environment variables configuration**
- **What**: Configure required environment variables for certificate generation and verification in production. This includes:
  - `CERTIFICATE_SECRET_KEY`: Secret key for HMAC-SHA256 signature verification
  - `NEXT_PUBLIC_FRONTEND_URL`: Production frontend URL for QR code generation
- **Why**: QR codes on certificates must point to the correct verification URL
- **Files**: `.env`, `docker-compose.yml`
- **Spec Ref**: SPEC-1 (FR-014), SPEC-2
- **Verification**: 
  1. Set `CERTIFICATE_SECRET_KEY=your-production-secret-key` in production `.env`
  2. Set `NEXT_PUBLIC_FRONTEND_URL=https://your-domain.com` in production
  3. Generated certificates will show valid verification status when QR code is scanned
- **Effort**: ~30min
- **Story Points**: 1

---

### GT-5.6: Demo Preparation

**Spec Reference**: All specs

#### Detailed Tasks:

**DT-5.6.1 — Demo script**
- **What**: Create step-by-step demo script for defense presentation covering: Login (Azure mock) → Dashboard → Browse Courses → Enroll → Complete Lesson (XP toast) → Leaderboard → Chat with AI Coach → View Recommendations → Check Skill Gaps → Analytics Dashboard. Include talking points for each step highlighting technical innovation.
- **Files**: `docs/demo-script.md`
- **Spec Ref**: All
- **Verification**: Script covers all key features, timing fits 15-minute presentation slot
- **Effort**: ~1h
- **Story Points**: 2

**DT-5.6.2 — Fallback scenarios and seed data**
- **What**: Create seed data script that populates database with demo users, courses, enrollments, XP history, badges, team data, goals. Implement demo mode toggle in all services that returns cached responses when external APIs (GROQ, Azure) fail.
- **Files**: `scripts/seed-demo-data.py`, `services/*/demo_mode.py`
- **Spec Ref**: All (risk mitigation)
- **Verification**: Seed script populates DB, demo mode toggle works — all pages render with seed data even with external services down
- **Effort**: ~2h
- **Story Points**: 3

---

## Sprint 5 Summary

| Metric | Value |
|--------|-------|
| **Total Story Points** | 71 |
| **Total Estimated Hours** | ~50h |
| **Average Velocity Assumption** | 40 SP/solo dev/week |
| **Capacity Status** | 🔴 CRITICALLY OVERLOADED by 31 SP |

### Capacity Analysis
Sprint 5 is critically overloaded due to 20 SP of carry-overs from Sprint 4 + 44 SP of Sprint 5 original work (analytics, notifications, frontend pages, E2E tests, deployment, demo). **This confirms the 5-week timeline is aggressive for the full scope.**

**Recommended descoping to reach ≤40 SP (defense-priority ranked):**

| Action | SP Saved | Impact |
|--------|----------|--------|
| **Defer CO-5.3 (Content Librarian Agent)** | 5 SP | Low — content search works via basic DB queries; semantic search is an enhancement |
| **Defer CO-5.4 (Inter-agent team workflows)** | 5 SP | Low — individual agents work independently; orchestration is a polish layer |
| **Defer CO-5.2 (Course Maker Agent)** | 5 SP | Medium — course generation is impressive but courses can be created manually |
| **Defer DT-5.1.2 (AGNO batch analytics)** | 3 SP | Low — analytics work with on-demand queries; batch workflow is optimization |
| **Defer DT-5.2.3 (Notification preferences)** | 3 SP | Low — basic notification dispatch works without preference routing |
| **Defer DT-5.3.4 (Goals page)** | 3 SP | Low — goals API works; page can be shown via API docs |
| **Defer DT-5.4.5 (Hindsight persistence test)** | 2 SP | Low — covered by demo reliability test |

**With 7 deferrals: 71 - 26 = 45 SP** (marginally over, acceptable for final sprint)

**Further deferrals if needed:**
| Action | SP Saved |
|--------|----------|
| Defer DT-5.3.2 (Analytics page) | 3 SP |
| Defer DT-5.3.3 (Teams page) | 3 SP |

**With 9 deferrals: 71 - 32 = 39 SP** ✅

### Final Carry-Overs (Explicitly Deferred — Not Carried Forward)
These items are scoped out of the project and will NOT be built:
- ❌ Content Librarian Agent (Agent 5) — semantic search enhancement
- ❌ Inter-agent team workflows — orchestration layer
- ❌ AGNO batch analytics workflow — optimization
- ❌ Notification preferences — polish feature

**All other items marked as defer above should be attempted if time permits, but are not blocking for the defense.**

---

## Sprint 5 Checklist

- [ ] All critical detailed tasks completed and verified
- [ ] Analytics dashboards operational (overview, weekly, monthly, skills)
- [ ] Notification Service working (Email, Socket.io real-time)
- [ ] Dashboard page renders with all sections (stats, courses, challenges, AI recommendations, activity feed)
- [ ] Analytics page renders charts and stats
- [ ] Teams page renders with team grid and member management
- [ ] Goals page renders with personal and team goals
- [ ] Notification center component working (bell icon, dropdown, real-time updates)
- [ ] Demo mode UI fallbacks working (all pages render with mock data when APIs down)
- [ ] All E2E tests passing (auth flow, course lifecycle, AI coach flow, demo reliability)
- [ ] All remaining AI agents implemented (Gamification, Course Maker)
- [ ] Skill Gap Dashboard wired to live API
- [ ] Docker images build, docker-compose up runs full stack
- [ ] Seed data script populates demo database
- [ ] Demo script written with talking points
- [ ] 🎯 **DEFENSE READY**

---

## Pre-Defense Verification Checklist

Before the defense presentation, verify:
- [ ] All 4 services accessible on their ports (8001-8004)
- [ ] API Gateway routing works
- [ ] RabbitMQ message bus operational
- [ ] pg0 available for Hindsight memory
- [ ] MinIO object storage accessible
- [ ] Azure Entra ID (or mock) login works for enterprise users
- [ ] Local admin login works (email/password)
- [ ] Courses can be created, enrolled, completed
- [ ] XP, levels, badges awarded correctly
- [ ] Leaderboard displays correctly with real-time updates
- [ ] Teams can be created and managed
- [ ] Goals can be created and tracked
- [ ] Analytics data displays correctly
- [ ] AI Coach chat responds with AGNO agent + Hindsight context
- [ ] Recommendations displayed via Recommendation agent
- [ ] Skill gaps analyzed and displayed
- [ ] Notifications appear in real-time via Socket.io
- [ ] Demo mode fallback works (disable GROQ → still runs)
- [ ] Full demo script runs under 15 minutes with no errors

---

## Sprint 5 Multi-Tenant Extension

### GT-5.5: Multi-Tenant Final Integration

**Spec Reference**: SPEC-1 (FR-001b), SPEC-2, SPEC-6 (Non-Functional Requirements)

#### Detailed Tasks:

**DT-5.5.1 — Super Admin analytics dashboard**
- **Status:** ⏳ Pending
- **What**: Build /superadmin/analytics page with cross-tenant aggregated stats: total users across all tenants, average completion rate, most popular courses per tenant, skill gap heatmap. Anonymized - no individual user data exposed across tenants.
- **Files**: `frontend/src/app/superadmin/analytics/page.tsx`
- **Spec Ref**: SPEC-5 (Super Admin Analytics), SPEC-1 (FR-002e)
- **Verification**: Analytics show aggregate data, no cross-tenant individual data leakage
- **Effort**: ~3h
- **Story Points**: 5

**DT-5.5.2 — Multi-tenant E2E tests**
- **Status:** ⏳ Pending
- **What**: Write E2E tests verifying tenant isolation: (1) User from Tenant A cannot access Tenant B's courses, (2) Tenant Admin can only manage their tenant's users/courses, (3) Super Admin can view all tenants but not individual user data, (4) Leaderboard shows only tenant users.
- **Files**: `tests/e2e/test_tenant_isolation.py`
- **Spec Ref**: SPEC-1 (FR-001b), SPEC-6
- **Verification**: All tenant isolation scenarios pass
- **Effort**: ~2h
- **Story Points**: 3

**DT-5.5.3 — Tenant isolation regression tests**
- **Status:** ⏳ Pending
- **What**: Write regression tests for RLS policies, SQLAlchemy tenant middleware, API Gateway tenant validation. Ensure no code changes broke tenant isolation.
- **Files**: `tests/regression/test_tenant_isolation.py`
- **Spec Ref**: SPEC-2 (RLS strategy)
- **Verification**: All isolation tests pass
- **Effort**: ~2h
- **Story Points**: 3

**DT-5.5.4 — Final demo with 2 tenants**
- **Status:** ⏳ Pending
- **What**: Prepare final demo script that demonstrates multi-tenant isolation: Login as 3S user → see 3S courses → Login as Advancia user → see different courses → Super Admin view shows both. Demo must show data isolation is working.
- **Files**: `scripts/demo_multi_tenant.sh`
- **Spec Ref**: SPEC-6 (Demo mode)
- **Verification**: Demo shows 2 tenants with isolated data
- **Effort**: ~1h
- **Story Points**: 2

---

## Overall Project Story Point Summary

| Sprint | Theme | Total SP | Total Hours | Status |
|--------|-------|----------|-------------|--------|
| Sprint 1 | Project Setup + Identity & Access | 58 | ~41h | ⚠️ Overloaded (+18 SP) |
| Sprint 2 | Learning & Engagement (Core) | 53 | ~38h | ⚠️ Overloaded (+13 SP) |
| Sprint 3 | Gamification + Goals + Teams | 58 | ~41h | ⚠️ Overloaded (+18 SP) |
| Sprint 4 | AI Agents (AGNO + Hindsight + 6 Agents) | 82 | ~56h | 🔴 Critical (+42 SP) |
| Sprint 5 | Analytics + Notifications + Integration + Final | 71 | ~50h | 🔴 Critical (+31 SP) |
| **Total** | | **322** | **~226h** | |

### Velocity Assessment
- **Assumed velocity**: 40 SP/week (solo developer, ~40h/week)
- **Actual total**: 322 SP across 5 weeks = 64.4 SP/week required
- **Gap**: 60% over capacity

### Root Cause
The original 5-sprint plan attempted to fit a project that realistically requires 8-10 sprints into 5 sprints. The four improvements (story points, UI per sprint, testing per sprint, AI UI scaffolds) exposed this capacity gap by making the true scope visible.

### Recommendations
1. **If timeline is flexible**: Extend to 8 sprints (8 weeks). Sprints 1-3 stay as-is, Sprint 4 splits into "Core Agents" (Chat Coach + Recommendation + Hindsight) and "Extended Agents" (Gamification + Course Maker + Content Librarian + Workflows), Sprint 5 splits into "Analytics + Notifications" and "Integration + Demo Prep".
2. **If timeline is fixed (5 weeks)**: Accept the deferrals listed in each sprint's capacity analysis. Focus demo on: Auth, Courses, Gamification (XP/badges/leaderboard), Chat Coach AI, Recommendations, and Analytics. Defer: Content Librarian agent, inter-agent workflows, batch analytics, notification preferences, some frontend pages.
3. **Hybrid approach**: Keep 5 sprints but reduce scope at the spec level — mark FR-017 (Content Librarian) and inter-agent workflows as "stretch goals" and do not include them in the defense demo script.
