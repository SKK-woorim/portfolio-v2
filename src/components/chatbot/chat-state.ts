/**
 * 챗봇 요청 한 건의 상태 머신. React나 fetch에 기대지 않는 순수 함수만 둔다.
 *
 * 한 요청은 두 가지 상태를 가진다.
 * - 요청 단계(`ChatPhase`): 전송부터 종료까지, 한 번에 하나만 진행된다.
 * - 답변 전달 상태(`ChatDelivery`): 대화 목록에 남는 각 답변의 결과.
 *
 * 전이 규칙은 이 파일에만 있다. 화면에서는 `phase === "..."` 조합을 직접 쓰지 말고
 * 아래 조회 함수를 쓴다. 전체 그림은 docs/architecture/state-machines.md 참고.
 */
import { NO_RELEVANT_CONTEXT_CODE } from "@/lib/chat/error-messages";
import type { ChatFinishReason, ChatMessage, ChatPhase, ChatSource, ChatStreamError } from "./chatbot-types";

// ── 요청 단계 ────────────────────────────────────────────────────────────────

export const ACTIVE_CHAT_PHASES = ["submitting", "searching", "generating", "streaming"] as const satisfies readonly ChatPhase[];
export const TERMINAL_CHAT_PHASES = ["complete", "cancelled", "error"] as const satisfies readonly ChatPhase[];

const PHASE_RANK: Record<ChatPhase, number> = {
  idle: 0,
  submitting: 1,
  searching: 2,
  generating: 3,
  streaming: 4,
  complete: 5,
  cancelled: 5,
  error: 5,
};

/** 요청이 진행 중인 단계인지. 진행 중에는 새 질문을 받지 않는다. */
export function isChatPhaseActive(phase: ChatPhase) {
  return (ACTIVE_CHAT_PHASES as readonly ChatPhase[]).includes(phase);
}

export function isChatPhaseTerminal(phase: ChatPhase) {
  return (TERMINAL_CHAT_PHASES as readonly ChatPhase[]).includes(phase);
}

/** 단계는 앞으로만 간다. 늦게 도착한 이전 단계 이벤트와 종료 뒤의 이벤트는 무시한다. */
export function advanceChatPhase(current: ChatPhase, next: ChatPhase): ChatPhase {
  if (isChatPhaseTerminal(current)) return current;
  return PHASE_RANK[next] >= PHASE_RANK[current] ? next : current;
}

export type ChatStreamState = {
  phase: ChatPhase;
  /** 진행 중에는 단계 안내, 오류로 끝나면 오류 문구. */
  statusMessage: string | null;
  /** 오래 기다린 요청에만 취소 버튼을 보여 준다. */
  canCancel: boolean;
};

export const INITIAL_CHAT_STREAM_STATE: ChatStreamState = { phase: "idle", statusMessage: null, canCancel: false };

export const SUBMITTING_STATUS_MESSAGE = "질문을 확인하고 있어요.";

export type ChatStreamEvent =
  | { type: "submitted" }
  | { type: "status"; phase: "submitting" | "searching" | "generating"; message?: string }
  | { type: "token" }
  | { type: "cancel-revealed" }
  | { type: "finished"; finishReason: ChatFinishReason }
  | { type: "failed"; message: string }
  | { type: "cancelled" };

/**
 * 요청 단계 전이표. 받아들일 수 없는 이벤트는 같은 객체를 그대로 돌려준다.
 *
 * idle·종료 ─submitted→ submitting ─status→ searching ─status→ generating ─token→ streaming
 * 진행 중 ─finished→ complete | cancelled,  ─failed→ error,  ─cancelled→ cancelled
 */
