# SPEC-3: Data Model

## Project: Enterprise AI-Driven Upskilling & Mentorship Platform

This document outlines the complete data model with entities, fields, types, and relationships.

---

## 0. Platform Bootstrap Entities

### 0.1 system_config (NEW - REVISED)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | Int | PK, always 1 | Singleton row |
| setup_completed | Boolean | not null, default false | Once true, never changes |
| setup_completed_at | DateTime | nullable | Timestamp of setup completion |
| platform_name | String | nullable | Configured during setup (deprecated — use group_name) |
| platform_logo_url | String | nullable | MinIO path of uploaded logo (deprecated — use group_logo_url) |
| **OrganizationGroup Fields (NEW):** |
| group_name | String | nullable | 3S Group — holding entity name (e.g., "3S Group") |
| group_logo_url | String | nullable | Group logo URL (MinIO path) |
| group_website | String | nullable | Group website (e.g., "https://www.3s.com.tn") |
| group_primary_color | String | nullable | Brand color hex (e.g., "#6C63FF") |
| **End OrganizationGroup Fields** |
| default_timezone | String | nullable | e.g. "Africa/Tunis" — Used as fallback when user.timezone is null. MUST be implemented in backend setup endpoint (POST /api/setup/platform) and validated as valid IANA timezone string using pytz. |
| **superadmin_onboarded** | Boolean | not null, default false | True when all Getting Started checklist items complete |
| **superadmin_checklist** | JSON | nullable | Checklist state: `{ platform_configured: true, first_tenant_created: true, tenant_admins_assigned: false, entra_id_configured: false, seat_limits_set: false, first_users_invited: false }` |
| platform_language | String | nullable | Default language (en, fr, ar) |
| support_email | String | nullable | Support contact email |
| jwt_expiry_minutes | Int | default 15 | JWT token expiry |
| session_timeout_hours | Int | default 8 | Session timeout |
| rate_limit_rpm | Int | default 100 | Rate limit requests per minute |
| groq_api_key | String | nullable | GROQ API key (masked in UI) |
| demo_mode | Boolean | default false | Demo mode for AI fallback |
| **agent_toggles** | JSON | nullable | Agent enable/disable state: `{ chat_coach: true, recommendation: true, gamification: true, course_maker: false, librarian: false, skill_gap: false }` |
| email_templates | JSON | nullable | Email template toggles |
| smtp_config | JSON | nullable | SMTP configuration |

**Note:** This table controls bootstrap mode. When `setup_completed = false`, all routes except `/setup/*` are blocked.

**Implementation Note:** The `default_timezone` field must be:
- Required in POST /api/setup/platform request body
- Validated as a valid IANA timezone string using Python's `pytz.timezone()` before saving
- Used as the fallback when a user has not yet set their own timezone in user.timezone

---

## 1. Entity Relationship Overview

```
SystemConfig (1) ──< (singleton)
Tenant (1) ──────< User >
Tenant (1) ──────< Course >
User (1) ──────< Enrollment >────── (1) Course
User (1) ──────< UserProgress >──── (1) Lesson
User (1) ──────< XPTransaction >────
User (1) ──────< Badge >─────────── (1) BadgeDefinition
User (1) ──────< TeamMembership >─ (1) Team
User (1) ──────< UserGoal >────────
User (1) ──────< ChatMessage >─────
Course (1) ────< Module >─────────── (1) Lesson
Module (1) ────< Assessment >─────── (1) Question
Team (1) ──────< TeamGoal >─────────
```

---

## 1.1 Multi-Tenancy: Tenant vs Global Entities

### Tenant-Scoped Entities (have tenant_id)
- User, Course, Module, Lesson, Assessment, Enrollment, UserProgress, VideoProgress, TextProgress, Certificate, XPTransaction, UserLevel, BadgeDefinition, UserBadge, UserStreak, Leaderboard, Team, TeamMembership, UserGoal, TeamGoal, ChatConversation, UserRecommendation, SkillGap, Notification, CourseAnalytics, UserSkillProgress, ContentSource

### Global/Shared Entities (no tenant_id)
- Skill, SkillEdge, BadgeDefinition (global templates), AssessmentItem (CAT question bank)

---

## 1.2 Tenant Entity (NEW)

