---
name: sprint-excel-generator
description: Use this skill when generating a structured Excel (.xlsx) file from sprint documentation files. This includes parsing sprint markdown files, extracting General Tasks (GT) and Detailed Tasks (DT), calculating totals, and producing a multi-sheet Excel file where each sprint is represented as a separate sheet with consistent formatting, visual styling, and task tracking (status, story points, effort).
---

# Sprint Excel Generator Skill

## 🎯 Purpose

This skill transforms sprint documentation (Markdown files) into a **well-structured, visually appealing Excel file** used for project tracking and sprint management.

Each sprint becomes **one sheet** in a single Excel file.

---

## 📁 Input Source

- The agent must read sprint files from the project (e.g., `/sprints/` folder or equivalent).
- Each file follows a structured Markdown format containing:
  - Sprint title
  - General Tasks (GT-x.x)
  - Detailed Tasks (DT-x.x.x)
  - Status
  - Story Points
  - Effort

---

## 🧩 Extraction Rules

### 1. Sprint Identification
- Extract sprint name from title:
  - Example: `# Sprint 1: Project Setup`
- Sheet name format:
  → `Sprint 1`

---

### 2. General Tasks (GT)

Each General Task must include:
- ID (e.g., GT-1.0)
- Title (e.g., Platform First-Run Setup)

---

### 3. Detailed Tasks (DT)

For each DT:
- ID (e.g., DT-1.0.1)
- Title
- Status (DONE / PENDING)
- Story Points (integer)
- Effort (time string like ~2h)

---

## 📊 Excel Structure

Each sprint = **one sheet**

### Columns:

| Column | Description |
|--------|------------|
| Sprint | Sprint name + title |
| General Task | GT ID + Title |
| Detailed Task | DT ID + Title |
| Story Points | Numeric value |
| Effort | Time estimate |
| Status | Visual icon |
| Total SP (GT) | Sum of all DT story points |

---

## 🎨 Visual Design Requirements

### General Layout
- Use a **clean, modern layout**
- Apply **consistent styling across all sheets**

---

### 🎯 Styling Rules

#### Header Row:
- Bold text
- Centered alignment
- Background color (e.g., dark blue or purple)
- White font

---

#### General Task Rows:
- Each GT must have:
  - A **distinct background color block**
  - Slightly darker or highlighted row
- Acts as a visual separator between groups

---

#### Detailed Task Rows:
- Indented or visually nested under their GT
- Standard white or alternating row colors

---

### ✅ Status Representation (IMPORTANT)

DO NOT use plain text.

Use icons:
- ✅ → DONE
- ⏳ → PENDING

---

### 📊 Total Story Points (Per GT)

- Compute dynamically:
  - Sum all DT story points under the same GT
- Display this value in a merged or grouped cell aligned with the GT

---

### ✨ Additional Enhancements

- Auto-adjust column width
- Add borders for readability
- Freeze header row
- Align numeric columns properly
- Use alternating row shading for better readability

---

## 🧮 Logic Rules

- Group DTs under their corresponding GT
- Maintain hierarchy visually
- Ensure no DT is left ungrouped
- Preserve order from source file

---

## 📦 Output

- A single Excel file:
  → `sprint_tracking.xlsx`

- Contains:
  - One sheet per sprint
  - Consistent structure and formatting

---

## ⚙️ Implementation Guidance

The agent may:
- Use Python libraries such as:
  - `openpyxl` or `xlsxwriter`
- Parse Markdown using structured reading (headings, patterns)

---

## 📌 Example Mapping

### Input:
GT-1.0: Platform Setup
DT-1.0.1 — system_config table (SP: 2, DONE)
DT-1.0.2 — API setup (SP: 3, PENDING)

### Output:

| Sprint | General Task | Detailed Task | SP | Effort | Status | Total SP |
|--------|-------------|--------------|----|--------|--------|----------|
| Sprint 1 | GT-1.0 Platform Setup | DT-1.0.1 system_config table | 2 | 1h | ✅ | 5 |
|         |                     | DT-1.0.2 API setup            | 3 | 2h | ⏳ |   |

---

## 🚀 Triggering This Skill

This skill should activate when the user asks for:
- "Generate sprint Excel"
- "Create Excel from sprint files"
- "Build sprint tracking file"
- "Export sprint data to Excel"

OR explicitly:
→ "Use the sprint-excel-generator skill"

---

## ⚠️ Constraints

- Do NOT invent tasks — only extract from files
- Do NOT hardcode values
- Must reflect real sprint data
- Maintain consistency across all sheets

---

## 🧪 Validation Checklist

Before finishing:
- ✔ Each sprint has its own sheet
- ✔ GT grouping is correct
- ✔ DTs are properly nested
- ✔ Story Points totals are accurate
- ✔ Status icons are used (not text)
- ✔ Excel is readable and clean