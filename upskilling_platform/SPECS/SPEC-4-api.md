# SPEC-4: API Specification

## Project: Enterprise AI-Driven Upskilling & Mentorship Platform

This document outlines all API endpoints organized by bounded context (DDD), built with FastAPI.

---

## 0. Platform Setup Endpoints (MS1 - Public but Setup-Key Protected)

**Note:** These endpoints are for first-run setup only. Once `system_config.setup_completed = true`, they return HTTP 410 Gone.

### Setup Status (Public - No Key Required)
| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/api/setup/status` | Returns `{ setup_completed: bool }` | None |

### Setup Endpoints (X-Setup-Key Header Required)
All endpoints except `/status` require header: `X-Setup-Key: {SETUP_SECRET_KEY}`

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/api/setup/admin` | Create Super Admin account (name, email, password) | X-Setup-Key |
| POST | `/api/setup/group` | Configure 3S Group holding entity (name, logo, website, color, timezone, support_email) | X-Setup-Key |
| POST | `/api/setup/platform` | DEPRECATED — Use /api/setup/group instead | X-Setup-Key |

**Request Body (POST /api/setup/group) — NEW:**
```json
{
  "group_name": "string (required, e.g., '3S Group')",
  "group_logo_url": "string (optional, MinIO URL)",
  "group_website": "string (optional, e.g., 'https://www.3s.com.tn')",
  "group_primary_color": "string (optional, hex color)",
  "timezone": "string (required, must be valid IANA timezone string, e.g. 'Africa/Tunis')",
  "support_email": "string (required, email format)"
}
```
**Validation Note:** The `timezone` field must be validated using Python's `zoneinfo` before saving. Invalid timezone strings return HTTP 422. This value is stored in system_config.default_timezone and used as the platform-wide fallback. The `group_*` fields are stored in system_config as the parent 3S Group entity.

**Request Body (POST /api/setup/tenant) — UPDATED:**
```json
{
  "name": "string (required, e.g., '3S')",
  "slug": "string (required, URL-safe, e.g., '3s')",
  "logo_url": "string (optional, MinIO URL)",
  "primary_color": "string (optional, hex color)",
  "email_domain": "string (optional, e.g., '3s.com.tn') — for auto-detecting company on login",
  "status": "string (default: 'active')"
}
```
**Note:** The `email_domain` field enables automatic company detection when users type their email on the login page.

| POST | `/api/setup/complete` | Finalize setup: sets setup_completed=true, publishes platform.setup.completed to RabbitMQ, initializes superadmin_checklist | X-Setup-Key |

**Request Body (POST /api/setup/complete):**
```json
{
  "setup_completed": true
}
```

**Response (HTTP 200):**
```json
{
  "setup_completed": true,
  "redirect_to": "/superadmin/login",
  "message": "Platform is live!"
}
```

**Post-Setup Response (HTTP 410 Gone):**
```json
{
  "detail": "Setup has already been completed"
}
```

### Rate Limiting
- Setup endpoints: 5 requests/minute per IP (brute-force protection)

---

## Tenant Context Middleware (ALL Endpoints)

### Multi-Tenant Request Flow
1. API Gateway extracts `tenantId` from JWT token
2. For tenant-scoped endpoints: tenantId must match resource's tenant_id
3. For Super Admin: tenantId = null, can access all tenants
4. All tenant-scoped queries include tenant_id filter via SQLAlchemy middleware

### Tenant Resolution on Login
- Login URL: `/auth/login/azure?tenant={slug}` OR resolved by email domain
- Super Admin login: `/auth/login/local` (no tenant parameter)

---

## MS0: Super Admin / Tenant Management (via API Gateway)

Base URL: `http://localhost:8000/superadmin`

