# SPEC-1: Functional Requirements

## Project: Enterprise AI-Driven Upskilling & Mentorship Platform

This document outlines all functional requirements for the platform, organized by module/domain. Requirements are marked as MVP, Nice-to-Have, or Out of Scope.

---

## 0. Platform Bootstrap / First-Run Setup

### FR-000: Platform First-Run Setup Wizard
- **Actor:** Super Admin (first-time deployer)
- **Action:** Configure platform, create Super Admin account, configure 3S Group, set up first company via guided wizard
- **Outcome:** Platform configured and operational; Super Admin can log in
- **Priority:** MVP
- **Implementation Details:**
  - **Bootstrap Detection:** On fresh database (no Super Admin exists), all routes blocked except `/setup/*`
  - **system_config Table:** Single-row table with `setup_completed = false` initially
  - **Setup Endpoints (public but X-Setup-Key protected):**
    - GET `/api/setup/status` — Returns `{ setup_completed: bool }` (no key needed)
    - POST `/api/setup/admin` — Create Super Admin account (name, email, password)
    - POST `/api/setup/group` — Configure 3S Group (name, logo, website, primary_color, timezone, support_email)
    - POST `/api/setup/platform` — **DEPRECATED** — Group config moved to Step 3
    - POST `/api/setup/tenant` — Create first company (tenant with domain)
    - POST `/api/setup/complete` — Mark setup_completed=true, publish event
  - **SETUP_SECRET_KEY:** Env variable required to protect setup endpoints (fail-fast if not set)
  - **Once Complete:** Setup endpoints return HTTP 410 Gone permanently
  - **RabbitMQ Event:** `platform.setup.completed` published on completion
  - **SuperAdmin Role:** Above Admin in hierarchy; tenantId=null; authProvider=local only; never uses Azure Entra ID

> **🔴 CRITICAL ARCHITECTURE NOTE:**
> The Super Admin is a **platform-level identity** (3S Group level), NOT a company employee. He must NEVER authenticate through Azure Entra ID. His account lives exclusively in the platform's PostgreSQL database with `authProvider = local`. Azure Entra ID is configured **per company** (per tenant) for that company's employees only.

### FR-000h: OrganizationGroup Configuration (3S Group Entity)
- **Actor:** Super Admin (during setup wizard Step 3)
- **Action:** Configure the parent holding entity above all companies
- **Outcome:** 3S Group stored as platform-level identity; appears in platform branding
- **Priority:** MVP
- **Implementation Details:**
  - **Storage:** Fields stored in `system_config` table (or dedicated OrganizationGroup table)
  - **Fields:**
    - `group_name` — Full name (e.g., "3S Group")
    - `group_logo_url` — Uploaded to MinIO
    - `group_website` — URL (e.g., "https://www.3s.com.tn")
    - `group_primary_color` — Brand color hex
    - `default_timezone` — "Africa/Tunis" default
    - `support_email` — Group-level support contact
    - `platform_name` — Display name (e.g., "SkillForge by 3S Group")
  - **UI in Setup Wizard:** Step 3 — "Configure Your Organization" with drag-and-drop logo upload
  - **Usage:** Appears in browser tab title, emails, certificates, platform footer
  - **CRITICAL:** This is the parent of all tenants (companies). 3S, Advancia, Smart UP, Global Net are its subsidiaries.

### FR-000c: Super Admin First-Login Getting Started Checklist
- **Actor:** Super Admin (first login after setup wizard)
- **Action:** View platform readiness checklist on first login
- **Outcome:** Clear guidance on what needs to be done to get platform operational
- **Priority:** MVP
- **Implementation Details:**
  - **Trigger:** `system_config.superadmin_onboarded = false` on first Super Admin login
  - **Checklist Items (stored in system_config JSONB):**
    1. ✅ Platform configured (auto-checked after setup wizard)
    2. ✅ First tenant created (auto-checked after setup wizard)
    3. ⬜ Assign a Tenant Admin to each company
    4. ⬜ Configure Azure Entra ID per tenant (entraIdConfig)
    5. ⬜ Set seat limits per tenant
    6. ⬜ Invite/create first users per tenant
  - **Display Rule:** Checklist visible on `/superadmin/dashboard` until all steps complete
  - **Auto-Check Logic:**
    - Step 1: Checked when `setup_completed = true`
    - Step 2: Checked when first tenant exists with status = active
    - Step 3: Checked when every tenant has at least one admin assigned
    - Step 4: Checked when every tenant has `entraIdConfig` populated
    - Step 5: Checked when every tenant has `seat_limit` set (or unlimited)
    - Step 6: Checked when every tenant has at least 1 user
  - **Persistence:** Checkbox states stored in `system_config.superadmin_checklist` (JSONB)
  - **Dismissal:** Once all steps complete, checklist disappears permanently (tracked via `superadmin_onboarded = true`)

### FR-000d: Super Admin Dashboard — Full Widget Specification
- **Actor:** Super Admin
- **Action:** View comprehensive platform overview with actionable widgets
- **Outcome:** At-a-glance platform health + quick actions for tenant management
- **Priority:** MVP
- **Implementation Details:**

**Row 1 — Stats Cards (4 cards):**
1. **Total Tenants:** Display format: "X active / Y suspended" with breakdown badges
2. **Total Users:** Aggregate user count across all tenants
3. **Platform Health:** Percentage of healthy services with color coding (green >90%, yellow 70-90%, red <70%)
4. **Total Courses:** Aggregate course count across all tenants

**Row 2 — Main Content (2/3) + Sidebar (1/3):**

*Left Column (2/3):*

**Tenant Activity Table:**
- Columns: Tenant Name, User Count, Active Users (last 7 days), Admin Assigned (Yes/No), Azure Entra ID Configured (Yes/No), Status Badge
- Actions per row: "Manage" button → navigates to `/superadmin/tenants/[id]`
- Sortable by any column

**Getting Started Checklist:**
- Only shown when `system_config.superadmin_onboarded = false`
- Collapsible card with checkbox items as defined in FR-000c
- Visual progress indicator (X/6 steps complete)
- Each item clickable → navigates to relevant configuration page

*Right Column (1/3):*

**Quick Actions Card:**
- Buttons: "Create New Tenant", "Assign Tenant Admin", "View Cross-Tenant Analytics", "Platform Settings"
- Icon + label per button, grid layout (2x2)

**Platform Alerts Card:**
- Warning alerts displayed as cards with icons:
  - "X tenants have no admin assigned"
  - "X tenants have no Entra ID config"
  - "Seat limit reached: [Tenant Name]"
- Color-coded by severity (red for critical, yellow for warning)

