"use client";

import { useEffect, useId, useRef } from "react";
import { Button } from "@/components/ui/button";

const CONFIRM_VALUE = "confirm";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** danger: 되돌리기 어려운 작업, primary: 일반 확인. */
  tone?: "danger" | "primary";
  onConfirm: () => void;
  /** 취소 버튼·Esc 등 확인 없이 닫혔을 때. */
  onCancel: () => void;
};

/**
 * `window.confirm`을 대신하는 네이티브 모달 확인 창.
 *
 * - `showModal()`이 배경 inert·포커스 가두기·Esc 닫기·닫을 때 호출 요소로의 포커스 복귀를 맡는다.
 *   그래서 role·aria-modal·수동 포커스 트랩·Esc 처리·포커스 복원 코드를 두지 않는다.
 * - 닫기 방식은 모달 기본값(Esc만)이다. 바깥 클릭으로는 닫지 않는다.
 * - 버튼은 `<form method="dialog">`로 닫고, `close` 이벤트에서 `returnValue`를 읽은 뒤 `''`로 되돌린다.
 *   Esc는 값을 남기지 않으므로 `''`는 "선택 없이 닫힘(취소)"이다.
 * - 열 때 안전한 쪽(취소)에 초기 포커스를 둔다. React의 `autoFocus`는 마운트 때만 동작하고 네이티브
 *   `autofocus` 속성을 남기지 않으므로, `showModal()` 직후 직접 옮긴다.
 */
export function ConfirmDialog({ open, title, description, confirmLabel, cancelLabel = "취소", tone = "danger", onConfirm, onCancel }: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  function handleClose() {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const choice = dialog.returnValue;
    // Esc는 값을 바꾸지 않고, 브라우저마다 이전 값을 지우는지가 달라 다음 닫힘에 남지 않게 비운다.
    dialog.returnValue = "";
    if (choice === CONFIRM_VALUE) onConfirm();
    else onCancel();
  }

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onClose={handleClose}
      className="admin-dialog w-[calc(100%-2rem)] max-w-md rounded-3xl bg-white p-6 text-left text-base font-normal text-[var(--ink)] shadow-2xl"
    >
      <h2 id={titleId} className="text-lg font-semibold">{title}</h2>
      {description ? <p id={descriptionId} className="mt-2 text-sm leading-6 text-[var(--body)]">{description}</p> : null}
      <form method="dialog" className="mt-6 flex flex-wrap justify-end gap-3">
        <Button ref={cancelRef} type="submit" value="cancel" variant="secondary">{cancelLabel}</Button>
        <Button type="submit" value={CONFIRM_VALUE} variant={tone === "danger" ? "danger" : "primary"}>{confirmLabel}</Button>
      </form>
    </dialog>
  );
}
