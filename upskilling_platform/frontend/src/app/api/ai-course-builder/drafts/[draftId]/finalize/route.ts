import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> }
) {
  try {
    const { draftId } = await params;
    const upstream = await fetch(
      buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}/finalize`),
      {
        method: "POST",
      }
    );
    const data = await upstream.json();
    return Response.json(data, { status: upstream.status });
  } catch (error) {
    return Response.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to finalize draft in OpenMAIC",
      },
      { status: 500 }
    );
  }
}