### Tenant Management Endpoints (Super Admin only)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/superadmin/tenants` | List all tenants (companies) | JWT (SuperAdmin) |
| POST | `/superadmin/tenants` | Create new tenant (company) | JWT (SuperAdmin) |
| GET | `/superadmin/tenants/{tenant_id}` | Get tenant details | JWT (SuperAdmin) |
| PUT | `/superadmin/tenants/{tenant_id}` | Update tenant config | JWT (SuperAdmin) |
| PATCH | `/superadmin/tenants/{tenant_id}/status` | **UPDATED** — Activate/suspend tenant, publishes tenant.suspended event | JWT (SuperAdmin) |
| DELETE | `/superadmin/tenants/{tenant_id}` | Delete tenant (soft delete) | JWT (SuperAdmin) |
| POST | `/superadmin/tenants/{tenant_id}/admins` | Assign tenant admin | JWT (SuperAdmin) |
| POST | `/superadmin/tenants/{tenant_id}/test-entra` | **NEW** — Test Azure Entra ID connection | JWT (SuperAdmin) |
| PATCH | `/superadmin/tenants/{tenant_id}/seat-limit` | **NEW** — Update seat limit | JWT (SuperAdmin) |
| GET | `/superadmin/analytics` | Cross-tenant aggregated stats | JWT (SuperAdmin) |
| GET | `/superadmin/settings` | Get platform settings | JWT (SuperAdmin) |
| PUT | `/superadmin/settings/general` | Update general platform settings | JWT (SuperAdmin) |
| PUT | `/superadmin/settings/security` | Update security settings | JWT (SuperAdmin) |
| PUT | `/superadmin/settings/notifications` | Update notification settings | JWT (SuperAdmin) |
| PUT | `/superadmin/settings/ai` | Update AI & agents settings | JWT (SuperAdmin) |
| POST | `/superadmin/settings/test-email` | Send test email | JWT (SuperAdmin) |
| POST | `/superadmin/settings/export` | Export all platform data | JWT (SuperAdmin) |
| POST | `/superadmin/settings/reset` | Reset platform (wipe all data) | JWT (SuperAdmin) |
| GET | `/superadmin/checklist` | Get Super Admin onboarding checklist status | JWT (SuperAdmin) |
| PUT | `/superadmin/checklist` | Update checklist item status | JWT (SuperAdmin) |

**Request Body (POST /superadmin/tenants) — UPDATED:**
```json
{
  "name": "string (required)",
  "slug": "string (required)",
  "logo_url": "string (optional)",
  "primary_color": "string (optional)",
  "email_domain": "string (optional, e.g., '3s.com.tn')",
  "entra_id_config": "object (optional, { tenantId, clientId, clientSecret, redirectUri })",
  "seat_limit": "integer (optional, null = unlimited)"
}
```

**Response (POST /superadmin/tenants/{tenant_id}/test-entra) — NEW:**
```json
{
  "valid": true,
  "tenant_name": "3S",
  "error": null
}
```
OR:
```json
{
  "valid": false,
  "error": "Invalid client secret"
}
```

**Request Body (PATCH /superadmin/tenants/{tenant_id}/seat-limit) — NEW:**
```json
{
  "seat_limit": 100
}
```
- Setting seat_limit publishes tenant.seat_limit_changed to RabbitMQ

**Note:** On PATCH /superadmin/tenants/{id}/status (suspend), the backend must:
1. Update tenant status to suspended
2. Publish `tenant.suspended` event to RabbitMQ auth.exchange
3. Notification service sends email to the company's admin
```json
{
  "id": "uuid",
  "name": "3S",
  "slug": "3s",
  "logoUrl": "https://...",
  "primaryColor": "#6C63FF",
  "status": "active",
  "seatLimit": 500,
  "userCount": 142,
  "createdAt": "2026-01-15T10:00:00Z"
}
```

---

## MS0: Super Admin Identity & Access (Tenant Admin Management)

Base URL: `http://localhost:8000/superadmin`

**Scope:** Manages Tenant Admin accounts only. Super Admin CANNOT access individual user records within any tenant.

### Tenant Admin Management Endpoints (Super Admin)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/superadmin/identity` | List all Tenant Admin accounts | JWT (SuperAdmin) |
| POST | `/superadmin/admins/assign` | Assign existing user as Tenant Admin | JWT (SuperAdmin) |
| POST | `/superadmin/admins/invite` | **NEW** — Invite new person as admin (creates pending admin, sends welcome email) | JWT (SuperAdmin) |
| DELETE | `/superadmin/admins/{id}/unassign` | Revoke admin assignment | JWT (SuperAdmin) |
| PATCH | `/superadmin/admins/{id}/status` | Suspend/reactivate admin | JWT (SuperAdmin) |
| POST | `/superadmin/admins/{id}/reset-password` | Trigger password reset email | JWT (SuperAdmin) |
| GET | `/superadmin/identity/role-mapping` | List admin-level role mapping rules | JWT (SuperAdmin) |
| POST | `/superadmin/identity/role-mapping` | Create admin-level role mapping rule | JWT (SuperAdmin) |
| PUT | `/superadmin/identity/role-mapping/{id}` | Update role mapping rule | JWT (SuperAdmin) |
| DELETE | `/superadmin/identity/role-mapping/{id}` | Delete role mapping rule | JWT (SuperAdmin) |
| POST | `/superadmin/identity/role-mapping/{id}/simulate` | Test rule against mock claims | JWT (SuperAdmin) |
| GET | `/superadmin/identity/audit` | Admin-level audit log | JWT (SuperAdmin) |
| GET | `/superadmin/audit-log` | **NEW** — Platform-level audit log | JWT (SuperAdmin) |

