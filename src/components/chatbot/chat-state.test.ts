import { describe, expect, it } from "vitest";
import {
  ACTIVE_CHAT_PHASES,
  CANCELLED_ANSWER_PLACEHOLDER,
  INITIAL_CHAT_STREAM_STATE,
  SUBMITTING_STATUS_MESSAGE,
  TERMINAL_CHAT_PHASES,
  canRetryChatMessage,
  deliveryForFinishReason,
  isChatPhaseActive,
  isChatPhaseTerminal,
  reduceChatMessage,
  reduceChatStream,
  restoreStoredDelivery,
  type ChatStreamEvent,
  type ChatStreamState,
} from "./chat-state";
import type { ChatMessage, ChatPhase } from "./chatbot-types";

const ALL_PHASES: ChatPhase[] = ["idle", ...ACTIVE_CHAT_PHASES, ...TERMINAL_CHAT_PHASES];

function run(events: ChatStreamEvent[], from: ChatStreamState = INITIAL_CHAT_STREAM_STATE) {
  return events.reduce(reduceChatStream, from);
}

describe("chat phase groups", () => {
  it("puts every phase in exactly one of idle, active, or terminal", () => {
    for (const phase of ALL_PHASES) {
      const groups = [phase === "idle", isChatPhaseActive(phase), isChatPhaseTerminal(phase)].filter(Boolean);
      expect(groups, phase).toHaveLength(1);
    }
  });
});

describe("reduceChatStream", () => {
  it("follows the happy path to complete", () => {
    const state = run([
      { type: "submitted" },
      { type: "status", phase: "searching", message: "검색 중" },
      { type: "status", phase: "generating", message: "생성 중" },
      { type: "token" },
      { type: "finished", finishReason: "stop" },
    ]);
    expect(state).toEqual({ phase: "complete", statusMessage: null, canCancel: false });
  });

  it("starts every request with the submitting message and a hidden cancel control", () => {
    expect(run([{ type: "submitted" }])).toEqual({ phase: "submitting", statusMessage: SUBMITTING_STATUS_MESSAGE, canCancel: false });
  });

  it("keeps the previous message when a status event carries none", () => {
    const state = run([{ type: "submitted" }, { type: "status", phase: "searching" }]);
    expect(state).toMatchObject({ phase: "searching", statusMessage: SUBMITTING_STATUS_MESSAGE });
  });

  it("ignores a status that would move the request backward, including its message", () => {
    const generating = run([{ type: "submitted" }, { type: "status", phase: "generating", message: "생성 중" }]);
    expect(reduceChatStream(generating, { type: "status", phase: "searching", message: "늦은 검색" })).toBe(generating);
  });

  it("clears the status line when the first token arrives and stays put for later tokens", () => {
    const streaming = run([{ type: "submitted" }, { type: "token" }]);
    expect(streaming).toMatchObject({ phase: "streaming", statusMessage: null });
    expect(reduceChatStream(streaming, { type: "token" })).toBe(streaming);
  });

  it("reveals cancel only while a request is active and hides it at every ending", () => {
    expect(reduceChatStream(INITIAL_CHAT_STREAM_STATE, { type: "cancel-revealed" })).toBe(INITIAL_CHAT_STREAM_STATE);
    const waiting = run([{ type: "submitted" }, { type: "cancel-revealed" }]);
    expect(waiting.canCancel).toBe(true);
    expect(reduceChatStream(waiting, { type: "finished", finishReason: "length" })).toEqual({ phase: "complete", statusMessage: null, canCancel: false });
    expect(reduceChatStream(waiting, { type: "finished", finishReason: "cancelled" }).phase).toBe("cancelled");
    expect(reduceChatStream(waiting, { type: "failed", message: "오류" })).toEqual({ phase: "error", statusMessage: "오류", canCancel: false });
    expect(reduceChatStream(waiting, { type: "cancelled" })).toEqual({ phase: "cancelled", statusMessage: null, canCancel: false });
  });

  it("refuses a new submission while one is active", () => {
    for (const phase of ACTIVE_CHAT_PHASES) {
      const active: ChatStreamState = { phase, statusMessage: "진행 중", canCancel: true };
      expect(reduceChatStream(active, { type: "submitted" })).toBe(active);
    }
  });

  it("drops every stream event once the request has ended, and allows a fresh submission", () => {
    const lateEvents: ChatStreamEvent[] = [
      { type: "status", phase: "generating", message: "늦은 상태" },
      { type: "token" },
      { type: "cancel-revealed" },
      { type: "finished", finishReason: "stop" },
      { type: "failed", message: "늦은 오류" },
      { type: "cancelled" },
    ];
    for (const phase of ["idle", ...TERMINAL_CHAT_PHASES] as const) {
      const ended: ChatStreamState = { phase, statusMessage: null, canCancel: false };
      for (const event of lateEvents) expect(reduceChatStream(ended, event), `${phase} ← ${event.type}`).toBe(ended);
      expect(reduceChatStream(ended, { type: "submitted" }).phase).toBe("submitting");
    }
  });
});

