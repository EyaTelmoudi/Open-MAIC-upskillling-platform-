from __future__ import annotations

import subprocess
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


ROOT = Path(__file__).resolve().parents[2]
REPORT = Path(__file__).resolve().parents[1]
OUTPUT = REPORT / "figures" / "ch3_unit_tests_pytest_terminal.png"

COMMAND = [
    "python",
    "-m",
    "pytest",
    "services/identity/tests/test_jwt.py",
    "services/identity/tests/test_rbac.py",
    "services/learning/tests/test_xp.py",
    "services/notifications/tests/test_realtime.py",
    "-q",
]


def load_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "C:/Windows/Fonts/consola.ttf",
        "C:/Windows/Fonts/cour.ttf",
        "C:/Windows/Fonts/lucon.ttf",
    ]
    for candidate in candidates:
        path = Path(candidate)
        if path.exists():
            return ImageFont.truetype(str(path), size)
    return ImageFont.load_default()


def main() -> None:
    result = subprocess.run(
        COMMAND,
        cwd=ROOT / "upskilling_platform",
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        check=False,
    )

    output = result.stdout.strip()
    title = "PS D:\\PFE\\OpenMAIC\\upskilling_platform> " + " ".join(COMMAND)
    lines = [title, ""] + output.splitlines()

    font = load_font(22)
    padding_x = 34
    padding_y = 30
    line_gap = 8
    line_height = 30
    max_width = 1420

    wrapped: list[str] = []
    for line in lines:
        if not line:
            wrapped.append("")
            continue
        current = line
        while len(current) > 118:
            wrapped.append(current[:118])
            current = current[118:]
        wrapped.append(current)

    height = padding_y * 2 + len(wrapped) * (line_height + line_gap) + 12
    image = Image.new("RGB", (max_width, height), "#0f172a")
    draw = ImageDraw.Draw(image)

    draw.rectangle((0, 0, max_width, 56), fill="#111827")
    draw.ellipse((24, 20, 40, 36), fill="#ef4444")
    draw.ellipse((52, 20, 68, 36), fill="#f59e0b")
    draw.ellipse((80, 20, 96, 36), fill="#22c55e")

    y = 78
    for index, line in enumerate(wrapped):
        color = "#e5e7eb"
        if index == 0:
            color = "#93c5fd"
        elif "passed" in line:
            color = "#86efac"
        elif "warning" in line.lower():
            color = "#fde68a"
        elif line.startswith("=") or line.startswith("-"):
            color = "#94a3b8"
        draw.text((padding_x, y), line, font=font, fill=color)
        y += line_height + line_gap

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    image.save(OUTPUT)
    print(f"Saved {OUTPUT}")
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
