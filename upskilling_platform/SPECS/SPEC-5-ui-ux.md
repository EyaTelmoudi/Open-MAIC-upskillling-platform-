# SPEC-5: UI/UX Specification

## Project: Enterprise AI-Driven Upskilling & Mentorship Platform

This document outlines all screens, pages, key components, and user interactions with detailed design specifications.

---

## 0. Setup Pages (First-Run)

### 0.1 Setup Wizard (`/setup`)

**Route Behavior:**
- Only accessible when `system_config.setup_completed = false`
- Once complete, redirects to `/superadmin/login`

**Layout:**
- Full-page centered layout (no sidebar, no topbar)
- Dark background: `#0F1117`
- Card surfaces: `#1A1D27`
- Primary: `#6C63FF`

**Step Indicator:**
- 5 numbered dots (1-5) with connecting line
- Current step: filled primary color
- Completed step: checkmark with primary color
- Pending step: muted color `#2A2D3E`
- Vertical center alignment, centered in viewport

### Step 1: Welcome
- Platform logo (if uploaded) or platform name
- Heading: "Welcome to [Platform Name]!"
- Description: "Let's configure your platform in just a few minutes."
- "Get Started" CTA button (primary, full-width)

### Step 2: Super Admin Account
- **Fields:**
  - Full Name (Input, required)
  - Email (Input, email, required)
  - Password (Input, password, required, min 8 chars, 1 uppercase, 1 number)
  - Confirm Password (Input, password, required)
  - Setup Key (Input, password, required) — user gets from DevOps via .env
- Password strength indicator
- "Create Account" button

