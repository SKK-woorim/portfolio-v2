import { vi } from "vitest";

/**
 * jsdom에는 `showModal`/`close`와 `<form method="dialog">` 제출이 없어 열림 상태와 닫힘 이벤트만 흉내 낸다.
 * - `showModal()`: `open` 속성을 단다.
 * - `close(value?)`: 열려 있으면 `returnValue`를 정하고 `open`을 지운 뒤 `close`를 보낸다(브라우저와 달리 동기).
 * - `<form method="dialog">` 제출: 기본 동작을 막고 제출 버튼의 `value`로 가장 가까운 dialog를 닫는다.
 * 반환한 함수로 문서 리스너를 해제한다.
 */
export function installNativeDialogMock() {
  HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement, returnValue?: string) {
    if (!this.hasAttribute("open")) return;
    if (returnValue !== undefined) this.returnValue = returnValue;
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  });

  const submitDialogForm = (event: Event) => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.getAttribute("method") !== "dialog") return;
    event.preventDefault();
    const submitter = (event as SubmitEvent).submitter;
    form.closest("dialog")?.close(submitter instanceof HTMLButtonElement ? submitter.value : "");
  };
  document.addEventListener("submit", submitDialogForm, true);
  return () => document.removeEventListener("submit", submitDialogForm, true);
}
