"use client";

import { useState, useTransition } from "react";
import { moveToTrash, publishContent, restoreContent, unpublishContent } from "@/app/admin/actions";
import { availableContentTransitions, type ContentTransition } from "@/lib/content/status";
import type { FormState } from "@/lib/validation/content";
import { ConfirmDialog } from "./confirm-dialog";
import { FormStatus } from "./form-status";

type ContentTable = "portfolio_items" | "posts";

type TransitionButton = {
  label: string;
  pendingLabel: string;
  className: string;
  run: (table: ContentTable, id: string) => Promise<FormState>;
  /** 실행 전에 확인 창으로 한 번 더 묻는다. */
  confirm?: { title: string; description: string; confirmLabel: string };
};

const TRANSITION_BUTTONS: Record<ContentTransition, TransitionButton> = {
  publish: { label: "발행", pendingLabel: "발행 중…", className: "text-[var(--primary)]", run: publishContent },
  unpublish: { label: "발행 중단", pendingLabel: "처리 중…", className: "text-[var(--body)]", run: unpublishContent },
  trash: { label: "휴지통", pendingLabel: "처리 중…", className: "text-[#b33d4a]", run: moveToTrash, confirm: { title: "이 콘텐츠를 휴지통으로 옮길까요?", description: "언제든 복구할 수 있습니다.", confirmLabel: "휴지통으로 옮기기" } },
  restore: { label: "복구", pendingLabel: "복구 중…", className: "text-[var(--primary)]", run: restoreContent },
};

/** 현재 발행 상태에서 실행할 수 있는 전이만 버튼으로 보여 준다. 규칙은 `@/lib/content/status`에 있다. */
export function ContentStatusActions({ table, id, status }: { table: ContentTable; id: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<ContentTransition | null>(null);
  const [message, setMessage] = useState<FormState>({});
  const [confirming, setConfirming] = useState<ContentTransition | null>(null);
  const confirmation = confirming ? TRANSITION_BUTTONS[confirming].confirm : undefined;

  function run(transition: ContentTransition) {
    setRunning(transition);
    startTransition(async () => setMessage(await TRANSITION_BUTTONS[transition].run(table, id)));
  }

  function request(transition: ContentTransition) {
    if (TRANSITION_BUTTONS[transition].confirm) setConfirming(transition);
    else run(transition);
  }

  function confirm() {
    const transition = confirming;
    setConfirming(null);
    if (transition) run(transition);
  }

  return (
    <div className="flex flex-col items-end gap-2" data-status={status}>
      <div className="inline-flex flex-wrap justify-end gap-3">
        {availableContentTransitions(status).map((transition) => {
          const button = TRANSITION_BUTTONS[transition];
          return (
            <button
              key={transition}
              type="button"
              className={`focus-ring font-semibold disabled:opacity-50 ${button.className}`}
              disabled={pending}
              onClick={() => request(transition)}
            >
              {pending && running === transition ? button.pendingLabel : button.label}
            </button>
          );
        })}
      </div>
      <FormStatus variant="text" result={message} error={message.error} success={message.success} className="max-w-55 text-right" />
      <ConfirmDialog
        open={Boolean(confirmation)}
        title={confirmation?.title ?? ""}
        description={confirmation?.description}
        confirmLabel={confirmation?.confirmLabel ?? ""}
        onConfirm={confirm}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