### 1.0 Tenant
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, default uuid() | Unique identifier |
| name | String | not null | Display name (e.g., "3S", "Advancia", "Smart UP", "Global Net") |
| slug | String | unique, not null | URL-safe identifier (e.g., "3s", "advancia", "smart-up", "global-net") |
| logoUrl | String | nullable | Tenant logo URL |
| primaryColor | String | nullable | Brand color hex code (e.g., "#6C63FF") |
| **emailDomain** | String | nullable | Company email domain (e.g., "3s.com.tn") — for auto-detecting company on login |
| status | Enum | not null | active, suspended, pending |
| entraIdConfig | JSON | nullable | Per-tenant Azure Entra ID app credentials: { tenantId, clientId, clientSecret, redirectUri } |
| seatLimit | Int | nullable | Maximum number of users allowed (null = unlimited) |
| createdAt | DateTime | not null | Creation timestamp |
| updatedAt | DateTime | not null | Last update timestamp |
| createdById | UUID | FK → User | Super Admin who created the tenant |

**Relationships:**
- One-to-Many: Users, Courses, Teams, etc.
- Unique constraint: slug
- **Index:** email_domain (for fast lookup during login)

**Note:** The 3S Group (holding company) is the PARENT entity above all tenants. It's stored in system_config as `group_name`, `group_logo_url`, etc., not as a Tenant.

---

## 2. Core Entities

## 8.1 Identity Audit Entities (REVISED)

### 8.1 RoleMappingRule (REVISED)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| tenantId | UUID | FK → Tenant, nullable | Tenant scope (NULL = platform-level Super Admin rules) |
| claimType | String | not null | e.g., "groups", "roles", "department" |
| claimOperator | Enum | not null | contains, equals, exists, not_exists |
| claimValue | String | not null | Expected claim value |
| targetRole | Enum | not null | Role to assign (Admin at platform-level, Manager→TeamIntern at tenant-level) |
| priority | Int | not null | Order (higher = evaluated first) |
| isActive | Boolean | default true | Rule enabled |
| createdById | UUID | FK → User | Who created the rule |
| createdAt | DateTime | not null | Creation timestamp |
| updatedAt | DateTime | not null | Last update timestamp |

**Constraints:**
- Platform-level rules (tenantId=NULL): targetRole MUST be Admin only
- Tenant-level rules: targetRole MUST NOT be Admin or SuperAdmin
- Enforced at Pydantic validation + DB check constraint

---

### 8.2 RoleChangeAuditLog (NEW)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| tenantId | UUID | FK → Tenant, nullable | Tenant scope (NULL = platform-level actions) |
| timestamp | DateTime | not null | When action occurred |
| actorId | UUID | FK → User | Admin who performed action |
| actorName | String | not null | Admin name (denormalized for audit) |
| targetUserId | UUID | FK → User | User affected |
| targetUserName | String | not null | Target user name (denormalized) |
| oldRole | Enum | nullable | Previous role |
| newRole | Enum | nullable | New role |
| oldStatus | Enum | nullable | Previous status |
| newStatus | Enum | nullable | New status |
| reason | String | nullable | Reason note |
| source | Enum | not null | manual_override, role_mapping_rule, onboarding_complete |
| ipAddress | String | nullable | Client IP |
| scope | Enum | not null | tenant_level, platform_level |

**Scope Field:**
- tenant_level: Written by Tenant Admin actions → visible in /admin/identity/audit
- platform_level: Written by Super Admin actions → visible in /superadmin/identity/audit

### 8.3 SuperAdminAuditLog (NEW — Platform-Level)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| timestamp | DateTime | not null | When action occurred |
| actorId | UUID | FK → User | Super Admin who performed action |
| actorName | String | not null | Super Admin name (denormalized) |
| action | Enum | not null | company_created, company_updated, company_suspended, admin_invited, admin_revoked, admin_suspended, settings_changed, seat_limit_changed, role_mapping_changed |
| targetId | UUID | nullable | Target entity ID (tenant ID or admin user ID) |
| targetName | String | nullable | Target entity name |
| details | JSON | nullable | Action-specific data: { field_changed, old_value, new_value } |
| ipAddress | String | nullable | Client IP |

**Index:** (timestamp DESC) for fast queries
**Retention:** Keep all records (compliance requirement)

---