**Request Body (POST /superadmin/admins/invite) — NEW:**
```json
{
  "first_name": "string (required)",
  "last_name": "string (required)",
  "email": "string (required, email format)",
  "tenant_id": "uuid (required)"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Admin invitation sent",
  "admin_id": "uuid"
}
```
- Creates User: role=Admin, authProvider=local, status=pending
- Generates temporary password OR magic link token
- Publishes admin.invited to RabbitMQ
- Notification service sends welcome email

**Tenant Admin Response Example:**
```json
{
  "id": "uuid",
  "name": "John Doe",
  "email": "john@3s.com",
  "company": "3S",
  "tenantId": "tenant-uuid",
  "status": "active",
  "lastLogin": "2026-04-10T10:00:00Z",
  "createdAt": "2026-01-15T10:00:00Z",
  "createdBy": "setup-wizard"
}
```

---

## MS1: Identity & Access Service (Port 8001)

Base URL: `http://localhost:8001`

### Tenant-Scoped Identity Endpoints (Tenant Admin Access)

**Note:** All endpoints enforce `rule.tenant_id == jwt.tenant_id` at service layer + RLS at DB layer (double enforcement).

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/identity/pending-users` | List pending users in caller's tenant | JWT (Admin) |
| GET | `/identity/email-mismatches` | List users with emailMismatch = true | JWT (Admin) |
| POST | `/identity/users/{id}/confirm-email` | Admin confirms: update email = entraEmail, clear flag | JWT (Admin) |
| POST | `/identity/users/{id}/keep-email` | Admin keeps current email, clears flag | JWT (Admin) |
| PATCH | `/identity/users/{id}/role` | Override user role (own tenant only) | JWT (Admin) |
| PATCH | `/identity/users/{id}/status` | Change user status (own tenant only) | JWT (Admin) |
| POST | `/identity/users/{id}/revoke` | Force logout user (own tenant only) | JWT (Admin) |
| GET | `/identity/role-mapping-rules` | List role mapping rules for tenant | JWT (Admin) |
| POST | `/identity/role-mapping-rules` | Create role mapping rule for tenant | JWT (Admin) |
| PUT | `/identity/role-mapping-rules/{id}` | Update rule (own tenant only) | JWT (Admin) |
| DELETE | `/identity/role-mapping-rules/{id}` | Delete rule (own tenant only) | JWT (Admin) |
| POST | `/identity/role-mapping-rules/simulate` | Simulate rule on mock claims | JWT (Admin) |
| GET | `/identity/audit` | Get identity audit log for tenant | JWT (Admin) |

**Role Mapping Rule Constraints:**
- Via tenant-scoped endpoints, target_role MUST NOT be Admin or SuperAdmin
- Via superadmin endpoints, target_role MUST be Admin only (not SuperAdmin)
- Enforced at API validation layer (Pydantic) + DB check constraint

### Authentication Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/auth/login/azure` | Login with Azure Entra ID (receive JWT) | None |
| POST | `/auth/login/local` | Login with email + password (admin only) | None |
| POST | `/auth/refresh` | Refresh access token | None |
| POST | `/auth/logout` | Invalidate session | JWT |
| GET | `/auth/me` | Get current user profile | JWT |
| POST | `/auth/set-password` | **NEW** — Set password with one-time token (invited admin first login) | Token |
| GET | `/auth/validate-set-password-token` | **NEW** — Validate token before showing password form | None |

**Request Body (POST /auth/set-password) — NEW:**
```json
{
  "token": "string (one-time-use token from invitation email)",
  "password": "string (new password, min 8 chars)"
}
```
**Response:**
```json
{
  "success": true,
  "message": "Password set successfully. You can now log in."
}
```
- Validates token is valid, not expired, not used
- Hashes password with bcrypt
- Sets user.status = active
- Marks token as used

