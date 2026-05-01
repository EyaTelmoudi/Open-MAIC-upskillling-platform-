# SPEC-2: Technical Architecture

## Project: Enterprise AI-Driven Upskilling & Mentorship Platform

This document describes the technical architecture based on Domain-Driven Design (DDD) with 4 bounded contexts.

---

## 0. Platform Bootstrap Layer

### First-Run Setup Detection

On fresh deployment (empty database), the platform runs in "bootstrap mode":

1. **system_config Table:** Single-row table with `setup_completed = false`, `superadmin_onboarded = false`, `superadmin_checklist = {}` initially
2. **API Gateway Middleware:** Checks `system_config.setup_completed` on every request
   - If `false`: Block ALL routes except `/setup/*` and `/api/setup/*` → redirect to `/setup`
   - If `true`: Normal operation
3. **Next.js Middleware:** Three-state access logic:
   - State 1: `setup_completed = false` → Force all traffic to `/setup`
   - State 2: `setup_completed = true` AND `user.onboarded = false` → Force to `/onboarding`
   - State 3: Normal operation
   - State 3b (Super Admin): `setup_completed = true` AND `superadmin_onboarded = false` → Allow access to `/superadmin/dashboard` but show Getting Started checklist

### Getting Started Checklist Data Model

The Super Admin First-Login checklist is stored in `system_config`:

```python
# system_config JSONB fields:
superadmin_checklist: {
    "platform_configured": True,       # auto-checked after setup wizard
    "first_tenant_created": True,      # auto-checked after setup wizard  
    "tenant_admins_assigned": False,   # checked: all tenants have admin
    "entra_id_configured": False,       # checked: all tenants have entraIdConfig
    "seat_limits_set": False,           # checked: all tenants have seat_limit
    "first_users_invited": False        # checked: all tenants have >= 1 user
}
superadmin_onboarded: bool              # true when all checklist items complete
```

**Auto-Check Logic:**
- Step 1: Always `true` when `setup_completed = true`
- Step 2: Always `true` when first tenant exists with `status = 'active'`
- Step 3-6: Query each condition on dashboard load, update checklist state

### Setup Key Protection
- `SETUP_SECRET_KEY` env variable required (fail-fast if missing)
- All `/api/setup/*` endpoints (except `/status`) require `X-Setup-Key` header
- After setup complete, endpoints return HTTP 410 Gone permanently

### Three-State Middleware Flow
```
Request → Check setup_completed
├── FALSE → Redirect /setup (Super Admin wizard)
├── TRUE → Check user.onboarded (or superadmin_onboarded for Super Admin)
│   ├── FALSE (enterprise user) → Redirect /onboarding (enterprise user wizard)
│   ├── FALSE (Super Admin first login) → Redirect /superadmin/dashboard with Getting Started checklist
│   └── TRUE → Check user.status
│       ├── pending → Redirect /onboarding
│       └── active → Normal operation
```

**Super Admin First-Login Logic:**
- On first Super Admin login, check `system_config.superadmin_onboarded`
- If `false`: display Getting Started checklist on `/superadmin/dashboard`
- Checklist tracks: platform configured, first tenant created, tenant admin assigned, Entra ID configured, seat limits set, first users invited
- Once all steps complete, set `superadmin_onboarded = true` to dismiss checklist

### Post-Setup Redirect Flow

**Backend Flow (POST /api/setup/complete):**
1. Mark `setup_completed = true` in system_config
2. Create initial checklist state: `{ step1_done: true, step2_done: true, ... }`
3. Publish `platform.setup.completed` event to RabbitMQ
4. Return `{ success: true, redirect_to: "/superadmin/login" }`

**Frontend Flow:**
1. Show 3-second success animation: "Platform is live! 🎉"
2. Auto-redirect to `/superadmin/login`
3. After login, if `superadmin_onboarded = false`, show Getting Started checklist with highlight animation

---

## 1. System Overview

### Multi-Tenancy Architecture

**Tenant = Company** (e.g., 3S, Advancia, Smart UP, Global Net)

The platform serves multiple subsidiary companies from a single deployed instance with strict data isolation between companies.

#### Multi-Tenancy Strategy: Shared Database, Row-Level Isolation

