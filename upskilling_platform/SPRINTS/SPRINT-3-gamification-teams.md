# Sprint 3: Gamification + Goals + Teams

> Update 2026-04-24: GT-3.3 Goals Tracking, GT-3.4 Skill Gap Analysis, DT-3.5.2 realtime notification consumption, DT-3.6.3 real-time leaderboard/profile refresh, DT-3.8.2 learning-gamification integration testing, and DT-3.8.3 realtime notification flow testing are now implemented and verified in code.

## Sprint Status

### Session 2026-04-23 — GT-3.2 Team Management Update

- **Completed:** Tenant-scoped Team Management hardening in `services/learning/routers/teams.py`
- **Completed:** Team activity feed endpoint `GET /teams/{id}/activity`
- **Completed:** Team Manager workspace page `frontend/src/app/team-manager/teams/page.tsx`
- **Completed:** Team Manager-only sidebar section linking to `/team-manager/teams`
- **Completed:** Cross-tenant protection for team access, membership changes, course assignment, and progress views
- **Verified:** Focused tests pass for team access rules and existing enrollment tenant checks

| Status | Count | Details |
|--------|-------|---------|
| **✅ DONE** | 6 | DT-3.1.1 (XP/Level), DT-3.1.2 (Badges), DT-3.1.3 (Streaks), DT-3.1.4 (Leaderboard API), DT-3.6.1 (Leaderboard page), DT-3.6.2 (Profile page - core) |
| **⏳ Pending** | 16 | All Team, Goals, Skill Gap, RabbitMQ events, Socket.io, Testing tasks |
| **⚠️ Partial** | 1 | DT-3.6.2 (gamification widgets pending backend) |

**Total: 23 tasks | Done: 6 | Pending: 16 | Partial: 1**

---

## General Tasks

### GT-3.1: Gamification System (XP, Levels, Badges, Streaks, Leaderboard)

**Spec Reference**: SPEC-4 API (Gamification endpoints)

#### Detailed Tasks:

**DT-3.1.1 — XP and Level system**
- **Status:** ✅ DONE
- **What**: Implement XP earning (configurable per action: lesson complete = 50 XP, quiz pass = 100 XP, etc.), level progression with exponential curve, XP history tracking, publish `xp.gained` and `level.up` events to RabbitMQ.
- **Files**: `services/learning/gamification/xp.py`, `services/learning/gamification/levels.py`
- **Spec Ref**: SPEC-4 (GET /gamification/xp, GET /gamification/level)
- **Verification**: XP awarded correctly on actions, level advances at threshold, RabbitMQ `xp.gained` event emitted
- **Effort**: ~3h
- **Story Points**: 5

**DT-3.1.2 — Badges and Achievements**
- **Status:** ✅ DONE
- **What**: Implement badge definitions (completion, streak, mastery, social, milestone, challenge) with tiers (bronze/silver/gold/platinum). Awarding logic checks conditions on each XP event. Publish `badge.earned` events.
- **Files**: `services/learning/gamification/badges.py`
- **Spec Ref**: SPEC-4 (GET /gamification/badges)
- **Verification**: Badges awarded correctly at milestones, events published
- **Effort**: ~2h
- **Story Points**: 3

**DT-3.1.3 — Streak tracking**
- **Status:** ✅ DONE
- **What**: Implement daily streak tracking (consecutive days of activity), streak milestones, publish `streak.update` events to RabbitMQ. Handle timezone-aware day boundaries.
- **Files**: `services/learning/gamification/streaks.py`
- **Spec Ref**: SPEC-4 (GET /gamification/streak)
- **Verification**: Streak increments on consecutive days, resets on gap, events published
- **Effort**: ~2h
- **Story Points**: 3

**DT-3.1.4 — Leaderboard API**
- **Status:** ✅ DONE
- **What**: Implement leaderboard rankings (global, team, weekly, monthly) using pg0 relational queries. Include pagination and current user rank lookup.
- **Files**: `services/learning/gamification/leaderboard.py`
- **Spec Ref**: SPEC-4 (GET /leaderboard, GET /leaderboard/me)
- **Verification**: Rankings calculated correctly, pagination works, user rank accurate
- **Effort**: ~2h
- **Story Points**: 3

