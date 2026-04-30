import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const upstream = await fetch(
      buildOpenMAICUrl("/api/learing-expert-agent/generate"),
      {
        method: "POST",
        body: formData,
      }
    );

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type":
          upstream.headers.get("content-type") || "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to forward request to OpenMAIC",
      },
      { status: 500 }
    );
  }
}