### 2.1 User
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK, default uuid() | Unique identifier (platform UUID, independent of Entra ID) |
| tenantId | UUID | FK → Tenant, nullable | Tenant (company) this user belongs to (NULL for SuperAdmin) |
| entraOid | String | nullable | Entra ID object ID (immutable, primary lookup key for Azure users) |
| email | String | unique, not null | User email (platform primary contact) |
| entraEmail | String | nullable | Email from Entra ID (sync reference for change detection) |
| emailMismatch | Boolean | default false | TRUE when Entra ID email differs from platform email |
| passwordHash | String | nullable | Hashed password (for local admin auth only, null for azure_entra) |
| authProvider | Enum | not null | azure_entra, local |
| firstName | String | not null | First name (synced from Entra ID given_name) |
| lastName | String | not null | Last name (synced from Entra ID family_name) |
| displayName | String | nullable | Display name from Entra ID (primary display in UI if present) |
| avatar | String | nullable | Avatar URL (uploaded in platform, not from Entra ID) |
| role | Enum | not null | SuperAdmin, Admin, Manager, LearningExpert, TeamManager, TeamMember, TeamIntern |
| status | Enum | not null | pending, active, suspended, inactive |
| department | String | nullable | Department name (synced from Entra ID) |
| jobTitle | String | nullable | Job title (synced from Entra ID jobTitle) |
| officeLocation | String | nullable | Office location (synced from Entra ID officeLocation) |
| preferredLanguage | String | nullable | Preferred language (e.g., "fr-FR", "en-US", from Entra ID) |
| timezone | String | not null, default "Africa/Tunis" | IANA timezone string (e.g. "Africa/Tunis", "Europe/Paris"). Stored server-side. Used for all date boundary calculations. |
| entraAccountEnabled | Boolean | nullable | Entra ID accountEnabled flag (false = suspend user) |
| entraGroups | JSONB | nullable | Cached Entra ID group memberships: [{"id": "group-uuid", "displayName": "grp-name"}] |
| managerEntraOid | String | nullable | Entra ID OID of this user's manager |
| lastEntraSync | DateTime | nullable | Timestamp of last successful Entra ID data sync |
| bio | Text | nullable | User biography (managed in platform) |
| skills | String[] | default [] | Array of skill names (managed in platform) |
| createdAt | DateTime | not null | Creation timestamp |
| updatedAt | DateTime | not null | Last update timestamp |

**Relationships:**
- Many-to-One: Tenant (nullable for SuperAdmin)
- One-to-Many: Enrollments, UserProgress, XPTransactions, Badges, TeamMemberships, UserGoals, ChatMessages

**SuperAdmin Properties:**
- `tenantId = NULL` (no tenant scope)
- `authProvider = local` only (never Azure Entra ID)
- `status = active` always (cannot be suspended)
- Only one SuperAdmin exists (partial unique index on role='SuperAdmin')
- Created exclusively via the setup wizard — no endpoint creates SuperAdmin after setup

**Entra ID Field Mapping Notes:**
| Entra ID Claim/Field | Platform User Field |
|---------------------|------------------|
| oid | entraOid |
| mail / userPrincipalName | entraEmail |
| given_name | firstName |
| family_name | lastName |
| displayName | displayName |
| department | department |
| jobTitle | jobTitle |
| officeLocation | officeLocation |
| preferredLanguage | preferredLanguage |
| accountEnabled | entraAccountEnabled |
| memberOf (via /users/{oid}/memberOf) | entraGroups |
| manager.id (via /users/{oid}/manager) | managerEntraOid |

**Fields NOT synced from Entra ID (platform-exclusive):**
- id (platform UUID, independent)
- role (assigned by role mapping rules or manual override)
- status (managed by platform logic)
- onboarded (managed by onboarding wizard)
- authProvider (set at creation)
- tenantId (resolved once at first login)
- avatar (uploaded in platform)
- bio (platform profile)
- skills (platform-managed)
- passwordHash (null for azure_entra users)

---

### 2.2 Course
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| tenantId | UUID | FK → Tenant, not null | Tenant (company) this course belongs to |
| title | String | not null | Course title |
| description | Text | nullable | Course description |
| thumbnail | String | nullable | Thumbnail URL |
| category | String | not null | Course category |
| difficulty | Enum | not null | beginner, intermediate, advanced |
| duration | Int | not null | Total duration in minutes |
| isPublished | Boolean | default false | Published status |
| isMandatory | Boolean | default false | Mandatory for all users |
| authorId | UUID | FK → User | Course creator |
| createdAt | DateTime | not null | Creation timestamp |
| updatedAt | DateTime | not null | Last update timestamp |
| memoryBankId | String | nullable | Hindsight bank ID associated with this course for semantic recall |

**Relationships:**
- Many-to-One: Tenant
- One-to-Many: Modules, Enrollments

---

### 2.3 Module
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| courseId | UUID | FK → Course | Parent course |
| title | String | not null | Module title |
| description | Text | nullable | Module description |
| order | Int | not null | Display order |
| createdAt | DateTime | not null | Creation timestamp |

**Relationships:**
- Many-to-One: Course
- One-to-Many: Lessons, Assessments