---

### GT-3.2: Team Management

**Spec Reference**: SPEC-4 API (Team endpoints)

#### Detailed Tasks:

**DT-3.2.1 — Team CRUD API**
- **Status:** ✅ Done
- **What**: Implement team creation (Manager+), listing, update, delete. Include team stats (member count, total XP).
- **Files**: `services/learning/routers/teams.py`
- **Spec Ref**: SPEC-4 (GET/POST/PUT/DELETE /teams)
- **Verification**: Team operations work, stats computed correctly

**DT-3.2.2 — Team membership**
- **Status:** ✅ Done
- **What**: Implement add/remove team members, role assignment within team. Prevent duplicate memberships.
- **Files**: `services/learning/routers/teams.py`
- **Spec Ref**: SPEC-4 (POST/DELETE /teams/{id}/members)
- **Verification**: Add/remove members work, duplicates prevented

**DT-3.2.3 — Team activity feed**
- **Status:** ⏳ Pending
- **What**: Implement team activity feed aggregated from RabbitMQ events (enrollments, completions, badge awards).
- **Files**: `services/learning/teams/activity.py`
- **Spec Ref**: SPEC-4 (GET /teams/{id}/activity)
- **Verification**: Activity feed shows team member events chronologically

**DT-3.2.4 — Team course assignment**
- **Status:** ✅ Done
- **What**: Add `POST /teams/{team_id}/courses` endpoint to assign a course to all team members at once.
- **Files**: `services/learning/routers/teams.py`
- **Spec Ref**: SPEC-1 (FR-031b), SPEC-4 (/teams/{id}/courses)
- **Verification**: All team members enrolled, deadline/mandatory flags persisted

**DT-3.2.5 — Team progress tracking**
- **Status:** ✅ Done
- **What**: Add `GET /teams/{team_id}/progress` — all members with summary columns (courses assigned, completed, in progress).
- **Files**: `services/learning/routers/teams.py`
- **Spec Ref**: SPEC-1 (FR-031c), SPEC-4 (/teams/{id}/progress)
- **Verification**: Progress shows per-member breakdown
- **Verification**: Progress list shows correct data, detail view shows all enrolled courses with progress
- **Effort**: ~2h
- **Story Points**: 3

---

### GT-3.3: Goals Tracking

**Spec Reference**: SPEC-4 API (Goals endpoints)

#### Detailed Tasks:

**DT-3.3.1 — Personal goals API**
- **Status:** ⏳ Pending
- **What**: Implement user goal CRUD (title, description, deadline, XP reward, target count). Track progress toward goal completion. Auto-complete goals when target reached.
- **Files**: `services/learning/goals/router.py`
- **Spec Ref**: SPEC-4 (GET/POST/PUT/DELETE /goals)
- **Verification**: Goal CRUD works, progress tracks correctly, auto-completion triggers
- **Effort**: ~2h
- **Story Points**: 3

**DT-3.3.2 — Team goals API**
- **Status:** ⏳ Pending
- **What**: Implement team goal management (Manager+). Team goals aggregate member progress.
- **Files**: `services/learning/goals/team_goals.py`
- **Spec Ref**: SPEC-4 (GET/POST/PUT /goals/team)
- **Verification**: Team goals work, member progress aggregated
- **Effort**: ~1h
- **Story Points**: 2

---

### GT-3.4: Skill Gap Analysis (pg0 relational queries)

**Spec Reference**: SPEC-4 (FR-019)

#### Detailed Tasks:

**DT-3.4.1 — Skill graph in PostgreSQL**
- **Status:** ⏳ Pending
- **What**: Create skill graph tables (Skill, SkillEdge) in pg0, implement path-finding queries for skill dependencies. Skills organized in hierarchical taxonomy.
- **Files**: `packages/common/src/models/skills.py`, `services/learning/analytics/skill_gap.py`
- **Spec Ref**: SPEC-2, SPEC-3
- **Verification**: Skill graph queries return correct dependency paths
- **Effort**: ~3h
- **Story Points**: 5

