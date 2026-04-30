import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";

export async function GET() {
  try {
    const upstream = await fetch(buildOpenMAICUrl("/api/learing-expert-agent/drafts"), {
      cache: "no-store",
    });
    const data = await upstream.json();
    return Response.json(data, { status: upstream.status });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch drafts from OpenMAIC",
      },
      { status: 500 }
    );
  }
}