**Frontend:** Page at `/set-password?token=xxx` displays password input + confirm + "Set Password" button

### User Management Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/users` | List all employees (admin only) | JWT (Admin) |
| GET | `/users/{user_id}` | Get user details | JWT |
| PUT | `/users/{user_id}` | Update user profile (includes **timezone** field) | JWT |
| DELETE | `/users/{user_id}` | Deactivate user (admin only) | JWT (Admin) |
| POST | `/users/import` | Bulk import users via CSV file | JWT (Admin) |
| GET | `/users/export` | Export user list (CSV/Excel/PDF) | JWT (Admin) |

**Request Body (PUT /users/{user_id}):**
```json
{
  "first_name": "string (optional)",
  "last_name": "string (optional)",
  "display_name": "string (optional)",
  "department": "string (optional)",
  "job_title": "string (optional)",
  "office_location": "string (optional)",
  "preferred_language": "string (optional, e.g. 'fr-FR', 'en-US')",
  "timezone": "string (optional, IANA timezone string, e.g. 'Africa/Tunis', 'Europe/Paris')",
  "bio": "string (optional)"
}
```
**Note:** The timezone field is editable. Changing timezone takes effect immediately for all future streak and XP calculations.

### Onboarding Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/onboarding/status` | Get onboarding completion status | JWT |
| POST | `/onboarding/step/profile` | Submit profile setup step (includes **timezone** field) | JWT |
| POST | `/onboarding/step/skills` | Submit skills selection step | JWT |
| POST | `/onboarding/step/goals` | Submit goal setting step | JWT |
| POST | `/onboarding/step/recommendation` | Confirm first course recommendation | JWT |
| POST | `/onboarding/complete` | Mark onboarding as complete | JWT |
| GET | `/onboarding/config` | Get onboarding config (Admin) | JWT (Admin) |
| PUT | `/onboarding/config` | Update onboarding config (Admin) | JWT (Admin) |

**Request Body (POST /onboarding/step/profile):**
```json
{
  "first_name": "string (required)",
  "last_name": "string (required)",
  "department": "string (optional)",
  "job_title": "string (optional)",
  "timezone": "string (required, IANA timezone string, e.g. 'Africa/Tunis', 'Europe/Paris')"
}
```
**Note:** The timezone field is required. The frontend should auto-detect the browser's timezone using `Intl.DateTimeFormat().resolvedOptions().timeZone` as the default suggestion.

### Role & Permission Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/roles` | List all roles | JWT |
| GET | `/roles/{role_id}` | Get role details with permissions | JWT |
| POST | `/roles` | Create new role (admin only) | JWT (Admin) |
| PUT | `/roles/{role_id}` | Update role (admin only) | JWT (Admin) |
| DELETE | `/roles/{role_id}` | Delete role (admin only) | JWT (Admin) |

---

## MS2: Learning Platform Service (Port 8002)

Base URL: `http://localhost:8002`

### Course Management Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/courses` | List courses with filters | JWT |
| GET | `/courses/{course_id}` | Get course details | JWT |
| POST | `/courses` | Create course (LearningExpert+) | JWT |
| PUT | `/courses/{course_id}` | Update course | JWT |
| DELETE | `/courses/{course_id}` | Delete course | JWT (Admin) |
| GET | `/courses/{course_id}/curriculum` | Get course modules/lessons | JWT |
| PATCH | `/courses/{course_id}/publish` | Toggle publish/unpublish course | JWT (LearningExpert+) |

### Course Assignment Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/courses/{course_id}/assign` | Assign course to user/team with deadline | JWT (Manager+) |
| POST | `/courses/{course_id}/assign/department` | Assign course to all users in a department | JWT (Manager) |
| PUT | `/assignments/{assignment_id}` | Update assignment (deadline, mandatory) | JWT (Manager+) |
| DELETE | `/assignments/{assignment_id}` | Remove course assignment | JWT (Manager+) |

### Module & Lesson Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/courses/{course_id}/modules` | Add module to course | JWT |
| PUT | `/modules/{module_id}` | Update module | JWT |
| DELETE | `/modules/{module_id}` | Delete module | JWT |
| POST | `/modules/{module_id}/lessons` | Add lesson to module | JWT |
| PUT | `/lessons/{lesson_id}` | Update lesson | JWT |
| DELETE | `/lessons/{lesson_id}` | Delete lesson | JWT |

