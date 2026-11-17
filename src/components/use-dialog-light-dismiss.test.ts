/** @vitest-environment jsdom */

import { cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useDialogLightDismiss } from "./use-dialog-light-dismiss";

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "closedBy");
});

function renderDialog() {
  const dialog = document.createElement("dialog");
  dialog.open = true;
  dialog.append(document.createElement("p"));
  document.body.append(dialog);
  // 다이얼로그 상자는 (100,100)~(300,300)이다.
  dialog.getBoundingClientRect = () => ({ left: 100, top: 100, right: 300, bottom: 300, width: 200, height: 200, x: 100, y: 100, toJSON: () => ({}) });
  const close = vi.fn();
  dialog.close = close;
  renderHook(() => useDialogLightDismiss({ current: dialog }));
  return { dialog, close };
}

const INSIDE = { clientX: 150, clientY: 150 };
const OUTSIDE = { clientX: 20, clientY: 20 };

function press(dialog: HTMLDialogElement, down: PointerEventInit, up: PointerEventInit) {
  dialog.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, ...down }));
  dialog.dispatchEvent(new PointerEvent("pointerup", { bubbles: true, ...up }));
}

describe("useDialogLightDismiss", () => {
  it("closes when both the press and the release land outside the dialog box", () => {
    const { dialog, close } = renderDialog();
    press(dialog, OUTSIDE, OUTSIDE);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("keeps the dialog open when a drag starts inside and is released on the backdrop", () => {
    const { dialog, close } = renderDialog();
    press(dialog, INSIDE, OUTSIDE);
    expect(close).not.toHaveBeenCalled();
  });

  it("keeps the dialog open for a press and release inside", () => {
    const { dialog, close } = renderDialog();
    press(dialog, INSIDE, INSIDE);
    expect(close).not.toHaveBeenCalled();
  });

  it("does nothing where the browser supports closedby natively", () => {
    Object.defineProperty(HTMLDialogElement.prototype, "closedBy", { configurable: true, get: () => "any" });
    const { dialog, close } = renderDialog();
    press(dialog, OUTSIDE, OUTSIDE);
    expect(close).not.toHaveBeenCalled();
  });
});