### Step 3: Platform Configuration
- **Fields:**
  - Platform Name (Input, required)
  - Logo Upload (drag & drop zone, accepts image/*, shows preview)
  - Timezone (Select dropdown, default "Africa/Tunis")
    - **Note:** Accepts IANA timezone strings (e.g. "Africa/Tunis", "Europe/Paris"), NOT UTC offset strings (e.g. "UTC+01:00")
    - Auto-detect from browser using `Intl.DateTimeFormat().resolvedOptions().timeZone` and pre-fill
  - Support Email (Input, email, required)
- "Save & Continue" button

### Step 4: First Tenant
- **Fields:**
  - Company Name (Input, required)
  - Slug (Input, auto-generated from name, editable, URL-safe)
  - Company Logo (Input, optional, drag & drop)
  - "Configure Azure Entra ID" expandable section (optional, can skip)
- "Create Tenant" button

### Step 5: Review & Launch
- Summary card:
  - Super Admin: [name] ([email])
  - Platform: [platform name]
  - First Tenant: [tenant name]
- "Launch Platform" button (primary, with confetti animation on success)
- 3-second countdown with success message "Platform is live! 🎉"
- Auto-redirect to `/superadmin/login` after countdown

**Post-Setup Redirect Logic:**
1. On POST `/api/setup/complete` success:
   - Show 3-second success animation: "Platform is live!"
   - After animation: redirect to `/superadmin/login`
2. On Super Admin first login post-setup:
   - Check `system_config.superadmin_onboarded`
   - If `false`: redirect to `/superadmin/dashboard` with Getting Started checklist highlighted
3. Getting Started checklist dismissal:
   - When all 6 steps complete: set `superadmin_onboarded = true`
   - Checklist disappears permanently from dashboard

---

## 1. Design System

### 1.1 Color Palette

| Role | Color Name | Hex Code | Usage |
|------|------------|----------|-------|
| Primary | Electric Violet | #6C63FF | Main brand actions, active states, buttons |
| Primary Light | Accent Violet | #8B85FF | Hover states, gradients |
| Secondary | Mint Green | #00D4AA | Success, XP gains, streaks, progress |
| Accent Gold | Gold/Yellow | #FFD700 | Achievements, rewards, leaderboard |
| Error | Error Red | #FF6B6B | Errors, warnings, destructive actions |
| Background | Dark | #0F1117 | Main app background (dark mode) |
| Card | Card Dark | #1A1D27 | Card surfaces |
| Border | Border | #2A2D3E | Borders, dividers |
| Text Primary | | #F0F0F5 | Main text |
| Text Secondary | Muted | #8B8FA8 | Muted/secondary text |

### 1.2 Typography

| Element | Font | Weight | Size |
|---------|------|--------|------|
| Page Title (h1) | Inter | Bold 700 | 30px (text-3xl) |
| Section Heading (h2) | Inter | SemiBold 600 | 24px (text-xl) |
| Subsection (h3) | Inter | SemiBold 600 | 20px (text-lg) |
| Body | Inter | Regular 400 | 16px (text-base) |
| Small/Body | Inter | Regular 400 | 14px (text-sm) |
| Labels/Caption | Inter | Medium 500 | 12px (text-xs) |
| **Numbers/Code** | **JetBrains Mono** | Medium 500 | Variable |

> **Rule:** All XP numbers, streak counts, level numbers, timers, and rank displays MUST use `JetBrains Mono` with class `font-['JetBrains_Mono']`.

### 1.3 Spacing System

| Token | Value | Usage |
|-------|-------|-------|
| Page container | p-8 (32px) | Main page padding |
| Card padding | p-5/p-6 (20px/24px) | Card internal spacing |
| Section gap | gap-4/gap-6 | Grid gaps |
| Border radius (cards) | rounded-2xl (16px) | Card surfaces |
| Border radius (buttons) | rounded-[10px] | Buttons, inputs |
| Border radius (badges) | rounded-full | Pills, badges |

### 1.4 Components (shadcn/ui)

All standard shadcn/ui components are available:
- Button, Input, Select, Card, Dialog, Dropdown Menu
- Tabs, Badge, Avatar, Progress, Toast
- Table, Form, Calendar, Chart
- ScrollArea, Skeleton, Tooltip

---

## 2. Page Structure

### 2.0 Tenant Context Indicator (ALL Pages)

#### Tenant Switcher in Sidebar
- Sidebar top: Shows current tenant logo + name (e.g., "3S", "Advancia")
- If user has access to multiple tenants: dropdown to switch tenant
- Tenant context persists across all authenticated pages
- Tenant Admin sees "Admin" badge next to tenant name

#### Super Admin Indicator
- Super Admin sees "Super Admin" badge in sidebar
- Super Admin can access /superadmin/* routes

---

### 2.1 Dashboard Page (`/` or `/dashboard`)

#### Layout Structure
- Container: max-w-[1440px] centered, p-8 padding
- Card-based layout with all components having rounded-2xl borders

#### Hero Banner Section
- Large gradient banner with rounded-2xl corners
- Background: `bg-gradient-to-r from-[#6C63FF]/20 to-[#00D4AA]/20`
- Border: `border-[#6C63FF]/20`
- Content:
  - Heading: "Good morning, [User Name]! 🚀" in text-3xl
  - Subtitle: Motivational text like "You're 3 lessons away from leveling up."
  - CTAs: "Continue Learning" (primary) + "View Goals" (outline) with gap-3

#### Stats Cards Grid
- Grid: `grid grid-cols-4 gap-4`
- 4 cards with:
  - Label (text-sm text-muted-foreground)
  - Large number (text-3xl font-bold font-['JetBrains_Mono'])
  - Icon container (p-2 bg-[COLOR]/10 rounded-lg)
  - Trend indicator: flex items-center gap-1 text-xs text-[#00D4AA]

**Cards:**
1. **XP This Week**: 2,450 XP with TrendingUp icon (#6C63FF)
2. **Current Streak**: 12 days with 🔥 + flame icon
3. **Courses Completed**: 18 courses with BookCheck icon (#00D4AA)
4. **Team Rank**: #3 with Award icon (#FFD700)

#### Main Content Grid
- Grid: `grid grid-cols-3 gap-6`
- Left column (col-span-2): Continue Learning + Recommended by AI
- Right column (1/3): Sidebar widgets

##### Continue Learning Section
- Section header with "View all →" link
- Course cards (vertical stack, space-y-4)
- Card anatomy:
  - Thumbnail: w-32 h-20 rounded-xl with object-cover
  - Badge: position absolute top-2 left-2 (e.g., "🔥 Hot")
  - Content: title, next lesson, progress bar, percentage
  - Button: "Resume →" on right

##### Recommended by AI Section
- Grid: `grid grid-cols-3 gap-4`
- 3 recommendation cards with:
  - Image: h-32 with group-hover:scale-105
  - Relevance badge: "94% match" top-right
  - Content: title + AI reason text

##### Right Sidebar Widgets

**Today's Challenge Widget:**
- Gradient card: `bg-gradient-to-br from-[#6C63FF]/10 to-[#8B85FF]/10`
- Border: `border-[#6C63FF]/20`
- Content: title, difficulty badge (Easy/Medium/Hard), challenge title, description
- Rewards row: XP (+150 XP in gold) + timer (3h 24m left)
- CTA: "Accept Challenge" full-width primary button

**Team Activity Feed Widget:**
- Standard card with border-border
- Activity items: avatar + name + action + timestamp

---

### 2.2 Super Admin Login (`/superadmin/login`)

#### Layout Structure
- Full-page centered layout (no sidebar, no topbar)
- Same design tokens as Setup wizard

#### Card
- Max-width: max-w-md centered
- Card: bg-card rounded-2xl p-8 border border-border

#### Header
- "Super Admin Login" heading (text-2xl, center aligned)
- Platform logo above heading (if configured)

#### Form Fields
- Email (Input, type email)
- Password (Input, type password)
- "Sign In" button (primary, full-width)

#### Error States
- Invalid credentials: red-bordered input + error message below

---

### 2.3 AI Coach Page (`/coach`)

#### Layout Structure
- Full-screen flex layout: `flex h-screen overflow-hidden`
- Two sections: Main chat area (flex-1) + Context sidebar (w-80)

#### Header Section
- Border-b border-border, bg-card, px-6 py-4
- Left side:
  - Gradient avatar: w-10 h-10 rounded-full bg-gradient-to-br from-[#6C63FF] to-[#8B85FF]
  - Sparkles icon centered inside
  - Text: "AI Coach" + "Your personalized learning assistant"
- Right side:
  - Active status indicator with pulsing green dot + "Active" text

#### Context Banner
- Below header: bg-gradient-to-r from-[#6C63FF]/10 to-[#8B85FF]/10
- px-6 py-3, border-b border-[#6C63FF]/20
- Shows: "You are currently learning: [Course Name]"

#### Messages Area
- ScrollArea with flex-1, px-6 py-6
- Max-width: max-w-4xl mx-auto, space-y-6

**AI Messages:**
- Layout: flex gap-3
- Avatar: w-8 h-8 rounded-full gradient (same as header)
- Bubble: inline-block px-4 py-3 rounded-2xl bg-card border border-border max-w-[80%]
- Text: text-sm whitespace-pre-wrap
- XP reward: mt-2 flex items-center gap-1 text-xs text-[#00D4AA]
- Timestamp: text-xs text-muted-foreground below bubble

**User Messages:**
- Layout: flex gap-3 flex-row-reverse
- Avatar: w-8 h-8 rounded-full object-cover
- Bubble: bg-primary text-primary-foreground
- Timestamp: text-right aligned

#### Suggestion Chips Section
- Above input: px-6 py-3 border-t border-border bg-card/50
- Label: "Quick actions:" text-xs text-muted-foreground mb-2
- Chips (flex gap-2 flex-wrap):
  1. "Explain this lesson" + BookOpen icon (#6C63FF)
  2. "Give me a quiz" + Target icon (#00D4AA)
  3. "Summarize my progress" + TrendingUp icon (#FFD700)
  4. "What should I learn next?" + Lightbulb icon (#8B85FF)

#### Input Area
- Border-t border-border, px-6 py-4, bg-card
- Max-w-4xl mx-auto flex items-end gap-3
- Components:
  - Paperclip button (left)
  - Textarea: flex-1, px-4 py-3 bg-input-background border rounded-xl
  - Mic button
  - Send button (right): primary button style

#### Right Context Sidebar (w-80)
- Border-l border-border, bg-card, overflow-y-auto, p-6

**Sections:**

1. **Current Course Progress Card**
   - Label: "Current Course" text-xs text-muted-foreground
   - Title: course name font-semibold
   - Progress: "67%" text-xs + progress bar with gradient fill

2. **Skill Gaps Detected**
   - Heading: "Skill Gaps Detected"
   - Items: flex justify-between with severity badges
     - High: bg-[#FF6B6B]/10 text-[#FF6B6B]
     - Medium: bg-[#FFD700]/10 text-[#FFD700]
     - Low: bg-[#00D4AA]/10 text-[#00D4AA]

3. **Recommended Next Action**
   - Highlighted gradient card: from-[#6C63FF]/10 to-[#8B85FF]/10
   - Label + action title + description
   - "Start Learning" button

4. **Daily AI Tip Card**
   - Gradient: from-[#00D4AA]/10 to-[#00B896]/10
   - Lightbulb icon + "Daily Tip" label
   - Tip content in text-sm

#### XP Reward Animation
- Overlay: fixed top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-50
- Animation: initial={{ opacity: 0, y: 50, scale: 0.5 }} animate={{ opacity: 1, y: 0, scale: 1 }}
- Card: px-8 py-4 bg-[#00D4AA] text-white rounded-2xl shadow-2xl
- Text: "+25 XP" in font-['JetBrains_Mono'] text-2xl font-bold

---

### 2.3 Leaderboard Page (`/leaderboard`)

#### Layout Structure
- Container: max-w-[1440px] centered, p-8
- Heading: "Leaderboard" text-3xl mb-6

#### Tab Navigation
- Flex gap-2 mb-8 border-b border-border
- Tabs: "Global" | "My Team" | "Weekly" | "Monthly"
- Active tab: text-primary + bottom indicator (h-0.5 bg-primary)

#### Main Grid Layout
- Grid: grid-cols-3 gap-6
- Left (col-span-2): leaderboard content
- Right (1/3): stats sidebar

#### Top 3 Podium Section
- Card: bg-card rounded-2xl p-8 border border-border
- Heading: "Top Performers" text-xl mb-6
- Podium: flex items-end justify-center gap-4 (order: 2nd, 1st, 3rd)

**Podium Position Anatomy:**
- User container: flex flex-col items-center
- Avatar: rounded-full with colored border
  - #1: w-24 h-24, gold border (#FFD700), glow
  - #2: w-20 h-20, silver border (#C0C0C0)
  - #3: w-20 h-20, bronze border (#CD7F32)
- Crown/Medal: positioned above avatar
  - #1: Crown icon, #FFD700
  - #2: Medal icon, silver
  - #3: Medal icon, bronze
- Details: name, LevelBadge, XP (JetBrains Mono)
- Podium base: colored gradient with rank number

#### Leaderboard Table (Rank 4+)
- Card: bg-card rounded-2xl border border-border overflow-hidden
- Table: full-width with headers (uppercase, text-xs, text-muted-foreground)
- Columns: Rank | User | XP | Courses | Streak | Change
- Row styling:
  - Hover: bg-accent/30
  - Current user: bg-primary/10 border-l-4 border-l-primary

#### Stats Sidebar (Right Column)
- Sticky card: bg-card rounded-2xl p-6 border border-border sticky top-8
- Heading: "Your Stats This Week" font-semibold mb-6
- Stats list with space-y-6:
  1. **XP Earned**: 2,450 in text-[#6C63FF] + trend (+23%)
  2. **Lessons Completed**: 28
  3. **Time Spent**: 14.5h
  4. **Current Streak**: 🔥 + 12
  5. **Your Rank Progress**: "Current: #6" + "↑ 1", "420 XP away from #5"
- Bottom button: "View Full Analytics"

---

### 2.4 Course Catalog (`/courses`)

#### Layout
- Filter Sidebar (260px left) + Course Grid (main)
- Container: max-w-[1440px] centered, p-8

#### Filter Sidebar
- Search bar: "Try: 'async javascript'"
- Sections: Difficulty, Duration, Skills
- Active filters: removable pills

#### Main Content
- Header: "Course Catalog" + "Showing X courses"
- Sort: Relevance | Newest | Most Popular | Highest Rated
- View toggle: Grid/List

#### Course Card
- Thumbnail: 16:9 ratio
- Badges: difficulty (top-left), AI Recommended (top-right)
- Title: max 2 lines
- Meta: duration | lessons | rating
- Skill tags: max 3 + "+2 more"
- XP reward: "Earn up to 500 XP"
- If enrolled: progress bar + percentage
- If not: "Enroll →" button
- Hover: card lifts, primary border, "Quick Preview" fades in

---

### 2.5 Course Detail (`/courses/[id]`)

#### Layout: Hero + Content (2/3) + Sticky Sidebar (1/3)

#### Hero Section
- Large thumbnail h-80
- Gradient overlay from bottom
- Title, rating, student count
- Difficulty badge
- Author avatar + name + role

#### Tabbed Content
- Tabs: Overview | Curriculum | Reviews

**Overview:**
- Description paragraph
- "What you'll learn" checklist (2-column grid)

**Curriculum:**
- Accordion modules
- Lesson items: icon, title, duration, checkmark/lock

**Reviews:**
- Rating stats
- Review list

#### Sticky Sidebar
- Duration + lessons count
- XP reward (gold)
- Progress bar (if enrolled)
- CTA: "Continue Learning" or "Enroll Now"

---

### 2.6 Learning Page (`/learn/[courseId]/[lessonId]`)

#### Layout: Fixed Header + Left Nav (280px) + Main Content + Floating AI

#### Fixed Header
- Back link to course
- Course title
- Full-width gradient progress bar
- Lesson counter (JetBrains Mono)

#### Left Sidebar - Lesson Navigation
- Collapsible modules
- Lesson items: icon, title, duration, completion status
- Current lesson: primary color left border

#### Main Content - Lesson Types
- **Video:** Custom video player
- **Text:** Max 70ch line length, code blocks, callout boxes
- **Quiz:** Card questions, clickable answers, animations

#### Bottom Navigation
- Previous/Next lesson links
- Progress dots
- "Mark as Complete" + XP hint

#### Floating AI Coach Button
- Position: bottom-right fixed
- 56px circle, primary color
- Slides in chat panel on click

---

### 2.7 Profile Page (`/profile`)

#### Layout: Hero + Main Content (2/3) + Skills Panel (1/3)

#### Hero Section
- Large avatar with level ring border
- Name, role, department
- LevelBadge (large, centered with glow)
- XPProgressBar (large)
- Stats: Total XP | Courses | Streak | Global Rank

#### Achievements Section
- Grid of AchievementBadge components
- Earned: full color + tier glow
- Locked: grayscale + 🔒

#### Activity Heatmap
- GitHub-style contribution grid
- 52 weeks × 7 days
- 5 intensity levels

---

### 2.8 Goals Page (`/goals`)

- Full-width layout
- Header with "New Goal" CTA
- Goal cards: icon, title, deadline, XP reward, progress bar
- Empty state with motivational copy

---

### 2.9 Teams Page (`/teams`)

- Full-width layout
- Stats cards: Members, Total XP, Courses Completed, Avg. Streak
- Team members grid

---

### 2.10 Analytics Page (`/analytics`)

- Full-width layout
- Charts: Weekly XP, Progress Over Time
- Stats grid: Total Time, Avg Session, Completion Rate, Quiz Average

### 2.10b Public Certificate Verification Page (`/verify/[certificate_id]`)

**Purpose:**
- Public-facing verification page for scanned certificate QR codes

**Layout:**
- Centered validation card with no authenticated shell
- Max width: `max-w-3xl`
- Strong status-first hierarchy with large icon and concise summary

**States:**
- **Valid:** green-accent card with large âœ… indicator
- **Invalid:** red-accent card with large â‌Œ indicator
- **Revoked / Expired:** amber-accent card with large âڑ ï¸ڈ indicator

**Displayed fields for valid certificates:**
- Certificate ID
- Full name
- Course name
- Completion date
- Grade
- Score
- Issued at
- Expires at

**Behavior:**
- Must work on desktop and mobile
- Must be understandable without requiring JSON knowledge
- Certificate ID and timestamps use monospace styling

---

### 2.11 Admin Pages (Tenant-Level)

**Existing Tenant Admin Sidebar (add new section):**
```
[existing sections: Dashboard, Users, Courses, Teams, Goals, Gamification, Analytics]
├── Identity & Access   /admin/identity             ← NEW
│     (badge: pending user count + email mismatch count, real-time)
└── [existing: Settings]
```

| Page | URL | Purpose |
|------|-----|---------|
| Admin Dashboard | `/admin` | System overview (tenant-scoped for Admin) |
| User Management | `/admin/users` | Manage users (tenant-scoped) |
| Course Management | `/admin/courses` | Manage all courses (tenant-scoped) |
| Course Editor | `/admin/courses/[id]/edit` | Create/edit courses |
| Analytics Dashboard | `/admin/analytics` | Platform analytics (tenant-scoped) |
| Identity & Access | `/admin/identity` | **NEW** - Identity management for own tenant |
| Pending Users | `/admin/identity/pending` | Pending users table with role assignment |
| Email Mismatches | `/admin/identity/email-sync` | Email change review and admin confirmation |
| Role Mapping Rules | `/admin/identity/role-mapping` | Tenant-level claim→role rules |
| Manual Role Override | `/admin/identity/override` | Role/status override with force logout |
| Access Revocation | `/admin/identity/revocation` | Emergency controls |
| Identity Audit Log | `/admin/identity/audit` | Tenant identity audit log |
| Settings | `/settings` | Platform settings (tenant-scoped) |

**Preferences Tab (within Settings):**
- **Timezone Field:** The Preferences tab timezone dropdown must:
  - Save to the backend via `PUT /users/{user_id}` and to the database, NOT only to localStorage
  - Use IANA timezone strings as options (e.g., America/Los_Angeles, America/New_York, Europe/London, Europe/Paris, Africa/Cairo, Africa/Tunis, Asia/Riyadh), NOT UTC offset labels (e.g., "UTC-08:00 Pacific")
  - Show the note: "Your timezone is used to calculate your learning streaks and daily progress. Changes take effect immediately."

**Tenant Admin Identity & Access Pages:**

**Pending Users (`/admin/identity/pending`):**
- Table: Name, Email, First Login Date, Days Waiting (color-coded), Current Default Role
- Actions: Assign Role inline dropdown, Bulk assign role
- Real-time badge count on sidebar

**Email Mismatches (`/admin/identity/email-sync`):**
- **NEW** — Dedicated page for email change detection and admin confirmation
- Table columns: User name, Platform email (current), Entra ID email (new), Detected date, Days unresolved
- Per-row actions: "Update to Entra ID" (confirm), "Keep current" (reject)
- Bulk action: "Update all to Entra ID email"
- Badge count on /admin/identity nav item includes emailMismatch users + pending users
- Calls: GET `/identity/email-mismatches`, POST `/identity/users/{id}/confirm-email`, POST `/identity/users/{id}/keep-email`

**Role Mapping Rules (`/admin/identity/role-mapping`):**
- Same UI as Super Admin but scoped to this tenant
- Target roles: Manager, LearningExpert, TeamManager, TeamMember, TeamIntern
- NOT available: Admin, SuperAdmin

**Manual Role Override (`/admin/identity/override`):**
- User search within this tenant only
- Change role, change status, add reason note
- Force logout toggle (invalidate tokens)
- Writes to tenant audit log

**Access Revocation (`/admin/identity/revocation`):**
- Emergency controls: Force Logout, Suspend, Deactivate, Unlock
- Mandatory reason field
- Bulk operations supported

**Identity Audit Log (`/admin/identity/audit`):**
- Columns: Timestamp, Actor, Target, Old Role, New Role, Reason, Source, IP
- Filter by date range, action type
- Export to CSV

### 2.12 Super Admin Portal Pages (REVISED - Admin Management Only)

**Sidebar Navigation:**
```
Super Admin Panel
├── Dashboard              /superadmin/dashboard
├── Companies              /superadmin/tenants
├── Admins & Identity     /superadmin/identity       ← renamed, merged
│     (badge: count of unassigned/suspended admins)
├── Analytics            /superadmin/analytics
└── Platform Settings   /superadmin/settings
```

| Page | URL | Purpose |
|------|-----|---------|
| Super Admin Dashboard | `/superadmin/dashboard` | Cross-tenant stats, platform health |
| Tenant Management | `/superadmin/tenants` | List, create, suspend, delete tenants |
| Tenant Detail | `/superadmin/tenants/[id]` | Config, seat usage, admin assignment, feature flags |
| Tenant Admin Management | `/superadmin/identity` | List all Tenant Admins across companies |
| Admin Role Mapping Rules | `/superadmin/identity/role-mapping` | Platform-level claim→Admin rules |
| Admin Audit Log | `/superadmin/identity/audit` | Admin actions audit log |
| Cross-Tenant Analytics | `/superadmin/analytics` | Aggregated analytics (anonymized) |
| Platform Settings | `/superadmin/settings` | Global platform settings |

**Tenant Admin Management Page (`/superadmin/identity`):**
- Table: Name, Email, Assigned Company, Status, Last Login, Created At, Created By
- Actions per row: Edit Assignment, Reset Password, Suspend Admin, Revoke Assignment
- Filter: by company, by status
- "Assign New Admin" button

**Admin Role Mapping Page (`/superadmin/identity/role-mapping`):**
- Rule list: claim_type, operator, value, target_role, priority, is_active
- "Test Rule" simulation feature
- Target role restricted to: Admin only

#### Super Admin Dashboard (`/superadmin/dashboard`) — Full Widget Layout

**Layout Structure:**
- Container: max-w-[1440px] centered, p-8 padding
- Card-based layout with rounded-2xl borders

**Row 1 — Stats Cards (4 cards in grid-cols-4):**

1. **Total Tenants:**
   - Label: "Total Tenants" text-sm text-muted-foreground
   - Value: "X / Y" in JetBrains Mono text-3xl (X active, Y suspended)
   - Icon: Building2 in #6C63FF
   - Sub-badges: Active (green), Suspended (red)

2. **Total Users:**
   - Label: "Total Users" text-sm text-muted-foreground  
   - Value: "X" in JetBrains Mono text-3xl
   - Icon: Users in #00D4AA

3. **Platform Health:**
   - Label: "Platform Health" text-sm text-muted-foreground
   - Value: "X%" in JetBrains Mono text-3xl
   - Color coding: green >90%, yellow 70-90%, red <70%
   - Subtitle: "X services healthy" text-xs

4. **Total Courses:**
   - Label: "Total Courses" text-sm text-muted-foreground
   - Value: "X" in JetBrains Mono text-3xl
   - Icon: BookOpen in #FFD700

**Row 2 — Main Content (2/3) + Sidebar (1/3):**

*Left Column (col-span-2):*

**Tenant Activity Table:**
- Card: bg-card rounded-2xl border border-border overflow-hidden
- Header: "Tenant Activity" text-xl mb-4
- Table columns:
  - Tenant Name (sortable)
  - User Count (sortable)
  - Active Users (last 7 days) (sortable)
  - Admin Assigned: "Yes" (green) / "No" (red)
  - Entra ID: "Yes" (green) / "No" (red)
  - Status: Badge (Active=green, Suspended=red, Pending=yellow)
- Actions per row: "Manage" button → navigates to `/superadmin/tenants/[id]`
- Empty state: "No tenants yet. Create your first tenant to get started."

**Getting Started Checklist:**
- Card: gradient border from-[#6C63FF] to-[#00D4AA]
- Header: "Getting Started" with progress badge "X/6 complete"
- Only shown when `system_config.superadmin_onboarded = false`
- Checklist items:
  1. ✅ Platform configured (auto-checked)
  2. ✅ First tenant created (auto-checked)
  3. ⬜ Assign a Tenant Admin to each company
  4. ⬜ Configure Azure Entra ID per tenant
  5. ⬜ Set seat limits per tenant
  6. ⬜ Invite/create first users per tenant
- Each incomplete item: clickable → navigates to relevant page
- Highlight animation on first login to draw attention

*Right Column (1/3):*

**Quick Actions Card:**
- Card: bg-card rounded-2xl border border-border p-6
- Header: "Quick Actions" text-lg mb-4
- Grid layout: 2x2 gap-3
- Buttons:
  1. "Create New Tenant" + Building2 icon → `/superadmin/tenants/new`
  2. "Assign Tenant Admin" + UserPlus icon → `/superadmin/identity`
  3. "View Analytics" + BarChart2 icon → `/superadmin/analytics`
  4. "Platform Settings" + Settings icon → `/superadmin/settings`

**Platform Alerts Card:**
- Card: bg-card rounded-2xl border border-border p-6
- Header: "Platform Alerts" text-lg mb-4 with alert count badge
- Alert items (color-coded cards):
  - Red: "X tenants have no admin assigned"
  - Red: "X tenants have no Entra ID config"
  - Yellow: "Seat limit reached: [Tenant Name]"
- Each alert: clickable → navigates to relevant tenant detail
- Empty state: "All clear! No issues detected."

---

#### Platform Settings Page (`/superadmin/settings`) — Full Tabbed Interface

**Layout:**
- Horizontal tab navigation (General, Security, Notifications, AI & Agents, Danger Zone)
- Tab content area with form fields
- Save buttons per section

**Tab 1: General**
- Card: bg-card rounded-2xl border border-border p-6
- Fields:
  - Platform Name (Input, max 50 chars)
  - Logo Upload (drag & drop zone, shows preview, accepts image/*)
  - Support Email (Input, email validation)
  - Default Timezone (Select dropdown, IANA strings: Africa/Tunis, Europe/Paris, etc.)
  - Platform Language (Select: English, French, Arabic)
- Save button at bottom

**Tab 2: Security**
- Card: bg-card rounded-2xl border border-border p-6
- Fields:
  - JWT Expiry (Input, number, min 5, max 120, default 15, suffix "minutes")
  - Session Timeout (Input, number, min 1, max 24, default 8, suffix "hours")
  - Setup Key Rotation Reminder (toggle, shows "Last rotated: [date]")
  - Rate Limit (Input, number, min 10, max 1000, default 100, suffix "requests/min")
- Save button at bottom

**Tab 3: Notifications**
- Card: bg-card rounded-2xl border border-border p-6
- Fields:
  - Email Templates (toggle list):
    - Welcome email (toggle)
    - Course assigned (toggle)
    - Deadline reminder (toggle)
    - Course completion (toggle)
    - Certificate issued (toggle)
    - Inactivity alert (toggle)
  - SMTP Configuration (collapsible section):
    - Host (Input)
    - Port (Input, number)
    - Username (Input)
    - Password (Input, password type)
    - From Address (Input, email)
    - Use TLS (toggle)
  - "Test Email" button → sends test email to support email
- Save button at bottom

**Tab 4: AI & Agents**
- Card: bg-card rounded-2xl border border-border p-6
- Fields:
  - GROQ API Key:
    - Display: "sk-...XXXX" (masked, last 4 visible)
    - "Update Key" button → opens modal with new key input
  - Demo Mode (toggle): When enabled, AI uses pre-defined responses
  - Agent Toggles (grid of switches):
    - Chat Coach AI (toggle, default ON)
    - Recommendation AI (toggle, default ON)
    - Gamification AI (toggle, default ON)
    - Course Maker AI (toggle, default OFF)
    - Content Librarian AI (toggle, default OFF)
    - Skill Gap Analyzer AI (toggle, default OFF)
- Save button at bottom

**Tab 5: Danger Zone**
- Card: bg-card rounded-2xl border-2 border-[#FF6B6B] p-6
- Header: "Danger Zone" text-lg text-[#FF6B6B] mb-4
- Warning notice: "These actions are irreversible. Please proceed with caution."
- Actions:
  1. **Reset Platform:**
     - Button: bg-[#FF6B6B] text-white
     - Click → Confirmation modal: "Type 'RESET' to confirm"
     - On confirm: Wipes all data, sets setup_completed=false, redirects to /setup
  2. **Export All Data:**
     - Button: outline border-[#FF6B6B] text-[#FF6B6B]
     - Click → Downloads JSON dump of all platform data
- Data export includes: tenants, users, courses, enrollments, progress, teams, goals

---

#### Tenant Detail Page (`/superadmin/tenants/[id]`) — Setup Progress Section

**Layout:**
- Page header: Tenant name + status badge + action buttons (Edit, Suspend, Delete)
- NEW: Setup Progress section at top (prominent, full-width)

**Setup Progress Section:**
- Card: gradient border from-[#6C63FF]/30 to-[#00D4AA]/30 bg-[#6C63FF]/5 rounded-2xl p-6 mb-6
- Header: "Setup Progress" text-xl mb-4 + Overall health score badge "X% complete"
- Progress bar: full-width, gradient fill, shows completion percentage

**4-Step Progress Indicator:**

1. **Azure Entra ID:**
   - Status: Configured (✅ green check) or Not Configured (❌ red X)
   - When Configured: Shows "App ID: ...XXXX" subtitle
   - When Not Configured: CTA "Configure" → opens Entra ID config modal
   - Card style: green border if done, red border if not

2. **Tenant Admin:**
   - Status: Assigned (✅ + admin name + avatar) or Not Assigned (❌)
   - When Assigned: Shows admin email
   - When Not Assigned: CTA "Assign Admin" → navigates to `/superadmin/identity?tenant={id}`
   - Card style: green border if done, red border if not

3. **Seat Limit:**
   - Status: "Set: X seats" (✅ green) or "Unlimited" (⚠️ yellow) or "Not Set" (❌ red)
   - When Not Set: CTA "Set Limit" → opens seat limit modal
   - Card style: green/yellow/red based on status

4. **First Users:**
   - Status: "X users" (✅ green) or "No users yet" (❌ red)
   - Shows user count with avatar stack (max 3)
   - When None: CTA "Invite Users" → navigates to `/admin/users?tenant={id}`
   - Card style: green if users > 0, red if none

**Tenant Info Section:**
- Below Setup Progress: tenant details card
- Fields: Name, Slug, Logo, Primary Color, Status, Created Date
- Usage: user count vs seat limit (progress bar if limit set)

#### Tenant Management (`/superadmin/tenants`)
- Table: Name, Slug, Status (active/suspended/pending), User Count, Seat Limit, Created
- Actions: Create, Edit, Suspend/Activate, Delete
- Status badges with color coding

#### Tenant Detail (`/superadmin/tenants/[id]`)
- Tenant info: name, slug, logo, primary color, status
- Usage: user count vs seat limit progress bar
- Assigned admin(s) with avatar and email
- Feature flags: toggle AI agents, gamification, etc.
- Actions: Edit, Suspend, Delete

### 2.13 Login Flow Update

#### Tenant Resolution
- Landing page: Tenant slug input OR email domain auto-detection
- After resolution: redirect to correct Azure Entra ID or local login

#### Login URLs
- Tenant Azure login: `/auth/login/azure?tenant={slug}`
- Tenant local login: `/auth/login/local?tenant={slug}`
- Super Admin login: `/auth/login/local` (no tenant parameter)

---

## 3. Component Library

### 3.1 Navigation
| Component | Usage |
|-----------|-------|
| Sidebar | Main navigation (240px width) |
| Topbar | Logo, search, notifications, profile |
| Breadcrumb | Path indicator |
| TabBar | Switch between views |

### 3.2 Content
| Component | Usage |
|-----------|-------|
| CourseCard | Course preview in grid/list |
| LessonItem | Lesson in sidebar with status |
| ModuleAccordion | Expandable modules |
| ProgressRing | Circular progress |
| XPBadge | Display XP with animation |
| StreakCounter | Current streak display |
| LeaderboardRow | User row in leaderboard |

### 3.3 Feedback
| Component | Usage |
|-----------|-------|
| Toast | Success/error notifications |
| Modal | Confirmations, forms |
| Skeleton | Loading states |
| EmptyState | No data illustrations |

### 3.4 Gamification
| Component | File | Purpose |
|-----------|------|---------|
| XPProgressBar | `components/ui/XPProgressBar.tsx` | XP fill bar with gradient + shimmer |
| LevelBadge | `components/ui/LevelBadge.tsx` | Circular level with tier colors |
| StreakCounter | `components/ui/StreakCounter.tsx` | Streak fire with pulse |
| AchievementBadge | `components/ui/AchievementBadge.tsx` | Hexagonal achievement |
| RoleSwitcher | `components/ui/RoleSwitcher.tsx` | Role toggle UI |

### 3.5 AI
| Component | Usage |
|-----------|-------|
| ChatMessage | User/AI message bubble |
| ChatInput | Message input with suggestions |
| RecommendationCard | Course recommendation |
| AITypingIndicator | Loading state |

---

## 4. Responsive Breakpoints

| Breakpoint | Width | Sidebar Behavior |
|------------|-------|------------------|
| Desktop | 1440px | Full 240px sidebar |
| Tablet | 768px | Collapsed icon-only (56px) |
| Mobile | < 768px | Bottom navigation bar |

---

## 5. Animations & Transitions

### Hover Effects
- Cards: `hover:border-primary/50 transition-all`
- Buttons: `hover:opacity-90 transition-opacity`
- Links: `hover:underline`
- Interactive cards: `hover:shadow-lg transition-all`
- Images: `group-hover:scale-105 transition-transform`

### Active States
- Status indicators: `animate-pulse` on colored dots
- XP reward animation: fade + scale + translate

### Transitions
- Default: 150-200ms using transition-colors, transition-opacity, transition-all
- Page transitions: Fade (150ms)
- Card hover: Scale (1.02) + shadow (200ms)
- Progress updates: Animated fill (300ms ease-out)
- XP gains: Pop-up + count-up animation

---

## 6. Micro-Copy Reference

| State | Copy |
|-------|------|
| Empty courses | "No courses here yet. Your future self is waiting 👀" |
| No notifications | "You're all caught up! Go learn something 🚀" |
| Streak broken | "Streak reset. But hey, every legend has a comeback arc 💪" |
| Level up | "LEVEL UP! 🎉 You just got 1% more dangerous." |
| Loading | "Brewing your personalized content... ☕" |
| AI Coach greeting | "Hey! I've read every lesson here so you don't have to start from scratch 🤖" |
| Challenge subtitle | "Your AI coach cooked this one up just for you 🧑‍🍳" |
| Streak widget | "You're on fire! 🚀" |
| Empty goals | "No goals here yet. Your future self is waiting 👀" |

---

## 7. Accessibility Notes

- Maintain sufficient color contrast for text readability
- Interactive elements have visible hover/focus states
- Important actions use high-contrast primary buttons
- Status indicators use both color and text/icons
- All interactive elements are keyboard accessible

---

*Generated for PFE Project: Enterprise AI-Driven Upskilling & Mentorship Platform*
*Author: Aya Telmoudi | Supervisor: Hazem Raouafi*
*Last Updated: 2026-04-08*