---

### 2.4 Lesson
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| moduleId | UUID | FK → Module | Parent module |
| title | String | not null | Lesson title |
| content | Text | not null | Lesson content (Markdown) |
| contentType | Enum | not null | text, video, quiz |
| duration | Int | not null | Duration in minutes |
| order | Int | not null | Display order |
| createdAt | DateTime | not null | Creation timestamp |

**Relationships:**
- Many-to-One: Module
- One-to-Many: UserProgress

**Storage Rule:** Official lesson structure and publishable lesson data live in PostgreSQL. Large files and generated assets referenced by lessons live in MinIO. Hindsight may store semantic knowledge about the lesson, but not the authoritative lesson row itself.

---

### 2.5 Assessment
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| moduleId | UUID | FK → Module | Parent module |
| title | String | not null | Assessment title |
| passingScore | Int | not null | Minimum score to pass (%) |
| timeLimit | Int | nullable | Time limit in minutes |
| createdAt | DateTime | not null | Creation timestamp |

**Relationships:**
- Many-to-One: Module
- One-to-Many: Questions, AssessmentAttempts

---

### 2.6 Question
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| assessmentId | UUID | FK → Assessment | Parent assessment |
| text | Text | not null | Question text |
| type | Enum | not null | multiple_choice, true_false |
| options | JSON | not null | Array of options |
| correctAnswer | String | not null | Correct option ID |
| points | Int | not null | Points for correct answer |
| order | Int | not null | Display order |

**Relationships:**
- Many-to-One: Assessment

---

### 2.7 Enrollment
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | Enrolled user |
| courseId | UUID | FK → Course | Enrolled course |
| enrolledAt | DateTime | not null | Enrollment timestamp |
| deadline | DateTime | nullable | Assignment deadline |
| isMandatory | Boolean | default false | Mandatory assignment |
| completedAt | DateTime | nullable | Completion timestamp |
| status | Enum | not null | in_progress, completed, dropped |

**Relationships:**
- Many-to-One: User, Course
- Unique constraint: (userId, courseId)

---

### 2.8 UserProgress
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | User |
| lessonId | UUID | FK → Lesson | Lesson |
| status | Enum | not null | not_started, in_progress, completed |
| completedAt | DateTime | nullable | Completion timestamp |
| timeSpent | Int | default 0 | Time spent in seconds |
| videoProgressId | UUID | FK → VideoProgress, nullable | Video progress tracking |
| textProgressId | UUID | FK → TextProgress, nullable | Text progress tracking |

**Relationships:**
- Many-to-One: User, Lesson, VideoProgress, TextProgress
- Unique constraint: (userId, lessonId)

---

### 2.9 AssessmentAttempt
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | User |
| assessmentId | UUID | FK → Assessment | Assessment |
| score | Int | not null | Score achieved |
| passed | Boolean | not null | Pass/fail status |
| answers | JSON | not null | User answers |
| startedAt | DateTime | not null | Start timestamp |
| completedAt | DateTime | not null | Completion timestamp |

**Relationships:**
- Many-to-One: User, Assessment

---

### 2.10 Certificate
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| certificateNumber | String | unique, not null | Format: CERT-{YEAR}-{RANDOM_8} |
| userId | UUID | FK → User | Certificate recipient |
| courseId | UUID | FK → Course | Course completed |
| enrollmentId | UUID | FK → Enrollment | Related enrollment |
| learnerName | String | not null | SNAPSHOT at issue time, immutable |
| courseTitle | String | not null | SNAPSHOT at issue time, immutable |
| courseVersion | String | not null | SNAPSHOT at issue time, immutable |
| issuingOrg | String | not null | SNAPSHOT at issue time, immutable |
| issuedAt | DateTime | not null | Issue timestamp |
| expiresAt | DateTime | nullable | Expiration timestamp |
| contentHash | String | not null | SHA-256 of canonical JSON |
| signature | String | not null | HMAC-SHA256 signed with CERTIFICATE_SECRET_KEY |
| pdfUrl | String | nullable | MinIO storage path |
| isRevoked | Boolean | default false | Revocation status |
| revokedAt | DateTime | nullable | Revocation timestamp |
| revokedReason | String | nullable | Reason for revocation |

**Relationships:**
- Many-to-One: User, Course, Enrollment
- Unique constraint: certificateNumber

**Important:** learnerName, courseTitle, courseVersion, issuingOrg are captured at certificate issue time and are IMMUTABLE. They must never be updated even if user or course data changes.

---

### 2.10b Certificate Security Addendum (Supersedes HMAC Notes)