**DT-3.4.2 — Gap computation**
- **Status:** ⏳ Pending
- **What**: Compute skill gaps based on user progress vs target skills for their role. Output ranked list of gaps with recommended courses.
- **Files**: `services/learning/analytics/gap_engine.py`
- **Spec Ref**: SPEC-4 (GET /skill-gap/gaps)
- **Verification**: Gaps computed correctly, recommendations relevant
- **Effort**: ~2h
- **Story Points**: 3

---

### GT-3.5: RabbitMQ Event Flow

**Spec Reference**: SPEC-2 (RabbitMQ)

#### Detailed Tasks:

**DT-3.5.1 — Gamification events publisher**
- **Status:** ⏳ Pending
- **What**: Publish events: `xp.gained`, `level.up`, `badge.earned`, `streak.update` to RabbitMQ learning.exchange on each gamification action.
- **Files**: `services/learning/events/gamification.py`
- **Spec Ref**: SPEC-2
- **Verification**: All 4 event types visible in RabbitMQ after corresponding actions
- **Effort**: ~2h
- **Story Points**: 3

**DT-3.5.2 — Socket.io consumer integration**
- **Status:** ⏳ Pending
- **What**: Notification service consumes RabbitMQ gamification events and pushes to Socket.io rooms keyed by user_id. Events: `xp:gained`, `level:up`, `badge:earned`, `streak:update`.
- **Files**: `services/notifications/consumer.py`, `services/notifications/websocket.py`
- **Spec Ref**: SPEC-2, SPEC-4 (WebSocket Events)
- **Verification**: Real-time UI updates when XP gained, badges earned (test with Socket.io client)
- **Effort**: ~2h
- **Story Points**: 3

---

### GT-3.6: Frontend UI — Gamification, Teams, Goals

**Spec Reference**: SPEC-5 (Leaderboard, Profile, Teams, Goals), UI-DESIGN-SYSTEM.md §7, §8.5–8.8

#### Detailed Tasks:

**DT-3.6.1 — Leaderboard page**
- **Status:** ✅ DONE
- **What**: Build `/leaderboard` page with tabs (Global, My Team, Weekly, Monthly), top-3 podium (gold/silver/bronze cards with crown/medal icons, LevelBadge, XP count), ranked table (rank, user, XP, courses, streak, change). Wire to `GET /leaderboard` and `GET /leaderboard/me`. Current user row highlighted with primary border. Follow `UI-DESIGN-SYSTEM.md` §8.5.
- **Files**: `frontend/src/app/leaderboard/page.tsx`, `frontend/src/app/components/leaderboard/Podium.tsx`, `frontend/src/app/components/leaderboard/LeaderboardTable.tsx`, `frontend/src/app/components/leaderboard/StatsSidebar.tsx`
- **Spec Ref**: SPEC-5 (Leaderboard), SPEC-4 (GET /leaderboard)
- **Verification**: Leaderboard renders with podium and table, tabs switch data, wired to API
- **Effort**: ~3h
- **Story Points**: 5

**DT-3.6.2 — Profile page with gamification widgets**
- **Status:** ⚠️ Partial (core done, gamification widgets pending backend)
- **What**: Build `/profile` page with hero section (large avatar, LevelBadge lg, XPProgressBar lg, stats row), achievements grid (AchievementBadge components, locked/unlocked states), skills panel (progress bars per skill). Wire to `GET /gamification/profile`, `GET /gamification/badges`. Follow `UI-DESIGN-SYSTEM.md` §7 and §8.6.
- **Files**: `frontend/src/app/profile/page.tsx` ✅ CREATED, `frontend/src/app/components/profile/ProfileHero.tsx`, `frontend/src/app/components/profile/AchievementsGrid.tsx`, `frontend/src/app/components/profile/SkillsPanel.tsx`
- **Spec Ref**: SPEC-5 (Profile), SPEC-4 (Gamification endpoints), SPEC-1 FR-004 ✅ DONE
- **Verification**: Profile renders with level badge, XP bar, achievements grid, skills panel
- **Effort**: ~3h
- **Story Points**: 5
- **Status**: Core profile page (FR-004: view/edit name, bio, skills, department) ✅ DONE. Gamification widgets (LevelBadge, XPProgressBar, achievements) pending gamification backend.

