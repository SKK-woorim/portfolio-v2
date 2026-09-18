import { describe, expect, it } from "vitest";
import { advanceChatPhase, parseChatFinishReason, readChatHttpError } from "./use-chat-stream";

describe("chat stream state", () => {
  it("allows forward progress and ignores late backward events", () => {
    expect(advanceChatPhase("submitting", "searching")).toBe("searching");
    expect(advanceChatPhase("searching", "generating")).toBe("generating");
    expect(advanceChatPhase("generating", "streaming")).toBe("streaming");
    expect(advanceChatPhase("streaming", "searching")).toBe("streaming");
    expect(advanceChatPhase("complete", "streaming")).toBe("complete");
    expect(advanceChatPhase("error", "complete")).toBe("error");
  });

  it("uses a non-2xx JSON message and retry metadata", async () => {
    const response = new Response(JSON.stringify({
      code: "RATE_LIMITED",
      message: "잠시 뒤 다시 질문해 주세요.",
      retryAfterSeconds: 12,
    }), { status: 429, headers: { "Content-Type": "application/json" } });

    await expect(readChatHttpError(response)).resolves.toEqual({
      code: "RATE_LIMITED",
      message: "잠시 뒤 다시 질문해 주세요.",
      retryAfterSeconds: 12,
    });
  });

  it("preserves the intentional disabled state from the relay", async () => {
    const response = new Response(JSON.stringify({
      code: "CHATBOT_DISABLED",
      message: "현재 포트폴리오 AI 챗봇 연결이 꺼져 있어요. 소개와 연락처에서 더 많은 정보를 확인해 주세요.",
    }), { status: 503, headers: { "Content-Type": "application/json" } });

    await expect(readChatHttpError(response)).resolves.toMatchObject({ code: "CHATBOT_DISABLED" });
  });

  it("falls back safely when a non-2xx response is not JSON", async () => {
    const response = new Response("upstream failed", { status: 502 });
    await expect(readChatHttpError(response)).resolves.toEqual({
      code: "INTERNAL_ERROR",
      message: "답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
    });
  });

  it("keeps the model finish reason explicit so length-limited answers are not marked complete", () => {
    expect(parseChatFinishReason("stop")).toBe("stop");
    expect(parseChatFinishReason("length")).toBe("length");
    expect(parseChatFinishReason("cancelled")).toBe("cancelled");
    expect(parseChatFinishReason("unknown")).toBeNull();
  });
});
