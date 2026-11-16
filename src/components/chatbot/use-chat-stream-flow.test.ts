/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useChatStream } from "./use-chat-stream";

const REQUEST = { requestId: "request-1", sessionId: "session-1", message: "질문", history: [] };
const SOURCE = { id: "S1", title: "소개", type: "profile", url: "/about" };

/** 테스트가 원하는 시점에 SSE 프레임을 흘려 보낼 수 있는 응답. */
function sseResponse(signal?: AbortSignal) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(streamController) { controller = streamController; } });
  const encoder = new TextEncoder();
  signal?.addEventListener("abort", () => controller.error(new DOMException("Aborted", "AbortError")), { once: true });
  return {
    response: new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream; charset=utf-8" } }),
    emit(event: string, data: unknown) {
      controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    },
    end() {
      controller.close();
    },
  };
}

function createHandlers() {
  return { onSources: vi.fn(), onToken: vi.fn(), onComplete: vi.fn(), onError: vi.fn(), onCancel: vi.fn() };
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

function startStream() {
  const handlers = createHandlers();
  let stream!: ReturnType<typeof sseResponse>;
  const fetchMock = vi.fn((_url: string, init: { signal: AbortSignal }) => {
    stream = sseResponse(init.signal);
    return Promise.resolve(stream.response);
  });
  vi.stubGlobal("fetch", fetchMock);
  const hook = renderHook(() => useChatStream(handlers));
  return { handlers, fetchMock, hook, emit: (event: string, data: unknown) => stream.emit(event, data), end: () => stream.end() };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("useChatStream request lifecycle", () => {
  it("walks submitting → searching → generating → streaming → complete", async () => {
    const { handlers, hook, emit } = startStream();
    expect(hook.result.current.phase).toBe("idle");
    expect(hook.result.current.isBusy).toBe(false);

    act(() => void hook.result.current.sendChat(REQUEST));
    expect(hook.result.current.phase).toBe("submitting");
    expect(hook.result.current.isBusy).toBe(true);
    expect(hook.result.current.statusMessage).toBe("질문을 확인하고 있어요.");
    await settle();

    emit("status", { phase: "searching", message: "관련 정보를 검색하고 있어요." });
    await settle();
    expect(hook.result.current.phase).toBe("searching");
    expect(hook.result.current.statusMessage).toBe("관련 정보를 검색하고 있어요.");

    emit("sources", { items: [SOURCE] });
    emit("status", { phase: "generating", message: "답변을 생성하고 있어요." });
    await settle();
    expect(handlers.onSources).toHaveBeenCalledWith("request-1", [SOURCE]);
    expect(hook.result.current.phase).toBe("generating");

    emit("token", { delta: "안녕" });
    emit("token", { delta: "하세요" });
    await settle();
    expect(hook.result.current.phase).toBe("streaming");
    expect(hook.result.current.statusMessage).toBeNull();
    expect(handlers.onToken.mock.calls).toEqual([["request-1", "안녕"], ["request-1", "하세요"]]);

    emit("done", { requestId: "4e2c0d9a-2f4b-4c58-9c1e-0c9a3f6f8b11", finishReason: "stop" });
    await settle();
    expect(hook.result.current.phase).toBe("complete");
    expect(hook.result.current.isBusy).toBe(false);
    expect(handlers.onComplete).toHaveBeenCalledWith("request-1", "stop", { cached: false });
    expect(handlers.onError).not.toHaveBeenCalled();
  });

  it("ignores a late backward status after generation started", async () => {
    const { hook, emit } = startStream();
    act(() => void hook.result.current.sendChat(REQUEST));
    await settle();

    emit("status", { phase: "generating", message: "답변을 생성하고 있어요." });
    emit("status", { phase: "searching", message: "늦게 도착한 검색 상태" });
    await settle();

    expect(hook.result.current.phase).toBe("generating");
    expect(hook.result.current.statusMessage).toBe("답변을 생성하고 있어요.");
  });

  it("reports a cached answer and a length-limited finish through onComplete", async () => {
    const { handlers, hook, emit } = startStream();
    act(() => void hook.result.current.sendChat(REQUEST));
    await settle();

    emit("token", { delta: "저장된 답변" });
    emit("done", { requestId: "4e2c0d9a-2f4b-4c58-9c1e-0c9a3f6f8b11", finishReason: "length", cached: true });
    await settle();

    expect(hook.result.current.phase).toBe("complete");
    expect(handlers.onComplete).toHaveBeenCalledWith("request-1", "length", { cached: true });
  });

  it("ends in cancelled when the backend reports a cancelled finish", async () => {
    const { handlers, hook, emit } = startStream();
    act(() => void hook.result.current.sendChat(REQUEST));
    await settle();

    emit("token", { delta: "일부" });
    emit("done", { requestId: "4e2c0d9a-2f4b-4c58-9c1e-0c9a3f6f8b11", finishReason: "cancelled" });
    await settle();

    expect(hook.result.current.phase).toBe("cancelled");
    expect(handlers.onComplete).toHaveBeenCalledWith("request-1", "cancelled", { cached: false });
  });

  it("treats a done event without any token as an internal error", async () => {
    const { handlers, hook, emit } = startStream();
    act(() => void hook.result.current.sendChat(REQUEST));
    await settle();

    emit("done", { requestId: "4e2c0d9a-2f4b-4c58-9c1e-0c9a3f6f8b11", finishReason: "stop" });
    await settle();

    expect(hook.result.current.phase).toBe("error");
    expect(hook.result.current.isBusy).toBe(false);
    expect(handlers.onComplete).not.toHaveBeenCalled();
    expect(handlers.onError).toHaveBeenCalledWith("request-1", { code: "INTERNAL_ERROR", message: "답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요." });
  });

  it("surfaces a backend error event with its message", async () => {
    const { handlers, hook, emit } = startStream();
    act(() => void hook.result.current.sendChat(REQUEST));
    await settle();

    emit("error", { code: "NO_RELEVANT_CONTEXT", message: "공개된 내용에서 확인할 수 없어요." });
    await settle();

    expect(hook.result.current.phase).toBe("error");
    expect(hook.result.current.statusMessage).toBe("공개된 내용에서 확인할 수 없어요.");
    expect(handlers.onError).toHaveBeenCalledWith("request-1", { code: "NO_RELEVANT_CONTEXT", message: "공개된 내용에서 확인할 수 없어요." });
  });

  it("fails when the stream closes before a terminal event", async () => {
    const { handlers, hook, emit, end } = startStream();
    act(() => void hook.result.current.sendChat(REQUEST));
    await settle();

    emit("token", { delta: "끊긴 답변" });
    end();
    await settle();

    expect(hook.result.current.phase).toBe("error");
    expect(handlers.onError).toHaveBeenCalledWith("request-1", expect.objectContaining({ code: "INTERNAL_ERROR" }));
  });

  it("maps a non-2xx response to its error code without reading a stream", async () => {
    const handlers = createHandlers();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "RATE_LIMITED", message: "요청이 많아요.", retryAfterSeconds: 7 }), { status: 429 })));
    const hook = renderHook(() => useChatStream(handlers));

    act(() => void hook.result.current.sendChat(REQUEST));
    await settle();

    expect(hook.result.current.phase).toBe("error");
    expect(handlers.onError).toHaveBeenCalledWith("request-1", { code: "RATE_LIMITED", message: "요청이 많아요.", retryAfterSeconds: 7 });
  });

  it("reports a network failure as an unavailable model", async () => {
    const handlers = createHandlers();
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));
    const hook = renderHook(() => useChatStream(handlers));

    act(() => void hook.result.current.sendChat(REQUEST));
    await settle();

    expect(hook.result.current.phase).toBe("error");
    expect(handlers.onError).toHaveBeenCalledWith("request-1", expect.objectContaining({ code: "MODEL_UNAVAILABLE" }));
  });

  it("cancels the active request, aborts the fetch, and drops late events", async () => {
    const { handlers, fetchMock, hook, emit } = startStream();
    act(() => void hook.result.current.sendChat(REQUEST));
    await settle();
    emit("token", { delta: "첫 조각" });
    await settle();

    act(() => hook.result.current.cancel());
    expect(hook.result.current.phase).toBe("cancelled");
    expect(hook.result.current.isBusy).toBe(false);
    expect(handlers.onCancel).toHaveBeenCalledWith("request-1");
    expect((fetchMock.mock.calls[0]?.[1] as { signal: AbortSignal }).signal.aborted).toBe(true);
    await settle();

    expect(handlers.onError).not.toHaveBeenCalled();
    expect(handlers.onComplete).not.toHaveBeenCalled();
    expect(handlers.onToken).toHaveBeenCalledTimes(1);

    // 이미 끝난 요청을 다시 취소해도 아무 일도 일어나지 않는다.
    act(() => hook.result.current.cancel());
    expect(handlers.onCancel).toHaveBeenCalledTimes(1);
  });

  it("refuses a second request while one is in flight and accepts one afterwards", async () => {
    const { handlers, fetchMock, hook, emit } = startStream();
    act(() => void hook.result.current.sendChat(REQUEST));
    act(() => void hook.result.current.sendChat({ ...REQUEST, requestId: "request-2" }));
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    emit("token", { delta: "답변" });
    emit("done", { requestId: "4e2c0d9a-2f4b-4c58-9c1e-0c9a3f6f8b11", finishReason: "stop" });
    await settle();
    expect(handlers.onComplete).toHaveBeenCalledTimes(1);

    act(() => void hook.result.current.sendChat({ ...REQUEST, requestId: "request-3" }));
    expect(hook.result.current.phase).toBe("submitting");
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("reveals the cancel control only after a long wait and hides it once finished", async () => {
    const { hook, emit } = startStream();
    act(() => void hook.result.current.sendChat(REQUEST));
    await settle();
    expect(hook.result.current.canCancel).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });
    expect(hook.result.current.canCancel).toBe(true);

    emit("token", { delta: "답변" });
    emit("done", { requestId: "4e2c0d9a-2f4b-4c58-9c1e-0c9a3f6f8b11", finishReason: "stop" });
    await settle();
    expect(hook.result.current.canCancel).toBe(false);
  });
});
