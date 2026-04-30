# Sprint 2: Learning & Engagement Microservice (Core)

## Context Required
> Load these files before starting any task in this sprint:
> - `PLAN.md` — project summary and architecture overview
> - `SPECS/SPEC-2-architecture.md` — BC-2 Learning & Engagement Service
> - `SPECS/SPEC-4-api.md` — API endpoints (MS2 section)
> - `SPECS/SPEC-3-data-model.md` — Data entities
> - `SPECS/SPEC-5-ui-ux.md` — Course Catalog, Course Detail, Learning Page
> - `UI-DESIGN-SYSTEM.md` — §8.2 Course Catalog, §8.3 Course Detail, §8.4 Learning Page

## Sprint Header
- **Sprint Goal:** Course and module management (CRUD), content ingestion pipeline (AGNO + MinIO + pg0), learning progress tracking, first RabbitMQ inter-service events, Course Catalog + Course Detail + Learning Player frontend pages
- **Duration:** Week 2 (1 week)
- **Spec Coverage:** SPEC-2 (BC-2), SPEC-3 (Data Model), SPEC-4 (API), SPEC-5 (Course pages)
- **Previous Sprint:** Sprint 1 ✅ completed
- **Carry-overs from previous sprint:** none

---

## General Tasks

### GT-2.1: Course Management

**Spec Reference**: SPEC-4 API (Course endpoints)

#### Detailed Tasks:

**DT-2.1.1 — Course CRUD API**
- **Status:** ✅ DONE
- **What**: Implement FastAPI endpoints for course listing (with filters), detail, create, update, delete. Include pagination and difficulty/category filtering.
- **Files**: `services/learning/routers/courses.py`, `services/learning/main.py`
- **Spec Ref**: SPEC-4 (GET/POST/PUT/DELETE /courses)
- **Verification**: All course endpoints return correct responses, filtering works
- **Effort**: ~3h
- **Story Points**: 5

**DT-2.1.2 — Module & Lesson API**
- **Status:** ✅ DONE
- **What**: Implement module and lesson CRUD endpoints. Lessons support types: video, text, quiz. Modules are ordered within courses, lessons ordered within modules.
- **Files**: `services/learning/routers/modules.py`, `services/learning/routers/lessons.py`
- **Spec Ref**: SPEC-4 (POST/PUT/DELETE /modules, /lessons)
- **Verification**: Module/lesson endpoints work, ordering preserved
- **Effort**: ~3h
- **Story Points**: 5

**DT-2.1.3 — Database models (PostgreSQL)**
- **Status:** ✅ DONE
- **What**: Create SQLAlchemy models for Course, Module, Lesson, Enrollment, Progress with relationships, indexes, and constraints per SPEC-3.
- **Files**: `packages/common/src/common/models.py`
- **Spec Ref**: SPEC-3
- **Verification**: Tables created via Alembic migration, relationships work
- **Effort**: ~2h
- **Story Points**: 3

**DT-2.1.4 — Course publish/unpublish toggle**
- **Status:** ✅ DONE
- **What**: Add `PATCH /courses/{course_id}/publish` endpoint to toggle is_published field. Validates course has at least 1 module + 1 lesson before allowing publish. Publishes `course.published` event to RabbitMQ on state change.
- **Files**: `services/learning/routers/courses.py`
- **Spec Ref**: SPEC-1 (FR-013b), SPEC-4 (/courses/{id}/publish)
- **Verification**: Toggle changes course visibility, validation prevents invalid publish, event published
- **Effort**: ~1h
- **Story Points**: 2

**DT-2.1.5 — Course assignment with deadline**
- **Status:** ✅ DONE
- **What**: Add course assignment endpoints with deadline and mandatory flags. POST /courses/{id}/assign creates assignment with optional deadline date and mandatory flag. PUT /assignments/{id} updates assignment. DELETE /assignments/{id} removes.
- **Files**: `services/learning/routers/assignments.py`, `services/learning/schemas/assignment.py`, `packages/common/src/common/models.py`
- **Spec Ref**: SPEC-1 (FR-013c, FR-013d), SPEC-4 (Course Assignment endpoints)
- **Verification**: Assignment created with deadline, mandatory flag persisted, removal works
- **Effort**: ~2h
- **Story Points**: 3

**DT-2.1.6 — Deadline enforcement logic**
- **Status:** ✅ DONE
- **What**: Implement background job to check deadlines and send overdue reminders. Consumes RabbitMQ events, publishes reminder notifications. Manager can extend deadline per user.
- **Files**: `services/learning/jobs/deadline_checker.py`
- **Spec Ref**: SPEC-1 (FR-013c)
- **Verification**: Overdue users receive notifications, deadline extension updates work
- **Effort**: ~2h
- **Story Points**: 3

**DT-2.1.7 — Bulk department-level course assignment**
- **Status:** ✅ DONE
- **What**: Add POST /courses/{course_id}/assign/department endpoint that accepts department_id, deadline (optional), is_mandatory (optional). Creates enrollment records for all active users in the department. Manager can only assign to their own department (dept_id from token). Skip already-enrolled users with warning. Publish department.course.assigned event to RabbitMQ. Returns assigned_count, skipped_count, errors array.
- **Files**: `services/learning/routers/assignments.py`
- **Spec Ref**: SPEC-1 (FR-013e), SPEC-4 (POST /courses/{id}/assign/department)
- **Verification**: Endpoint assigns course to all department users, skipped already-enrolled, event published
- **Effort**: ~2h
- **Story Points**: 3

