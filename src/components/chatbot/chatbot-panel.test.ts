/** @vitest-environment jsdom */

import { cleanup, fireEvent, render } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatbotPanel } from "./chatbot-panel";
import type { ChatbotRuntimeAvailability, ChatMessage } from "./chatbot-types";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children?: ReactNode; href: string; [key: string]: unknown }) => createElement("a", { ...props, href }, children),
}));

afterEach(() => cleanup());

const baseProps = {
  messages: [] as ChatMessage[],
  phase: "idle" as const,
  statusMessage: null,
  canCancel: false,
  input: "",
  isReady: true,
  runtimeAvailability: "enabled" as ChatbotRuntimeAvailability,
  announcement: "",
  suggestedQuestions: ["추천 질문"] as const,
  onInputChange: vi.fn(),
  onSubmit: vi.fn(),
  onRetry: vi.fn(),
  onCancel: vi.fn(),
  onRefreshStatus: vi.fn(),
  onClose: vi.fn(),
  onClearConversation: vi.fn(),
  onNavigate: vi.fn(),
};

function renderPanel(overrides: Partial<typeof baseProps> = {}) {
  return render(createElement(ChatbotPanel, { ...baseProps, ...overrides }));
}

describe("ChatbotPanel interaction states", () => {
  it.each([
    ["checking", "챗봇 연결 상태를 확인하고 있어요."],
    ["disabled", "지금은 AI 챗봇 연결이 꺼져 있어요."],
    ["unavailable", "AI 챗봇 연결 상태를 확인할 수 없어요."],
  ] as const)("focuses the close control while runtime is %s", (runtimeAvailability, message) => {
    const view = renderPanel({ runtimeAvailability });
    const close = view.getByRole("button", { name: "포트폴리오 챗봇 닫기" });

    expect(document.activeElement).toBe(close);
    expect(view.getByText(message)).toBeTruthy();
  });

  it("closes the runtime fallback after following an internal link", () => {
    const onNavigate = vi.fn();
    const view = renderPanel({ runtimeAvailability: "unavailable", onNavigate });

    fireEvent.click(view.getByRole("link", { name: "소개 보기" }));

    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("keeps shift-enter for multiline input and submits on a plain enter", () => {
    const onSubmit = vi.fn();
    const view = renderPanel({ input: "첫 줄\n둘째 줄", onSubmit });
    const input = view.getByRole("textbox", { name: "포트폴리오에 대해 질문하기" });

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(onSubmit).toHaveBeenCalledWith("첫 줄\n둘째 줄");
  });

  it("shows a new-reply affordance when a long conversation is scrolled away", () => {
    const messages = Array.from({ length: 24 }, (_, index) => ({
      id: `message-${index}`,
      role: index % 2 ? "assistant" as const : "user" as const,
      content: `대화 ${index}`,
      delivery: "complete" as const,
    }));
    const view = renderPanel({ messages });
    const list = view.getByRole("dialog").querySelector(".chatbot-message-list") as HTMLDivElement;
    Object.defineProperty(list, "clientHeight", { configurable: true, value: 100 });
    Object.defineProperty(list, "scrollHeight", { configurable: true, value: 1_000 });
    Object.defineProperty(list, "scrollTop", { configurable: true, writable: true, value: 0 });
    Object.defineProperty(list, "scrollTo", { configurable: true, value: vi.fn() });
    fireEvent.scroll(list);

    view.rerender(createElement(ChatbotPanel, {
      ...baseProps,
      messages: [...messages, { id: "new", role: "assistant", content: "새 답변", delivery: "streaming" }],
    }));

    expect(view.getByRole("button", { name: "새 답변 보기" })).toBeTruthy();
  });

  it("clears an existing conversation through the explicit reset control", () => {
    const onClearConversation = vi.fn();
    const view = renderPanel({
      messages: [{ id: "user-1", role: "user", content: "질문", delivery: "complete" }],
      onClearConversation,
    });

    fireEvent.click(view.getByRole("button", { name: "대화 기록 지우기" }));

    expect(onClearConversation).toHaveBeenCalledTimes(1);
  });
});
