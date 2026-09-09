import { getReadinessStatus } from "@/lib/health/readiness";

export const dynamic = "force-dynamic";
export const maxDuration = 5;

export async function GET(request: Request) {
  const readiness = await getReadinessStatus({}, request.signal);
  return Response.json(readiness, {
    status: readiness.status === "ready" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