The certificate model must support RSA-based verification in addition to the existing display fields.

**Additional / revised fields required for secure verification:**
- `certificateId` (UUID, primary verification identifier if different from public display number)
- `grade` (String, nullable)
- `score` (Float, nullable)
- `status` (Enum: issued, revoked)
- `payloadJson` (JSONB, canonical signed payload)
- `signature` (Text, RS256 signature over canonical payload)
- `qrCodeUrl` (String, nullable)

**Behavioral rules:**
- `payloadJson` contains the immutable verification snapshot
- `signature` is verified with `CERT_PUBLIC_KEY`
- Revocation is represented by status + revokedAt + revokedReason
- Public verification attempts are logged in a dedicated audit table

### 2.10c CertificateVerificationAudit
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| certificateId | UUID | FK â†’ Certificate | Verified certificate |
| ipAddress | String | not null | Request IP |
| verifiedAt | DateTime | not null | Attempt timestamp |
| result | Enum | not null | valid, invalid, expired, revoked, not_found |
| message | String | nullable | Detail such as "Signature mismatch" |

**Relationships:**
- Many-to-One: Certificate

---

### 2.11 VideoProgress
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | User |
| lessonId | UUID | FK → Lesson | Lesson |
| enrollmentId | UUID | FK → Enrollment | Related enrollment |
| watchedSegments | JSONB | not null | List of [start, end] float pairs |
| watchPercent | Float | not null | Calculated from merged segments |
| lastPosition | Float | not null | Last playback position in seconds |
| startedAt | DateTime | not null | Start timestamp |
| completedAt | DateTime | nullable | Completion timestamp |
| status | Enum | not null | not_started, in_progress, completed |
| hasGaps | Boolean | default false | True if skips > 30s detected |
| isFlagged | Boolean | default false | True if integrity checks failed |
| flagReason | String | nullable | Reason for flag |

**Relationships:**
- Many-to-One: User, Lesson, Enrollment

---

### 2.12 TextProgress
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | User |
| lessonId | UUID | FK → Lesson | Lesson |
| enrollmentId | UUID | FK → Enrollment | Related enrollment |
| activeReadingTime | Int | default 0 | Seconds of focused tab time |
| maxScrollDepth | Float | default 0.0 | 0.0 to 1.0 scroll depth |
| status | Enum | not null | not_started, in_progress, completed |
| completedAt | DateTime | nullable | Completion timestamp |

**Relationships:**
- Many-to-One: User, Lesson, Enrollment

---

## 3. Gamification Entities

### 3.1 XPTransaction
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | User |
| amount | Int | not null | XP amount (+/-) |
| reason | String | not null | Reason (course_complete, lesson_complete, etc.) |
| createdAt | DateTime | not null | Transaction timestamp |

**Relationships:**
- Many-to-One: User

---

### 3.2 UserLevel
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | User |
| level | Int | not null | Current level |
| totalXP | Int | not null | Total XP earned |
| createdAt | DateTime | not null | Creation timestamp |
| updatedAt | DateTime | not null | Last update timestamp |

**Relationships:**
- Many-to-One: User
- Unique constraint: userId

---

### 3.3 BadgeDefinition
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| name | String | unique, not null | Badge name |
| description | Text | not null | Badge description |
| icon | String | not null | Badge icon URL |
| xpReward | Int | not null | XP reward |
| criteria | JSON | not null | Criteria for earning |
| createdAt | DateTime | not null | Creation timestamp |

---

### 3.4 UserBadge
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | User |
| badgeId | UUID | FK → BadgeDefinition | Badge |
| earnedAt | DateTime | not null | Earned timestamp |

**Relationships:**
- Many-to-One: User, BadgeDefinition
- Unique constraint: (userId, badgeId)

---

### 3.5 UserStreak
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | User |
| currentStreak | Int | default 0 | Current streak days |
| longestStreak | Int | default 0 | Longest streak |
| lastActivityDate | Date | nullable | Last activity |
| createdAt | DateTime | not null | Creation timestamp |
| updatedAt | DateTime | not null | Last update timestamp |

**Relationships:**
- Many-to-One: User
- Unique constraint: userId

---

### 3.6 Leaderboard
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| type | Enum | not null | global, team, weekly |
| period | String | not null | Time period (e.g., "2024-W01") |
| userId | UUID | FK → User | User |
| rank | Int | not null | Rank position |
| xp | Int | not null | XP in period |
| updatedAt | DateTime | not null | Last update timestamp |

**Relationships:**
- Many-to-One: User

---

