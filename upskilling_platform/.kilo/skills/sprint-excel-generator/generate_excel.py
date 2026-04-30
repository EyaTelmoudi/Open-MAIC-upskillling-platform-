#!/usr/bin/env python3
"""
Sprint Excel Generator
Generates a structured Excel file from sprint markdown documentation
"""

import re
import os
from openpyxl import Workbook
from openpyxl.styles import Font, Alignment, PatternFill, Border, Side
from openpyxl.utils import get_column_letter

SPRINT_FILES = [
    ("Sprint 1", "D:/PFE/upskilling_platform/SPRINTS/SPRINT-1-infrastructure.md"),
    ("Sprint 2", "D:/PFE/upskilling_platform/SPRINTS/SPRINT-2-learning-platform.md"),
    ("Sprint 3", "D:/PFE/upskilling_platform/SPRINTS/SPRINT-3-gamification-teams.md"),
    ("Sprint 4", "D:/PFE/upskilling_platform/SPRINTS/SPRINT-4-ai-agents.md"),
    ("Sprint 5", "D:/PFE/upskilling_platform/SPRINTS/SPRINT-5-final-testing.md"),
]

OUTPUT_FILE = "D:/PFE/upskilling_platform/.kilo/skills/sprint-excel-generator/output/sprint_tracking_v4.xlsx"

# Colors per skill requirements
HEADER_FILL = PatternFill(
    start_color="1E3A5F", end_color="1E3A5F", fill_type="solid"
)  # Dark blue

# Different colors for each General Task
GT_COLORS = [
    "E8F4FD",  # Light blue
    "FDF4E8",  # Light orange
    "E8FDE8",  # Light green
    "F4E8FD",  # Light purple
    "E8FDFF",  # Light cyan
    "FFFDE8",  # Light yellow
    "FFE8E8",  # Light red/pink
    "FDE8FF",  # Light magenta
    "E8FFF0",  # Light mint
    "FFE8F4",  # Light rose
    "F0E8FF",  # Light lavender
    "FFE8D4",  # Light peach
]

ALT_ROW_FILL = PatternFill(start_color="F5F7FA", end_color="F5F7FA", fill_type="solid")

HEADER_FONT = Font(bold=True, color="FFFFFF", size=11)
GT_FONT = Font(bold=True, size=10)
DT_FONT = Font(size=10)

thin_border = Border(
    left=Side(style="thin", color="D0D0D0"),
    right=Side(style="thin", color="D0D0D0"),
    top=Side(style="thin", color="D0D0D0"),
    bottom=Side(style="thin", color="D0D0D0"),
)


def parse_sprint_file(filepath):
    """Parse sprint markdown and extract GT/DT info"""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()

    tasks = []
    current_gt = None

    lines = content.split("\n")
    for line in lines:
        # Match GT line (### GT-X.X: Title)
        gt_match = re.match(r"### (GT-\d+\.\d+):\s*(.+)", line)
        if gt_match:
            gt_id = gt_match.group(1)
            gt_title = gt_match.group(2).strip()
            current_gt = {"id": gt_id, "title": gt_title, "dts": []}
            tasks.append(current_gt)
            continue

        # Match DT line (**DT-X.X.X — Title)
        dt_match = re.match(r"\*\*DT-(\d+\.\d+\.\d+)\s*—\s*(.+?)\*\*", line)
        if dt_match and current_gt:
            dt_id = dt_match.group(1)
            dt_title = dt_match.group(2).strip()

            # Search for Status, SP, Effort in following lines
            status = "PENDING"
            sp = 0
            effort = ""

            idx = lines.index(line)
            search_range = min(idx + 15, len(lines))

            for j in range(idx, search_range):
                next_line = lines[j]
                # Check status - look for ✅ or DONE, or ⏳ or PENDING
                if "✅" in next_line or (
                    "Status:" in next_line and "DONE" in next_line
                ):
                    status = "DONE"
                elif "⏳" in next_line or (
                    "Status:" in next_line and "PENDING" in next_line
                ):
                    status = "PENDING"

                # Story Points
                sp_match = re.search(
                    r"Story Points[:\s]*[\**]*\s*[-:]?\s*(\d+)", next_line
                )
                if sp_match:
                    sp = int(sp_match.group(1))

                # Effort
                effort_match = re.search(
                    r"Effort[:\s]*[\**]*\s*([-:]?\s*~?\d+\.?\d*\s*[hms])", next_line
                )
                if effort_match:
                    effort = effort_match.group(1).strip("-: ")

            current_gt["dts"].append(
                {
                    "id": dt_id,
                    "title": dt_title,
                    "status": status,
                    "sp": sp,
                    "effort": effort,
                }
            )

    return tasks