**DT-3.6.3 — Real-time Socket.io integration for gamification**
- **Status:** ⏳ Pending
- **What**: Connect Socket.io client to listen for `xp:gained`, `level:up`, `badge:earned`, `streak:update` events. Show animated toast notifications (XP pop-up with count-up, badge unlock celebration, streak update). Update leaderboard and profile in real-time without page refresh.
- **Files**: `frontend/src/app/lib/socket.ts`, `frontend/src/app/components/notifications/GamificationToast.tsx`, `frontend/src/app/hooks/useSocketEvents.ts`
- **Spec Ref**: SPEC-4 (WebSocket Events), UI-DESIGN-SYSTEM.md §7
- **Verification**: XP gain triggers animated toast, badge unlock shows celebration, leaderboard updates live
- **Effort**: ~2h
- **Story Points**: 3

**DT-3.6.5 — Goals page**
- **Status:** ⏳ Pending
- **What**: Build `/goals` page with personal goals list (card with icon, title, deadline, XP reward, progress bar, status badge), "New Goal" button with form modal, team goals section. Wire to `GET /goals`, `POST /goals`, `GET /goals/team`. Follow `UI-DESIGN-SYSTEM.md` §8.7.
- **Files**: `frontend/src/app/pages/goals/page.tsx`, `frontend/src/app/components/goals/GoalCard.tsx`, `frontend/src/app/components/goals/NewGoalModal.tsx`, `frontend/src/app/components/goals/TeamGoals.tsx`
- **Spec Ref**: SPEC-5 (Goals), SPEC-4 (Goals endpoints)
- **Verification**: Goals render with progress, create goal form works, team goals section visible
- **Effort**: ~2h
- **Story Points**: 3

**DT-3.6.4 — Teams page**
- **What**: Build `/teams` page with team grid (team cards: name, member count, total XP, avg streak), create team button (Manager+), team detail view with member list (avatar, LevelBadge, stats). Wire to `GET /teams`, `GET /teams/{id}`, `POST /teams`. Follow `UI-DESIGN-SYSTEM.md` §8.8.
- **Files**: `frontend/src/app/pages/teams/page.tsx`, `frontend/src/app/components/teams/TeamCard.tsx`, `frontend/src/app/components/teams/TeamDetail.tsx`, `frontend/src/app/components/teams/MemberCard.tsx`
- **Spec Ref**: SPEC-5 (Teams), SPEC-4 (Team endpoints)
- **Verification**: Teams render with stats, create team works, member list displays
- **Effort**: ~2h
- **Story Points**: 3

**DT-3.6.5 — Goals page**
- **What**: Build `/goals` page with personal goals list (card with icon, title, deadline, XP reward, progress bar, status badge), "New Goal" button with form modal, team goals section. Wire to `GET /goals`, `POST /goals`, `GET /goals/team`. Follow `UI-DESIGN-SYSTEM.md` §8.7.
- **Files**: `frontend/src/app/pages/goals/page.tsx`, `frontend/src/app/components/goals/GoalCard.tsx`, `frontend/src/app/components/goals/NewGoalModal.tsx`, `frontend/src/app/components/goals/TeamGoals.tsx`
- **Spec Ref**: SPEC-5 (Goals), SPEC-4 (Goals endpoints)
- **Verification**: Goals render with progress, create goal form works, team goals section visible
- **Effort**: ~2h
- **Story Points**: 3

---

### GT-3.7: AI UI Scaffold — Skill Gap Dashboard (activates in Sprint 4)

**Spec Reference**: SPEC-5 (Analytics), SPEC-1 (FR-019)

> Static/mock UI scaffold with hardcoded or empty states. Will be wired to real Skill Gap Analyzer agent in Sprint 4.

#### Detailed Tasks:

**DT-3.7.1 — Skill Gap Dashboard scaffold [AI UI Scaffold — activates in Sprint 4]**
- **Status:** ⏳ Pending
- **What**: Build static skill gap dashboard component: skill radar/bar chart with mock data, gap list with severity indicators (Critical/High/Medium/Low), "Recommended Actions" section with placeholder text. Empty state: "Your skill gap analysis will appear here once the AI agent processes your learning data." No API calls — static mock with hardcoded sample data.
- **Files**: `frontend/src/app/components/skillgap/SkillGapDashboard.tsx`, `frontend/src/app/components/skillgap/SkillRadarChart.tsx`, `frontend/src/app/components/skillgap/GapList.tsx`
- **Spec Ref**: SPEC-5 (Analytics Dashboard), SPEC-1 (FR-019)
- **Verification**: Dashboard renders with mock skill radar chart and gap list, empty state works
- **Effort**: ~2h
- **Story Points**: 3

---

### GT-3.8: Testing — Gamification & Teams

**Spec Reference**: SPEC-2, SPEC-4

#### Detailed Tasks:

**DT-3.8.1 — Gamification service unit tests**
- **Status:** ⏳ Pending
- **What**: Write pytest unit tests for: XP awarding logic (multipliers, anti-gaming), level progression thresholds, badge condition checking, streak tracking (consecutive days, reset on gap), leaderboard ranking calculation. Mock database and RabbitMQ.
- **Files**: `services/learning/tests/test_gamification.py`, `services/learning/tests/test_xp.py`, `services/learning/tests/test_badges.py`, `services/learning/tests/test_streaks.py`
- **Spec Ref**: SPEC-4 (Gamification endpoints)
- **Verification**: `pytest services/learning/tests/test_gamification* -v` passes, >80% coverage on gamification module
- **Effort**: ~3h
- **Story Points**: 5

**DT-3.8.2 — Learning + Gamification integration test**
- **Status:** ⏳ Pending
- **What**: Write integration test verifying the full event flow: (1) Complete lesson → `learning.lessons.completed` event, (2) Gamification service awards XP → `xp.gained` event, (3) XP triggers level check → `level.up` event if threshold crossed, (4) Badge conditions evaluated → `badge.earned` if applicable, (5) Leaderboard ranking updates. Test the chain end-to-end.
- **Files**: `tests/integration/test_learning_gamification.py`
- **Spec Ref**: SPEC-2 (BC-2 internal integration: Course → Gamification → Events)
- **Verification**: `pytest tests/integration/test_learning_gamification.py -v` passes — full event chain verified
- **Effort**: ~2h
- **Story Points**: 3

**DT-3.8.3 — Socket.io notification flow test**
- **Status:** ⏳ Pending
- **What**: Write integration test verifying: (1) Gamification event published to RabbitMQ, (2) Notification service consumer receives event, (3) Socket.io pushes event to correct user room, (4) Event payload matches expected format.
- **Files**: `tests/integration/test_socketio_gamification.py`
- **Spec Ref**: SPEC-2 (RabbitMQ → Socket.io pipeline)
- **Verification**: `pytest tests/integration/test_socketio_gamification.py -v` passes
- **Effort**: ~2h
- **Story Points**: 3

---

## Sprint 3 Summary

| Metric | Value |
|--------|-------|
| **Total Story Points** | 58 SP |
| **Done (Completed)** | 17 SP (DT-3.1.1-4, DT-3.6.1, DT-3.6.2 core) |
| **Pending (Deferred)** | 41 SP |
| **Estimated Hours Done** | ~16h |
| **Average Velocity Assumption** | 40 SP/solo dev/week |
| **Capacity Status** | ⚠️ OVERLOADED by 18 SP |

### Completed (17 SP)
- DT-3.1.1 — XP and Level system (5 SP) ✅
- DT-3.1.2 — Badges and Achievements (3 SP) ✅
- DT-3.1.3 — Streak tracking (3 SP) ✅
- DT-3.1.4 — Leaderboard API (3 SP) ✅
- DT-3.6.1 — Leaderboard page (5 SP) ✅
- DT-3.6.2 — Profile page core (2 SP) ⚠️