**DT-2.1.8 — Quiz/Assessment CRUD**
- **Status:** ✅ DONE
- **What**: Implement quiz/assessment management endpoints: GET/POST /courses/{id}/assessments, GET/PUT/DELETE /assessments/{id}, GET/POST /assessments/{id}/questions, GET/PUT/DELETE /questions/{id}. Supports multiple choice and true/false question types. Includes passing score and time limit settings. LearningExpert+ only.
- **Files**: `services/learning/routers/assessments.py`, `services/learning/schemas/assessment.py`
- **Spec Ref**: SPEC-1 (FR-011b), SPEC-4 (Quiz/Assessment Endpoints)
- **Verification**: Assessment CRUD works, questions CRUD works, questions linked to assessment
- **Effort**: ~3h
- **Story Points**: 5

**DT-2.1.8b — Lesson video URL support** ⭐ NEW
- **Status:** ✅ DONE
- **What**: Added video_url field to Lesson model and updated all lesson APIs to support video content. Updated learning player to render actual video player when video_url is present.
- **Files**: `packages/common/src/common/models.py`, `services/learning/routers/lessons.py`, `services/learning/routers/courses.py`, `frontend/src/app/learn/[courseId]/[lessonId]/page.tsx`
- **Verification**: Video player renders when lesson has video_url, sample video test passes
- **Effort**: ~1h
- **Story Points**: 2

**DT-2.1.9 — Assessment taking and scoring**
- **Status:** ✅ DONE
- **What**: Implement POST /assessments/{id}/take for learners to submit answers and GET /assessments/{id}/attempts to view history. Auto-calculate score, determine pass/fail based on passingScore. Publish assessment.completed event to RabbitMQ with score data.
- **Files**: `services/learning/routers/assessments.py`, `services/learning/schemas/attempt.py`
- **Spec Ref**: SPEC-1 (FR-011), SPEC-4 (POST /assessments/{id}/take)
- **Verification**: Assessment submission calculates score correctly, pass/fail determined, attempts stored
- **Effort**: ~2h
- **Story Points**: 3

**DT-2.1.9b — Quiz submission endpoint**
- **Status:** ✅ DONE
- **What**: Add endpoints for quiz taking: GET /assessments/{id}/questions returns questions, POST /assessments/{id}/submit submits answers with auto-timer, GET /assessments/{id}/results/{attempt_id} shows detailed results. Supports timed assessments with auto-submit.
- **Files**: `services/learning/routers/assessments.py`
- **Spec Ref**: SPEC-1 (FR-011c), SPEC-4 (Quiz/Assessment Endpoints)
- **Verification**: Questions returned, timer works, auto-submit on expiry, results show correct/incorrect per question
- **Effort**: ~2h
- **Story Points**: 3

**DT-2.1.10 — Course preview mode**
- **Status:** ✅ DONE
- **What**: Implement course preview for authors: POST /courses/{id}/preview-token generates 24h token, GET /courses/{id}/preview?token={token} allows viewing course as enrolled student (bypasses enrollment), DELETE /courses/{id}/preview-token revokes token. Visual "Preview Mode" banner in preview view. Only course author can generate/revoke token.
- **Files**: `services/learning/routers/courses.py`, `services/learning/routers/preview.py`, `services/learning/schemas/preview.py`, `packages/common/src/common/models.py`
- **Spec Ref**: SPEC-1 (FR-011c), SPEC-4 (Course Preview Endpoints)
- **Verification**: Preview token generated, preview URL works without enrollment, banner displayed, token can be revoked
- **Effort**: ~2h
- **Story Points**: 3

**DT-2.1.11 — Course rating and review**
- **Status:** ✅ DONE
- **What**: Added course review endpoints: POST /courses/{id}/reviews accepts rating (1-5 stars) and text feedback, GET /courses/{id}/reviews returns paginated reviews with average rating, GET /courses/{id}/reviews/stats returns rating distribution, GET /courses/{id}/my-review returns user's own review. User can update own review. Average rating cached on course. Frontend: Reviews tab on course detail page with rating stats, star input, review list.
- **Files**: `services/learning/routers/reviews.py`, `services/learning/schemas/review.py`, `frontend/src/app/courses/[id]/page.tsx`
- **Spec Ref**: SPEC-1 (FR-013), SPEC-4 (Course Review Endpoints)
- **Verification**: Review submitted, rating visible on course card, average calculated, stats display works, frontend reviews tab functional
- **Effort**: ~2h
- **Story Points**: 3

**DT-2.1.12 — Course/lesson bookmarking**
- **Status:** ✅ DONE
- **What**: Added bookmark endpoints: GET /bookmarks/courses returns user's bookmarked courses, GET /bookmarks/lessons returns bookmarked lessons, POST /bookmarks accepts course_id or lesson_id, DELETE /bookmarks/{id} removes. Frontend: BookmarkButton component, course catalog cards with bookmark, course detail page with bookmark button, lesson player with bookmark, dedicated /bookmarks page with tabs, sidebar navigation.
- **Files**: `services/learning/routers/bookmark.py`, `services/learning/schemas/bookmark.py`, `frontend/src/app/components/ui/BookmarkButton.tsx`, `frontend/src/app/bookmarks/page.tsx`, `frontend/src/app/components/layout/Sidebar.tsx`, `frontend/src/app/lib/api.ts`
- **Spec Ref**: SPEC-1 (FR-013e), SPEC-4 (Bookmark Endpoints)
- **Verification**: Bookmark created, listed, removed, all frontend pages working with CORS properly configured
- **Effort**: ~2h
- **Story Points**: 2

