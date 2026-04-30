# UI-DESIGN-SYSTEM.md — SkillForge
> **Single source of truth for all UI implementation decisions.**
> Every developer, every AI agent, every Kilo session must read this file before touching any UI code.
> Last updated: 2026-03-25

---

## ⚠️ Golden Rules (Read First)

- **NEVER** hardcode hex colors — always use CSS variables from `theme.css`
- **NEVER** reimplement a component that already exists in `src/app/components/figma/ui/`
- **NEVER** hardcode font families — always import from `fonts.css`
- **NEVER** use arbitrary Tailwind values (e.g. `w-[347px]`) — use design tokens
- **ALWAYS** use JetBrains Mono for any number display related to XP, streaks, levels
- **ALWAYS** register new routes in `routes.ts` only
- **ALWAYS** place new pages in `src/app/pages/`
- **ALWAYS** place new shared components in `src/app/components/`

---

## 1. Brand Identity

| Property | Value |
|---|---|
| Platform Name | SkillForge |
| Personality | Professional + energetic, learning feels like an adventure |
| Tone | Smart, motivating, slightly witty |
| Core Emotion | "I actually want to open this app today" |
| Visual Metaphor | LinkedIn meets Duolingo meets a premium gaming dashboard |

---

## 2. Design Tokens

### 2.1 Colors — Dark Mode (Primary)

| Token | Hex | Usage |
|---|---|---|
| `--background` | `#0F1117` | Main app background |
| `--card` | `#1A1D27` | Card surfaces |
| `--card-foreground` | `#F0F0F5` | Text on cards |
| `--popover` | `#222536` | Dropdowns, modals |
| `--primary` | `#6C63FF` | Primary brand — electric violet |
| `--primary-light` | `#8B85FF` | Hover states |
| `--secondary` | `#00D4AA` | Success, XP gains, streaks — mint green |
| `--destructive` | `#FF6B6B` | Errors, warnings |
| `--gold` | `#FFD700` | Achievements, rewards |
| `--text-primary` | `#F0F0F5` | Main text |
| `--text-secondary` | `#8B8FA8` | Muted/secondary text |
| `--border` | `#2A2D3E` | Borders, dividers |

### 2.2 Colors — Light Mode

| Token | Hex | Usage |
|---|---|---|
| `--background` | `#F4F5FA` | Main app background |
| `--card` | `#FFFFFF` | Card surfaces |
| `--card-foreground` | `#1A1D27` | Text on cards |
| `--popover` | `#FFFFFF` | Dropdowns, modals |
| `--primary` | `#5B54E8` | Primary brand — darker violet |
| `--secondary` | `#00B896` | Success, XP gains |
| `--text-primary` | `#1A1D27` | Main text |
| `--text-secondary` | `#6B6F87` | Muted/secondary text |
| `--border` | `#E2E4EF` | Borders, dividers |

### 2.3 Brand-Specific Colors (Gamification)

| Color | Dark Hex | Light Hex | Usage |
|---|---|---|---|
| Brand Primary | `#6C63FF` | `#5B54E8` | Main actions, active states |
| Brand Secondary | `#00D4AA` | `#00B896` | Success, progress |
| Brand Gold | `#FFD700` | — | XP rewards, achievements |
| Brand Bronze | `#CD7F32` | — | Level 1–10 tier |
| Brand Silver | `#C0C0C0` | — | Level 11–25 tier |
| Brand Platinum | `#E5E4E2` | — | Level 51+ tier |

---

## 3. Typography

| Element | Font | Weight | Size |
|---|---|---|---|
| `h1` | Inter / Plus Jakarta Sans | Bold 700 | 32px / 2rem |
| `h2` | Inter / Plus Jakarta Sans | SemiBold 600 | 24px / 1.5rem |
| `h3` | Inter / Plus Jakarta Sans | SemiBold 600 | 20px / 1.25rem |
| `h4` | Inter / Plus Jakarta Sans | SemiBold 600 | 16px / 1rem |
| Body | Inter | Regular 400 / Medium 500 | 14px / 0.875rem |
| Code / Numbers | JetBrains Mono / Fira Code | Medium 500 | 14px / 0.875rem |
| Labels | Inter | Medium 500 | 14px / 0.875rem |
| Small text | Inter | Regular 400 | 12px / 0.75rem |

