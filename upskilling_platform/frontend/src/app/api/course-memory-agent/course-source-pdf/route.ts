import path from "node:path";
import { spawn } from "node:child_process";

import { assemblePublishedCourseForMemory } from "@/app/lib/course-memory-agent";

async function extractPdfText(buffer: Buffer): Promise<string> {
  const scriptPath = path.join(
    process.cwd(),
    "src",
    "app",
    "lib",
    "scripts",
    "extract_pdf_text.py",
  );

  return new Promise((resolve, reject) => {
    const child = spawn("python", [scriptPath], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });

    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];

    child.stdout.on("data", (chunk) => {
      stdoutChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.stderr.on("data", (chunk) => {
      stderrChunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      const stdout = Buffer.concat(stdoutChunks).toString("utf8").trim();
      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();

      if (code !== 0) {
        reject(new Error(stderr || stdout || "Failed to extract PDF text."));
        return;
      }

      try {
        const payload = JSON.parse(stdout) as { text?: string; error?: string };
        if (payload.error) {
          reject(new Error(payload.error));
          return;
        }
        resolve((payload.text || "").trim());
      } catch {
        reject(new Error("The PDF extraction helper returned invalid JSON."));
      }
    });

    child.stdin.write(buffer);
    child.stdin.end();
  });
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const courseId = String(formData.get("courseId") || "").trim();
    const tenantId = String(formData.get("tenantId") || "").trim() || null;

    if (!courseId) {
      return Response.json(
        { success: false, error: "courseId is required" },
        { status: 400 },
      );
    }

    if (!(file instanceof File)) {
      return Response.json(
        { success: false, error: "A PDF file is required." },
        { status: 400 },
      );
    }

    if (file.type !== "application/pdf") {
      return Response.json(
        { success: false, error: "Only PDF files are accepted for the course memory source." },
        { status: 400 },
      );
    }

    const extractedText = await extractPdfText(Buffer.from(await file.arrayBuffer()));
    if (!extractedText.trim()) {
      return Response.json(
        {
          success: false,
          error: "The uploaded PDF did not contain extractable text for course memory retention.",
        },
        { status: 400 },
      );
    }

    const result = await assemblePublishedCourseForMemory(request, courseId, tenantId, [
      {
        kind: "course_source_pdf",
        title: file.name,
        text: extractedText,
      },
    ]);

    return Response.json({ success: true, result }, { status: 200 });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to retain the traditional course source PDF in Hindsight",
      },
      { status: 500 },
    );
  }
}