const streamingAnswer: ChatMessage = { id: "request-1", role: "assistant", content: "", delivery: "streaming", retryMessage: "질문" };

describe("reduceChatMessage", () => {
  it("accumulates sources and tokens while streaming", () => {
    const source = { id: "S1", title: "소개", type: "profile" as const, url: "/about" };
    const withSources = reduceChatMessage(streamingAnswer, { type: "sources", sources: [source] });
    const withTokens = reduceChatMessage(reduceChatMessage(withSources, { type: "token", delta: "안녕" }), { type: "token", delta: "하세요" });
    expect(withTokens).toMatchObject({ content: "안녕하세요", delivery: "streaming", sources: [source] });
  });

  it("maps each finish reason to its delivery and marks cached answers", () => {
    const answered = reduceChatMessage(streamingAnswer, { type: "token", delta: "답변" });
    expect(reduceChatMessage(answered, { type: "finished", finishReason: "stop" })).toMatchObject({ delivery: "complete", content: "답변" });
    expect(reduceChatMessage(answered, { type: "finished", finishReason: "length" }).delivery).toBe("partial");
    expect(reduceChatMessage(answered, { type: "finished", finishReason: "cancelled" }).delivery).toBe("cancelled");
    expect(reduceChatMessage(answered, { type: "finished", finishReason: "stop", cached: true }).cached).toBe(true);
    expect("cached" in reduceChatMessage(answered, { type: "finished", finishReason: "stop" })).toBe(false);
  });

  it("fills an empty cancelled answer with a placeholder and keeps partial text", () => {
    expect(reduceChatMessage(streamingAnswer, { type: "cancelled" })).toMatchObject({ delivery: "cancelled", content: CANCELLED_ANSWER_PLACEHOLDER });
    const partial = reduceChatMessage(streamingAnswer, { type: "token", delta: "일부" });
    expect(reduceChatMessage(partial, { type: "cancelled" })).toMatchObject({ delivery: "cancelled", content: "일부" });
  });

  it("replaces the answer with the error message and code", () => {
    const failed = reduceChatMessage(streamingAnswer, { type: "failed", error: { code: "MODEL_BUSY", message: "요청이 많아요." } });
    expect(failed).toMatchObject({ delivery: "error", content: "요청이 많아요.", errorCode: "MODEL_BUSY" });
  });

  it("never changes an answer that already ended", () => {
    for (const delivery of ["complete", "partial", "cancelled", "error"] as const) {
      const ended: ChatMessage = { ...streamingAnswer, content: "끝난 답변", delivery };
      expect(reduceChatMessage(ended, { type: "token", delta: "늦은 조각" })).toBe(ended);
      expect(reduceChatMessage(ended, { type: "failed", error: { code: "INTERNAL_ERROR", message: "늦은 오류" } })).toBe(ended);
    }
  });
});

describe("delivery helpers", () => {
  it("maps finish reasons", () => {
    expect(deliveryForFinishReason("stop")).toBe("complete");
    expect(deliveryForFinishReason("length")).toBe("partial");
    expect(deliveryForFinishReason("cancelled")).toBe("cancelled");
  });

  it("restores an interrupted or unknown stored delivery as cancelled", () => {
    expect(restoreStoredDelivery("complete")).toBe("complete");
    expect(restoreStoredDelivery("partial")).toBe("partial");
    expect(restoreStoredDelivery("error")).toBe("error");
    expect(restoreStoredDelivery("streaming")).toBe("cancelled");
    expect(restoreStoredDelivery(undefined)).toBe("cancelled");
  });

  it("offers retry for failed, cancelled, and partial answers only", () => {
    const answer = { ...streamingAnswer, content: "답변" };
    expect(canRetryChatMessage({ ...answer, delivery: "error", errorCode: "MODEL_BUSY" })).toBe(true);
    expect(canRetryChatMessage({ ...answer, delivery: "cancelled" })).toBe(true);
    expect(canRetryChatMessage({ ...answer, delivery: "partial" })).toBe(true);
    expect(canRetryChatMessage({ ...answer, delivery: "complete" })).toBe(false);
    expect(canRetryChatMessage({ ...answer, delivery: "streaming" })).toBe(false);
    expect(canRetryChatMessage({ ...answer, delivery: "error", errorCode: "NO_RELEVANT_CONTEXT" })).toBe(false);
    expect(canRetryChatMessage({ ...answer, delivery: "error", retryMessage: undefined })).toBe(false);
    expect(canRetryChatMessage({ ...answer, role: "user", delivery: "error" })).toBe(false);
  });
});