def create_excel():
    """Create Excel workbook with all requirements"""
    wb = Workbook()
    wb.remove(wb.active)

    for sprint_name, filepath in SPRINT_FILES:
        tasks = parse_sprint_file(filepath)

        ws = wb.create_sheet(title=sprint_name)

        # Headers as per skill spec
        headers = [
            "Sprint",
            "General Task",
            "Detailed Task",
            "Story Points",
            "Effort",
            "Status",
            "Total SP (GT)",
        ]
        for col, header in enumerate(headers, 1):
            cell = ws.cell(row=1, column=col, value=header)
            cell.font = HEADER_FONT
            cell.fill = HEADER_FILL
            cell.alignment = Alignment(horizontal="center", vertical="center")
            cell.border = thin_border

        row = 2
        current_sprint = sprint_name
        gt_color_index = 0  # Track GT color index

        for gt in tasks:
            # Get color for this GT (cycle through colors)
            gt_color = GT_COLORS[gt_color_index % len(GT_COLORS)]
            gt_fill = PatternFill(
                start_color=gt_color, end_color=gt_color, fill_type="solid"
            )
            gt_color_index += 1

            gt_total_sp = sum(dt["sp"] for dt in gt["dts"])
            gt_row_start = row
            gt_rows_count = len(gt["dts"])

            for dt in gt["dts"]:
                # Sprint column - only write once per sprint
                if row == gt_row_start:
                    ws.cell(row=row, column=1, value=sprint_name).border = thin_border

                # General Task column - only write once per GT (merge cells)
                if row == gt_row_start:
                    gt_cell = ws.cell(
                        row=row, column=2, value=f"{gt['id']}: {gt['title']}"
                    )
                    gt_cell.font = GT_FONT
                    ws.cell(row=row, column=2).border = thin_border
                    # Merge GT cells vertically
                    if gt_rows_count > 1:
                        ws.merge_cells(
                            start_row=row,
                            start_column=2,
                            end_row=row + gt_rows_count - 1,
                            end_column=2,
                        )
                    # Apply GT background color (unique per GT)
                    for col in range(1, 8):
                        ws.cell(row=row, column=col).fill = gt_fill

                # Detailed Task column - show DT ID and Title
                dt_cell = ws.cell(row=row, column=3, value=f"{dt['id']}: {dt['title']}")
                dt_cell.font = DT_FONT
                ws.cell(row=row, column=3).border = thin_border

                # Story Points - centered
                ws.cell(row=row, column=4, value=dt["sp"]).border = thin_border
                ws.cell(row=row, column=4).alignment = Alignment(horizontal="center")

                # Effort
                ws.cell(row=row, column=5, value=dt["effort"]).border = thin_border

                # Status with icons ✅ and ⏳
                status_icon = "✅" if dt["status"] == "DONE" else "⏳"
                ws.cell(row=row, column=6, value=status_icon).border = thin_border
                ws.cell(row=row, column=6).alignment = Alignment(horizontal="center")

                # Total SP - only in first GT row
                if row == gt_row_start:
                    total_cell = ws.cell(row=row, column=7, value=gt_total_sp)
                    total_cell.font = Font(bold=True, size=10)
                    total_cell.alignment = Alignment(horizontal="center")
                    # Merge Total SP cells vertically with GT
                    if gt_rows_count > 1:
                        ws.merge_cells(
                            start_row=row,
                            start_column=7,
                            end_row=row + gt_rows_count - 1,
                            end_column=7,
                        )

                # Alternate row colors for DT rows (only for non-GT rows)
                if row > gt_row_start and row % 2 == 0:
                    for col in range(1, 8):
                        ws.cell(row=row, column=col).fill = ALT_ROW_FILL

                row += 1

        # Column widths
        ws.column_dimensions["A"].width = 12
        ws.column_dimensions["B"].width = 35
        ws.column_dimensions["C"].width = 45
        ws.column_dimensions["D"].width = 13
        ws.column_dimensions["E"].width = 12
        ws.column_dimensions["F"].width = 10
        ws.column_dimensions["G"].width = 14

        # Freeze header row
        ws.freeze_panes = "A2"

    wb.save(OUTPUT_FILE)
    print(f"Excel file created: {OUTPUT_FILE}")


if __name__ == "__main__":
    create_excel()