### Quiz/Assessment Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/courses/{course_id}/assessments` | List assessments for a course | JWT |
| POST | `/courses/{course_id}/assessments` | Create assessment for course/module | JWT (LearningExpert+) |
| GET | `/assessments/{assessment_id}` | Get assessment details with questions | JWT |
| PUT | `/assessments/{assessment_id}` | Update assessment | JWT (LearningExpert+) |
| DELETE | `/assessments/{assessment_id}` | Delete assessment | JWT (LearningExpert+) |
| GET | `/assessments/{assessment_id}/questions` | List questions for assessment | JWT |
| POST | `/assessments/{assessment_id}/questions` | Add question to assessment | JWT (LearningExpert+) |
| PUT | `/questions/{question_id}` | Update question | JWT (LearningExpert+) |
| DELETE | `/questions/{question_id}` | Delete question | JWT (LearningExpert+) |
| POST | `/assessments/{assessment_id}/take` | Submit assessment attempt | JWT |
| GET | `/assessments/{assessment_id}/attempts` | Get user's attempts for assessment | JWT |

### Course Preview Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/courses/{course_id}/preview-token` | Generate preview token (24h expiry) | JWT (LearningExpert+, course author only) |
| GET | `/courses/{course_id}/preview` | Preview course as student (token required) | Preview Token |
| DELETE | `/courses/{course_id}/preview-token` | Revoke preview token | JWT (LearningExpert+, course author only) |

### Enrollment & Progress Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/enrollments` | Enroll in a course | JWT |
| GET | `/enrollments` | List user enrollments | JWT |
| GET | `/enrollments/{enrollment_id}` | Get enrollment details | JWT |
| PUT | `/enrollments/{enrollment_id}/progress` | Update lesson progress | JWT |
| GET | `/progress/course/{course_id}` | Get course progress | JWT |
| POST | `/progress/{lesson_id}/complete` | Mark lesson as complete | JWT |

### Quiz/Assessment Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/assessments/{assessment_id}/questions` | Get assessment questions | JWT |
| POST | `/assessments/{assessment_id}/submit` | Submit quiz answers | JWT |
| GET | `/assessments/{assessment_id}/attempts` | Get user's attempts | JWT |
| GET | `/assessments/{assessment_id}/results/{attempt_id}` | Get attempt results | JWT |

### Course Review Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/courses/{course_id}/review` | Submit course review (rating + feedback) | JWT |
| GET | `/courses/{course_id}/reviews` | Get course reviews | JWT |
| PUT | `/courses/{course_id}/reviews/{review_id}` | Update own review | JWT |

### Bookmark Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/bookmarks` | List user's bookmarks | JWT |
| POST | `/bookmarks` | Add bookmark (course or lesson) | JWT |
| DELETE | `/bookmarks/{bookmark_id}` | Remove bookmark | JWT |

### Certificate Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/certificates` | List user's certificates | JWT |
| GET | `/certificates/{certificate_id}` | Get certificate details | JWT |
| GET | `/certificates/{certificate_id}/download` | Download certificate PDF | JWT |
| GET | `/certificates/{certificate_id}/qr` | Get QR code image for certificate | JWT |
| POST | `/certificates/generate` | Trigger certificate generation for completed enrollment | JWT |
| GET | `/verify/{certificate_id}` | **PUBLIC** - Verify certificate authenticity and validity | None |
| PATCH | `/admin/certificates/{certificate_id}/revoke` | Revoke certificate with reason | JWT (Admin) |

**Verification endpoint logic (`GET /verify/{certificate_id}`):**
1. Validate `certificate_id` as UUID
2. Query the certificate record using parameterized DB access
3. If not found â†’ return `{ "status": "invalid", "message": "Certificate not found" }`
4. If revoked â†’ return `{ "status": "revoked", "reason": "..." }`
5. If expired â†’ return `{ "status": "expired" }`
6. Rebuild the signed payload from DB fields
7. Verify the signature using `RS256` and `CERT_PUBLIC_KEY`
8. If signature invalid â†’ return `{ "status": "invalid", "message": "Signature mismatch" }`
9. If verification succeeds â†’ return full certificate metadata

