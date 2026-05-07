import io
import json
import sys

from PyPDF2 import PdfReader


def main() -> int:
    try:
        raw_bytes = sys.stdin.buffer.read()
        if not raw_bytes:
            raise ValueError("No PDF data received.")

        reader = PdfReader(io.BytesIO(raw_bytes))
        pages: list[str] = []

        for page in reader.pages:
            text = (page.extract_text() or "").strip()
            if text:
                pages.append(text)

        print(json.dumps({"text": "\n\n".join(pages)}))
        return 0
    except Exception as exc:
        print(json.dumps({"error": str(exc)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
