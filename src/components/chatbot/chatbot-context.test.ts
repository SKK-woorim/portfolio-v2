/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const streamState = vi.hoisted(() => ({
  phase: "idle" as const,
  statusMessage: null as string | null,
  canCancel: false,
  isBusy: false,
  sendChat: vi.fn(),
  cancel: vi.fn(),
}));
const streamMocks = vi.hoisted(() => ({ useChatStream: vi.fn() }));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children?: ReactNode; href: string; [key: string]: unknown }) => createElement("a", { ...props, href }, children),
}));
vi.mock("./use-chat-stream", () => ({ useChatStream: streamMocks.useChatStream }));

import { CaseAsk } from "./case-ask";
import { ChatbotProvider } from "./chatbot-context";
import { ChatbotWidget } from "./chatbot-widget";

const QUESTION = "이 사례에서 맡은 역할은 무엇인가요?";

function statusResponse(status: string) {
  return new Response(JSON.stringify({ status }), { status: 200, headers: { "Content-Type": "application/json" } });
}

async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
    await Promise.resolve();
  });
}

function renderSite() {
  // children은 createElement의 추가 인자로 넘긴다. 타입상 필수 prop이라 props 타입만 느슨하게 맞춘다.
  const providerProps = { checkOnMount: true } as Parameters<typeof ChatbotProvider>[0];
  return render(createElement(
    ChatbotProvider,
    providerProps,
    createElement(CaseAsk, { questions: [QUESTION] }),
    createElement(ChatbotWidget),
  ));
}

beforeEach(() => {
  vi.useFakeTimers();
  streamState.sendChat.mockReset().mockReturnValue(true);
  streamState.cancel.mockReset();
  streamMocks.useChatStream.mockImplementation(() => streamState);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  Object.defineProperty(window, "matchMedia", { configurable: true, value: vi.fn((query: string) => ({
    matches: false, media: query, onchange: null, addListener: vi.fn(), removeListener: vi.fn(), addEventListener: vi.fn(), removeEventListener: vi.fn(), dispatchEvent: vi.fn(),
  })) });
  sessionStorage.clear();
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("ChatbotProvider availability and pending question", () => {
  it("keeps the conversation and composer visible when a known-online panel is opened", async () => {
    // 첫 확인은 바로 끝나고, 패널을 열 때 시작한 재확인은 끝나지 않은 채로 둔다.
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(statusResponse("enabled"))
      .mockReturnValue(new Promise<Response>(() => undefined));
    vi.stubGlobal("fetch", fetchMock);
    const view = renderSite();
    await settle();

    fireEvent.click(view.getByRole("button", { name: "포트폴리오 챗봇 열기" }));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(view.queryByText("챗봇 연결 상태를 확인하고 있어요.")).toBeNull();
    expect(view.getByRole("dialog", { name: "포트폴리오 챗봇" }).getAttribute("data-availability")).toBe("enabled");
    expect((view.getByRole("textbox", { name: "포트폴리오에 대해 질문하기" }) as HTMLTextAreaElement).disabled).toBe(false);
  });

  it("sends a question passed to the panel as soon as the connection is known", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(statusResponse("enabled"))));
    const view = renderSite();
    await settle();

    fireEvent.click(view.getByRole("button", { name: QUESTION }));
    await settle();

    expect(streamState.sendChat).toHaveBeenCalledTimes(1);
    expect(streamState.sendChat.mock.calls[0]?.[0]).toMatchObject({ message: QUESTION });
    expect(view.getByText(QUESTION, { selector: "p" })).toBeTruthy();
  });

  it("waits for the first status check before sending a passed question", async () => {
    let resolveStatus!: (response: Response) => void;
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => new Promise<Response>((resolve) => { resolveStatus = resolve; })));
    const view = renderSite();
    await settle();

    fireEvent.click(view.getByRole("button", { name: QUESTION }));
    await settle();
    expect(view.getByText("챗봇 연결 상태를 확인하고 있어요.")).toBeTruthy();
    expect(streamState.sendChat).not.toHaveBeenCalled();

    resolveStatus(statusResponse("enabled"));
    await settle();
    expect(streamState.sendChat).toHaveBeenCalledTimes(1);
  });

  it("leaves a passed question in the composer when the stream refuses it", async () => {
    streamState.sendChat.mockReturnValue(false);
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(statusResponse("enabled"))));
    const view = renderSite();
    await settle();

    fireEvent.click(view.getByRole("button", { name: QUESTION }));
    await settle();

    expect(streamState.sendChat).toHaveBeenCalledTimes(1);
    expect(view.queryByRole("article", { name: "사용자 질문" })).toBeNull();
    expect((view.getByRole("textbox", { name: "포트폴리오에 대해 질문하기" }) as HTMLTextAreaElement).value).toBe(QUESTION);
  });

  it("hides case questions once the chatbot is known to be off", async () => {
    vi.stubGlobal("fetch", vi.fn().mockImplementation(() => Promise.resolve(statusResponse("disabled"))));
    const view = renderSite();
    await settle();

    expect(view.queryByRole("button", { name: QUESTION })).toBeNull();
  });
});