## 4. Team & Goal Entities

### 4.1 Team
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| tenantId | UUID | FK → Tenant, not null | Tenant (company) this team belongs to |
| name | String | not null | Team name |
| description | Text | nullable | Team description |
| managerId | UUID | FK → User | Team manager |
| createdAt | DateTime | not null | Creation timestamp |
| updatedAt | DateTime | not null | Last update timestamp |

**Relationships:**
- Many-to-One: Tenant
- One-to-Many: TeamMemberships, TeamGoals

---

### 4.2 TeamMembership
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | User |
| teamId | UUID | FK → Team | Team |
| role | Enum | not null | manager, member |
| joinedAt | DateTime | not null | Join timestamp |

**Relationships:**
- Many-to-One: User, Team
- Unique constraint: (userId, teamId)

---

### 4.3 UserGoal
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | User |
| title | String | not null | Goal title |
| description | Text | nullable | Goal description |
| targetDate | Date | nullable | Target completion date |
| progress | Int | default 0 | Progress percentage |
| status | Enum | not null | active, completed, cancelled |
| createdAt | DateTime | not null | Creation timestamp |
| updatedAt | DateTime | not null | Last update timestamp |

**Relationships:**
- Many-to-One: User

---

### 4.4 TeamGoal
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| teamId | UUID | FK → Team | Team |
| title | String | not null | Goal title |
| description | Text | nullable | Goal description |
| targetDate | Date | nullable | Target completion date |
| progress | Int | default 0 | Progress percentage |
| status | Enum | not null | active, completed, cancelled |
| createdById | UUID | FK → User | Created by |
| createdAt | DateTime | not null | Creation timestamp |
| updatedAt | DateTime | not null | Last update timestamp |

**Relationships:**
- Many-to-One: Team, User

---

## 5. AI & Chat Entities

### 5.1 ChatConversation
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | User |
| courseId | UUID | FK → Course, nullable | Related course |
| title | String | not null | Conversation title |
| agnoThreadId | String | nullable | AGNO thread ID for session resumption |
| createdAt | DateTime | not null | Creation timestamp |
| updatedAt | DateTime | not null | Last update timestamp |

**Relationships:**
- Many-to-One: User, Course
- One-to-Many: ChatMessages

---

### 5.2 ChatMessage
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| conversationId | UUID | FK → ChatConversation | Conversation |
| role | Enum | not null | user, assistant |
| content | Text | not null | Message content |
| metadata | JSON | nullable | Token usage, model used, etc. |
| createdAt | DateTime | not null | Creation timestamp |

**Relationships:**
- Many-to-One: ChatConversation

---

### 5.3 UserMemory (Hindsight Memory)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | User |
| memoryId | String | not null | Hindsight memory ID |
| content | Text | not null | Memory content |
| memoryType | Enum | not null | interaction, preference, progress, struggle |
| importanceScore | Float | default 0.5 | 0-1 importance for retrieval |
| createdAt | DateTime | not null | Creation timestamp |

**Relationships:**
- Many-to-One: User

**Note:** Vector storage is managed internally by Hindsight (retain/recall/reflect). No manual pgvector embeddings needed.

---

### 5.3b CourseMemoryBank (NEW)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| tenantId | UUID | FK → Tenant, not null | Owning tenant |
| courseId | UUID | FK → Course, not null | Linked official course |
| bankId | String | unique, not null | Hindsight memory bank ID |
| status | Enum | not null | active, archived |
| createdAt | DateTime | not null | Creation timestamp |
| updatedAt | DateTime | not null | Last sync/update timestamp |

**Purpose:** Links the official PostgreSQL course record to its Hindsight semantic memory bank.

---

### 5.3c CourseMemorySyncLog (NEW)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| courseId | UUID | FK → Course | Related course |
| bankId | String | not null | Hindsight bank target |
| syncType | Enum | not null | initial_retain, update_retain, reflection_snapshot |
| payloadSummary | JSON | nullable | Summary of what was retained |
| triggeredById | UUID | FK → User, nullable | Learning Expert or system actor |
| createdAt | DateTime | not null | Sync timestamp |

**Purpose:** Audits what official course knowledge was retained into Hindsight and when.

---

### 5.3d CourseGenerationRun (NEW)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| tenantId | UUID | FK → Tenant, not null | Tenant scope |
| courseId | UUID | FK → Course, nullable | Linked official course once persisted |
| sourceType | Enum | not null | pdf, brief, mixed |
| sourceFilePath | String | nullable | MinIO path or uploaded source reference |
| prompt | Text | not null | Learning Expert prompt/brief |
| finalDraftPath | String | nullable | Path to exported finalized package during transition phase |
| status | Enum | not null | pending, generated, approved, persisted, published |
| createdById | UUID | FK → User | Learning Expert |
| createdAt | DateTime | not null | Creation timestamp |
| updatedAt | DateTime | not null | Last update timestamp |