> **Rule:** All XP numbers, streak counts, level numbers, and timers must use `JetBrains Mono`.

---

## 4. Spacing & Layout Tokens

| Token | Value |
|---|---|
| Base unit | 4px |
| Card border radius | 16px (`rounded-2xl`) |
| Button border radius | 10px (`rounded-[10px]`) |
| Badge / pill radius | 999px (fully rounded) |
| Input border radius | 10px |
| Sidebar width | 240px |
| Content max-width | 1440px |
| Right panel width | 300px |
| Filter sidebar width | 260px |
| Lesson nav sidebar width | 280px |

---

## 5. Elevation & Visual Effects

| Effect | Rule |
|---|---|
| Card hover (dark) | `box-shadow: 0 0 0 1px rgba(108, 99, 255, 0.3)` |
| Achievement glow | Outer glow matching the badge tier color |
| Modals / overlays | Glassmorphism — `backdrop-blur` |
| XP bar fill | Gradient `#6C63FF → #00D4AA` with animated shimmer (white 30% opacity) |

---

## 6. Responsive Breakpoints

| Breakpoint | Width | Sidebar Behavior |
|---|---|---|
| Desktop | 1440px | Full 240px sidebar |
| Tablet | 768px | Collapsed icon-only sidebar (56px wide) |
| Mobile | < 768px | Bottom navigation bar replaces sidebar |

---

## 7. Gamification Visual Language

### 7.1 XP Progress Bar — `XPProgressBar.tsx`

- Fill: gradient `#6C63FF → #00D4AA`
- Animation: shimmer (white 30% opacity, moving)
- Numbers: JetBrains Mono
- Heights: `sm` = 8px | `md` = 12px | `lg` = 16px

### 7.2 Level Badge — `LevelBadge.tsx`

- Shape: circular
- Sizes: `sm` = 48px | `md` = 64px | `lg` = 96px
- Tier gradients:
  - Level 1–10: Bronze `#CD7F32 → #A0522D`
  - Level 11–25: Silver `#C0C0C0 → #808080`
  - Level 26–50: Gold `#FFD700 → #FFA500`
  - Level 51+: Platinum with iridescent shimmer

### 7.3 Streak Counter — `StreakCounter.tsx`

- Icon: 🔥 fire emoji
- Number: JetBrains Mono, bold
- Glow: warm orange glow when streak > 7 days
- Animation: subtle pulse when streak > 7 days

### 7.4 Achievement Badge — `AchievementBadge.tsx`

- Shape: hexagonal (`clip-path` polygon)
- Tiers: Bronze | Silver | Gold | Platinum
- Unlocked: full color with tier glow
- Locked: grayscale + 🔒 lock icon overlay
- Hover: scale up + tooltip showing description

### 7.5 Leaderboard Rank Styles

| Rank | Visual Treatment |
|---|---|
| #1 | Gold crown icon + gold text + golden background tint + glow |
| #2 | Silver medal icon + silver treatment |
| #3 | Bronze medal icon + bronze treatment |
| #4+ | Clean rank number, no special treatment |

---

## 8. Page-by-Page Breakdown

---

### 8.1 Dashboard (Main Hub)

**Route:** `/` or `/dashboard`
**Layout:** Left Sidebar (240px) + Main Content + Optional Right Panel (300px)

#### Left Sidebar
- **Logo section:** SkillForge logo (Zap icon) + brand name
- **User profile card:**
  - Avatar (48px circle)
  - Name + role
  - `LevelBadge` (small, `sm` size)
  - `XPProgressBar` (mini)
  - XP counter in JetBrains Mono: `"4,230 / 5,000 XP"`
- **Navigation items:**
  - 🏠 Dashboard
  - 📚 Courses
  - 🤖 AI Coach
  - 🏆 Leaderboard
  - 👥 My Team
  - 🎯 Goals
  - 📊 Analytics
  - ⚙️ Settings
