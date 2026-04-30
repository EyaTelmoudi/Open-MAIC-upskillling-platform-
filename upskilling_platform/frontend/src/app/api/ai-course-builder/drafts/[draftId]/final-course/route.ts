import { buildOpenMAICUrl } from "@/app/lib/openmaic-proxy";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ draftId: string }> },
) {
  try {
    const { draftId } = await params;
    const upstream = await fetch(
      buildOpenMAICUrl(`/api/learing-expert-agent/drafts/${draftId}/final-course`),
      { cache: "no-store" },
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
            : "Failed to load finalized course from OpenMAIC",
      },
      { status: 500 },
    );
  }
}