**Purpose:** Tracks the lifecycle from AI generation to official PostgreSQL persistence.

---

### 5.4 UserRecommendation
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | User |
| courseId | UUID | FK → Course, nullable | Recommended course |
| reason | Text | not null | Recommendation reason |
| score | Float | not null | Relevance score |
| confidence | Float | nullable | Confidence score from bandit |
| generatedAt | DateTime | not null | Generation timestamp |

**Relationships:**
- Many-to-One: User, Course

---

### 5.5 AgentWorkflow (AGNO Workflow State)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| workflowId | String | not null | AGNO workflow ID |
| agentType | Enum | not null | coaching, recommendation, gamification, coursemaker, librarian, skillgap |
| workflowData | JSON | not null | Serialized workflow state |
| status | Enum | not null | running, completed, failed |
| createdAt | DateTime | not null | Creation timestamp |
| updatedAt | DateTime | not null | Last update timestamp |

---

### 5.6 ContentChunk (Librarian Ingestion)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| sourceId | UUID | FK → ContentSource | Source document |
| chunkIndex | Int | not null | Chunk order |
| content | Text | not null | Chunk text |
| metadata | JSON | not null | { pageNumber, sectionTitle, contentType, qualityScore } |
| createdAt | DateTime | not null | Creation timestamp |

**Relationships:**
- Many-to-One: ContentSource

**Note:** Semantic search is handled by Hindsight recall(). No manual pgvector embeddings needed.

---

### 5.7 ContentSource (Librarian Ingestion)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| title | String | not null | Source title |
| sourceType | Enum | not null | pdf, docx, text, audio, video, url |
| url | String | nullable | URL if web content |
| filePath | String | nullable | MinIO object path (S3-compatible) |
| status | Enum | not null | pending, processing, indexed, failed |
| contentHash | String | not null | SHA256 for change detection |
| lastIndexed | DateTime | nullable | Last ingestion timestamp |
| createdAt | DateTime | not null | Creation timestamp |

---

### 5.8 KnowledgeGraph (Librarian KG Extraction)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| subject | String | not null | Entity subject |
| relation | String | not null | Relation type |
| object | String | not null | Entity object |
| sourceChunkId | UUID | FK → ContentChunk | Source chunk |
| confidence | Float | not null | Extraction confidence |
| createdAt | DateTime | not null | Creation timestamp |

**Relationships:**
- Many-to-One: ContentChunk

---

## 6. Analytics Entities

### 6.1 UserSkillProgress
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | User |
| skillName | String | not null | Skill name |
| proficiencyLevel | Float | not null | 0.0 - 1.0 |
| evidenceType | Enum | not null | quiz, behavior, cv, selfassess |
| confidenceInterval | JSON | nullable | [lower, upper] 95% CI |
| lastAssessed | DateTime | not null | Last assessment |
| createdAt | DateTime | not null | Creation timestamp |
| updatedAt | DateTime | not null | Last update timestamp |

**Relationships:**
- Many-to-One: User

---

### 6.2 Skill
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| name | String | unique, not null | Skill name |
| description | Text | nullable | Skill description |
| category | String | not null | Skill category |
| escoCode | String | nullable | ESCO taxonomy code |
| createdAt | DateTime | not null | Creation timestamp |

**Relationships:**
- One-to-Many: SkillEdges (from), SkillEdges (to)

---

### 6.3 SkillEdge
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| fromSkillId | UUID | FK → Skill | Source skill |
| toSkillId | UUID | FK → Skill | Target skill |
| edgeType | Enum | not null | prerequisite, complementary, leads_to_role |
| weight | Float | default 1.0 | Edge weight for path finding |
| createdAt | DateTime | not null | Creation timestamp |

**Relationships:**
- Many-to-One: Skill (from), Skill (to)

---

### 6.4 SkillGap
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | User |
| skillId | UUID | FK → Skill | Gap skill |
| severityScore | Float | not null | 0-1 severity |
| blockingPower | Float | not null | How much it blocks progression |
| estimatedHoursToClose | Float | not null | Estimated hours to master |
| status | Enum | not null | active, resolved, ignored |
| shapExplanation | JSON | nullable | SHAP attribution explanation |
| createdAt | DateTime | not null | Creation timestamp |
| resolvedAt | DateTime | nullable | Resolution timestamp |