export function reduceChatStream(state: ChatStreamState, event: ChatStreamEvent): ChatStreamState {
  if (event.type === "submitted") {
    if (isChatPhaseActive(state.phase)) return state;
    return { phase: "submitting", statusMessage: SUBMITTING_STATUS_MESSAGE, canCancel: false };
  }
  if (!isChatPhaseActive(state.phase)) return state;

  switch (event.type) {
    case "status": {
      if (advanceChatPhase(state.phase, event.phase) !== event.phase) return state;
      const statusMessage = event.message ?? state.statusMessage;
      if (state.phase === event.phase && state.statusMessage === statusMessage) return state;
      return { ...state, phase: event.phase, statusMessage };
    }
    case "token":
      if (state.phase === "streaming" && state.statusMessage === null) return state;
      return { ...state, phase: "streaming", statusMessage: null };
    case "cancel-revealed":
      return state.canCancel ? state : { ...state, canCancel: true };
    case "finished":
      return { phase: event.finishReason === "cancelled" ? "cancelled" : "complete", statusMessage: null, canCancel: false };
    case "failed":
      return { phase: "error", statusMessage: event.message, canCancel: false };
    case "cancelled":
      return { phase: "cancelled", statusMessage: null, canCancel: false };
  }
}

// ── 답변 전달 상태 ───────────────────────────────────────────────────────────

export type ChatDelivery = ChatMessage["delivery"];

export const CANCELLED_ANSWER_PLACEHOLDER = "답변 생성을 취소했어요.";
export const INTERRUPTED_ANSWER_PLACEHOLDER = "이전 답변 연결이 종료되었어요. 다시 시도해 주세요.";

export function deliveryForFinishReason(finishReason: ChatFinishReason): ChatDelivery {
  return finishReason === "length" ? "partial" : finishReason === "cancelled" ? "cancelled" : "complete";
}

/** 저장된 대화를 되살릴 때의 전달 상태. 스트리밍 도중 끊긴 답변은 취소된 것으로 본다. */
export function restoreStoredDelivery(value: unknown): ChatDelivery {
  return value === "complete" || value === "partial" || value === "cancelled" || value === "error" ? value : "cancelled";
}

export type ChatMessageEvent =
  | { type: "sources"; sources: ChatSource[] }
  | { type: "token"; delta: string }
  | { type: "finished"; finishReason: ChatFinishReason; cached?: boolean }
  | { type: "failed"; error: ChatStreamError }
  | { type: "cancelled" };

/**
 * 답변 한 건의 전이표. 스트리밍 중인 답변만 바뀌고, 끝난 답변은 그대로 남는다.
 *
 * streaming ─finished→ complete | partial | cancelled,  ─failed→ error,  ─cancelled→ cancelled
 */
export function reduceChatMessage(message: ChatMessage, event: ChatMessageEvent): ChatMessage {
  if (message.delivery !== "streaming") return message;

  switch (event.type) {
    case "sources":
      return { ...message, sources: event.sources };
    case "token":
      return { ...message, content: `${message.content}${event.delta}` };
    case "finished":
      return {
        ...message,
        content: message.content || CANCELLED_ANSWER_PLACEHOLDER,
        delivery: deliveryForFinishReason(event.finishReason),
        ...(event.cached ? { cached: true } : {}),
      };
    case "failed":
      return { ...message, content: event.error.message, delivery: "error", errorCode: event.error.code };
    case "cancelled":
      return { ...message, content: message.content || CANCELLED_ANSWER_PLACEHOLDER, delivery: "cancelled" };
  }
}

/** 근거가 없어 답하지 못한 답변인지. 재시도 대신 소개·연락처 링크를 보여 준다. */
export function isUnansweredForLackOfContext(message: Pick<ChatMessage, "errorCode">) {
  return message.errorCode === NO_RELEVANT_CONTEXT_CODE;
}

/** 같은 질문을 다시 보낼 수 있는 답변인지. 패널과 히어로 콘솔이 같은 규칙을 쓴다. */
export function canRetryChatMessage(message: ChatMessage) {
  return message.role === "assistant"
    && (message.delivery === "error" || message.delivery === "cancelled" || message.delivery === "partial")
    && !isUnansweredForLackOfContext(message)
    && Boolean(message.retryMessage);
}
