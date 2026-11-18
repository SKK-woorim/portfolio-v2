/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installNativeDialogMock } from "@/test-utils/native-dialog";
import { ContentStatusActions } from "./content-status-actions";

const actionMocks = vi.hoisted(() => ({
  moveToTrash: vi.fn(),
  publishContent: vi.fn(),
  restoreContent: vi.fn(),
  unpublishContent: vi.fn(),
}));

vi.mock("@/app/admin/actions", () => actionMocks);

const ID = "26ed78d5-f82c-437c-a093-a97addf70020";
let uninstallDialogMock: () => void;

beforeEach(() => {
  Object.values(actionMocks).forEach((mock) => mock.mockReset());
  actionMocks.moveToTrash.mockResolvedValue({ success: "휴지통으로 옮겼습니다." });
  actionMocks.publishContent.mockResolvedValue({ success: "발행했습니다." });
  uninstallDialogMock = installNativeDialogMock();
});

afterEach(() => {
  cleanup();
  uninstallDialogMock();
});

function renderActions() {
  return render(createElement(ContentStatusActions, { table: "posts", id: ID, status: "draft" }));
}

describe("ContentStatusActions", () => {
  it("asks in a modal dialog instead of window.confirm and trashes after confirmation", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const view = renderActions();

    fireEvent.click(view.getByRole("button", { name: "휴지통" }));
    const dialog = view.container.querySelector("dialog")!;
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(view.getByRole("heading", { name: "이 콘텐츠를 휴지통으로 옮길까요?" })).toBeTruthy();
    expect(actionMocks.moveToTrash).not.toHaveBeenCalled();

    fireEvent.click(view.getByRole("button", { name: "휴지통으로 옮기기" }));

    await waitFor(() => expect(actionMocks.moveToTrash).toHaveBeenCalledWith("posts", ID));
    expect(dialog.hasAttribute("open")).toBe(false);
    await waitFor(() => expect(view.getByRole("status").textContent).toBe("휴지통으로 옮겼습니다."));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("does not trash when cancelled or dismissed with Esc", () => {
    const view = renderActions();

    fireEvent.click(view.getByRole("button", { name: "휴지통" }));
    fireEvent.click(view.getByRole("button", { name: "취소" }));
    fireEvent.click(view.getByRole("button", { name: "휴지통" }));
    act(() => view.container.querySelector("dialog")!.close());

    expect(actionMocks.moveToTrash).not.toHaveBeenCalled();
    expect(view.container.querySelector("dialog")!.hasAttribute("open")).toBe(false);
  });

  it("runs transitions without a confirmation step immediately", async () => {
    const view = renderActions();
    fireEvent.click(view.getByRole("button", { name: "발행" }));
    await waitFor(() => expect(actionMocks.publishContent).toHaveBeenCalledWith("posts", ID));
    expect(HTMLDialogElement.prototype.showModal).not.toHaveBeenCalled();
  });
});