**DT-2.1.13 — Secure certificate issuance and download**
- **Status:** ⏳ PENDING
- **Effort:** ~5h
- **Story Points:** 6
- **What**: Generate a tamper-proof certificate automatically when a learner completes a course. Each certificate must use a UUID `certificate_id`, persist the signed payload in PostgreSQL, and expose learner download/view actions without storing any private key material in code or responses.

  Implementation details:
  - A. Certificate Trigger: Auto-generate when `enrollment.status = completed`, and only after all lessons satisfy the completion rule.
  - B. Certificate Identity: Use UUID for `certificate_id` rather than a human-generated sequence number.
  - C. Canonical Payload: Build canonical JSON from DB-backed certificate fields such as learner snapshot, course snapshot, completion date, issued date, score/grade, and expiry.
  - D. RS256 Signing: Sign the payload using RSA + SHA-256 with `CERT_PRIVATE_KEY`; verify with `CERT_PUBLIC_KEY`.
  - E. Downloadable Artifact: Keep PDF/HTML certificate rendering, but embed the signed certificate metadata and verification QR.
  - F. **Lesson Completion Logic**: A lesson is considered completed when: (1) video/text progress is completed (`status = completed`), OR (2) lesson has an assessment AND the assessment is passed. Certificate is generated when ALL lessons meet completion criteria.

- **Files**: `packages/common/src/common/models.py`, `services/learning/schemas/certificate.py`, `services/learning/routers/certificates.py`, `services/learning/services/video_progress.py`, `services/learning/services/text_progress.py`, `services/learning/routers/assessments.py`, `frontend/src/app/certificates/page.tsx`, `frontend/src/app/lib/api.ts`, `frontend/src/app/lib/routes.ts`
- **Spec Ref**: SPEC-1 (FR-012, FR-012b, FR-012c), SPEC-2 (Certificate Security Addendum), SPEC-3 (Certificate Model Addendum), SPEC-4 (Certificate Endpoints)
- **Verification**: Completing a course creates one signed certificate row, learner can open/download it, and the stored payload matches the rendered certificate data

**DT-2.1.15 — Public certificate verification endpoint**
- **Status:** ⏳ PENDING
- **Effort:** ~4h
- **Story Points:** 4
- **What**: Expose a public `GET /verify/{certificate_id}` endpoint with no auth, validating UUID format before DB access, rebuilding the original payload from persisted DB fields, and verifying the RS256 signature before returning the result.

  Implementation details:
  - A. Validate `certificate_id` as UUID before querying to reduce abuse and unnecessary DB hits.
  - B. Query PostgreSQL with parameterized access only.
  - C. Return JSON states: `valid`, `invalid`, `revoked`, `expired`.
  - D. If valid, return learner-facing certificate details such as `full_name`, `course_name`, `completion_date`, `grade`, `score`, `issued_at`, `expires_at`.
  - E. If invalid, return safe failure messages only, never key data or signing internals.

- **Files**: `services/learning/routers/certificates.py`, `services/learning/schemas/certificate.py`, `packages/common/src/common/models.py`
- **Spec Ref**: SPEC-1 (FR-012b), SPEC-4 (`GET /verify/{certificate_id}`), SPEC-6 (Certificate Verification Security)
- **Verification**: Valid certificate returns `status=valid`, revoked returns `status=revoked`, unknown UUID returns `status=invalid`, expired certificates return `status=expired`

**DT-2.1.16 — Certificate revocation controls**
- **Status:** ⏳ PENDING
- **Effort:** ~2h
- **Story Points:** 2
- **What**: Add an authenticated admin-only revocation flow so compromised or withdrawn certificates can be marked as revoked without deleting the issuance record.

  Implementation details:
  - A. Add `PATCH /admin/certificates/{certificate_id}/revoke`.
  - B. Persist `status = revoked` and `revocation_reason`.
  - C. Preserve auditability by keeping the original signed payload and issuance history intact.

- **Files**: `services/learning/routers/certificates.py`, `services/learning/schemas/certificate.py`, `packages/common/src/common/models.py`
- **Spec Ref**: SPEC-1 (FR-012c), SPEC-4 (Revocation Endpoint), SPEC-3 (Certificate Status)
- **Verification**: Revoked certificate remains queryable in DB and public verification returns `status=revoked` with the stored reason

**DT-2.1.17 — Verification audit logging and anti-abuse protections**
- **Status:** ⏳ PENDING
- **Effort:** ~3h
- **Story Points:** 3
- **What**: Protect the public verification flow against abuse and create a fraud-monitoring trail for every verification attempt.

  Implementation details:
  - A. Rate-limit `GET /verify/{certificate_id}` to 30 requests per minute per IP.
  - B. Log every verification attempt with `certificate_id`, IP, timestamp, and result.
  - C. Add a dedicated verification audit table for later review and anomaly detection.
  - D. Ensure private keys are never logged or exposed.

- **Files**: `packages/common/src/common/models.py`, `services/learning/routers/certificates.py`, `services/learning/middleware/*`, `services/learning/schemas/certificate.py`
- **Spec Ref**: SPEC-3 (CertificateVerificationAudit), SPEC-6 (Certificate Verification Security)
- **Verification**: Excess verification traffic is throttled, and each attempt produces an auditable row with a verification result

