"use client";

import { useState, useTransition } from "react";
import { moveToTrash, publishContent, restoreContent, unpublishContent } from "@/app/admin/actions";
import { availableContentTransitions, type ContentTransition } from "@/lib/content/status";
import type { FormState } from "@/lib/validation/content";

type ContentTable = "portfolio_items" | "posts";

type TransitionButton = {
  label: string;
  pendingLabel: string;
  className: string;
  run: (table: ContentTable, id: string) => Promise<FormState>;
  /** 실행 전에 한 번 더 묻는 문구. */
  confirm?: string;
};

const TRANSITION_BUTTONS: Record<ContentTransition, TransitionButton> = {
  publish: { label: "발행", pendingLabel: "발행 중…", className: "text-[var(--primary)]", run: publishContent },
  unpublish: { label: "발행 중단", pendingLabel: "처리 중…", className: "text-[var(--body)]", run: unpublishContent },
  trash: { label: "휴지통", pendingLabel: "처리 중…", className: "text-[#b33d4a]", run: moveToTrash, confirm: "이 콘텐츠를 휴지통으로 옮길까요? 언제든 복구할 수 있습니다." },
  restore: { label: "복구", pendingLabel: "복구 중…", className: "text-[var(--primary)]", run: restoreContent },
};

/** 현재 발행 상태에서 실행할 수 있는 전이만 버튼으로 보여 준다. 규칙은 `@/lib/content/status`에 있다. */
export function ContentStatusActions({ table, id, status }: { table: ContentTable; id: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<ContentTransition | null>(null);
  const [message, setMessage] = useState<FormState>({});

  function run(transition: ContentTransition) {
    const button = TRANSITION_BUTTONS[transition];
    if (button.confirm && !window.confirm(button.confirm)) return;
    setRunning(transition);
    startTransition(async () => setMessage(await button.run(table, id)));
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
              onClick={() => run(transition)}
            >
              {pending && running === transition ? button.pendingLabel : button.label}
            </button>
          );
        })}
      </div>
      {message.error ? <span role="alert" className="max-w-55 text-right text-xs text-[#b33d4a]">{message.error}</span> : null}
      {message.success ? <span role="status" className="max-w-55 text-right text-xs text-[#146b58]">{message.success}</span> : null}
    </div>
  );
}
