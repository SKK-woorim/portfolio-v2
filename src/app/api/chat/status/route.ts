import * as Sentry from "@sentry/nextjs";
import { getChatbotIndexStats } from "@/lib/chat/index-stats";
import { getChatbotRuntimeStatus } from "@/lib/chat/runtime-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const headers = { "Cache-Control": "no-store, max-age=0" };
  try {
    const [status, index] = await Promise.all([getChatbotRuntimeStatus(), getChatbotIndexStats()]);
    const enabled = status.enabled;
    return Response.json(
      { status: enabled ? "enabled" : "disabled", enabled, ...(index ? { index } : {}) },
      { headers },
    );
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "chat-runtime-status" } });
    return Response.json(
      { status: "unavailable", enabled: false },
      { status: 503, headers },
    );
  }
}
