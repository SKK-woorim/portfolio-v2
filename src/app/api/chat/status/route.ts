import * as Sentry from "@sentry/nextjs";
import { getChatbotRuntimeStatus } from "@/lib/chat/runtime-status";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let enabled = false;
  try {
    enabled = (await getChatbotRuntimeStatus()).enabled;
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "chat-runtime-status" } });
  }

  return Response.json(
    { enabled },
    { headers: { "Cache-Control": "no-store, max-age=0" } },
  );
}
