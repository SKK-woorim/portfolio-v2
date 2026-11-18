/** @vitest-environment jsdom */

import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { installNativeDialogMock } from "@/test-utils/native-dialog";
import { ReindexAllControl } from "./chatbot-reindex-controls";

const actionMocks = vi.hoisted(() => ({
  reindexAllKnowledgeDocuments: vi.fn(),
  reindexKnowledgeDocument: vi.fn(),
}));

vi.mock("@/app/admin/actions", () => actionMocks);

let uninstallDialogMock: () => void;

beforeEach(() => {
  actionMocks.reindexAllKnowledgeDocuments.mockReset();
  actionMocks.reindexAllKnowledgeDocuments.mockResolvedValue({ success: "전체 재인덱싱을 요청했습니다." });
  uninstallDialogMock = installNativeDialogMock();
});

afterEach(() => {
  cleanup();
  uninstallDialogMock();
});

describe("ReindexAllControl", () => {
  it("submits the original form data with confirmed=true only after the dialog is confirmed", async () => {
    const confirmSpy = vi.spyOn(window, "confirm");
    const view = render(createElement(ReindexAllControl));

    fireEvent.click(view.getByRole("button", { name: "전체 재인덱싱" }));
    const dialog = view.container.querySelector("dialog")!;
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(actionMocks.reindexAllKnowledgeDocuments).not.toHaveBeenCalled();
    // 확인 창의 form은 제출 폼 안에 중첩되지 않는다.
    expect(dialog.closest("form")).toBeNull();

    const confirmButton = [...dialog.querySelectorAll("button")].find((button) => button.textContent === "전체 재인덱싱")!;
    fireEvent.click(confirmButton);

    await waitFor(() => expect(actionMocks.reindexAllKnowledgeDocuments).toHaveBeenCalledTimes(1));
    const submitted = actionMocks.reindexAllKnowledgeDocuments.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("confirmed")).toBe("true");
    await waitFor(() => expect(view.getByRole("status").textContent).toBe("전체 재인덱싱을 요청했습니다."));
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("does not submit when cancelled or dismissed with Esc, and asks again next time", async () => {
    const view = render(createElement(ReindexAllControl));
    const trigger = view.getByRole("button", { name: "전체 재인덱싱" });
    const dialog = view.container.querySelector("dialog")!;

    fireEvent.click(trigger);
    fireEvent.click(view.getByRole("button", { name: "취소" }));
    expect(dialog.hasAttribute("open")).toBe(false);

    fireEvent.click(trigger);
    expect(dialog.hasAttribute("open")).toBe(true);
    act(() => dialog.close());

    fireEvent.click(trigger);
    expect(dialog.hasAttribute("open")).toBe(true);
    expect(actionMocks.reindexAllKnowledgeDocuments).not.toHaveBeenCalled();
  });
});
