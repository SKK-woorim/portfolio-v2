"use client";

import { useEffect, type RefObject } from "react";

function isOutside(event: PointerEvent, dialog: HTMLDialogElement) {
  // event.target은 다이얼로그 여백·자식 사이 빈틈에서도 dialog 자신이라, 좌표로만 판정한다.
  const rect = dialog.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
}

/**
 * closedby="any"를 지원하지 않는 브라우저에서 바깥 클릭으로 모달을 닫는다.
 * 누름과 뗌이 모두 바깥일 때만 닫아, 안에서 시작한 텍스트 선택 드래그가 배경에서 끝나도 닫히지 않게 한다.
 */
export function useDialogLightDismiss(dialogRef: RefObject<HTMLDialogElement | null>) {
  useEffect(() => {
    const dialog = dialogRef.current;
    // 네이티브 closedby가 있으면 브라우저 동작에 맡긴다.
    if (!dialog || "closedBy" in HTMLDialogElement.prototype) return;

    let pressedOutside = false;
    const onPointerDown = (event: PointerEvent) => {
      pressedOutside = isOutside(event, dialog);
    };
    const onPointerUp = (event: PointerEvent) => {
      const shouldClose = pressedOutside && isOutside(event, dialog);
      pressedOutside = false;
      if (shouldClose && dialog.open) dialog.close();
    };
    dialog.addEventListener("pointerdown", onPointerDown);
    dialog.addEventListener("pointerup", onPointerUp);
    return () => {
      dialog.removeEventListener("pointerdown", onPointerDown);
      dialog.removeEventListener("pointerup", onPointerUp);
    };
  }, [dialogRef]);
}
