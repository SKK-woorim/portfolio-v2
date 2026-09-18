import type { ChatbotRuntimeAvailability } from "./chatbot-types";

export type RuntimeStatusAbortReason = "timeout" | "superseded" | "unmount" | null;

export function runtimeAvailabilityAfterAbort(reason: RuntimeStatusAbortReason): ChatbotRuntimeAvailability | null {
  return reason === "timeout" ? "unavailable" : null;
}
