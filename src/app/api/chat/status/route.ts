import * as Sentry from "@sentry/nextjs";
import { getChatbotRuntimeStatus } from "@/lib/chat/runtime-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const enabled = (await getChatbotRuntimeStatus()).enabled;
    return Response.json(
      { status: enabled ? "enabled" : "disabled", enabled },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "chat-runtime-status" } });
    return Response.json(
      { status: "unavailable", enabled: false },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
