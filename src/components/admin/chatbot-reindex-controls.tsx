"use client";

import { useActionState, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { reindexAllKnowledgeDocuments, reindexKnowledgeDocument } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/validation/content";
import { ConfirmDialog } from "./confirm-dialog";
import { FormStatus } from "./form-status";

const initialState: FormState = {};

function ActionMessage({ state }: { state: FormState }) {
  return <FormStatus variant="text" result={state} error={state.error} success={state.success} className="mt-2 max-w-72" />;
}

export function ReindexDocumentControl({ documentId }: { documentId: string }) {
  const [state, formAction, pending] = useActionState(reindexKnowledgeDocument, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="documentId" value={documentId} />
      <button type="submit" disabled={pending} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border)] px-4 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)] disabled:cursor-wait disabled:opacity-60">
        <RefreshCw size={14} aria-hidden="true" />
        {pending ? "요청 중…" : "다시 인덱싱"}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

export function ReindexAllControl() {
  const [state, formAction, pending] = useActionState(reindexAllKnowledgeDocuments, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  // 확인 창에서 승인한 뒤 다시 보내는 제출 한 번만 통과시킨다.
  const approvedRef = useRef(false);
  const [confirming, setConfirming] = useState(false);

  function submitApproved() {
    setConfirming(false);
    approvedRef.current = true;
    formRef.current?.requestSubmit();
  }

  return (
    // 확인 창 안의 <form method="dialog">가 제출 폼 안에 중첩되지 않도록 형제로 둔다.
    <div>
      <form
        ref={formRef}
        action={formAction}
        onSubmit={(event) => {
          if (approvedRef.current) {
            approvedRef.current = false;
            return;
          }
          event.preventDefault();
          setConfirming(true);
        }}
      >
        <input type="hidden" name="confirmed" value="true" />
        <Button type="submit" size="large" disabled={pending}>
          <RefreshCw size={16} aria-hidden="true" />
          {pending ? "전체 요청 중…" : "전체 재인덱싱"}
        </Button>
        <ActionMessage state={state} />
      </form>
      <ConfirmDialog
        open={confirming}
        title="모든 콘텐츠의 챗봇 인덱스를 다시 생성할까요?"
        confirmLabel="전체 재인덱싱"
        tone="primary"
        onConfirm={submitApproved}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}
