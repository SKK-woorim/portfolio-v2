/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const streamState = vi.hoisted(() => ({
  phase: "idle" as const,
  statusMessage: null as string | null,
  canCancel: false,
  isBusy: false,
  sendChat: vi.fn().mockResolvedValue(true),
  cancel: vi.fn(),
}));
const streamMocks = vi.hoisted(() => ({
  useChatStream: vi.fn(),
}));
const navigationMocks = vi.hoisted(() => ({
  latestHandlers: undefined as Record<string, (...args: unknown[]) => void> | undefined,
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children?: ReactNode; href: string; [key: string]: unknown }) => createElement("a", { ...props, href }, children),
}));
vi.mock("./use-chat-stream", () => ({
  useChatStream: streamMocks.useChatStream,
}));

import { ChatbotWidget } from "./chatbot-widget";

function flushPromises() {
  return Promise.resolve().then(() => Promise.resolve());
}

function stubMatchMedia(matches: boolean) {
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) });
}

beforeEach(() => {
  vi.useFakeTimers();
  streamState.phase = "idle";
  streamState.statusMessage = null;
  streamState.canCancel = false;
  streamState.isBusy = false;
  streamState.sendChat.mockReset().mockResolvedValue(true);
  streamState.cancel.mockReset();
  navigationMocks.latestHandlers = undefined;
  streamMocks.useChatStream.mockImplementation((handlers: Record<string, (...args: unknown[]) => void>) => {
    navigationMocks.latestHandlers = handlers;
    return streamState;
  });
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  stubMatchMedia(false);
  sessionStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

async function openWidget(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const view = render(createElement(ChatbotWidget));
  fireEvent.click(view.getByRole("button", { name: "포트폴리오 챗봇 열기" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    await flushPromises();
  });
  return view;
}

describe("ChatbotWidget runtime availability", () => {
  it("moves from checking to unavailable when the status request times out", async () => {
    const fetchMock = vi.fn((_input: string, init: { signal: AbortSignal }) => new Promise<Response>((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    }));
    const view = await openWidget(fetchMock);

    expect(view.getByText("챗봇 연결 상태를 확인하고 있어요.")).toBeTruthy();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
      await flushPromises();
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/chat/status", expect.objectContaining({ cache: "no-store" }));
    expect(view.getByText("AI 챗봇 연결 상태를 확인할 수 없어요.")).toBeTruthy();
  });

  it.each([
    ["enabled", "공개된 콘텐츠를 바탕으로 답해요"],
    ["disabled", "지금은 AI 챗봇 연결이 꺼져 있어요."],
    ["unexpected", "AI 챗봇 연결 상태를 확인할 수 없어요."],
  ] as const)("renders the %s status returned by the runtime endpoint", async (status, message) => {
    const payload = status === "unexpected" ? { status: "unknown" } : { status };
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } }));
    const view = await openWidget(fetchMock);

    expect(view.getByText(message)).toBeTruthy();
  });

  it("closes the dialog and releases mobile scroll lock after an internal link", async () => {
    stubMatchMedia(true);
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "disabled" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const view = await openWidget(fetchMock);

    expect(document.body.classList.contains("chatbot-scroll-locked")).toBe(true);
    fireEvent.click(view.getByRole("link", { name: "소개 보기" }));

    expect(view.queryByRole("dialog", { name: "포트폴리오 챗봇" })).toBeNull();
    expect(document.body.classList.contains("chatbot-scroll-locked")).toBe(false);
  });
});

describe("ChatbotWidget finish reasons", () => {
  it("renders stop, length, and cancelled delivery states through the real widget callbacks", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "enabled" }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const view = await openWidget(fetchMock);
    const input = view.getByRole("textbox", { name: "포트폴리오에 대해 질문하기" });

    fireEvent.change(input, { target: { value: "첫 질문" } });
    fireEvent.click(view.getByRole("button", { name: "질문 보내기" }));
    const firstRequestId = streamState.sendChat.mock.calls[0]?.[0]?.requestId as string;
    await act(async () => {
      navigationMocks.latestHandlers?.onToken?.(firstRequestId, "완료 답변");
      navigationMocks.latestHandlers?.onComplete?.(firstRequestId, "stop");
    });
    expect(view.queryByText("생성이 취소된 답변입니다.")).toBeNull();
    expect(view.queryByText("답변이 길이 제한으로 일부만 표시되었습니다.")).toBeNull();

    fireEvent.change(input, { target: { value: "두 번째 질문" } });
    fireEvent.click(view.getByRole("button", { name: "질문 보내기" }));
    const secondRequestId = streamState.sendChat.mock.calls[1]?.[0]?.requestId as string;
    await act(async () => {
      navigationMocks.latestHandlers?.onToken?.(secondRequestId, "일부 답변");
      navigationMocks.latestHandlers?.onComplete?.(secondRequestId, "length");
    });
    expect(view.getByText("답변이 길이 제한으로 일부만 표시되었습니다.")).toBeTruthy();

    fireEvent.change(input, { target: { value: "세 번째 질문" } });
    fireEvent.click(view.getByRole("button", { name: "질문 보내기" }));
    const thirdRequestId = streamState.sendChat.mock.calls[2]?.[0]?.requestId as string;
    await act(async () => {
      navigationMocks.latestHandlers?.onToken?.(thirdRequestId, "취소된 답변");
      navigationMocks.latestHandlers?.onComplete?.(thirdRequestId, "cancelled");
    });
    expect(view.getByText("생성이 취소된 답변입니다.")).toBeTruthy();
  });
});