### Pending (41 SP)
- GT-3.2 Team Management (13 SP)
- GT-3.3 Goals Tracking (5 SP)
- GT-3.4 Skill Gap Analysis (8 SP)
- GT-3.5 RabbitMQ Event Flow (6 SP)
- DT-3.6.3 Socket.io integration (3 SP)
- DT-3.6.4 Teams page (3 SP)
- DT-3.6.5 Goals page (3 SP)
- DT-3.7.1 Skill Gap Dashboard (3 SP)
- GT-3.8 Testing (11 SP)

### Capacity Analysis
Sprint 3 is overloaded due to full gamification backend + teams + goals + 5 frontend pages + testing. **Recommended deferrals to reduce to ≤40 SP:**
- **Defer DT-3.6.4 (Teams page, 3 SP)** → Move to Sprint 5 (integration polish). Teams backend still works, UI just deferred. Saves 3 SP.
- **Defer DT-3.6.5 (Goals page, 3 SP)** → Move to Sprint 5 (integration polish). Same rationale. Saves 3 SP.
- **Defer DT-3.7.1 (Skill Gap Dashboard scaffold, 3 SP)** → Move to Sprint 4 alongside actual Skill Gap Analyzer agent implementation. Saves 3 SP.
- **Defer DT-3.4.1 (Skill graph in PostgreSQL, 5 SP)** → Move to Sprint 4 since it feeds directly into the Skill Gap Analyzer agent. Saves 5 SP.
- **Defer DT-3.8.3 (Socket.io notification flow test, 3 SP)** → Move to Sprint 5 alongside Notification Service completion. Saves 3 SP.

With all five deferrals: **58 - 17 = 41 SP.** Acceptable.

---

## Sprint 3 Checklist

- [ ] All detailed tasks completed and verified
- [ ] Gamification system operational (XP, levels, badges, streaks, leaderboard)
- [ ] Team management operational
- [ ] Goals tracking operational
- [ ] Skill gap analysis working (pg0 relational queries)
- [ ] RabbitMQ event flow: course completed → points awarded → Socket.io UI update
- [x] Leaderboard page renders with podium, table, tabs — wired to API
- [x] Profile page renders with view/edit (name, bio, skills, department) — FR-004 ✅ DONE. Gamification widgets pending gamification backend.
- [ ] Real-time Socket.io gamification toasts working (XP pop-ups, badge celebrations)
- [ ] Teams page renders with team grid and member list
- [ ] Goals page renders with personal and team goals
- [ ] Skill Gap Dashboard scaffold renders (static mock)
- [ ] Gamification service unit tests passing (>80% coverage)
- [ ] Learning + Gamification integration test passing (full event chain)
- [ ] Sprint demo: Leaderboard, XP gains, badge awards visible in real-time UI, Teams and Goals pages navigable

---

## Sprint 3 Multi-Tenant Extension

### GT-3.7: Multi-Tenant Gamification & Teams

**Spec Reference**: SPEC-1 (FR-001b), SPEC-3 (tenant_id on Team, UserGoal, TeamGoal)

#### Detailed Tasks:

**DT-3.7.1 — Tenant-scoped teams**
- **Status:** ⏳ Pending
- **What**: Add tenant_id to Team, TeamMembership, TeamGoal. Update all team endpoints to filter by tenant_id from JWT. Teams cannot cross tenant boundaries.
- **Files**: `packages/common/src/common/models.py`, `services/learning/teams/router.py`, `services/learning/teams/membership.py`
- **Spec Ref**: SPEC-3 (Team entity), SPEC-4 (Team endpoints)
- **Verification**: Teams scoped to tenant, cross-tenant team access blocked
- **Effort**: ~2h
- **Story Points**: 3

**DT-3.7.2 — Tenant-scoped goals**
- **Status:** ⏳ Pending
- **What**: Add tenant_id to UserGoal, TeamGoal. Update goals endpoints to filter by tenant. Team goals only visible within same tenant.
- **Files**: `packages/common/src/common/models.py`, `services/learning/routers/goals.py`
- **Spec Ref**: SPEC-3 (Goal entities)
- **Verification**: Goals scoped to tenant
- **Effort**: ~1h
- **Story Points**: 2

---

## Sprint 3 Checklist