**Verification endpoint requirements:**
- Public, no auth
- Rate-limited to `30 requests/minute per IP`
- Logs certificate_id, IP, timestamp, and result
- Renders both JSON and a human-readable HTML page with âœ… / â‌Œ / âڑ ï¸ڈ status

**Revocation request body:**
```json
{
  "reason": "string"
}
```

### Video Progress Heartbeat Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/progress/video/heartbeat` | Send video playback heartbeat | JWT |
| GET | `/progress/video/{lesson_id}` | Get video progress for lesson | JWT |

### Text Progress Heartbeat Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/progress/text/heartbeat` | Send text reading heartbeat | JWT |
| GET | `/progress/text/{lesson_id}` | Get text progress for lesson | JWT |

### Manual Completion Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/progress/{lesson_id}/complete` | Mark lesson as complete (validates requirements) | JWT |

### Gamification Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/gamification/profile` | Get user gamification profile | JWT |
| GET | `/gamification/xp` | Get XP history | JWT |
| GET | `/gamification/level` | Get current level and progress | JWT |
| GET | `/gamification/badges` | List earned badges | JWT |
| GET | `/gamification/streak` | Get current streak | JWT |
| GET | `/leaderboard` | Get leaderboard (global/team/weekly) | JWT |
| GET | `/leaderboard/me` | Get current user rank | JWT |

**Note:** All gamification endpoints (streak, XP, leaderboard) are calculated using the user's `user.timezone` field from the database, not the server's UTC clock. A user's "day" starts and ends at their local midnight (as defined by their timezone), not UTC midnight. If user.timezone is null, the system's default_timezone (from system_config) is used as the fallback.

### Team Management Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/teams` | List all teams | JWT |
| GET | `/teams/{team_id}` | Get team details | JWT |
| POST | `/teams` | Create team (Manager+) | JWT |
| PUT | `/teams/{team_id}` | Update team | JWT (Manager) |
| DELETE | `/teams/{team_id}` | Delete team | JWT (Admin) |
| POST | `/teams/{team_id}/members` | Add member to team | JWT (Manager) |
| DELETE | `/teams/{team_id}/members/{user_id}` | Remove member | JWT (Manager) |
| GET | `/teams/{team_id}/activity` | Get team activity feed | JWT |
| POST | `/teams/{team_id}/courses` | Assign course to all team members | JWT (Manager) |
| GET | `/teams/{team_id}/members/{user_id}/progress` | Get member's course progress | JWT (Manager) |
| GET | `/teams/{team_id}/progress` | Get all members' progress overview | JWT (Manager) |

### Goals Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/goals` | List user goals | JWT |
| POST | `/goals` | Create personal goal | JWT |
| PUT | `/goals/{goal_id}` | Update goal | JWT |
| DELETE | `/goals/{goal_id}` | Delete goal | JWT |
| GET | `/goals/team` | List team goals | JWT |
| POST | `/goals/team` | Create team goal | JWT (Manager) |
| PUT | `/goals/team/{goal_id}` | Update team goal | JWT (Manager) |

### Analytics Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/analytics/overview` | Get user analytics overview | JWT |
| GET | `/analytics/weekly` | Get weekly stats | JWT |
| GET | `/analytics/monthly` | Get monthly stats | JWT |
| GET | `/analytics/skills` | Get skill progress | JWT |
| GET | `/analytics/team/{team_id}` | Get team analytics | JWT (Manager) |
| GET | `/analytics/courses` | Get course analytics (Admin) | JWT (Admin) |
| GET | `/analytics/department/{dept_id}` | Get department analytics | JWT (Manager+) |
| GET | `/analytics/export` | Export analytics report (PDF/CSV) | JWT (Admin) |

---

## MS3: AI Agents Service (Port 8003)

Base URL: `http://localhost:8003`

### AI Coach Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/coach/chat` | Send message to AI coach (Chat Coach Agent) | JWT |
| GET | `/coach/conversations` | List chat conversations | JWT |
| GET | `/coach/conversations/{conv_id}` | Get conversation messages | JWT |
| DELETE | `/coach/conversations/{conv_id}` | Delete conversation | JWT |

### Recommendations Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/recommendations` | Get personalized course recommendations | JWT |
| GET | `/recommendations/learning-path` | Get suggested learning path | JWT |
| POST | `/recommendations/feedback` | Submit recommendation feedback | JWT |