**DT-2.1.18 — QR verification UX and public result page**
- **Status:** ⏳ PENDING
- **Effort:** ~3h
- **Story Points:** 3
- **What**: Embed a high-res QR code into each certificate and provide a human-readable verification page that clearly shows valid, invalid, revoked, or expired status.

  Implementation details:
  - A. QR must encode `https://{YOUR_DOMAIN}/verify/{certificate_id}`.
  - B. Use error correction level `H` and minimum rendered size `200x200px`.
  - C. Public verification page must display a clear visual result: `Valid`, `Invalid`, `Revoked`, or `Expired`.
  - D. Keep the machine-readable JSON response, but also render a user-friendly HTML verification page.

- **Files**: `frontend/src/app/certificates/page.tsx`, `frontend/src/app/verify/[certificate_id]/page.tsx`, `frontend/src/app/lib/api.ts`, `services/learning/routers/certificates.py`
- **Spec Ref**: SPEC-5 (Public Certificate Verification Page), SPEC-4 (`GET /verify/{certificate_id}`)
- **Verification**: Certificate preview/download contains the QR, scanning it opens the public verification page, and the page shows the same status as the JSON API

---

### GT-2.2: Content Ingestion Pipeline

**Spec Reference**: SPEC-2 (AGNO + MinIO + pg0)

#### Detailed Tasks:

**DT-2.2.1 — AGNO workflow for content ingestion**
- **Status:** ✅ DONE
- **What**: Create content ingestion workflow that processes uploaded content (PDF, text, video, images), stores binary assets in MinIO, indexes metadata
- **Files**: 
  - `services/learning/services/content/ingestion.py` - ContentIngestionService
  - `services/learning/routers/upload.py` - Upload API endpoints
  - `frontend/src/app/admin/content/page.tsx` - Content management UI
- **Spec Ref**: SPEC-2
- **Verification**: Files upload to MinIO, metadata stored, UI displays bucket stats and file list, delete functionality works
- **Effort**: ~3h
- **Story Points**: 5

**DT-2.2.2 — MinIO file upload integration**
- **Status:** ✅ DONE
- **What**: Implement file upload endpoints that store course media (videos, PDFs, slides, images) in MinIO and return S3-compatible URLs
- **Files**: `services/learning/storage/minio_client.py`
- **Spec Ref**: SPEC-2
- **Verification**: Files upload to MinIO, URLs accessible
- **Effort**: ~2h
- **Story Points**: 3

---

### GT-2.3: Enrollment & Progress

**Spec Reference**: SPEC-4 API (Enrollment/Progress endpoints)

#### Detailed Tasks:

**DT-2.3.1 — Enrollment API**
- **Status:** ✅ DONE
- **What**: Implement enrollment endpoints (enroll, list, get). Prevent duplicate enrollments. Publish `learning.enrollment.created` event to RabbitMQ on enrollment.
- **Files**: `services/learning/routers/enrollment.py`
- **Spec Ref**: SPEC-4 (POST/GET /enrollments)
- **Verification**: User can enroll in course, event published
- **Effort**: ~2h
- **Story Points**: 3

**DT-2.3.1b — Enrollment frontend fixes** ⭐ NEW
- **Status:** ✅ DONE
- **What**: Fixed frontend to use actual authenticated user ID instead of mock IDs. Updated Course Catalog, Course Detail, and Learning Player pages to use AuthContext for user identification.
- **Files**: `frontend/src/app/courses/page.tsx`, `frontend/src/app/courses/[id]/page.tsx`, `frontend/src/app/learn/[courseId]/[lessonId]/page.tsx`, `frontend/src/app/context/AuthContext.tsx`
- **Verification**: Enrollment works with real user, enrollment auto-redirects to learning page
- **Effort**: ~1h
- **Story Points**: 2

**DT-2.3.2 — Progress tracking API**
- **Status:** ✅ DONE
- **What**: Implement lesson progress and completion tracking. On completion, publish `learning.lessons.completed` event to RabbitMQ.
- **Files**: `services/learning/progress/router.py`
- **Spec Ref**: SPEC-4 (PUT /enrollments/{id}/progress, POST /progress/{lesson_id}/complete)
- **Verification**: Progress updates correctly, RabbitMQ event emitted on completion
- **Effort**: ~2h
- **Story Points**: 3

**DT-2.3.3 — Video and text progress heartbeat APIs**
- **Status:** ✅ DONE
- **Story Points:** 5
- **Effort:** ~3h
- **What**: Implement POST /progress/video/heartbeat and POST /progress/text/heartbeat endpoints. Implement segment merge algorithm for video. Implement active reading time tracking with Page Visibility API support. Implement integrity validation (speed cap, time impossibility check, gap logging). Update POST /progress/{lesson_id}/complete to enforce per-type validation rules and reject if requirements not met.
- **Files**:
  - `services/learning/routers/progress.py`
  - `services/learning/services/video_progress.py`
  - `services/learning/services/text_progress.py`
  - `services/learning/utils/reading_time.py`
- **Spec Ref**: SPEC-2 (Lesson Completion Enforcement), SPEC-4 (heartbeat endpoints)
- **Verification**: Video heartbeat accumulates segments correctly, watch_percent calculated without double-counting, speed > 2x rejected, text heartbeat only counts focused time, manual mark-complete returns 422 if requirements not met
- **Note**: Fixed race condition (duplicate key error) by adding SELECT FOR UPDATE locking with fallback