**Relationships:**
- Many-to-One: User, Skill

---

### 6.5 AssessmentItem (CAT Question Bank)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| skillId | UUID | FK → Skill | Related skill |
| text | Text | not null | Question text |
| type | Enum | not null | multiple_choice, true_false |
| options | JSON | not null | Array of options |
| correctAnswer | String | not null | Correct option ID |
| irtDifficulty | Float | not null | IRT difficulty parameter (b) |
| irtDiscrimination | Float | not null | IRT discrimination parameter (a) |
| irtGuessing | Float | not null | IRT guessing parameter (c) |
| createdAt | DateTime | not null | Creation timestamp |

**Relationships:**
- Many-to-One: Skill

---

### 6.6 AssessmentAttempt (CAT)
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | User |
| skillId | UUID | FK → Skill | Target skill |
| thetaEstimate | Float | not null | Current theta estimate |
| standardError | Float | not null | SE of theta estimate |
| questionsUsed | Int | not null | Number of questions answered |
| completedAt | DateTime | not null | Completion timestamp |

**Relationships:**
- Many-to-One: User, Skill

---

### 6.7 CourseAnalytics
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | User |
| skillName | String | not null | Skill name |
| proficiencyLevel | Float | not null | 0.0 - 1.0 |
| lastAssessed | DateTime | not null | Last assessment |
| createdAt | DateTime | not null | Creation timestamp |
| updatedAt | DateTime | not null | Last update timestamp |

**Relationships:**
- Many-to-One: User

---

### 6.2 CourseAnalytics
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| courseId | UUID | FK → Course | Course |
| totalEnrollments | Int | default 0 | Total enrollments |
| completions | Int | default 0 | Completion count |
| avgRating | Float | nullable | Average rating |
| avgTimeToComplete | Int | nullable | Average completion time |
| updatedAt | DateTime | not null | Last update timestamp |

**Relationships:**
- Many-to-One: Course

---

## 7. Notification Entities

### 7.1 Notification
| Field | Type | Constraints | Description |
|-------|------|-------------|-------------|
| id | UUID | PK | Unique identifier |
| userId | UUID | FK → User | Recipient |
| type | Enum | not null | goal_achieved, badge_earned, course_completed, etc. |
| title | String | not null | Notification title |
| message | Text | not null | Notification message |
| isRead | Boolean | default false | Read status |
| createdAt | DateTime | not null | Creation timestamp |

**Relationships:**
- Many-to-One: User

---

## 8. Enums Summary

```typescript
enum UserRole {
  SuperAdmin  // Platform-wide, no tenant
  Admin      // Tenant Admin
  Manager
  LearningExpert
  TeamManager
  TeamMember
  TeamIntern
}

enum TenantStatus {
  active
  suspended
  pending
}

enum UserStatus {
  pending
  active
  suspended
  inactive
}

enum AuthProvider {
  azure_entra
  local
}

enum CourseDifficulty {
  beginner
  intermediate
  advanced
}

enum ContentType {
  text
  video
  quiz
}

enum LessonStatus {
  not_started
  in_progress
  completed
}

enum EnrollmentStatus {
  in_progress
  completed
  dropped
}

enum ProgressStatus {
  not_started
  in_progress
  completed
}

enum QuestionType {
  multiple_choice
  true_false
}

enum BadgeType {
  achievement
  milestone
  streak
}

enum GoalStatus {
  active
  completed
  cancelled
}

enum NotificationType {
  goal_achieved
  badge_earned
  course_completed
  streak_milestone
  team_update
}

enum CertificateStatus {
  issued
  revoked
}

enum CertificateVerificationResult {
  valid
  invalid
  expired
  revoked
  not_found
}

// AI Agent Enums

enum AgentType {
  coaching
  recommendation
  gamification
  coursemaker
  librarian
  skillgap
}

enum MemoryType {
  interaction
  preference
  progress
  struggle
}

enum ContentSourceType {
  pdf
  docx
  text
  audio
  video
  image
  slide
  url
}

enum ContentSourceStatus {
  pending
  processing
  indexed
  failed
}

enum EvidenceType {
  quiz
  behavior
  cv
  selfassess
}

enum SkillEdgeType {
  prerequisite
  complementary
  leads_to_role
}

enum SkillGapStatus {
  active
  resolved
  ignored
}
```

---

*Generated for PFE Project: Enterprise AI-Driven Upskilling & Mentorship Platform*
*Author: Aya Telmoudi | Supervisor: Hazem Raouafi*
