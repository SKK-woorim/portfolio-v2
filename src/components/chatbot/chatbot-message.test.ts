/** @vitest-environment jsdom */

import { cleanup, render } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ChatbotMessage } from "./chatbot-message";

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children?: ReactNode; href: string; [key: string]: unknown }) => createElement("a", { ...props, href }, children),
}));

afterEach(() => cleanup());

const baseMessage = {
  id: "assistant-1",
  role: "assistant" as const,
  content: "답변 내용",
  retryMessage: "다시 질문",
};

describe("ChatbotMessage delivery states", () => {
  it("labels a length-limited answer as partial and keeps retry available", () => {
    const onRetry = vi.fn();
    const view = render(createElement(ChatbotMessage, {
      message: { ...baseMessage, delivery: "partial" as const },
      onRetry,
    }));

    expect(view.getByText("답변이 길이 제한으로 일부만 표시되었습니다.")).toBeTruthy();
    view.getByRole("button", { name: "다시 시도" }).click();
    expect(onRetry).toHaveBeenCalledWith("다시 질문");
  });

  it("labels a cancelled answer without treating a completed answer as interrupted", () => {
    const cancelled = render(createElement(ChatbotMessage, { message: { ...baseMessage, delivery: "cancelled" as const } }));
    expect(cancelled.getByText("생성이 취소된 답변입니다.")).toBeTruthy();
    cancelled.unmount();

    const complete = render(createElement(ChatbotMessage, { message: { ...baseMessage, delivery: "complete" as const } }));
    expect(complete.queryByText("생성이 취소된 답변입니다.")).toBeNull();
    expect(complete.queryByText("답변이 길이 제한으로 일부만 표시되었습니다.")).toBeNull();
  });
});