**DT-2.3.4 — Timezone-aware streak and XP calculation**
- **Status:** ⏳ Pending
- **What**: Refactor services/learning/gamification/streaks.py and services/learning/gamification/xp.py to replace all date.today() calls with datetime.now(pytz.timezone(user_timezone)).date(). Create a shared utility function get_user_local_date(user_timezone: str) -> date in services/learning/gamification/utils.py. All gamification functions that previously used date.today() must now accept and use user_timezone: str. Add pytz to services/learning/requirements.txt. Leaderboard weekly/monthly period boundaries must also use the user's local timezone for reset calculations.
- **Files**: services/learning/gamification/streaks.py, services/learning/gamification/xp.py, services/learning/gamification/leaderboard.py, services/learning/gamification/utils.py, services/learning/requirements.txt
- **Spec Ref**: SPEC-1 (FR-TZ-001)
- **Verification**: A user with timezone "Africa/Tunis" who completes a lesson at 23:30 local time (22:30 UTC) receives their streak credit for the correct local date. Unit test confirms this with a mocked datetime.
- **Effort**: ~2h
- **Story Points**: 3

---

### GT-2.4: RabbitMQ Inter-Service Events

**Spec Reference**: SPEC-2 (RabbitMQ)

#### Detailed Tasks:

**DT-2.4.1 — Lesson completion event**
- **Status:** ✅ DONE
- **What**: On lesson completion, publish `learning.lessons.completed` event with payload: `{ userId, courseId, lessonId, timestamp }` to learning.exchange
- **Files**: `services/learning/routers/progress.py`
- **Spec Ref**: SPEC-2
- **Verification**: Event visible in RabbitMQ queue after lesson completion
- **Effort**: ~1h
- **Story Points**: 2

**DT-2.4.2 — Enrollment event**
- **Status:** ✅ DONE
- **What**: On enrollment, publish `learning.enrollment.created` event to RabbitMQ
- **Files**: `services/learning/routers/enrollment.py`
- **Spec Ref**: SPEC-2
- **Verification**: Event visible in RabbitMQ queue after enrollment
- **Effort**: ~1h
- **Story Points**: 2

---

### GT-2.5: Frontend UI — Course Pages

**Spec Reference**: SPEC-5 (Course Catalog, Course Detail, Learning Page), UI-DESIGN-SYSTEM.md §8.2–8.4

#### Detailed Tasks:

**DT-2.5.1 — Course Catalog page scaffold**
- **Status:** ✅ DONE
- **What**: Build `/courses` page with filter sidebar (difficulty, duration, skills), course grid with CourseCard components (thumbnail, title, difficulty badge, duration, XP reward, enroll button), search bar, sort dropdown. Use shadcn/ui Card, Badge, Input, Select. Follow `UI-DESIGN-SYSTEM.md` §8.2 card anatomy.
- **Files**: `frontend/src/app/courses/page.tsx`, `frontend/src/app/components/ui/Card.tsx`
- **Spec Ref**: SPEC-5 (Course Catalog)
- **Verification**: Page renders with filter sidebar and course grid, loads real courses from API
- **Effort**: ~3h
- **Story Points**: 5

**DT-2.5.2 — Course Detail page with API integration**
- **Status:** ✅ DONE
- **What**: Build `/courses/[id]` page with hero section (thumbnail, title, rating), tabbed content (Overview, Curriculum, Reviews), sticky sidebar (duration, XP reward, Enroll/Continue button). Wire to `GET /courses/{id}` and `GET /courses/{id}/curriculum` via API Gateway.
- **Files**: `frontend/src/app/courses/[id]/page.tsx`
- **Spec Ref**: SPEC-5 (Course Detail), SPEC-4 (Course endpoints)
- **Verification**: Page loads course data from API, curriculum accordion expands, enrollment works with real user
- **Effort**: ~3h
- **Story Points**: 5

**DT-2.5.3 — Learning Player page**
- **Status:** ✅ DONE
- **What**: Build `/learn/[courseId]/[lessonId]` page with left lesson navigation sidebar (280px), main content area (video/text/quiz), progress bar header, bottom nav (Previous/Next/Mark Complete). Wire progress tracking to `PUT /enrollments/{id}/progress` and `POST /progress/{lessonId}/complete`.
- **Files**: `frontend/src/app/learn/[courseId]/[lessonId]/page.tsx`
- **Spec Ref**: SPEC-5 (Learning Page), SPEC-4 (Progress endpoints)
- **Verification**: Lesson renders, navigation works, Mark Complete button calls API, video player works when video_url present
- **Effort**: ~3h
- **Story Points**: 5

**DT-2.5.4 — Onboarding wizard UI**
- **Status:** ✅ DONE
- **What**: Build multi-step onboarding wizard at `/onboarding` triggered when user.onboarded = false. Steps: (1) Welcome — platform intro, expected journey length, (2) Profile Setup — confirm name, department, role, select skills of interest from taxonomy **+ TIMEZONE SELECTION (required)**, (3) Goal Setting — set learning goal with deadline, (4) First Course Recommendation — AI recommends first course based on role+skills+goals. Progress saved between steps. Completion marks onboarded=true, redirects to dashboard with "Start Learning" CTA. Show "Preview Mode" banner in preview.
- **Frontend Timezone Implementation:**
  - Add timezone selection to Step 2 (Profile Setup) of the onboarding wizard
  - Auto-detect browser timezone using `Intl.DateTimeFormat().resolvedOptions().timeZone`
  - Save selected timezone to backend via POST /onboarding/step/profile payload, NOT localStorage
  - The timezone value saved here populates user.timezone in the database