- **Streak widget:** `StreakCounter` + `"12 days"` + `"You're on fire! 🚀"`
- **Theme toggle:** Sun/Moon icon button

#### Main Content — Row 1: Hero Welcome Banner
- Background: gradient `from-[#6C63FF]/20 to-[#00D4AA]/20`
- Heading: `"Good morning, Aya! 🚀"`
- Subtitle: `"You're 3 lessons away from leveling up."`
- CTAs: `"Continue Learning"` (primary button) + `"View Goals"` (ghost button)

#### Main Content — Row 2: Stats Cards (4 columns)

| Card | Content |
|---|---|
| XP This Week | Number `2,450` + sparkline + trend arrow `+23%` |
| Current Streak | 🔥 + streak number `12` + `"Personal best: 21 days"` |
| Courses Completed | Count `18` + `"2 away from milestone"` |
| Team Rank | `"#3 on your team"` |

#### Main Content — Row 3: Two Columns (60 / 40)

**Left — Continue Learning:**
- In-progress course cards
- Each card: thumbnail (16:9), title, progress bar, next lesson name, `"Resume →"` button
- Badge labels: `"🔥 Hot"` or `"⭐ New"`

**Right — Today's Challenge:**
- Title: `"Today's Challenge"`
- Difficulty badge: Easy / Medium / Hard (color coded)
- XP reward: `"+150 XP"` in gold (`--gold`)
- Timer: `"⏱️ 3h 24m left"`
- CTA: `"Accept Challenge"`
- Subtitle copy: `"Your AI coach cooked this one up just for you 🧑‍🍳"`

#### Main Content — Row 4: Two Columns (60 / 40)

**Left — Recommended by AI:**
- 3 course cards
- Each: thumbnail, title, relevance badge (e.g. `"94% match"`), reason text

**Right — Team Activity Feed:**
- Activity items: avatar + action text + timestamp
- Example: `"Ahmed earned the 🏆 Speed Learner badge"`

---

### 8.2 Course Catalog

**Route:** `/courses`
**Layout:** Filter Sidebar (260px left) + Course Grid (main)

#### Filter Sidebar
- Search bar with placeholder: `"Try: 'async javascript'"`
- Filter sections:
  - **Difficulty:** Beginner | Intermediate | Advanced
  - **Duration:** < 5 hours | 5–15 hours | 15+ hours
  - **Skills:** React, Python, TypeScript, Design, ML
- Active filters: removable pills
- `"Clear All"` link to reset

#### Main Content
- Header: `"Course Catalog"` + `"Showing X courses"`
- Sort: Relevance | Newest | Most Popular | Highest Rated
- View toggle: Grid (3 columns) / List

#### Course Card Anatomy
- Thumbnail: 16:9 ratio
- **Top-left badge:** Difficulty (green = Beginner / yellow = Intermediate / red = Advanced)
- **Top-right badge:** `"AI Recommended"` (violet, only when applicable)
- Title: max 2 lines
- Author avatar + name
- Meta row: ⏱ Duration | 📚 Lessons | ⭐ Rating
- Skill tags: max 3 shown + `"+2 more"`
- XP reward: `"Earn up to 500 XP"` in `--gold`
- **If enrolled:** progress bar + `"X% complete"`
- **If not enrolled:** `"Enroll →"` button
- **Hover state:** card lifts, primary color border, `"Quick Preview"` fades in

---

### 8.3 Course Detail

**Route:** `/courses/:id`
**Layout:** Hero + Content (2/3) + Sticky Sidebar (1/3)

#### Hero Section
- Large thumbnail (`h-80`)
- Gradient overlay from bottom
- Course title, rating, student count
- Difficulty badge
- Author avatar + name + role

#### Tabbed Content Area
Tabs: `Overview` | `Curriculum` | `Reviews`

**Overview tab:**
- Description paragraph
- `"What you'll learn"` checklist in 2-column grid

**Curriculum tab:**
- Accordion-style modules
- Each lesson item: icon (video / text / quiz), title, duration, checkmark (completed) or lock (locked)

**Reviews tab:**
- Placeholder: `"Reviews coming soon"`