### FR-000e: Platform Settings Page — Full Specification
- **Actor:** Super Admin
- **Action:** Configure global platform settings via tabbed interface
- **Outcome:** Centralized platform configuration management
- **Priority:** MVP
- **Route:** `/superadmin/settings`

**Tabs:**

1. **General Tab:**
   - Platform Name (Input)
   - Logo Upload (drag & drop)
   - Support Email (Input, email)
   - Default Timezone (Select dropdown, IANA strings)
   - Platform Language (Select: English, French, Arabic)
   - "Save Changes" button

2. **Security Tab:**
   - JWT Expiry Configuration (Input: minutes, default 15)
   - Session Timeout (Input: hours, default 8)
   - Setup Key Rotation Reminder (toggle + last rotated date display)
   - Rate Limit Settings (requests per minute, default 100)
   - "Save Security Settings" button

3. **Notifications Tab:**
   - Default Email Templates Toggle (on/off per template)
   - SMTP Configuration: Host, Port, Username, Password, From Address, Use TLS toggle
   - "Test Email" button
   - "Save Notification Settings" button

4. **AI & Agents Tab:**
   - GROQ API Key: Masked display (last 4 chars visible), "Update Key" button
   - Demo Mode Toggle (when disabled, uses pre-defined AI responses)
   - Agent Enable/Disable Toggles per feature:
     - Chat Coach AI
     - Recommendation AI
     - Gamification AI
     - Course Maker AI
     - Content Librarian AI
     - Skill Gap Analyzer AI
   - "Save Agent Settings" button

5. **Danger Zone Tab:**
   - Red-bordered container
   - Actions:
     - "Reset Platform" — Wipes all data, re-triggers setup wizard
     - "Export All Data" — Downloads JSON/CSV dump of all platform data
   - Confirmation modal required for destructive actions

### FR-000f: Tenant Detail Page — Guided Setup Flow
- **Actor:** Super Admin
- **Action:** View tenant-specific setup progress and configuration
- **Outcome:** Clear per-tenant health view with actionable CTAs
- **Priority:** MVP
- **Route:** `/superadmin/tenants/[id]`

**Setup Progress Section (top of page):**
- 4-step progress indicator with completion status:

1. **Azure Entra ID:** 
   - Status: "Configured" (green check) or "Not Configured" (red X)
   - CTA: "Configure" button → opens Entra ID config modal

2. **Tenant Admin:**
   - Status: "Assigned" (green check + admin name) or "Not Assigned" (red X)
   - CTA: "Assign Admin" button → navigates to admin assignment

3. **Seat Limit:**
   - Status: "Set: X seats" (green) or "Unlimited" (yellow) or "Not Set" (red)
   - CTA: "Set Limit" button → opens seat limit modal

4. **First Users:**
   - Status: "X users" (green) or "No users yet" (red)
   - CTA: "Invite Users" button → navigates to user invitation

- Overall tenant health score (0-100) based on setup completion
- Visual progress bar showing setup completion percentage

### FR-000g: Post-Setup Redirect Logic
- **Actor:** System (on setup wizard completion)
- **Action:** Orchestrate user flow after setup wizard completes
- **Outcome:** Seamless transition from setup to login to dashboard with checklist
- **Priority:** MVP
- **Implementation Details:**

**Backend (POST /api/setup/complete):**
1. Mark `setup_completed = true` in system_config
2. Publish `platform.setup.completed` event to RabbitMQ
3. Return success response with redirect URL

**Frontend (on POST /api/setup/complete success):**
1. Show 3-second success animation with message: "Platform is live! 🎉"
2. After animation, redirect to `/superadmin/login`

**Post-Login Flow:**
1. On Super Admin login (POST /auth/login/local returns JWT):
   - Check `system_config.superadmin_onboarded`
   - If `false`: redirect to `/superadmin/dashboard` with Getting Started checklist visible
   - Checklist should have a highlight/animation to draw attention
2. On first checklist completion (all 6 steps checked):
   - Set `system_config.superadmin_onboarded = true`
   - Checklist disappears from dashboard

**Middleware Update (Three-State):**
- State 1: `setup_completed = false` → Redirect to `/setup`
- State 2: `setup_completed = true` AND `user.onboarded = false` → Redirect to `/onboarding`
- State 3: Normal operation (added below)
- State 3b (NEW): Super Admin with `superadmin_onboarded = false` → Show Getting Started checklist on dashboard

---

## 1. Authentication & User Management

### FR-001: Enterprise User Provisioning (Azure Entra ID)
- **Actor:** HR Admin / Manager
- **Action:** Create user accounts via Azure Entra ID admin portal
- **Outcome:** Employee accounts provisioned with corporate credentials
- **Priority:** MVP
- **Note:** No public self-registration - B2B enterprise model. Users are scoped to their Tenant (company). Azure Entra ID app registration is per-tenant.

### FR-001b: Multi-Tenant Data Isolation
- **Actor:** System
- **Action:** Enforce strict data isolation between tenants using PostgreSQL Row-Level Security (RLS)
- **Outcome:** Users can only access data from their own tenant; cross-tenant access attempts rejected
- **Priority:** MVP
- **Implementation Details:**
  - Every tenant-scoped table has tenant_id UUID NOT NULL FK → Tenant
  - SQLAlchemy session middleware injects tenant_id into all queries automatically
  - PostgreSQL RLS policies enforce isolation at DB level
  - JWT tokens carry tenantId - API Gateway validates tenant context before routing
  - No data can leak across tenants even if application logic has a bug

### FR-002: Enterprise SSO Authentication (Azure Entra ID)
- **Actor:** Registered employee (Team Member, Manager, Learning Expert, etc.)
- **Action:** Login via Azure Entra ID (OAuth2/OIDC)
- **Outcome:** JWT token issued, session established
- **Priority:** MVP
- **Note:** Only non-admin users authenticate via Azure Entra ID

### FR-002b: Local Admin Authentication
- **Actor:** Platform Administrator
- **Action:** Login with email and password (local credentials)
- **Outcome:** JWT token issued, session established with Admin role
- **Priority:** MVP
- **Note:** Admin accounts are created directly in the platform database (not provisioned via Azure Entra ID). Password is bcrypt hashed (cost factor 12). This enables platform administration independent of Azure Entra ID availability.

### FR-002c: Super Admin Authentication
- **Actor:** Super Admin (3S Group level)
- **Action:** Login with email and password (local credentials, no tenant scope)
- **Outcome:** JWT token issued with tenantId=null, session established with SuperAdmin role
- **Priority:** MVP
- **Note:** Super Admin is platform-wide (not scoped to any tenant). Can access /superadmin endpoints for tenant management and cross-tenant analytics. **NEVER authenticates via Azure Entra ID** — this is explicitly OUT OF SCOPE for Super Admin.