- **Files**: `frontend/src/app/pages/onboarding/page.tsx`, `frontend/src/app/components/onboarding/WelcomeStep.tsx`, `frontend/src/app/components/onboarding/ProfileStep.tsx`, `frontend/src/app/components/onboarding/GoalsStep.tsx`, `frontend/src/app/components/onboarding/RecommendationStep.tsx`, `frontend/src/app/lib/onboarding.ts`
- **Spec Ref**: SPEC-1 (FR-004b), SPEC-5 (Onboarding), SPEC-4 (Onboarding endpoints)
- **Verification**: All 4 steps render, data saves between steps, completion redirects to dashboard, auto-redirect works for new users
- **Effort**: ~3h
- **Story Points**: 5

**DT-2.5.5 — Video player heartbeat integration (frontend)**
- **Status:** ✅ DONE
- **Story Points:** 3
- **Effort:** ~2h
- **What**: Update Learning Player page to send heartbeat events to POST /progress/video/heartbeat every 10 seconds during video playback. Send final heartbeat on pause, seek, and video end events. Track played_segments client-side and include in each heartbeat payload. Integrate Page Visibility API to pause text reading timer when tab is not focused. Send text heartbeat every 10 seconds for text lessons. Show a progress indicator (e.g. "80% watched") on video lessons. Disable "Mark Complete" button for video lessons until server confirms completion_unlocked = true in heartbeat response.
- **Files**:
  - `frontend/src/app/learn/[courseId]/[lessonId]/page.tsx`
  - `frontend/src/lib/progressTracker.ts` (new file)
- **Spec Ref**: SPEC-5 (Learning Page), SPEC-4 (heartbeat endpoints)
- **Verification**: Heartbeats fire every 10s during playback, segment array grows correctly, mark-complete locked until threshold reached, tab switch pauses reading timer
- **Note**: Fixed race condition causing 500 errors when clicking Next button rapidly

---

### GT-2.6: AI UI Scaffold — Chat Coach, Recommendations, Skill Gap (activates in Sprint 4)

**Spec Reference**: SPEC-5 (AI components), UI-DESIGN-SYSTEM.md §8.1 (AI Coach section)

> These are static/mock UI scaffolds with hardcoded or empty states. They will be wired to real AI agent APIs in Sprint 4.

#### Detailed Tasks:

**DT-2.6.1 — Chat Coach interface scaffold [AI UI Scaffold — activates in Sprint 4]**
- **Status:** ✅ DONE
- **What**: Build static chat UI: message bubble layout (user/assistant), input area with send button, conversation list sidebar. Use hardcoded mock messages showing Bloom's Taxonomy-aware coaching style. Include typing indicator component (disabled). No API calls — static mock only.
- **Files**: `frontend/src/app/coach/page.tsx`, `frontend/src/app/components/coach/ChatMessages.tsx`, `frontend/src/app/components/coach/ChatInput.tsx`, `frontend/src/app/components/coach/ConversationList.tsx`
- **Spec Ref**: SPEC-5 (Chat Coach), SPEC-1 (FR-014)
- **Verification**: Chat UI renders with mock messages, input field accepts text, send button present but non-functional
- **Effort**: ~2h
- **Story Points**: 3

**DT-2.6.2 — Recommendations panel scaffold [AI UI Scaffold — activates in Sprint 4]**
- **Status:** ✅ DONE
- **What**: Build static recommendations panel component: 3 recommendation cards with mock data (thumbnail, title, relevance percentage badge, reason text). Empty state: "Your personalized recommendations will appear here." No API calls — static mock only.
- **Files**: `frontend/src/app/components/recommendations/RecommendationCard.tsx`, `frontend/src/app/components/recommendations/RecommendationsPanel.tsx`, `frontend/src/app/recommendations/page.tsx`
- **Spec Ref**: SPEC-5 (AI components), SPEC-1 (FR-015)
- **Verification**: Panel renders with 3 mock recommendation cards, empty state works
- **Effort**: ~1h
- **Story Points**: 2

---

### GT-2.7: Testing — Learning Platform

**Spec Reference**: SPEC-2, SPEC-3, SPEC-4

#### Detailed Tasks:

**DT-2.7.1 — Course service unit tests**
- **Status:** ⏳ Pending
- **What**: Write pytest unit tests for course CRUD operations, module/lesson ordering, enrollment validation (duplicate prevention), progress tracking logic. Mock database session.
- **Files**: `services/learning/tests/test_courses.py`, `services/learning/tests/test_enrollment.py`, `services/learning/tests/test_progress.py`
- **Spec Ref**: SPEC-4 (Course, Enrollment, Progress endpoints)
- **Verification**: `pytest services/learning/tests/ -v` passes, >80% coverage on course/enrollment modules
- **Effort**: ~3h
- **Story Points**: 5

**DT-2.7.2 — Identity + Learning integration test**
- **Status:** ⏳ Pending
- **What**: Write integration test verifying: (1) JWT from Identity service is accepted by Learning service, (2) RBAC roles restrict course creation to LearningExpert+, (3) Enrolled courses appear in user's enrollment list, (4) Lesson completion publishes RabbitMQ event.
- **Files**: `tests/integration/test_identity_learning.py`
- **Spec Ref**: SPEC-2 (BC-1 + BC-2 integration)
- **Verification**: `pytest tests/integration/test_identity_learning.py -v` passes
- **Effort**: ~2h
- **Story Points**: 3

**DT-2.7.3 — Content ingestion integration test**
- **Status:** ⏳ Pending
- **What**: Write integration test verifying: file upload → MinIO storage → metadata DB indexing pipeline works end-to-end. Test with sample PDF and image file.
- **Files**: `tests/integration/test_content_ingestion.py`
- **Spec Ref**: SPEC-2 (AGNO + MinIO + pg0 pipeline)
- **Verification**: `pytest tests/integration/test_content_ingestion.py -v` passes
- **Effort**: ~2h
- **Story Points**: 3

