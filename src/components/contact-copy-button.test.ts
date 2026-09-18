/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ContactCopyButton } from "./contact-copy-button";

const clipboard = { writeText: vi.fn() };

beforeEach(() => {
  clipboard.writeText.mockReset();
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
});

afterEach(() => cleanup());

describe("ContactCopyButton", () => {
  it("copies the configured email and announces success", async () => {
    clipboard.writeText.mockResolvedValue(undefined);
    const view = render(createElement(ContactCopyButton, { value: "owner@example.com" }));

    fireEvent.click(view.getByRole("button", { name: "이메일 주소 복사" }));

    await waitFor(() => expect(view.getByRole("status").textContent).toContain("주소를 복사했습니다."));
    expect(clipboard.writeText).toHaveBeenCalledWith("owner@example.com");
  });

  it("keeps a selectable fallback message when the clipboard is unavailable", async () => {
    clipboard.writeText.mockRejectedValue(new Error("clipboard unavailable"));
    const view = render(createElement(ContactCopyButton, { value: "owner@example.com" }));

    fireEvent.click(view.getByRole("button", { name: "이메일 주소 복사" }));

    await waitFor(() => expect(view.getByRole("status").textContent).toContain("복사하지 못했습니다."));
  });
});
