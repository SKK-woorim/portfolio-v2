/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COPY_FEEDBACK_MS, MediaUrlCopyButton } from "./media-url-copy-button";

const URL_TO_COPY = "https://example.com/storage/image.webp";
const COPIED = "본문에 쓸 URL을 복사했습니다.";
const FAILED = "URL을 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.";
const writeText = vi.fn<(text: string) => Promise<void>>();

beforeEach(() => {
  vi.useFakeTimers();
  writeText.mockReset();
  writeText.mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function click(button: HTMLElement) {
  // 클릭 → clipboard 약속 해소 → 다음 프레임에 문구 채움
  await act(async () => { fireEvent.click(button); });
  act(() => { vi.advanceTimersByTime(16); });
}

function renderButton() {
  const view = render(createElement(MediaUrlCopyButton, { url: URL_TO_COPY }));
  return { view, button: view.getByRole("button", { name: "본문 URL 복사" }), status: view.getByRole("status") };
}

describe("MediaUrlCopyButton", () => {
  it("copies the URL and announces it through a single status region outside the button", async () => {
    const { view, button, status } = renderButton();
    expect(status.textContent).toBe("");
    expect(button.contains(status)).toBe(false);

    await click(button);

    expect(writeText).toHaveBeenCalledWith(URL_TO_COPY);
    expect(status.textContent).toBe(COPIED);
    expect(view.getAllByRole("status")).toHaveLength(1);
    expect(view.getAllByText(COPIED)).toHaveLength(1);
    expect(button.getAttribute("data-copy-status")).toBe("copied");
    expect((button as HTMLButtonElement).disabled).toBe(false);
  });

  it("shows and announces a failure when the clipboard rejects", async () => {
    writeText.mockRejectedValueOnce(new Error("denied"));
    const { button, status } = renderButton();

    await click(button);

    expect(status.textContent).toBe(FAILED);
    expect(button.getAttribute("data-copy-status")).toBe("failed");
  });

  it("clears the state and message after the feedback timeout", async () => {
    const { button, status } = renderButton();
    await click(button);

    act(() => { vi.advanceTimersByTime(COPY_FEEDBACK_MS); });

    expect(status.textContent).toBe("");
    expect(status.className).toContain("sr-only");
    expect(button.getAttribute("data-copy-status")).toBe("idle");
  });

  it("restarts the timer on repeat clicks and makes a repeated message differ so it is announced again", async () => {
    const { button, status } = renderButton();
    await click(button);
    const first = status.textContent;

    act(() => { vi.advanceTimersByTime(COPY_FEEDBACK_MS - 500); });
    await click(button);
    const second = status.textContent;

    expect(first).toBe(COPIED);
    expect(second).toBe(`${COPIED}\u00A0`);
    expect(second?.trim()).toBe(COPIED);

    // 첫 클릭의 타이머가 끝날 시점에도 지워지지 않는다.
    act(() => { vi.advanceTimersByTime(600); });
    expect(status.textContent).toBe(second);
    act(() => { vi.advanceTimersByTime(COPY_FEEDBACK_MS); });
    expect(status.textContent).toBe("");

    await click(button);
    expect(status.textContent).toBe(COPIED);
  });

  it("cancels pending timers on unmount", async () => {
    const { view, button } = renderButton();
    await click(button);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
