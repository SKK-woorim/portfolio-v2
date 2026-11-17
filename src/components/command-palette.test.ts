/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommandPalette } from "./command-palette";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// jsdom에는 showModal/close가 없어 열림 상태만 흉내 낸다.
beforeEach(() => {
  push.mockReset();
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) { this.setAttribute("open", ""); });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  });
});

afterEach(() => cleanup());

function renderOpenPalette() {
  const view = render(createElement(CommandPalette, {
    projects: [{ slug: "first-project", title: "첫 프로젝트", period: "2026" }],
    posts: [],
    email: "hello@example.com",
  }));
  act(() => { window.dispatchEvent(new Event("portfolio:open-command-palette")); });
  return view;
}

describe("CommandPalette keyboard handling", () => {
  it("ignores an IME-confirming enter and runs the selected entry on a plain enter", () => {
    const view = renderOpenPalette();
    const input = view.getByRole("combobox", { name: "검색어" });

    expect(fireEvent.keyDown(input, { key: "Enter", keyCode: 229 })).toBe(false);
    fireEvent.keyDown(input, { key: "Enter", isComposing: true });
    expect(push).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter", keyCode: 13 });
    expect(push).toHaveBeenCalledWith("/portfolio/first-project");
  });

  it("closes from the visible close button without running the selected entry", () => {
    const view = renderOpenPalette();
    const close = view.getByRole("button", { name: "검색 닫기" });

    // Enter는 버튼 기본 동작(클릭)으로 넘어가야 하므로 막지 않는다.
    expect(fireEvent.keyDown(close, { key: "Enter", keyCode: 13 })).toBe(true);
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(close);
    expect(HTMLDialogElement.prototype.close).toHaveBeenCalledTimes(1);
    expect(view.queryByRole("combobox", { name: "검색어" })).toBeNull();
    expect(push).not.toHaveBeenCalled();
  });
});