---

## Sprint 2 Summary

| Metric | Value |
|--------|-------|
| **Total Story Points** | 64 (53 + 11 from architecture decisions) |
| **Total Estimated Hours** | ~46h |
| **Average Velocity Assumption** | 40 SP/solo dev/week |
| **Capacity Status** | ✅ DONE - 54/64 SP completed (52 + 2 SP security fix) |

### Completed vs Pending Breakdown

**✅ COMPLETE (54 SP):**
- DT-2.1.1 — Course CRUD API (5 SP)
- DT-2.1.2 — Module & Lesson API (5 SP)
- DT-2.1.3 — Database models (3 SP)
- DT-2.1.4 — Course publish/unpublish toggle (2 SP)
- DT-2.1.5 — Course assignment with deadline (3 SP)
- DT-2.1.6 — Deadline enforcement logic (3 SP)
- DT-2.1.7 — Bulk department-level course assignment (3 SP)
- DT-2.1.8 — Quiz/Assessment CRUD (5 SP)
- DT-2.1.8b — Lesson video URL support (2 SP)
- DT-2.1.9 — Assessment taking and scoring (3 SP)
- DT-2.1.9b — Quiz submission endpoint (3 SP)
- DT-2.1.10 — Course preview mode (3 SP)
- DT-2.1.11 — Course rating and review (3 SP) ⭐ NEW
- DT-2.1.12 — Course/lesson bookmarking (2 SP) ⭐ NEW
- DT-2.1.14 — Quiz answer exposure security fix (2 SP) ⭐ SECURITY FIX
- DT-2.2.2 — MinIO file upload integration (3 SP)
- DT-2.3.1 — Enrollment API (3 SP)
- DT-2.3.1b — Enrollment frontend fixes (2 SP)
- DT-2.3.2 — Progress tracking API (3 SP)
- DT-2.4.1 — Lesson completion event (2 SP)
- DT-2.4.2 — Enrollment event (2 SP)
- DT-2.5.1 — Course Catalog page (5 SP)
- DT-2.5.2 — Course Detail page (5 SP)
- DT-2.5.3 — Learning Player page (5 SP)
- DT-2.5.4 — Onboarding wizard UI (5 SP)

**⏳ PENDING / REFINED CERTIFICATE WORK:**
- DT-2.1.13 — Secure certificate issuance and download (6 SP)
- DT-2.1.15 — Public certificate verification endpoint (4 SP)
- DT-2.1.16 — Certificate revocation controls (2 SP)
- DT-2.1.17 — Verification audit logging and anti-abuse protections (3 SP)
- DT-2.1.18 — QR verification UX and public result page (3 SP)
- DT-2.7.1 — Course service unit tests (5 SP)
- DT-2.7.2 — Identity + Learning integration test (3 SP)
- DT-2.7.3 — Content ingestion integration test (3 SP)

---

### DT-2.1.14 — Quiz answer exposure security fix ⭐ SECURITY FIX
- **Status:** ✅ DONE
- **What**: Replace QuestionResponse with QuestionPublicResponse (hides correct_answer) for all question-fetching endpoints. Add QuestionWithAnswerResponse for result/review endpoints only. Add integration test verifying GET /questions does not return correct_answer field.
- **Files**: `services/learning/schemas/assessment.py`, `services/learning/routers/assessments.py`
- **Spec Ref**: SPEC-6 (Security Requirements — no sensitive data exposed to client)
- **Verification**: GET /assessments/{id}/questions response does NOT contain correct_answer key. POST /submit response DOES contain correct_answer per question in the results payload.
- **Effort**: ~1.5h
- **Story Points**: 2

---

## Sprint 2 Checklist

**Core Features:**
- [x] Course management API complete (CRUD with filters)
- [x] Module and lesson CRUD working
- [x] Quiz/Assessment system implemented
- [x] Video URL support for lessons
- [x] Course publish/unpublish toggle
- [x] Course assignment with deadline
- [x] Bulk department-level assignment

**Enrollment & Progress:**
- [x] Enrollment API with real user integration
- [x] Progress tracking and completion
- [x] RabbitMQ events (lesson.completed, enrollment.created)
- [x] Video/text heartbeat APIs (DT-2.3.3)

**Frontend Pages:**
- [x] Course Catalog page renders with filters and course grid
- [x] Course Detail page loads from API with curriculum accordion
- [x] Learning Player page renders lesson content with navigation
- [x] Video player works when video_url is present
- [x] Video/text heartbeat integration (DT-2.5.5)
- [x] Preview mode for course authors

**Enhanced Features:**
- [x] Course rating and review system fully implemented with frontend UI
- [x] Course/lesson bookmarking fully implemented with frontend UI
- [x] MinIO file upload integration

**Pending for Future Sprints:**
- [ ] Secure certificate issuance, verification, revocation, and QR validation
- [ ] Course service unit tests
- [ ] Identity + Learning integration tests
- [ ] Content ingestion integration tests

---

## Sprint 2 Completion Update (2026-04-23)

- DT-2.3.4 completed: timezone-aware gamification now uses a shared local-date utility for streak evaluation and local period boundaries for weekly/monthly leaderboards.
- DT-2.7.1 completed: Learning service unit tests now exercise the real course, enrollment, progress, and gamification route logic with mocked database boundaries.
- DT-2.7.2 completed: Identity-to-Learning integration tests now verify JWT acceptance, LearningExpert+ course creation enforcement, enrollment listing, and lesson completion event publishing.
- DT-2.7.3 completed: content ingestion integration tests now verify authenticated PDF and image uploads through the upload route into the MinIO-backed ingestion flow with tenant-prefixed object paths.
- Additional Sprint 2 correctness fixes applied while closing the remaining work:
  - fixed an indentation error in `services/learning/routers/courses.py`
  - enforced LearningExpert+ permissions for course creation/publish and Admin-only deletion
  - fixed a missing `Depends` import in `services/learning/routers/upload.py`