### FR-002d: Tenant Management (Super Admin)
- **Actor:** Super Admin
- **Action:** Create, configure, suspend, and delete tenants (companies)
- **Outcome:** Tenant entity created with name, slug, logoUrl, primaryColor, status, entraIdConfig, seatLimit
- **Priority:** MVP
- **Implementation Details:**
  - Tenant entity: id (UUID), name (display name), slug (URL-safe identifier), logoUrl, primaryColor, status (active/suspended/pending), entraIdConfig (JSON - per-tenant Azure Entra ID app credentials), seatLimit (nullable Int), createdAt, updatedAt, createdBy (FK → User)
  - Each company (3S, Advancia, Smart UP, Global Net) is a separate Tenant
  - Azure Entra ID config is per-tenant - different Entra ID app registration per company
  - Super Admin can assign Tenant Admin per company
  - Soft delete (status=suspended) preserves data for audit trail

### FR-002e: Tenant Admin Management (Super Admin)
- **Actor:** Super Admin
- **Action:** Assign and manage Tenant Admins per company
- **Outcome:** Tenant Admin user has tenantId in JWT, scoped to their company only
- **Priority:** MVP
- **Gov Note:** See FR-002g for complete Super Admin Identity & Access scope.

### FR-002f: Tenant Context Indicator
- **Actor:** Tenant Admin/Manager/All tenant users
- **Action:** View current tenant (company) context in UI
- **Outcome:** Sidebar/topbar shows tenant name and logo, tenant switcher for users with access to multiple tenants
- **Priority:** MVP

### FR-002i: Company Domain (Tenant Email Domain)
- **Actor:** Super Admin (creating a company)
- **Action:** Specify email domain for company (e.g., "3s.com.tn")
- **Outcome:** Platform auto-detects which company's Azure Entra ID config to use when user types email
- **Priority:** MVP
- **Implementation Details:**
  - **Field:** `email_domain` added to Tenant entity (e.g., "3s.com.tn", "advancia.com")
  - **Login Flow:** When user enters email on login page, platform resolves `email_domain` → tenant → tenant's Entra ID config
  - **Fallback:** If domain not found → prompt user to select company manually
  - **Use Case:** Enables automatic company detection without manual selection dropdown

### FR-002j: Admin Invitation Workflow (Invite New Admin)
- **Actor:** Super Admin
- **Action:** Invite a new person as company admin (not yet on platform)
- **Outcome:** Admin account created with temporary password; welcome email sent
- **Priority:** MVP
- **Workflow:**
  1. Super Admin enters: first_name, last_name, email, company (dropdown)
  2. Platform creates User: role=Admin, authProvider=local, status=pending
  3. Generates temporary password OR magic link token
  4. Publishes `admin.invited` event to RabbitMQ
  5. Notification service sends welcome email with password/magic link
  6. Admin clicks link → lands on `/set-password?token=xxx` → sets permanent password
  7. On first login, status transitions to active
- **Note:** Admins are always local accounts (NOT Azure Entra ID). This is the realistic workflow when a new company joins 3S Group.

### FR-002k: Test Azure Entra ID Connection
- **Actor:** Super Admin (configuring company Entra ID)
- **Action:** Verify Entra ID credentials are valid before saving
- **Outcome:** Green/red status indicator; prevents mysterious login errors later
- **Priority:** MVP
- **Implementation Details:**
  - **Endpoint:** POST `/superadmin/tenants/{id}/test-entra`
  - **Input:** tenantId, clientId, clientSecret from tenant's Entra ID registration
  - **Validation:** Call Microsoft Graph API `/organization` endpoint with credentials
  - **Response:** `{ valid: true, tenantName: "3S", error: null }` OR `{ valid: false, error: "Invalid client secret" }`
  - **UI:** "Test Connection" button in Company Detail → Azure Entra ID tab

### FR-002l: Admin Password Set / First-Login Flow
- **Actor:** New invited admin
- **Action:** Set password for the first time via magic link
- **Outcome:** Account activated, can log in with email + password
- **Priority:** MVP
- **Implementation Details:**
  - **Endpoint:** POST `/auth/set-password`
  - **Auth:** One-time-use token in query string or body
  - **Request:** `{ token: "xxx", password: "newpassword" }`
  - **Validation:** Token must be valid, not expired, not used
  - **On Success:** Mark token as used; set user.status=active
  - **Frontend Page:** `/set-password?token=xxx` — password input + confirm + "Set Password" button
  - **Note:** This is DIFFERENT from onboarding wizard. Onboarding is for regular employees (Team Member role). Password set is for Admin accounts ONLY.

### FR-002m: Super Admin Audit Log
- **Actor:** Super Admin
- **Action:** View platform-level audit trail
- **Outcome:** Track all Super Admin actions for compliance
- **Priority:** MVP
- **Implementation Details:**
  - **Endpoint:** GET `/superadmin/audit-log`
  - **Logged Actions:**
    - Company created / updated / suspended
    - Admin invited / revoked / suspended
    - Platform settings changed (SMTP, GROQ key, etc.)
    - Seat limit changes
    - Role mapping rule changes
  - **Fields:** timestamp, actor (Super Admin name), action, target (company/admin name), details, IP
  - **Filters:** date range, action type, target company
  - **UI:** `/superadmin/audit` page with filterable table + export to CSV

### FR-002n: Seat Limit Enforcement
- **Actor:** System (on enrollment)
- **Action:** Prevent enrollment when company seat limit reached
- **Outcome:** Company cannot exceed user limit; prevents surprise bills
- **Priority:** MVP
- **Implementation Details:**
  - **Field:** `seat_limit` on Tenant entity (nullable = unlimited)
  - **Check:** On POST `/enrollments` in Learning Service
    - If tenant.seat_limit IS NOT NULL AND current_user_count >= tenant.seat_limit
    - Return HTTP 403: "Company seat limit reached. Contact your administrator."
  - **Events:** Publish to RabbitMQ:
    - `tenant.seat_limit_warning` at 90% threshold
    - `tenant.seat_limit_reached` at 100% threshold

### FR-002o: Company Suspension Notification
- **Actor:** System (on tenant suspension)
- **Action:** Notify company's admin when company is suspended
- **Outcome:** Admin receives email explaining suspension
- **Priority:** MVP
- **Implementation Details:**
  - **Trigger:** PATCH `/superadmin/tenants/{id}/status` sets status=suspended
  - **Action:** Publish `tenant.suspended` to RabbitMQ auth.exchange
  - **Payload:** `{ tenantId, tenantName, suspendedBy, reason, suspendedAt }`
  - **Notification Service:** Consumes event, sends email to company's admin
  - **Email Template:** "Your company [Name] has been suspended. Reason: [reason]. Contact [Super Admin email] for details."

