/** @vitest-environment jsdom */

import { cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BlogError from "./error";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

afterEach(() => cleanup());

describe("BlogError", () => {
  it("separates a query failure from an empty or filtered result and offers retry", () => {
    const reset = vi.fn();
    const view = render(createElement(BlogError, { error: new Error("database unavailable"), reset }));

    expect(view.getByRole("alert").textContent).toContain("글 목록을 불러오지 못했습니다.");
    expect(view.getByText(/일시적인 연결 문제일 수 있습니다/)).toBeTruthy();
    fireEvent.click(view.getByRole("button", { name: "다시 시도" }));
    expect(reset).toHaveBeenCalledTimes(1);
  });
});
