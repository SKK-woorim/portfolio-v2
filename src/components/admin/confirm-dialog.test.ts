/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installNativeDialogMock } from "@/test-utils/native-dialog";
import { ConfirmDialog } from "./confirm-dialog";

let uninstallDialogMock: () => void;

beforeEach(() => {
  uninstallDialogMock = installNativeDialogMock();
});

afterEach(() => {
  cleanup();
  uninstallDialogMock();
});

function renderDialog(open: boolean) {
  const onConfirm = vi.fn();
  const onCancel = vi.fn();
  const props = { title: "삭제할까요?", description: "되돌릴 수 없습니다.", confirmLabel: "삭제", onConfirm, onCancel };
  const view = render(createElement(ConfirmDialog, { ...props, open }));
  const dialog = view.container.querySelector("dialog")!;
  return { view, dialog, onConfirm, onCancel, rerender: (next: boolean) => view.rerender(createElement(ConfirmDialog, { ...props, open: next })) };
}

describe("ConfirmDialog", () => {
  it("opens as a native modal named by its heading with focus on the safe action", () => {
    const { view, dialog } = renderDialog(true);

    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalledTimes(1);
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(dialog.getAttribute("role")).toBeNull();
    expect(dialog.getAttribute("aria-modal")).toBeNull();
    expect(dialog.getAttribute("closedby")).toBeNull();
    const title = view.getByRole("heading", { name: "삭제할까요?" });
    expect(dialog.getAttribute("aria-labelledby")).toBe(title.id);
    expect(document.getElementById(dialog.getAttribute("aria-describedby")!)?.textContent).toBe("되돌릴 수 없습니다.");
    expect(document.activeElement).toBe(view.getByRole("button", { name: "취소" }));
    expect(dialog.querySelector("form")?.getAttribute("method")).toBe("dialog");
  });

  it("does not open until requested", () => {
    const { dialog, rerender } = renderDialog(false);
    expect(dialog.hasAttribute("open")).toBe(false);
    rerender(true);
    expect(dialog.hasAttribute("open")).toBe(true);
  });

  it("confirms only from the confirm button and resets the return value", () => {
    const { view, dialog, onConfirm, onCancel } = renderDialog(true);

    fireEvent.click(view.getByRole("button", { name: "삭제" }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(dialog.hasAttribute("open")).toBe(false);
    expect(dialog.returnValue).toBe("");
  });

  it("cancels from the cancel button", () => {
    const { view, onConfirm, onCancel } = renderDialog(true);
    fireEvent.click(view.getByRole("button", { name: "취소" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("treats Esc (a close without a return value) as cancel even after an earlier confirm", () => {
    const { view, dialog, onConfirm, onCancel, rerender } = renderDialog(true);
    fireEvent.click(view.getByRole("button", { name: "삭제" }));
    rerender(false);
    rerender(true);

    // Esc는 returnValue를 정하지 않고 dialog를 닫는다.
    act(() => dialog.close());

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
