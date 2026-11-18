/** @vitest-environment jsdom */

import { cleanup, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { FormStatus } from "./form-status";

afterEach(() => cleanup());

describe("FormStatus", () => {
  it("keeps one empty status region in the DOM without taking layout space", () => {
    const view = render(createElement(FormStatus, {}));
    const status = view.getByRole("status");
    expect(status.textContent).toBe("");
    // sr-only(절대 위치)라 grid gap을 만들지 않고, display: none이 아니라 접근성 트리에 남는다.
    expect(status.className).toBe("sr-only");
    expect(view.queryByRole("alert")).toBeNull();
  });

  it("changes the content of the same status element on success", async () => {
    const view = render(createElement(FormStatus, { variant: "box" }));
    const status = view.getByRole("status");

    view.rerender(createElement(FormStatus, { variant: "box", success: "저장했습니다." }));

    expect(view.getByRole("status")).toBe(status);
    await waitFor(() => expect(status.textContent).toBe("저장했습니다."));
    expect(status.className).toContain("rounded-xl");
  });

  it("shows errors as an alert and empties the status", async () => {
    const view = render(createElement(FormStatus, { variant: "text", success: "저장했습니다.", className: "mt-2" }));
    view.rerender(createElement(FormStatus, { variant: "text", error: "저장하지 못했습니다.", className: "mt-2" }));

    const alert = view.getByRole("alert");
    expect(alert.textContent).toBe("저장하지 못했습니다.");
    expect(alert.className).toContain("text-xs");
    expect(alert.className).toContain("mt-2");
    await waitFor(() => expect(view.getByRole("status").textContent).toBe(""));
  });
});

describe("FormStatus repeated results", () => {
  it("announces the same success text again for a new result, and ignores plain re-renders", async () => {
    const first = { success: "저장했습니다." };
    const view = render(createElement(FormStatus, { result: first, success: first.success }));
    const status = view.getByRole("status");
    await waitFor(() => expect(status.textContent).toBe("저장했습니다."));

    // 입력 등으로 같은 결과가 다시 렌더링되면 내용이 바뀌지 않는다.
    const observed: string[] = [];
    const observer = new MutationObserver(() => observed.push(status.textContent ?? ""));
    observer.observe(status, { childList: true, characterData: true, subtree: true });
    view.rerender(createElement(FormStatus, { result: first, success: first.success }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(observed).toEqual([]);
    expect(status.textContent).toBe("저장했습니다.");

    // 같은 문구의 새 결과: 비웠다가 U+00A0이 붙은 문구로 다시 채운다(내용 변경 → 다시 안내).
    const second = { success: "저장했습니다." };
    view.rerender(createElement(FormStatus, { result: second, success: second.success }));
    await waitFor(() => expect(status.textContent).toBe("저장했습니다.\u00A0"));
    expect(observed).toContain("");
    expect(view.getByRole("status")).toBe(status);

    // 세 번째도 직전과 달라진다.
    const third = { success: "저장했습니다." };
    view.rerender(createElement(FormStatus, { result: third, success: third.success }));
    await waitFor(() => expect(status.textContent).toBe("저장했습니다."));
    observer.disconnect();
  });

  it("remounts the alert when a new result repeats the same error, but not on re-render", async () => {
    const first = { error: "로그인하지 못했습니다." };
    const view = render(createElement(FormStatus, { result: first, error: first.error }));
    const alert = view.getByRole("alert");
    await new Promise((resolve) => setTimeout(resolve, 80));

    view.rerender(createElement(FormStatus, { result: first, error: first.error }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(view.getByRole("alert")).toBe(alert);

    const second = { error: "로그인하지 못했습니다." };
    view.rerender(createElement(FormStatus, { result: second, error: second.error }));
    await waitFor(() => expect(view.getByRole("alert")).not.toBe(alert));
    expect(view.getByRole("alert").textContent).toBe("로그인하지 못했습니다.");
  });

  it("without a result value, announces only when the text changes", async () => {
    const view = render(createElement(FormStatus, { success: "보냈습니다." }));
    const status = view.getByRole("status");
    await waitFor(() => expect(status.textContent).toBe("보냈습니다."));
    view.rerender(createElement(FormStatus, { success: "보냈습니다." }));
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(status.textContent).toBe("보냈습니다.");
  });
});