### Gamification Agent Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/gamification/challenges` | Get active challenges | JWT |
| POST | `/gamification/challenges/{id}/complete` | Complete a challenge | JWT |
| GET | `/gamification/daily` | Get daily challenge | JWT |

### Course Maker Agent Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/course-maker/generate` | Generate course from topic | JWT (LearningExpert+) |
| GET | `/course-maker/status/{job_id}` | Check generation status | JWT |
| POST | `/course-maker/review/{job_id}` | Submit human review feedback | JWT (LearningExpert+) |
| POST | `/course-maker/{job_id}/approve` | Approve generated course and persist official draft in PostgreSQL/MinIO | JWT (LearningExpert+) |
| POST | `/course-maker/{job_id}/sync-memory` | Sync approved course knowledge into Hindsight course memory bank | JWT (LearningExpert+) |

### Content Librarian Agent Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/librarian/search` | Semantic search across content | JWT |
| POST | `/librarian/ingest` | Ingest new content source | JWT (LearningExpert+) |
| GET | `/librarian/sources` | List ingested content sources | JWT |

### Skill Gap Analyzer Agent Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/skill-gap/profile` | Get user skill profile | JWT |
| GET | `/skill-gap/gaps` | Get identified skill gaps | JWT |
| GET | `/skill-gap/report` | Generate skill gap report | JWT (Manager+) |
| GET | `/skill-gap/department` | Get department-wide skill gap summary | JWT (Manager) |
| POST | `/skill-gap/assess` | Start adaptive assessment | JWT |

### Agent Memory Endpoints (Hindsight)

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| POST | `/memory/retain` | Store memory (via Hindsight) | JWT |
| GET | `/memory/recall` | Search memories | JWT |
| POST | `/memory/reflect` | Trigger reflection on memories | JWT |
| GET | `/memory/stats` | Get memory statistics | JWT |

### Planned Course Storage and Memory Rule

- Official course records returned to the platform UI are sourced from PostgreSQL.
- Course files and generated assets are stored in MinIO and referenced from PostgreSQL rows.
- Hindsight stores course memory banks for semantic recall, expert feedback history, approved edit summaries, and reflective insights.
- Hindsight is not the authoritative store for published course structure or learner-facing publishing state.

---

## MS4: Notification Service (Port 8004)

Base URL: `http://localhost:8004`

### Notification Endpoints

| Method | Path | Description | Auth |
|--------|------|-------------|------|
| GET | `/notifications` | List user notifications | JWT |
| GET | `/notifications/unread` | Get unread notifications | JWT |
| PUT | `/notifications/{notif_id}/read` | Mark as read | JWT |
| PUT | `/notifications/read-all` | Mark all as read | JWT |
| DELETE | `/notifications/{notif_id}` | Delete notification | JWT |

### WebSocket Events

| Event | Direction | Description |
|-------|-----------|-------------|
| `notification:new` | Server → Client | New notification |
| `xp:gained` | Server → Client | XP earned |
| `level:up` | Server → Client | Level increased |
| `badge:earned` | Server → Client | Badge unlocked |
| `streak:update` | Server → Client | Streak updated |

---

## Common Response Formats

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

### Error Response
```json
{
  "success": false,
  "error": "Error message",
  "code": "ERROR_CODE"
}
```

### Paginated Response
```json
{
  "success": true,
  "data": [...],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

---

## Authentication

All protected endpoints require JWT token in header:
```
Authorization: Bearer <access_token>
```

### Token Endpoints

**Azure Entra ID Login (Enterprise Users):**
- `POST /auth/login/azure` — Initiates OAuth2/OIDC flow
- Request: `{ "code": "<authorization_code>" }` (from Azure redirect)
- Response: `{ access_token, refresh_token, expires_in, user: { id, email, role, authProvider: "azure_entra" } }`

**Local Admin Login:**
- `POST /auth/login/local` — Email + password authentication (admin only)
- Request: `{ "email": "admin@company.com", "password": "..." }`
- Response: `{ access_token, refresh_token, expires_in, user: { id, email, role, authProvider: "local" } }`
- Error: 401 if invalid credentials, 403 if user is not admin role

**Token Refresh:**
- `POST /auth/refresh` with refresh_token → returns new access_token

---

*Generated for PFE Project: Enterprise AI-Driven Upskilling & Mentorship Platform*
*Author: Aya Telmoudi | Supervisor: Hazem Raouafi*
*Last Updated: 2026-03-26*