> **🔴 UI TERMINOLOGY NOTE:**
> The Super Admin-facing UI should use **"Company"** everywhere instead of "Tenant". The underlying database field stays `tenant_id` but:
> - Buttons should say "+ Add Company" (not "+ Add Tenant")
> - Tables should say "Company Name" (not "Tenant Name")
> - This makes the platform feel professional for a business audience like 3S Group.

### FR-003: Role-Based Access Control (RBAC)
- **Actor:** System
- **Action:** Enforce permissions based on user role (7 roles)
- **Outcome:** Users can only access features permitted by their role
- **Priority:** MVP
- **Roles (ordered highest to lowest):**
  - SuperAdmin — Platform-wide (tenantId=null), can access /superadmin/*, create/manage tenants, cross-tenant analytics
  - Admin — Tenant admin, can manage users/courses within tenant
  - Manager — Can manage team members, assign courses
  - LearningExpert — Can create/edit courses
  - TeamManager — Can manage specific team
  - TeamMember — Standard learner
  - TeamIntern — Learner with restricted permissions

### FR-004: User Profile Management
- **Actor:** Any authenticated user
- **Action:** View/edit personal profile (name, avatar, bio, skills, **timezone**)
- **Outcome:** Profile updated and visible to authorized users
- **Priority:** MVP
- **Implementation Details:**
  - User can view and edit their timezone from the Settings → Preferences tab
  - Changing timezone takes effect immediately for all future streak and XP calculations
  - The timezone field is not synced from Azure Entra ID — it is platform-managed

### FR-004b: Onboarding Flow / Guided First-Login Experience
- **Actor:** New user (especially Team Intern)
- **Action:** Complete guided onboarding wizard on first login
- **Outcome:** User guided through profile setup, skill assessment, goal setting, recommended first course — reduced confusion and faster time-to-value
- **Priority:** MVP
- **Implementation Details:**
  - Trigger: On first login (user.onboarded = false), auto-redirect to /onboarding
  - **Step 1 (Welcome):** 
    - Read user.preferredLanguage from JWT or user profile
    - Customize welcome message language if set: fr-FR → French welcome, ar-TN → Arabic welcome, default English
  - Steps (continued):
    2. **Profile Setup** — Confirm name, department, role, select skills of interest from taxonomy **+ TIMEZONE SELECTION (required)**
      - Timezone selector field (IANA timezone dropdown, pre-filled with the platform's system_config.default_timezone, e.g. "Africa/Tunis")
      - The selected timezone is saved to user.timezone in the database via POST /onboarding/step/profile
      - This is a required field — onboarding cannot proceed to Step 3 without a timezone value
      - The frontend should auto-detect the browser's timezone using `Intl.DateTimeFormat().resolvedOptions().timeZone` as the default suggestion, but let the user confirm or change it
    3. **Goal Setting** — Set learning goal (e.g., "Learn Python basics", "Complete compliance training") with deadline
    4. **First Course Recommendation** — AI recommends first course based on role + skills + goals
  - Progress saved between steps (resume if interrupted)
  - Completion marks user.onboarded = true, redirects to dashboard with "Start Learning" CTA
  - Admins can customize onboarding steps per role via config
  - Onboarding steps marked as "system:onboarding" event in RabbitMQ for analytics

### FR-005: User Lifecycle Management
- **Actor:** Admin/Manager
- **Action:** Sync enterprise users from Azure Entra ID, manage user status
- **Outcome:** User status reflects corporate directory
- **Priority:** MVP
- **Note:** Applies to enterprise users only. Admin accounts are managed locally within the platform.

**Complete User Sync Logic (on every Entra ID login):**
1. Extract mapped claims from validated JWT: oid, tid, mail/userPrincipalName, given_name, family_name, displayName, department, jobTitle, preferredLanguage, accountEnabled
2. Check accountEnabled — if false, suspend user and block login
3. Resolve tenant via tid → Tenant.entraIdConfig
4. Lookup user by entraOid + tenantId (create if new)
5. Sync mutable fields (firstName, lastName, displayName, department, jobTitle, officeLocation, preferredLanguage)
6. Email change detection — if entraEmail ≠ user.email, set emailMismatch = true, publish user.email.mismatch event
7. Set lastEntraSync = now()
8. Fetch and cache groups (async, > 24h stale)
9. Run RoleMappingEngine with claims + groups, update role if rule matches
10. Issue platform JWT

### FR-SYNC-001: Email Change Detection and Admin-Confirmed Update
- **Actor:** System + Tenant Admin
- **Action:** When a user's email changes in Azure Entra ID, platform detects the change and requires admin confirmation before updating the platform email
- **Outcome:** Email mismatch flagged, Tenant Admin notified, admin confirms or rejects the change
- **Priority:** MVP
- **Implementation Details:**
  - On login sync: if entraEmail ≠ user.email → set emailMismatch = true
  - Publish user.email.mismatch event to RabbitMQ (auth.exchange, routing key: user.email.mismatch)
  - Tenant Admin sees notification badge on Identity & Access section
  - Dedicated "Email Mismatches" sub-section in /admin/identity shows: user, old email, new email, detected date, actions
  - Admin actions: "Update platform email" (confirm) or "Keep current email" (reject)
  - On confirmation: update user.email, clear emailMismatch, publish user.email.updated event
  - Data hygiene policy: emailMismatch must be resolved within 30 days

### FR-006: Audit Logging
- **Actor:** Admin
- **Action:** View audit logs of user actions
- **Outcome:** Trackable history of system activities
- **Priority:** Nice-to-Have

### FR-006b: Bulk User Import (CSV)
- **Actor:** Admin
- **Action:** Import multiple users via CSV file upload (email, first_name, last_name, role, department)
- **Outcome:** Batch user accounts created with temporary passwords, duplicate emails skipped
- **Priority:** MVP
- **Implementation Details:**
  - CSV parsing: email, first_name, last_name, role, department columns required
  - Temp password auto-generated, must be changed on first login
  - Duplicate emails: skip with warning in response
  - Returns: created count, skipped count, error details per row

### FR-006c: Export User List
- **Actor:** Admin
- **Action:** Export user list to CSV, Excel, or PDF
- **Outcome:** Downloadable file with user data (name, email, role, department, status, progress)
- **Priority:** MVP
- **Implementation Details:**
  - CSV: comma-separated, UTF-8 encoding
  - Excel: .xlsx with formatted headers
  - PDF: paginated report with company header

---

### FR-002g: Super Admin Identity & Access (Tenant Admin Management Only)
- **Actor:** Super Admin (3S Group level)
- **Action:** Manage Tenant Admin accounts across all companies
- **Outcome:** Tenant Admins can be assigned, suspended, or demoted; Super Admin cannot access individual user data
- **Priority:** MVP
- **Scope Note:** This is strictly scoped to managing Tenant Admin accounts only. Super Admin has NO access to individual user records within any tenant (GDPR compliance).
- **Implementation Details:**
  - List all Tenant Admin accounts: name, email, assigned company, status, last login, creation date, created by
  - Assign new Tenant Admin: select user or invite new admin to company
  - Reset admin password: sends email with temporary password
  - Suspend admin: blocks login for this admin only, does NOT affect their company's users
  - Revoke admin assignment: removes Admin role, demotes to no-tenant-assignment user
  - Filter by company, by status
  - Audit log of all admin actions

### FR-002h: Super Admin Role Mapping Rules (Platform-Level)
- **Actor:** Super Admin
- **Action:** Define which Entra ID claims automatically map to Admin role at platform level
- **Outcome:** Entra ID group membership can automatically grant Admin role on first login
- **Priority:** MVP
- **Implementation Details:**
  - Rule structure: claim_type, claim_operator, claim_value, target_role (Admin only), priority, is_active
  - Target role restricted to: Admin only (not SuperAdmin - only setup wizard can create SuperAdmin)
  - Test Rule simulation: validate rule against mock claims before saving
  - Example: if Entra ID group "grp-platform-admins" exists → user becomes Admin for their tenant

### FR-006d: Tenant Admin Identity & Access (Own Company Users)
- **Actor:** Tenant Admin (manages their own company only)
- **Action:** Manage identity and access for their company's users exclusively
- **Outcome:** Tenant Admin controls pending users, role mappings, role overrides, and access revocation for their company
- **Priority:** MVP
- **Scope:** Tenant-scoped exclusively to their own company. Tenant Admin CANNOT access users from other tenants.
- **Implementation Details:**

#### FR-006d.1: Pending Users Management
- List all users in THIS tenant with status = pending
- Columns: name, email, first login date, days waiting (color-coded), current default role
- Assign Role: inline dropdown + confirm per user
- Bulk assign role: select multiple users, assign role in batch
- Real-time badge count on sidebar nav item
- Calls tenant-scoped endpoint: `GET /identity/pending-users`

#### FR-006d.2: Role Mapping Rules (Tenant-Level)
- Tenant Admin defines rules for their company: Entra ID claim → platform role
- Target roles available: Manager, LearningExpert, TeamManager, TeamMember, TeamIntern
- Target roles NOT available: Admin, SuperAdmin (those are Super Admin's domain)
- Same rule structure as FR-002h but scoped to tenant
- Test Rule simulation feature
- Drag-to-reorder priority
- Calls tenant-scoped endpoint: `GET/POST/PUT/DELETE /identity/role-mapping-rules`

#### FR-006d.3: Manual Role Override
- Search users within THIS tenant only (cannot search across tenants)
- View user details, change role, change status, add reason note
- Force logout toggle: invalidate user's tokens
- All changes written to tenant-level audit log
- Calls tenant-scoped endpoints: `PATCH /identity/users/{id}/role`, `PATCH /identity/users/{id}/status`, `POST /identity/users/{id}/revoke`

#### FR-006d.4: Access Revocation (Emergency Controls)
- Emergency controls for THIS tenant's users only
- Actions: Force Logout, Suspend User, Deactivate User, Unlock Account
- Mandatory reason field on all actions
- Bulk operations supported
- All operations scoped to tenant

#### FR-006d.5: Identity Audit Log (Tenant-Level)
- Full log of all role and status changes for THIS tenant's users
- Columns: timestamp, actor (admin name), target user, old role, new role, reason, source (manual_override / role_mapping_rule / onboarding_complete), IP
- Filter by date range, action type
- Export to CSV
- Calls tenant-scoped endpoint: `GET /identity/audit`

---

## 2. Learning Hub & Course Management

### FR-007: Course Catalog
- **Actor:** Any authenticated user
- **Action:** Browse available courses with filtering (category, difficulty, duration)
- **Outcome:** List of courses displayed with metadata
- **Priority:** MVP

### FR-008: Course Enrollment
- **Actor:** Team Member/Intern
- **Action:** Enroll in a course
- **Outcome:** User added to course roster, progress initialized
- **Priority:** MVP

### FR-009: Course Content Hierarchy
- **Actor:** Learning Expert/Admin
- **Action:** Create courses with modules, lessons, and assessments
- **Outcome:** Structured learning path created
- **Priority:** MVP

### FR-010: Lesson Completion
- **Actor:** Enrolled user
- **Action:** Mark lesson as complete or submit lesson content
- **Outcome:** Progress updated, next lesson unlocked
- **Priority:** MVP

### FR-011: Quiz/Assessment
- **Actor:** Enrolled user
- **Action:** Take quiz at end of module
- **Outcome:** Score recorded, pass/fail determined
- **Priority:** MVP

### FR-011c: Quiz Taking & Score Submission
- **Actor:** Enrolled user
- **Action:** Take quiz within lesson/module, submit answers, view results
- **Outcome:** Score recorded, pass/fail determined, retry allowed if failed
- **Priority:** MVP
- **Implementation Details:**
  - UI presents questions one at a time or all at once
  - Timer countdown for timed assessments
  - Auto-submit on time expiry
  - Immediate feedback on submission (correct/incorrect per question)
  - Score calculated as percentage
  - Passing threshold defined by Learning Expert
  - Retry allowed if failed (configurable attempts)
  - Results stored with attempt timestamp

### FR-011b: Quiz/Assessment Management (Learning Expert)
- **Actor:** Learning Expert/Admin
- **Action:** Create, edit, delete quizzes/assessments per module or lesson. Add questions (multiple choice, true/false), set passing score, time limit.
- **Outcome:** Quizzes available for learners to take
- **Priority:** MVP
- **Implementation Details:**
  - CRUD endpoints for Assessment (title, passingScore, timeLimit)
  - CRUD endpoints for Question (text, type, options, correctAnswer, points, order)
  - Questions linked to Assessment
  - Learning Expert can create assessment per module
  - Assessment can be optional or required to pass module

### FR-011c: Course Preview Mode
- **Actor:** Learning Expert/Admin
- **Action:** Preview course as a student (see enrolled view, take lessons, see progress) before publishing
- **Outcome:** Author can verify course flow and experience before making public
- **Priority:** MVP
- **Implementation Details:**
  - Preview token generated per course for author
  - Preview URL: `/courses/{id}/preview?token={preview_token}`
  - Preview mode bypasses enrollment requirement
  - Preview shows actual student experience (lessons, progress tracking)
  - Preview token expires after 24h or can be revoked by author
  - Visual indicator shows "Preview Mode" banner in preview view

### FR-012: Course Completion Certificate
- **Actor:** User who completed course
- **Action:** View/download completion certificate
- **Outcome:** Certificate generated with course details, learner name, completion date
- **Priority:** MVP
- **Implementation Details:**
  - Certificate generated automatically when course status transitions to `completed`
  - Generate a UUID `certificate_id`
  - Build a canonical payload from certificate fields
  - Sign the payload using `RS256` with `CERT_PRIVATE_KEY`
  - Store certificate record in PostgreSQL
  - Generate a QR code pointing to `https://{YOUR_DOMAIN}/verify/{certificate_id}`
  - Embed the QR code into the downloadable certificate
  - GET `/certificates/{id}` returns certificate details
  - GET `/certificates/{id}/download` returns PDF file
  - Certificate also emailed (optional, via notification service)

### FR-012b: Public Certificate Verification
- **Actor:** External verifier, recruiter, manager, learner
- **Action:** Scan certificate QR code or open verification URL
- **Outcome:** Platform returns `valid`, `invalid`, `expired`, or `revoked`
- **Priority:** MVP
- **Implementation Details:**
  - Public endpoint: `GET /verify/{certificate_id}`
  - No authentication required
  - UUID validation required before DB lookup
  - Verifies signature with `CERT_PUBLIC_KEY`
  - Returns both machine-readable JSON and human-readable HTML verification result
  - Logs all verification attempts with certificate_id, IP, timestamp, and result

### FR-012c: Certificate Revocation
- **Actor:** Admin
- **Action:** Revoke issued certificate with a required reason
- **Outcome:** Certificate remains stored but public verification shows `revoked`
- **Priority:** MVP
- **Implementation Details:**
  - Admin-only endpoint: `PATCH /admin/certificates/{certificate_id}/revoke`
  - Request body contains `reason`
  - Revoked certificates must still be queryable by the public verification flow

### FR-013: Course Rating & Feedback
- **Actor:** User who completed course
- **Action:** Rate course (1-5 stars) and leave text feedback
- **Outcome:** Rating visible to other users, average rating shown on course card
- **Priority:** Nice-to-Have
- **Implementation Details:**
  - Rating: 1-5 stars (required for review)
  - Feedback: text review (optional, max 1000 chars)
  - Can only review once per course (after completion)
  - Can update own review
  - Average rating calculated and cached
  - Reviews shown on Course Detail page

### FR-013e: Course/Lesson Bookmarking
- **Actor:** Enrolled user
- **Action:** Bookmark a course or lesson for later (save for later)
- **Outcome:** Bookmarked items appear in "Saved" section for quick access
- **Priority:** Nice-to-Have
- **Implementation Details:**
  - Bookmark endpoint: POST /bookmarks (course_id or lesson_id)
  - List bookmarks: GET /bookmarks
  - Remove bookmark: DELETE /bookmarks/{id}
  - Bookmarks sortable by date added
  - Quick access from Dashboard "Saved for Later" section

### FR-013b: Course Publish/Unpublish Toggle
- **Actor:** Learning Expert/Admin
- **Action:** Toggle course visibility between published and draft states
- **Outcome:** Published courses visible in catalog; draft courses hidden from learners
- **Priority:** MVP
- **Implementation Details:**
  - `is_published` field already exists in Course model (default: false)
  - Dedicated toggle endpoint returns current state
  - Course cannot be published without at least one module and one lesson
  - Publishing publishes `course.published` event to RabbitMQ

### FR-013c: Course Assignment with Deadline
- **Actor:** Manager/Admin
- **Action:** Assign course to user or team with mandatory deadline
- **Outcome:** User sees assigned course with due date; reminder notifications sent
- **Priority:** MVP
- **Implementation Details:**
  - Deadline stored per enrollment (enrollment.deadline)
  - Mandatory flag (enrollment.is_mandatory)
  - Background job checks deadlines, sends overdue reminders
  - Manager can extend deadline for individual users

### FR-013d: Mandatory Course Assignment
- **Actor:** Admin
- **Action:** Mark course as mandatory for all users or specific department
- **Outcome:** All users in scope must complete course; completion tracked in analytics
- **Priority:** MVP
- **Implementation Details:**
  - Course-level mandatory flag (course.is_mandatory)
  - Department-level mandatory assignment
  - Non-completion affects completion rate metrics
  - Admin can override for individual users

### FR-013e: Bulk Department-Level Course Assignment
- **Actor:** Manager (Dept scope)
- **Action:** Assign a course to all members of a specific department at once
- **Outcome:** All department users receive the course assignment with optional deadline
- **Priority:** MVP
- **Implementation Details:**
  - POST /courses/{id}/assign/department endpoint
  - Accepts: department_id, deadline (optional), is_mandatory (optional)
  - Creates enrollment records for all active users in the department
  - Publishes department.course.assigned event to RabbitMQ
  - Manager can only assign to their own department (dept_id from user token)
  - Skip already-enrolled users with warning in response
  - Returns: assigned_count, skipped_count, errors array

### FR-013f: Department-Level Skill Gap Report
- **Actor:** Manager (Dept scope)
- **Action:** View aggregated skill gap analysis for their entire department
- **Outcome:** Manager sees department-wide skill gaps with per-user drill-down
- **Priority:** MVP
- **Implementation Details:**
  - Aggregates skill gaps across all users in the manager's department
  - Shows: top skill gaps by severity, gap distribution by category, affected user count
  - Allows drill-down to individual user skill profiles
  - Manager can only view their own department (dept_id from user token)
  - Endpoint: GET /skill-gap/department (in AI Agents service)

---

## 3. AI Agents System (MVP: 2-3 Agents)

### FR-014: Chat Coach AI (Hindsight-Powered)
- **Actor:** Enrolled user
- **Action:** Ask conversational questions about course content
- **Outcome:** AI provides contextual, Bloom's Taxonomy-aware responses using Hindsight memory
- **Priority:** MVP
- **Implementation Details:**
  - AGNO agent runtime with conversational agent pipeline
  - Hindsight memory on every turn: `recall()` retrieves top-5 learner memories + course context
  - `retain()` stores conversation summaries and detected struggles
  - `reflect()` generates coaching insights after sessions
  - GROQ Llama 3.3 70B for structured response generation
  - Pre/post-generation safety guardrails via GROQ
  - RabbitMQ for event publishing: coaching.session.completed
  - Socket.io for real-time response delivery to frontend
  - MinIO file URLs injected into context for course media references

### FR-015: Recommendation AI
- **Actor:** Enrolled user
- **Action:** View personalized learning path suggestions
- **Outcome:** AI recommends courses/modules based on user profile and progress
- **Priority:** MVP
- **Implementation Details:**
  - AGNO agent with structured workflow for recommendation pipeline
  - RabbitMQ consumer on: coaching.session.completed, assessment.completed, skill_gap.detected, user.lesson.completed
  - Hindsight `recall()` retrieves learner skill profile + past recommendations
  - Hindsight `retain()` stores new recommendation decisions with outcome metadata
  - Hindsight `reflect()` evaluates what recommendations worked vs failed
  - Contextual reranking against full user profile
  - Skill graph filter via pg0 relational tables with recursive CTE
  - Recommendations cached in PostgreSQL with TTL; Socket.io real-time feed for updates

### FR-016: Course Maker AI (Auto-Course Generation)
- **Actor:** Learning Expert/Admin
- **Action:** Generate course outline and quiz questions from topic
- **Outcome:** AI produces structured course skeleton with assessment questions
- **Priority:** Nice-to-Have (MVP if time permits)
- **Implementation Details:**
  - AGNO agent workflow: curriculum_designer → content_writer → multimedia_planner → quiz_generator → qa_reviewer → persist
  - Triggered by manual API call OR skill_gap.detected RabbitMQ event
  - Hindsight `recall()` checks existing content to avoid duplication before generating
  - Hindsight `retain()` stores searchable summaries, learning objectives, approved edits, instructor feedback, and generation notes for each course draft
  - Hindsight `reflect()` analyzes expert feedback and later learner performance to improve future generated content
  - GROQ Llama 3.3 70B for structured output generation
  - After learning-expert approval, official course metadata, modules, lessons, quizzes, and publishing state are persisted in PostgreSQL
  - Generated files and media assets are stored in MinIO (videos, PDFs, slides, images, thumbnails, downloadable resources)
  - MinIO file URLs returned for frontend rendering, while PostgreSQL remains the authoritative source for course structure
  - A Hindsight memory bank is created or updated per approved course so agents can later recall course knowledge, prior expert decisions, and generation history
  - Emits course.created to RabbitMQ exchange

### FR-017: Content Librarian AI
- **Actor:** Learning Expert / Admin
- **Action:** Ingest content from various sources and serve semantic search to other agents
- **Outcome:** Relevant content retrieved via Hindsight semantic search
- **Priority:** Nice-to-Have
- **Implementation Details:**
  - AGNO agent — Query API called by other agents (Chat Coach, Course Generator, Skill Gap Analyzer) via AGNO tool call
  - Hindsight `recall()` powers semantic search across all learning content (replaces manual vector search)
  - Hindsight `retain()` stores all content metadata and tagging decisions
  - Hindsight `reflect()` detects content gaps and quality issues at scale
  - Official platform content still lives in PostgreSQL and MinIO; Hindsight is the semantic retrieval and memory layer over that authoritative content
  - Automatic tagging and categorization of content
  - Detect duplicate or outdated content
  - Curate and maintain learning paths




### FR-018: Gamification AI (Adaptive)
- **Actor:** System (triggered by user actions)
- **Action:** Generate dynamic challenges and manage XP/streaks with adaptive difficulty
- **Outcome:** Users receive personalized challenges, XP awarded, real-time gamification events
- **Priority:** Nice-to-Have (MVP: Basic XP only)
- **Implementation Details:**
  - AGNO agent for real-time gamification management
  - RabbitMQ consumer on: coaching.session.completed, user.lesson.completed, user.action.*
  - Hindsight `retain()` every XP event, badge award, challenge completion
  - Hindsight `recall()` learner engagement history to adapt challenge difficulty
  - Hindsight `reflect()` detects disengagement patterns early
  - Real-time signal processor with sliding window aggregation (Python)
  - XP system with multipliers, streaks, anti-gaming rules
  - Exponential leveling curve with unlockable features
  - Badge system: completion, streak, mastery, social, milestone, challenge (bronze/silver/gold/platinum + hidden)
  - Leaderboards: global, team, individual — daily/weekly/monthly/all-time
  - Emits gamification.event to RabbitMQ exchange + Socket.io real-time

### FR-019: Skill Gap Analyzer AI
- **Actor:** Manager/Team Leader
- **Action:** View skill gap analysis for team members
- **Outcome:** AI identifies skill gaps with explanations, feeds data to Recommendation and Gamification agents
- **Priority:** Nice-to-Have
- **Implementation Details:**
  - AGNO agent for skill gap analysis and reporting
  - Four RabbitMQ events published:
    - skill_gap.detected: { userId, skillId, severityScore: 0-1, blockingPower, estimatedHoursToClose, timestamp }
    - skill_gap.resolved: { userId, skillId, masteryScore, timestamp }
    - skill_profile.updated: { userId, skillId, oldScore, newScore, evidenceType, timestamp }
    - assessment.completed: { userId, thetaEstimates, questionsUsed, confidenceIntervals, timestamp }
  - Hindsight `retain()` every assessment result, retry, and behavior signal
  - Hindsight `reflect()` computes mastery trajectory per skill per learner
  - Hindsight `recall()` retrieves full learner history for gap analysis reports
  - Skill Graph: pg0 relational tables (Skill, SkillEdge with recursive CTE), seeded from ESCO taxonomy
  - Skill Inference Engine: Bayesian fusion of evidence sources
  - Gap Computation: pg0 recursive CTE finds shortest path from current skills to target
  - Generates learner-facing AND manager-facing reports
  - Feeds gap data to Recommendation AI and Gamification AI

---

## 4. Gamification System

### FR-020: XP Points
- **Actor:** System (triggered by learning activities)
- **Action:** Award XP for completing lessons, quizzes, courses
- **Outcome:** User XP balance increases
- **Priority:** MVP

### FR-021: Levels & Progression
- **Actor:** System
- **Action:** Level up user when XP threshold reached
- **Outcome:** User level increases, new badges unlock
- **Priority:** MVP

### FR-022: Badges & Achievements
- **Actor:** System
- **Action:** Award badges for milestones (first course, streak, etc.)
- **Outcome:** Badge added to user profile
- **Priority:** Nice-to-Have

### FR-023: Leaderboards
- **Actor:** Any authenticated user
- **Action:** View global or team leaderboards
- **Outcome:** Rankings displayed by XP/level
- **Priority:** MVP

### FR-024: Streaks
- **Actor:** System
- **Action:** Track daily learning streaks
- **Outcome:** Streak counter updates, streak bonuses applied
- **Priority:** Nice-to-Have

### FR-TZ-001: Timezone-Aware Gamification
- **Actor:** System
- **Action:** All date boundary calculations (streak day, daily XP reset, leaderboard weekly/monthly periods) use the user's user.timezone field, not the server's UTC clock
- **Outcome:** A user's "day" starts and ends at their local midnight, not UTC midnight
- **Priority:** MVP
- **Implementation Details:**
  - Python services use pytz library: `datetime.now(pytz.timezone(user.timezone)).date()` instead of `date.today()`
  - Fallback: if user.timezone is null, use system_config.default_timezone
  - All timestamps stored in the database remain in UTC — only boundary calculations convert to user timezone
  - The streaks.py, xp.py, and leaderboard.py services must accept user_timezone: str as a parameter and use it for all date.today() calls

---

## 5. Goal Management & Progress Tracking

### FR-025: Personal Goals
- **Actor:** Team Member/Intern
- **Action:** Set personal learning goals (courses to complete, skills to acquire)
- **Outcome:** Goals visible in user dashboard
- **Priority:** MVP

### FR-026: Team Goals
- **Actor:** Team Manager
- **Action:** Set collective team learning goals
- **Outcome:** Team goal visible to all team members
- **Priority:** MVP

### FR-027: Progress Tracking Dashboard
- **Actor:** Any authenticated user
- **Action:** View personal learning progress (% completion, time spent)
- **Outcome:** Visual progress indicators displayed
- **Priority:** MVP

### FR-028: Goal Completion Notifications
- **Actor:** System
- **Action:** Notify user when goal is achieved
- **Outcome:** Real-time notification sent
- **Priority:** Nice-to-Have

---

## 6. Team Management & Collaboration

### FR-029: Team Creation
- **Actor:** Admin/Manager
- **Action:** Create team with name, description, and members
- **Outcome:** Team entity created
- **Priority:** MVP

### FR-030: Team Member Assignment
- **Actor:** Team Manager
- **Action:** Add/remove members to/from team
- **Outcome:** Team roster updated
- **Priority:** MVP

### FR-031: Team Dashboard
- **Actor:** Team Manager
- **Action:** View team progress, completion rates, active members
- **Outcome:** Aggregated team metrics displayed
- **Priority:** MVP

### FR-031b: Team Course Assignment
- **Actor:** Team Manager
- **Action:** Assign a course to all team members at once with optional deadline
- **Outcome:** All current team members enrolled in the course automatically
- **Priority:** MVP
- **Implementation Details:**
  - Bulk enrollment of all team members via single API call
  - Optional deadline parameter for assignment
  - Mandatory flag option
  - New members added to team are NOT auto-enrolled (requires separate setting)
  - Returns: enrolled count, failed count with reasons

### FR-031c: Individual Member Progress View
- **Actor:** Team Manager
- **Action:** View individual team member's progress on assigned courses
- **Outcome:** Per-member progress breakdown with completion percentages, time spent, quiz scores
- **Priority:** MVP
- **Implementation Details:**
  - List view: all members with summary columns (courses assigned, completed, in progress, overdue)
  - Detail view: member's enrolled courses with progress %, last activity date, deadline status
  - Filter by: status (in_progress, completed, overdue), course
  - Export to CSV option

### FR-032: Team Collaboration (Chat)
- **Actor:** Team Members
- **Action:** Send messages within team channel
- **Outcome:** Real-time team communication
- **Priority:** Out of Scope

---

## 7. Analytics & Reporting

### FR-033: User Analytics Dashboard
- **Actor:** Individual user
- **Action:** View personal learning analytics (time, courses, skills)
- **Outcome:** Personal metrics visualized
- **Priority:** Nice-to-Have

### FR-034: Manager Analytics
- **Actor:** Manager/Admin
- **Action:** View team/organization learning metrics
- **Outcome:** Aggregated reports with skill gap insights
- **Priority:** Nice-to-Have

### FR-035: Skill Gap Report
- **Actor:** Manager
- **Action:** Generate skill gap analysis report
- **Outcome:** PDF/visual report showing current vs. desired skills
- **Priority:** Nice-to-Have

### FR-035b: Export Analytics Report
- **Actor:** Admin/Manager
- **Action:** Export analytics report to PDF or CSV
- **Outcome:** Downloadable file with charts and data export
- **Priority:** Nice-to-Have
- **Implementation Details:**
  - PDF: formatted report with charts (via library), company header
  - CSV: raw data export for further analysis
  - Date range filter (start date, end date)
  - Includes: course completions, time spent, XP earned, skill progress

### FR-035c: Per-Department Completion Rates
- **Actor:** Admin/Manager
- **Action:** View learning statistics broken down by department
- **Outcome:** Department-level completion rates, average progress, skill gaps
- **Priority:** Nice-to-Have
- **Implementation Details:**
  - Aggregates enrollment and progress data by user department
  - Shows: enrolled count, completion rate %, avg score, avg time spent
  - Comparison view: department vs. organization average
  - Drill-down to individual user within department

---

## 8. Notifications & Real-time

### FR-036: In-App Notifications
- **Actor:** System
- **Action:** Send notifications for goals, achievements, course updates
- **Outcome:** Notification appears in real-time
- **Priority:** Nice-to-Have

### FR-037: Email Notifications
- **Actor:** System
- **Action:** Send email for important updates (goal deadlines, new courses)
- **Outcome:** Email delivered to user inbox
- **Priority:** Out of Scope

---

## User Roles Summary

| Role | Description | Scope |
|------|-------------|-------|
| Super Admin | 3S Group level - manages all tenants, cross-tenant analytics, platform settings | Platform-wide (no tenant) |
| Tenant Admin | Per-company Admin - manages users, courses within their company | Tenant-scoped |
| Admin | Alias for Tenant Admin (for backward compatibility) | Tenant-scoped |
| Manager | Team oversight, goal setting, analytics view | Tenant-scoped |
| Learning Expert | Course creation, content management | Tenant-scoped |
| Team Manager | Direct team management, progress tracking | Tenant-scoped |
| Team Member | Enrolled learner, goal pursuit | Tenant-scoped |
| Team Intern | Learner with limited access | Tenant-scoped |

---

## Requirements Priority Summary

| Priority | Count |
|----------|-------|
| MVP | 25 |
| Nice-to-Have | 14 |
| Out of Scope | 3 |
| **Total** | **42** |

---

*Generated for PFE Project: Enterprise AI-Driven Upskilling & Mentorship Platform*
*Author: Aya Telmoudi | Supervisor: Hazem Raouafi*
