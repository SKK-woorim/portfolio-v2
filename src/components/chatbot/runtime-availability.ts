/**
 * 챗봇 연결 상태 머신. 상태 확인 요청·패널 열기·채팅 응답이 모두 이 전이표를 거친다.
 *
 * checking ─status-resolved→ enabled | disabled | unavailable
 * checking·그 외 ─status-failed / status-aborted(timeout)→ unavailable
 * disabled·unavailable ─panel-opened→ checking  (enabled는 그대로 두고 뒤에서 다시 확인한다)
 * 모든 상태 ─chat-rejected-as-disabled→ disabled
 *
 * 전체 그림은 docs/architecture/state-machines.md 참고.
 */
import type { ChatbotRuntimeAvailability } from "./chatbot-types";

export type RuntimeStatusAbortReason = "timeout" | "superseded" | "unmount" | null;

export type RuntimeAvailabilityEvent =
  | { type: "panel-opened" }
  | { type: "status-resolved"; availability: Exclude<ChatbotRuntimeAvailability, "checking"> }
  | { type: "status-failed" }
  | { type: "status-aborted"; reason: RuntimeStatusAbortReason }
  | { type: "chat-rejected-as-disabled" };

export function initialRuntimeAvailability(disabledByDeployment: boolean): ChatbotRuntimeAvailability {
  return disabledByDeployment ? "disabled" : "checking";
}

/** 시간 초과만 "확인 불가"로 본다. 새 요청에 밀렸거나 화면이 사라진 요청은 상태를 건드리지 않는다. */
export function runtimeAvailabilityAfterAbort(reason: RuntimeStatusAbortReason): ChatbotRuntimeAvailability | null {
  return reason === "timeout" ? "unavailable" : null;
}

/** `/api/chat/status` 응답을 연결 상태로 읽는다. 알 수 없는 응답은 "확인 불가"다. */
export function parseRuntimeStatusPayload(payload: unknown): Exclude<ChatbotRuntimeAvailability, "checking"> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) return "unavailable";
  const { status, enabled } = payload as { status?: unknown; enabled?: unknown };
  if (status === "enabled" || enabled === true) return "enabled";
  if (status === "disabled") return "disabled";
  return "unavailable";
}

export function reduceRuntimeAvailability(state: ChatbotRuntimeAvailability, event: RuntimeAvailabilityEvent): ChatbotRuntimeAvailability {
  switch (event.type) {
    case "panel-opened":
      // 이미 연결된 상태라면 대화와 입력창을 가리지 않고, 뒤에서 조용히 다시 확인한다.
      return state === "enabled" ? "enabled" : "checking";
    case "status-resolved":
      return event.availability;
    case "status-failed":
      return "unavailable";
    case "status-aborted":
      return runtimeAvailabilityAfterAbort(event.reason) ?? state;
    case "chat-rejected-as-disabled":
      return "disabled";
  }
}

/** 질문을 받을 수 없는 상태(꺼짐·확인 불가). 확인 중은 포함하지 않는다. */
export function isChatOffline(availability: ChatbotRuntimeAvailability): availability is "disabled" | "unavailable" {
  return availability === "disabled" || availability === "unavailable";
}

export function isChatOnline(availability: ChatbotRuntimeAvailability) {
  return availability === "enabled";
}