- **Single PostgreSQL instance** with Row-Level Security (RLS) policies
- **Every tenant-scoped table** gets a `tenant_id UUID NOT NULL FK → Tenant` column
- **PostgreSQL RLS policies** enforce isolation at DB level
- **SQLAlchemy session middleware** injects `tenant_id` into all queries automatically
- **No data can leak** across tenants even if application logic has a bug

#### JWT Token Changes

- Tokens now carry: `userId, email, role, tenantId, authProvider`
- Super Admin tokens have `tenantId = null` (operate across all tenants)
- API Gateway validates tenantId on every request and rejects cross-tenant access

#### Auth Resolution

- **Enterprise users:** Azure Entra ID config resolved per-tenant (each company has its own Entra ID app registration stored in Tenant.entraIdConfig)
- **Login URL:** includes tenant slug: `/auth/login/azure?tenant={slug}` OR resolved by email domain
- **Super Admin:** local email/password auth, separate from tenant admin flow

#### MinIO Path Structure

All files stored under `/{tenantId}/courses/...` path prefix for isolation.

#### Architecture Pattern
**Microservices Architecture** with 4 bounded contexts (DDD), each containerized with Docker and deploy Docker containers ON Kubernetes.

### Component Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER                                  │
│  ┌────────────────────────────────────┐  ┌─────────────────────────────┐ │
│  │   Next.js Frontend (Multi-tenant) │  │   Super Admin Portal       │ │
│  │   - Dashboard, Courses, AI Coach  │  │   /superadmin/*            │ │
│  │   - Tenant context in sidebar      │  │   - Tenant CRUD           │ │
│  └──────────────┬─────────────────────┘  │   - Cross-tenant analytics │ │
│                 │                        └──────────────┬──────────────┘ │
│                 ▼                                     │                  │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              Traefik v3 (API Gateway + Reverse Proxy)          │    │
│  │  - Docker provider with labels                                  │    │
│  │  - CORS + Rate limiting middlewares                            │    │
│  │  - Path stripping (/api/v1/{service})                          │    │
│  │  - Prometheus metrics                                          │    │
│  │  - Dashboard on port 8080 (dev mode)                          │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
           ┌──────────────────────────┼──────────────────────────┐
           │        Traefik routes based on labels                │
           ▼                          ▼                          ▼
┌─────────────────┐    ┌─────────────────────────┐    ┌─────────────────┐
│   Identity &    │    │   Learning & Engagement │    │  AI Agents      │
│   Access Svc    │    │   Service               │    │  Service        │
│   (FastAPI)     │    │   (FastAPI)            │    │  (FastAPI)       │
│   Port: 8001    │    │   Port: 8002           │    │  Port: 8003      │
│   /api/v1/      │    │   /api/v1/             │    │   /api/v1/       │
└────────┬────────┘    └───────────┬─────────────┘    └────────┬────────┘
         │                          │                          │
         └──────────────────────────┼──────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                     MESSAGE BROKER (RabbitMQ - AMQP)                   │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐    │
│  │ auth.queue  │  │ learning.q  │  │  agents.q   │  │ notif.queue │    │
│  │ (tenantId)  │  │ (tenantId)  │  │             │  │ (tenantId)  │    │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
         ┌──────────────────────────┼──────────────────────────┐
         ▼                          ▼                          ▼
┌─────────────────┐    ┌─────────────────────────┐    ┌─────────────────┐
│ Notification    │    │   PostgreSQL + RLS      │    │    MinIO        │
│ Service         │    │   (RLS tenant isolation)│    │  (tenant-prefix│
│ (FastAPI)       │    │                         │    │   paths)        │
│ Port: 8004      │    │   Tenant table          │    │                 │
└─────────────────┘    └───────────┬─────────────┘    └─────────────────┘
                                   │
                                   ▼
                         ┌──────────────────┐
                         │    Hindsight     │
                         │  (retain, recall │
                         │   reflect)       │
                         └────────┬─────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │     AGNO         │
                         │  6 AI Agents     │
                         │  (Runtime +      │
                         │  Orchestration)  │
                         └──────────────────┘
```

---

## 2. Bounded Contexts (DDD)

### BC-1: Identity & Access Service (MS1)
**Port:** 8001

**Domain Responsibilities:**
- JWT token validation and refresh
- Azure Entra ID integration (OIDC/OAuth2)
- User profiles and employee management
- Role-based access control (RBAC)
- Session management

**Two-Tier Identity Management:**

1. **Super Admin Level (Platform-Wide):**
   - Manages Tenant Admin accounts only (FR-002g, FR-002h)
   - tenantId = null in JWT
   - ENDPOINTS: `/superadmin/identity/*`, `/superadmin/admins/*`
   - CanNOT access individual user records within any tenant (GDPR)

2. **Tenant Admin Level (Company-Scoped):**
   - Manages their own company's users only (FR-006d)
   - tenantId in JWT must match resource's tenant_id
   - ENDPOINTS: `/identity/pending-users`, `/identity/role-mapping-rules`, `/identity/users/*`
   - Double enforcement: API validation + RLS at DB layer

**Aggregates:**
- User (employee profile)
- Role
- Permission
- Session

##### BC-1.2: DirectorySearchService (Graph API Field Selection)

**Graph API user search $select parameter:**
```
GET https://graph.microsoft.com/v1.0/users
  ?$search="displayName:{query}" OR "mail:{query}"
  &$select=id,displayName,givenName,surname,mail,userPrincipalName,
           department,jobTitle,officeLocation,preferredLanguage,
           accountEnabled
  &$top=20
  &ConsistencyLevel=eventual
```

**DirectoryUserResult schema includes:**
- id → entraOid (primary lookup key)
- displayName → displayName
- givenName → firstName
- surname → lastName
- mail / userPrincipalName → entraEmail
- department → department
- jobTitle → jobTitle
- officeLocation → officeLocation
- preferredLanguage → preferredLanguage
- accountEnabled → entraAccountEnabled

---

### BC-1.1: UserSyncService (Complete Field Mapping)

**Azure Entra ID → Platform Field Mapping:**
| Entra ID Claim/Field | Platform User Field |
|---------------------|------------------|
| oid (object ID, immutable) | entraOid |
| tid (tenant ID) | resolved to tenantId via Tenant.entraIdConfig |
| mail OR userPrincipalName | entraEmail |
| email (platform primary, admin-confirmed on change) | email |
| given_name | firstName |
| family_name | lastName |
| displayName | displayName |
| department | department |
| jobTitle | jobTitle |
| officeLocation | officeLocation |
| preferredLanguage | preferredLanguage |
| accountEnabled | entraAccountEnabled |
| memberOf (groups, via /users/{oid}/memberOf) | entraGroups (JSONB cached) |
| manager.id (via /users/{oid}/manager) | managerEntraOid |

**Complete 9-Step Sync Logic (on every Entra ID login):**

**Step 1 — Extract claims:** From validated Entra ID JWT: oid, tid, mail/userPrincipalName, given_name, family_name, displayName, department, jobTitle, preferredLanguage, accountEnabled

**Step 2 — AccountEnabled check:**
- If accountEnabled = false:
  - If user exists → set status = suspended
  - Return HTTP 401: "Your company account has been disabled."
  - Do NOT issue platform JWT
  - Write to RoleChangeAuditLog (source = system_sync, reason = "Entra account disabled")

**Step 3 — Tenant resolution:** Resolve tenant from tid via Tenant.entraIdConfig

**Step 4 — User lookup:** By entraOid + tenantId
- FOUND → Step 5 (sync update)
- NOT FOUND → Step 6 (first login creation)

**Step 5 — Sync update (existing user):**
- a. Update mutable fields: firstName, lastName, displayName, department, jobTitle, officeLocation, preferredLanguage, entraAccountEnabled
- b. Email change detection:
  - Update entraEmail = token.mail
  - If entraEmail ≠ user.email → Set emailMismatch = true
    - Do NOT auto-update user.email
    - Publish auth.exchange → user.email.mismatch event
  - If entraEmail == user.email → Clear emailMismatch
- c. Set lastEntraSync = now()

**Step 6 — First login creation (new user):**
- Create User with: entraOid, tenantId, entraEmail, email = entraEmail (same at creation), firstName, lastName, displayName, department, jobTitle, officeLocation, preferredLanguage, entraAccountEnabled = true, role = TeamMember (default), status = pending, onboarded = false, authProvider = azure_entra, emailMismatch = false, lastEntraSync = now()

**Step 7 — Fetch and cache groups (async):**
- If lastEntraSync is null OR > 24h ago:
  - Call Graph API: GET /users/{oid}/memberOf
  - Store in user.entraGroups (JSONB)
- Do NOT block JWT issuance if group fetch fails — use cached value
- Log failure, proceed

**Step 8 — RoleMappingEngine:**
- Use JWT claims + user.entraGroups for rule evaluation
- Update user.role if rule matches
- Write to RoleChangeAuditLog

**Step 9 — Issue platform JWT:**
- { userId, email, role, tenantId, authProvider: "azure_entra", displayName, status }

**entraGroups Cache Strategy:**
- Refresh on: first login (always), subsequent login if lastEntraSync > 24h ago
- Do NOT block JWT issuance if group fetch fails — use cached value
- If entraGroups is null and group fetch fails → RoleMappingEngine skips group-based rules, evaluates only jobTitle/department rules
- Group fetch is async via FastAPI BackgroundTasks
- Log all Graph API failures with tenant context

---

### BC-2: Learning & Engagement Service (MS2)
**Port:** 8002

**Domain Responsibilities:**
- Course, module, lesson management
- Enrollment and progress tracking
- Gamification (XP, levels, badges, leaderboards)
- Team and member management
- Goals tracking
- Skill gap analysis (pg0 relational queries)
- Analytics and reporting
- **Certificate generation with integrity verification**
- **Lesson completion enforcement (video/text heartbeats)**

**Gamification Section — Timezone-Aware Date Boundary Rule:**

All gamification services must follow this rule without exception: store all timestamps in UTC, convert to the user's timezone only when computing date boundaries. The canonical pattern is:

```python
import pytz
from datetime import datetime

def get_user_local_date(user_timezone: str) -> date:
    tz = pytz.timezone(user_timezone)
    return datetime.now(tz).date()
```

The user_timezone string must be fetched from the users.timezone database column, with system_config.default_timezone as the fallback. This function replaces every date.today() call in the gamification layer. No gamification service may call date.today() directly.

**Aggregates:**
- Course / Module / Lesson / Assessment
- Enrollment / Progress / VideoProgress / TextProgress
- UserLevel / XPTransaction / Badge / UserStreak / Leaderboard
- Team / TeamMembership / TeamGoal
- UserGoal
- Analytics
- Certificate

---

### BC-2.1: Lesson Completion Enforcement Architecture

The backend enforces lesson completion based on measurable engagement signals per lesson type. This prevents fake completions via client-side "Mark Complete" buttons.

#### Completion Rules Per Lesson Type

| Lesson Type | Completion Condition |
|-------------|----------------------|
| video | watched_percent >= 80% of unique segments, playback_rate <= 2.0x |
| text | scrolled >= 85% AND active_reading_time >= estimated_reading_time |
| quiz | score >= assessment.passing_score on a valid attempt |
| pdf | scroll_depth >= 85% AND time_on_page >= min_read_time |

#### Video Heartbeat Flow

1. Frontend sends `POST /progress/video/heartbeat` every 10 seconds during video playback
2. Backend receives: lesson_id, enrollment_id, current_time, duration, played_segments, playback_rate
3. Backend merges played_segments with existing watched_segments using segment merge algorithm
4. Backend runs integrity validation (speed cap, time impossibility, gap logging)
5. If watch_percent >= 80% AND integrity passes → auto-complete lesson, set status to "completed"

#### Text Heartbeat Flow

1. Frontend sends `POST /progress/text/heartbeat` every 10 seconds for text lessons
2. Backend receives: lesson_id, enrollment_id, scroll_depth, time_on_page, is_focused (from Page Visibility API)
3. Backend increments active_reading_time ONLY when is_focused = true
4. Backend updates max_scroll_depth (never decrements)
5. If scroll >= 85% AND active_reading_time >= lesson.min_reading_seconds → auto-complete

#### Segment Merge Algorithm

Input: list of [start, end] segments (may overlap, may be unsorted)
Output: list of merged non-overlapping [start, end] segments

```
Sort segments by start time
Initialize merged = [segments[0]]
For each subsequent segment [start, end]:
  If start <= merged[-1][end]: extend merged[-1] to max(merged[-1][end], end)
  Else: append [start, end] to merged
Return merged
```

**Purpose:** Ensures rewatching the same section does not inflate watch_percent. Each second of video content is counted only once regardless of replay count.

#### Anti-Gaming Policy

**Rule 1 — Speed cap:** playback_rate > 2.0 → reject heartbeat, flag progress record as suspicious, do not count segments.

**Rule 2 — Time impossibility:** if total claimed watch time (adjusted for playback_rate) exceeds wall-clock elapsed time by more than 15% → flag as suspicious, do not mark complete.

**Rule 3 — Gap logging:** if a skip gap > 30 seconds is detected between segments → set has_gaps = true on VideoProgress (informational only, does not block completion).

**Rule 4 — Minimum session time:** video lesson cannot be marked complete if (completed_at - started_at) < (duration / max_rate / 2). This catches API-level bypass attempts.

#### Course Completion Gate

```
POST /progress/{lesson_id}/complete (or heartbeat triggers auto-complete)
  ↓
try_complete_lesson(lesson_id, enrollment_id, user_id)
  ↓
Route to validator by lesson.type:
  video → validate_video_completion (watch_percent >= 80, no integrity flag)
  text  → validate_text_completion (scroll >= 85%, read_time >= min)
  quiz  → validate_quiz_completion (passing attempt exists)
  pdf   → validate_pdf_completion (scroll >= 85%, time >= min)
  ↓
If validation fails → raise CompletionRequirementsNotMet (HTTP 422)
  ↓
If validation passes → LessonProgress.status = "completed"
  ↓
check_course_completion(enrollment_id, course_id):
  total_lessons = COUNT published lessons in course
  completed_lessons = COUNT LessonProgress WHERE status = completed
  return completed_lessons >= total_lessons
  ↓
If course complete:
  enrollment.status = "completed"
  enrollment.completed_at = now()
  generate_certificate(enrollment_id, user_id)
  publish RabbitMQ event: learning.course.completed
  payload: { userId, courseId, enrollmentId, completedAt }
```

#### Reading Time Estimation

```python
def estimate_reading_time(content: str) -> int:
    word_count = len(content.split())
    # 200 words per minute = 3.33 words/second (conservative)
    return max(30, int(word_count / 3.33))
```

Store result in lesson.min_reading_seconds at lesson creation/update time.

---

### BC-2.2: Certificate Generation and Integrity Architecture

#### Certificate Number Generation

Uses cryptographically secure random number generation:
```python
import secrets, string

def generate_certificate_number(year: int) -> str:
    alphabet = string.ascii_uppercase + string.digits
    random_part = ''.join(secrets.choice(alphabet) for _ in range(8))
    return f"CERT-{year}-{random_part}"
```

#### Integrity — Hash + HMAC Signature

On certificate issuance:
1. Build canonical dict with fields: certificate_number, learner_name, course_title, course_version, issuing_org, issued_at (ISO format)
2. Serialize with `json.dumps(sort_keys=True, separators=(',', ':'))`
3. SHA-256 hash the serialized string → store as content_hash
4. HMAC-SHA256 sign the content_hash using CERTIFICATE_SECRET_KEY env variable → store as signature

**Important:** learner_name, course_title, course_version, issuing_org are captured as SNAPSHOTS at certificate issue time and are IMMUTABLE. They must never be updated even if user or course data changes.

**Certificate learnerName Logic:**
- learnerName = user.displayName if not null else f"{user.firstName} {user.lastName}"
- This ensures the certificate uses the person's official company directory name, not just the split first/last name which may differ from their preferred form

#### PDF Generation

Uses @react-pdf/renderer inside Next.js API route:
- `POST /api/certificates/generate` receives certificate data from FastAPI
- Renders CertificatePDF React component to buffer via `renderToBuffer()`
- Returns PDF buffer to FastAPI caller
- FastAPI uploads PDF to MinIO and stores pdf_url

#### Verification Endpoint (Public)

`GET /certificates/verify/{certificate_number}` is PUBLIC (no auth):
- Recomputes hash from stored snapshot data
- Verifies HMAC signature using CERTIFICATE_SECRET_KEY
- Returns: valid/invalid status, learner name, course title, issue date, is_revoked flag

This is the anti-forgery source of truth for external verification.

#### LinkedIn Share Integration

Add to LinkedIn button URL format:
```
https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME
  &name={course_title}
  &organizationId={ORG_LINKEDIN_ID}
  &issueYear={year}
  &issueMonth={month}
  &certUrl=https://yourplatform.com/verify/{certificate_number}
  &certId={certificate_number}
```

#### Certificate Trigger Pipeline

Certificate is generated when enrollment.status transitions to "completed":
1. Create Certificate DB record with snapshot + hash + signature
2. Render PDF via @react-pdf/renderer
3. Embed QR code pointing to /verify/{certificate_number}
4. Upload PDF to MinIO → store URL in certificate.pdf_url
5. Send notification to learner

#### Certificate Design Specification (PDF)

**Layout:**
- Format: Landscape A4 (1123 × 794 px)
- Margins: 40px outer, 60px inner safe padding

**Background:**
- Base: #F9FAFB (very light gray-white)
- Subtle dot pattern texture (opacity 5-8%)

**Border System:**
- Outer border: 2px gradient stroke (#6366F1 → #22D3EE), radius 16px
- Inner border: 1px solid #E5E7EB, margin 10px from outer

**Top Badge:**
- Circular badge (80px) with gradient fill (#6366F1 → #22D3EE)
- Shield or checkmark icon
- Soft shadow: 0 8px 20px rgba(0,0,0,0.08)

**Typography:**
- Title: "CERTIFICATE" - Serif font (Playfair Display/Cinzel), 48px, letter-spacing 6px, #6366F1
- Subtitle: "OF COMPLETION" - 16px, letter-spacing 3px, #6B7280
- Platform Name: Sans-serif (Inter/Poppins), 18px, #374151
- Recipient Name: 36px, Bold, #111827 with thin gradient underline
- Course Title: 24px, Semi-bold, #1F2937

**Color Palette:**
- Primary: #6366F1 (Indigo)
- Secondary: #22D3EE (Cyan)
- Text Dark: #111827
- Text Light: #6B7280
- Border: #E5E7EB

**Central Seal:**
- Position: Center-bottom
- Double ring with gradient stroke
- Shield/verified badge icon with subtle glow effect

**Signature Section:**
- Two columns:
  - Left: Signature (script font), Name, Title
  - Right: Date, "Date of Completion"

**Verification Section:**
- Certificate ID: CERT-XXXX-XXXX format
- Verification URL: domain.com/verify/{certificate_number}
- QR Code: 70px on right side
- Microtext for authenticity

#### BC-2.2b Secure Certificate Validity Addendum (Supersedes HMAC Notes)

This project now adopts an RSA-based certificate validity system:

- Every certificate receives a UUID `certificate_id`
- The canonical certificate payload is signed with `RS256`
- Signing key source:
  - `CERT_PRIVATE_KEY` (PEM, environment variable)
- Verification key source:
  - `CERT_PUBLIC_KEY` (PEM, environment variable)
- The verification QR code must encode:
  - `https://{YOUR_DOMAIN}/verify/{certificate_id}`
- QR error correction level: `H`
- Minimum QR size on certificate: `200x200px`

**Public verification flow:**
- Endpoint: `GET /verify/{certificate_id}`
- No authentication required
- Validate UUID before DB lookup
- Query certificate with parameterized queries only
- Rebuild original payload from immutable certificate snapshot fields
- Verify RS256 signature with the public key
- Return one of:
  - `valid`
  - `invalid`
  - `expired`
  - `revoked`
- Also render a human-readable HTML page with clear visual status

**Operational controls:**
- Verification endpoint rate limit: `30 requests/minute per IP`
- All verification attempts logged with certificate_id, IP, timestamp, and result
- Admin revocation endpoint:
  - `PATCH /admin/certificates/{certificate_id}/revoke`

---

### BC-3: AI Agents Service (MS3)
**Port:** 8003

**Domain Responsibilities:**
- 6 AI Agents: Chat Coach, Recommendation, Gamification, Course Maker, Content Librarian, Skill Gap Analyzer
- Agent orchestration via AGNO (execution, workflows, tool calling, scheduling, monitoring)
- Agent memory management (Hindsight: retain, recall, reflect)
- Course content generation plus memory synchronization
- Inter-agent communication via RabbitMQ + AGNO team workflows

**Aggregates:**
- ChatConversation / ChatMessage
- UserMemory (Hindsight)
- UserRecommendation
- AgentWorkflow

---

### BC-4: Notification Service (MS4)
**Port:** 8004

**Domain Responsibilities:**
- Real-time notifications (Socket.io + RabbitMQ)
- Email notifications
- Push notifications
- Event-driven notification dispatch

**Aggregates:**
- Notification
- NotificationTemplate

---

## 3. Approved Tool Stack

### Frontend
| Technology | Version | Purpose |
|------------|---------|---------|
| Next.js | 14+ | React framework |
| React | 18+ | UI library |
| React Native | - | Mobile app |
| TypeScript | 5+ | Type safety |
| shadcn/ui | latest | Component library |
| Socket.io Client | 4+ | Real-time updates |

### Backend (All Microservices)
| Technology | Version | Purpose |
|------------|---------|---------|
| FastAPI | 0.109+ | API framework |
| Python | 3.12+ | Runtime |
| Pydantic | 2.5+ | Data validation |
| SQLAlchemy | 2.0+ | ORM |
| RabbitMQ | 3.12+ | Message broker |
| pika | 1.3+ | AMQP client |

### Data & External Services
| Service | Technology | Purpose |
|---------|------------|---------|
| Primary Database | PostgreSQL | Relational data + memory |
| ORM | SQLAlchemy | Database abstraction |
| File Storage | MinIO (S3-compatible) | Course videos, PDFs, slides, images, quiz media |
| Auth | Azure Entra ID | OAuth2/OIDC |
| Agent Memory | Hindsight (vectorize-io/hindsight) | Long-term memory (retain, recall, reflect) |
| Agent Runtime | AGNO | Agent execution, orchestration, workflows, tool calling |
| AI/LLM | GROQ | AI processing |
| Message Broker | RabbitMQ | Inter-service communication |

---

## 4. API Communication

### Inter-Service Communication
- **Synchronous:** REST APIs (direct or via API Gateway)
- **Asynchronous:** RabbitMQ (AMQP) for all event routing
- **Real-time:** Socket.io server + RabbitMQ consumer pushing to Socket.io rooms

### RabbitMQ Exchanges & Queues

| Exchange | Type | Queues | Purpose |
|----------|------|--------|---------|
| auth.exchange | topic | auth.notifications, auth.onboarding, auth.email_mismatch | Authentication events |
| learning.exchange | topic | learning.progress, learning.enrollment, learning.gamification | Learning events |
| agents.exchange | topic | agents.tasks, agents.recall | AI agent tasks |
| notifications.exchange | fanout | notif.email, notif.push, notif.sms, notif.websocket | Notification dispatch |

### RabbitMQ Events (Email Mismatch)

**user.email.mismatch:**
- Exchange: auth.exchange
- Routing key: user.email.mismatch
- Payload: `{ userId, tenantId, currentEmail, entraEmail, detectedAt }`

**user.email.updated:**
- Exchange: auth.exchange
- Routing key: user.email.updated
- Payload: `{ userId, oldEmail, newEmail, updatedBy, updatedAt }`

### Real-time Architecture
- Socket.io server runs alongside each service
- RabbitMQ consumer listens to relevant queues
- On message receipt, pushes to Socket.io room keyed by `user_id`
- Frontend Socket.io client subscribes to its user room

### AGNO Agent Workflows
- `sync_user_workflow`: Sync users from Azure Entra ID
- `process_lesson_complete_workflow`: Handle lesson completion + XP award
- `generate_recommendations_workflow`: Daily recommendation generation
- `analytics_aggregation_workflow`: Weekly analytics computation
- `content_ingestion_workflow`: Course content processing + storage in MinIO

---

## 5. Data Stack Details

### PostgreSQL (Main Database)
- All business data: users, courses, modules, lessons, enrollments, progress, teams, goals
- pg0 extension for Hindsight memory system

### Hindsight (Agent Memory)
- Agent memory storage (retain, recall, reflect)
- Per-agent, per-scope memory banks (per-user, per-course, global)
- Replaces entire RAG pipeline — no pgvector, no manual chunking, no embedding pipeline
- Stores semantic course knowledge, expert feedback history, generation decisions, and reusable insights
- Is not the source of truth for official published course records

### MinIO (File Storage)
- S3-compatible object storage
- Course thumbnails
- Lesson media (videos, images)
- PDF documents, slides
- Quiz media
- User avatars
- Agents retrieve file URLs from MinIO to inject into context

### Authoritative Course Storage Rule

- **PostgreSQL + MinIO are authoritative**
  - PostgreSQL stores official course structure, modules, lessons, quizzes, publishing states, approval states, and generation workflow metadata.
  - MinIO stores official uploaded sources and generated course assets.
- **Hindsight is assistive memory**
  - Hindsight stores searchable knowledge about a course, not the official transactional course record.

### AI Course Generation Persistence Flow

When a Learning Expert approves an AI-generated course:

1. The approved course draft/final version is saved into PostgreSQL.
2. Media and source files are saved into MinIO.
3. A Hindsight course memory bank is created or updated.
4. The Hindsight bank receives:
   - course summaries
   - learning objectives
   - quiz concepts
   - expert-approved edits
   - generation and reflection notes
5. Later agents use Hindsight to recall this course knowledge for coaching, recommendation, content reuse, and future generation improvement.

---

## 6. Security Architecture

### Multi-Tenant Security

**Role Hierarchy:**
- Super Admin (3S Group level) → Tenant Admin → Manager/LearningExpert/TeamManager/TeamMember/TeamIntern
- Super Admin: tenantId = null, operates across all tenants
- Tenant Admin: tenantId in JWT, scoped to their company

**Tenant Isolation:**
- PostgreSQL RLS policies on all tenant-scoped tables
- SQLAlchemy tenant context middleware
- API Gateway tenant validation middleware
- JWT contains tenantId for all tenant-scoped operations

### Authentication (Dual Auth + Super Admin)

The platform supports two authentication methods:

**1. Azure Entra ID (OIDC/OAuth2) — Enterprise Users**
- Used by: Team Members, Team Interns, Managers, Learning Experts, Team Managers
- Flow: OAuth2 authorization code flow via MSAL
- JWT token issued after successful OIDC validation
- User accounts provisioned via Azure Entra ID admin portal

**2. Local Email/Password — Admin Users**
- Used by: Platform Administrators only
- Flow: Standard email + password login
- Password bcrypt hashed (cost factor 12)
- Admin accounts created directly in platform database (not in Azure)
- Enables admin access independent of Azure Entra ID availability

**Shared JWT System:**
- Both auth methods produce the same JWT token format
- JWT tokens: 15-minute expiry
- Refresh tokens: 7-day expiry (HTTP-only secure cookie)
- Token contains: userId, email, role, **tenantId**, authProvider
- **Super Admin tokens have tenantId = null** (platform-wide access)
- No self-registration — enterprise users via Azure, admins created by Super Admin

### Authorization
- RBAC with 6 roles: Admin, Manager, LearningExpert, TeamManager, TeamMember, TeamIntern
- Middleware validates role permissions per endpoint

### Data Security
- TLS 1.3 everywhere
- PostgreSQL encryption at rest
- Environment variables for all secrets
- Prompt injection prevention for AI inputs

---

## 7. Deployment Architecture

### Docker Services
| Service | Plan | Instances |
|---------|------|-----------|
| Identity & Access | Docker | 1 |
| Learning & Engagement | Docker | 1 |
| AI Agents | Docker | 1 |
| Notification | Docker | 1 |
| RabbitMQ | Docker | 1 |
| MinIO | Docker | 1 |
| Traefik v3 | Docker | 1 |

### External Services
- **MinIO:** S3-compatible object storage (local Docker or remote)
- **Azure Entra ID:** Authentication
- **GROQ:** LLM API
- **Azure Cloud:** Kubernetes deployment

### CI/CD
- GitHub Actions for automated testing
- Docker build and push to container registry
- Kubernetes deployment to Azure

---

## 8. Scalability Considerations

- **Horizontal:** Each microservice can scale independently via Kubernetes
- **Database:** Connection pooling via SQLAlchemy
- **Agents:** Hindsight for efficient memory retrieval (retain/recall/reflect)
- **Messaging:** RabbitMQ can scale with multiple consumers
- **Target:** 50-100 concurrent users per tenant

---

## 9. Demo Mode (Fallback)

For defense reliability, a demo mode will be implemented:
- **Without GROQ:** Uses pre-defined responses
- **Without Hindsight/pg0:** Uses in-memory storage (small dataset)
- **Without RabbitMQ:** Falls back to synchronous REST calls
- **Without MinIO:** Uses local file system fallback
- **Local Docker:** All services run locally on laptop

---

*Generated for PFE Project: Enterprise AI-Driven Upskilling & Mentorship Platform*
*Author: Aya Telmoudi | Supervisor: Hazem Raouafi*