**Verification completed:**
- `pytest services/learning/tests -q`
- `pytest tests/integration/test_identity_learning.py tests/integration/test_content_ingestion.py -q`

---

## Sprint 2 Multi-Tenant Extension

### GT-2.8: Multi-Tenant Learning Platform

**Spec Reference**: SPEC-1 (FR-001b), SPEC-3 (tenant_id on all entities), SPEC-4 (tenant-scoped endpoints)

#### Detailed Tasks:

**DT-2.8.1 — Add tenant_id to learning entities**
- **Status:** ✅ Done
- **What**: Add tenant_id UUID FK → Tenant to all tenant-scoped learning entities: Course, Module, Lesson, Enrollment, UserProgress, VideoProgress, TextProgress, Certificate, Assessment, Question, AssessmentAttempt. Update all learning service queries to filter by tenant_id from JWT.
- **Files**: `packages/common/src/common/models.py`, `services/learning/routers/courses.py`, `services/learning/routers/modules.py`, `services/learning/routers/lessons.py`, `services/learning/routers/enrollment.py`, `services/learning/routers/progress.py`, `services/learning/routers/assessments.py`, `services/learning/routers/certificates.py`
- **Spec Ref**: SPEC-3 (Data Model), SPEC-4 (API endpoints)
- **Verification**: All learning endpoints scoped to tenant, tenant_id in all queries
- **Effort**: ~3h
- **Story Points**: 5

**DT-2.8.2 — Tenant-scoped course catalog**
- **Status:** ✅ Done
- **What**: Update GET /courses endpoint to return only courses from user's tenant. Add tenant filter validation in Traefik or service. Tenant Admin can see all their tenant's courses.
- **Files**: `services/learning/routers/courses.py`
- **Spec Ref**: SPEC-1 (FR-001b), SPEC-4 (/courses)
- **Verification**: Course catalog shows only tenant's courses, cross-tenant access blocked
- **Effort**: ~2h
- **Story Points**: 3

**DT-2.8.3 — Tenant-scoped enrollment and progress**
- **Status:** ✅ Done
- **What**: Update enrollment and progress endpoints to validate user belongs to same tenant as resource. Reject cross-tenant enrollment attempts.
- **Files**: `services/learning/routers/enrollment.py`, `services/learning/routers/progress.py`
- **Spec Ref**: SPEC-1 (FR-001b)
- **Verification**: Enrollment/progress scoped to tenant, cross-tenant rejected
- **Effort**: ~2h
- **Story Points**: 3

**DT-2.8.4 — MinIO tenant-prefixed paths**
- **Status:** ✅ Done
- **What**: Update MinIO storage to use tenant-prefixed paths: /{tenantId}/courses/{courseId}/... for all course files. Add tenant_id validation to file upload endpoints.
- **Files**: `packages/common/src/common/storage.py`, `services/learning/routers/upload.py`, `services/learning/services/content/ingestion.py`
- **Spec Ref**: SPEC-2 (MinIO path structure)
- **Verification**: Files stored under tenant path, cross-tenant file access blocked
- **Effort**: ~2h
- **Story Points**: 3

**DT-2.8.5 — Tenant-scoped gamification**
- **Status:** ✅ Done
- **What**: Update XP, levels, badges, streaks, leaderboard endpoints to be tenant-scoped. Leaderboard "global" tab = global within tenant. Add tenant_id to XPTransaction, UserLevel, UserBadge, UserStreak, Leaderboard.
- **Files**: `services/learning/gamification/leaderboard.py`, `services/learning/routers/gamification.py`
- **Spec Ref**: SPEC-3, SPEC-4 (Gamification endpoints)
- **Verification**: Gamification scoped to tenant, leaderboard shows only tenant users
- **Effort**: ~2h
- **Story Points**: 3

---

## Sprint 2 Checklist

**Core Features:**
- [x] Course management API complete (CRUD with filters)
- [x] Module and lesson CRUD working
- [x] Quiz/Assessment system implemented
- [x] Video URL support for lessons
- [x] Course publish/unpublish toggle
- [x] Course assignment with deadline
- [x] Bulk department-level assignment

**Enrollment & Progress:**
- [x] Enrollment API with real user integration
- [x] Progress tracking and completion
- [x] RabbitMQ events (lesson.completed, enrollment.created)
- [x] Video/text heartbeat APIs (DT-2.3.3)

**Frontend Pages:**
- [x] Course Catalog page renders with filters and course grid
- [x] Course Detail page loads from API with curriculum accordion
- [x] Learning Player page renders lesson content with navigation
- [x] Video player works when video_url is present
- [x] Video/text heartbeat integration (DT-2.5.5)
- [x] Preview mode for course authors

**Enhanced Features:**
- [x] Course rating and review system fully implemented with frontend UI
- [x] Course/lesson bookmarking fully implemented with frontend UI
- [x] MinIO file upload integration

**Pending for Future Sprints:**
- [ ] Secure certificate issuance, verification, revocation, and QR validation
- [ ] Course service unit tests
- [ ] Identity + Learning integration tests
- [ ] Content ingestion integration tests
