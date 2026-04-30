import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
    const body = await request.json();
    const upstream = await fetch(
      buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}/approve-scene`),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }
    );
    const data = await upstream.json();
    return Response.json(data, { status: upstream.status });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to update scene approval in OpenMAIC",
      },
      { status: 500 }
    );
  }
}