#### Sticky Sidebar
- Duration + lessons count
- XP reward displayed in `--gold`
- Progress bar (if user is enrolled)
- CTA: `"Continue Learning"` (enrolled) or `"Enroll Now"` (not enrolled)
- Note: `"Free for all employees"`

---

### 8.4 Learning Page (Course Player)

**Route:** `/courses/:id/learn/:lessonId`
**Layout:** Fixed Header + Left Nav Sidebar (280px) + Main Content + Floating AI Button

#### Fixed Header
- Back link to course
- Course title
- Full-width gradient progress bar
- `"X of Y lessons"` counter (JetBrains Mono)

#### Left Sidebar — Lesson Navigation
- Collapsible module sections
- Each lesson: icon, title, duration, completion checkmark or lock
- Current lesson: primary color left border highlight
- Completed lessons: muted style with checkmark

#### Main Content — Lesson Types

**Video lesson:**
- Full video player with custom controls

**Text lesson:**
- Max `70ch` line length
- Code blocks with syntax highlighting
- Pro tip callout boxes

**Quiz:**
- Card-based questions
- Large clickable answer options
- Correct answer: green glow
- Wrong answer: red shake animation + correct answer revealed

#### Bottom Navigation Bar
- `"← Previous Lesson"` | Progress dots | `"Next Lesson →"`
- `"Mark as Complete"` button with XP hint: `"Complete (+50 XP) ✨"`

#### Floating AI Coach Button
- Position: bottom-right fixed
- Size: 56px circle, `--primary` color, message icon
- On click: slides in chat panel from the right
  - Header: `"AI Coach"` + `"Ask me anything about this lesson 🤓"`
  - Messages: user / assistant bubble layout
  - Input: `"Type your question..."`

---

### 8.5 Leaderboard

**Route:** `/leaderboard`
**Layout:** Main Content (2/3) + Stats Sidebar (1/3)

#### Header Tabs
`Global` | `My Team` | `Weekly` | `Monthly`

#### Top 3 Podium
- **#1 (center, tallest):** gold gradient card, gold ring avatar, crown icon
- **#2 (left, medium):** silver gradient card
- **#3 (right, shortest):** bronze gradient card
- Each podium block: avatar + name + `LevelBadge` + XP count

#### Leaderboard Table (Rank 4+)
| Column | Content |
|---|---|
| Rank | Number |
| User | Avatar + name |
| XP | JetBrains Mono number |
| Courses | Count |
| Streak | 🔥 + count |
| Change | ↑ green / ↓ red / — neutral |

- Current user row: highlighted with `--primary` left border

#### Stats Sidebar — "Your Stats This Week"
- XP earned + trend indicator
- Lessons completed
- Time spent
- Current streak (`StreakCounter`)
- Rank progress message: `"420 XP away from #5"`

---

### 8.6 Profile (Gamification Profile)

**Route:** `/profile`
**Layout:** Hero + Main Content (2/3) + Skills Panel (1/3)

#### Hero Section
- Large avatar with level ring border (gold for level 26+)
- Name, role, department
- `LevelBadge` (large, `lg` size, centered with glow)
- `XPProgressBar` (large, `lg` size)
- Stats row: Total XP | Courses | Streak | Global Rank

#### Achievements Section
- Title: `"Achievements"` + `"X/Y unlocked"`
- Grid: `AchievementBadge` components, 6 per row
- Earned: full color + tier glow
- Locked: grayscale + 🔒 icon
- Hover: tooltip with badge description

#### Activity Heatmap
- GitHub-style contribution grid
- 52 columns (weeks) × 7 rows (days)
- 5 color intensity levels: none → very high
- Legend below: `None | Low | High`

#### Skills Panel
- Title: `"Skill Levels"`
- Progress bars per skill: Frontend, Backend, AI/ML, etc.
- `"Top Skills"` pills showing top 3 skills

---

### 8.7 Goals

**Route:** `/goals`
**Layout:** Full-width

#### Header
- Title: `"Goals"`
- Subtitle: `"Track your learning objectives and milestones"`
- CTA: `"New Goal"` button (primary)

#### Goal Card Anatomy
- Icon: 🎯 target
- Title: e.g. `"Complete 5 React Courses"`
- Meta: deadline date + XP reward (`--gold`)
- Status badge: `"In Progress"` (or other states)
- Progress bar + label: `"3 / 5"`

#### Empty State
- Copy: `"No goals here yet. Your future self is waiting 👀"`
- CTA: `"Create Your First Goal"`

---

### 8.8 Team

**Route:** `/team`
**Layout:** Full-width

#### Header
- Title: `"My Team"`
- Subtitle: `"Track your team's learning progress and achievements"`

#### Stats Cards (4 columns)

| Card | Content |
|---|---|
| Team Members | Count |
| Total XP | Number + trend `+15%` |
| Courses Completed | Count |
| Avg. Streak | 🔥 + average number |

#### Team Members Grid (2 columns)
Each member card:
- Avatar + `LevelBadge`
- Name + role
- Stats row: XP | Courses | Streak
- Status dot: green = active

---

### 8.9 Analytics

**Route:** `/analytics`
**Layout:** Full-width

#### Header
- Title: `"Analytics"`
- Subtitle: `"Your learning insights and progress metrics"`

#### Charts Section (2 columns)
- **Weekly XP Chart:** bar chart, Mon–Sun
- **Progress Over Time:** line chart, Oct–Mar

#### Stats Grid (4 columns)

| Card | Content |
|---|---|
| Total Learning Time | `"127h"` + `"This month: 24h"` |
| Avg. Session | `"45m"` + `"+5 min"` |
| Completion Rate | `"94%"` + `"17/18 courses"` |
| Quiz Average | `"89%"` + `"+3%"` |

---

## 9. Component Reference

| Component | File | Purpose |
|---|---|---|
| `XPProgressBar` | `components/figma/ui/XPProgressBar.tsx` | Displays XP fill bar with gradient + shimmer |
| `LevelBadge` | `components/figma/ui/LevelBadge.tsx` | Circular level indicator with tier colors |
| `StreakCounter` | `components/figma/ui/StreakCounter.tsx` | Streak fire display with pulse animation |
| `AchievementBadge` | `components/figma/ui/AchievementBadge.tsx` | Hexagonal achievement with tier glow |
| `RoleSwitcher` | `components/figma/ui/RoleSwitcher.tsx` | Role/permission toggle UI |
| `Sidebar` | `components/figma/ui/Sidebar.tsx` | Main left navigation sidebar |

### Component Props Quick Reference

```tsx
// XPProgressBar
{ currentXP: number; nextLevelXP: number; size?: 'sm'|'md'|'lg'; showLabel?: boolean }

// LevelBadge
{ level: number; size?: 'sm'|'md'|'lg' }

// StreakCounter
{ streak: number; personalBest?: number }

// AchievementBadge
{ name: string; tier: 'bronze'|'silver'|'gold'|'platinum'; locked?: boolean; description?: string }

// CourseCard (full)
{
  thumbnail: string; title: string;
  author: { name: string; avatar: string };
  difficulty: 'Beginner'|'Intermediate'|'Advanced';
  duration: string; lessons: number; rating: number;
  tags: string[]; xp: number; enrolled: boolean;
  progress?: number; aiRecommended?: boolean;
}
```

---

## 10. Micro-Copy Reference

| State | Copy |
|---|---|
| Empty courses | `"No courses here yet. Your future self is waiting 👀"` |
| No notifications | `"You're all caught up! Go learn something 🚀"` |
| Streak broken | `"Streak reset. But hey, every legend has a comeback arc 💪"` |
| Level up | `"LEVEL UP! 🎉 You just got 1% more dangerous."` |
| Loading | `"Brewing your personalized content... ☕"` |
| AI Coach greeting | `"Hey! I've read every lesson here so you don't have to start from scratch 🤖"` |
| Challenge subtitle | `"Your AI coach cooked this one up just for you 🧑‍🍳"` |
| Streak widget | `"You're on fire! 🚀"` |
| Empty goals | `"No goals here yet. Your future self is waiting 👀"` |

---


