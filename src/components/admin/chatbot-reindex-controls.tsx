"use client";

import { useActionState } from "react";
import { RefreshCw } from "lucide-react";
import { reindexAllKnowledgeDocuments, reindexKnowledgeDocument } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/validation/content";

const initialState: FormState = {};

function ActionMessage({ state }: { state: FormState }) {
  if (state.error) return <p role="alert" className="mt-2 max-w-72 text-xs text-[#a22b38]">{state.error}</p>;
  if (state.success) return <p role="status" className="mt-2 max-w-72 text-xs text-[#146b58]">{state.success}</p>;
  return null;
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
  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        if (!window.confirm("모든 콘텐츠의 챗봇 인덱스를 다시 생성할까요?")) event.preventDefault();
      }}
    >
      <input type="hidden" name="confirmed" value="true" />
      <Button type="submit" size="large" disabled={pending}>
        <RefreshCw size={16} aria-hidden="true" />
        {pending ? "전체 요청 중…" : "전체 재인덱싱"}
      </Button>
      <ActionMessage state={state} />
    </form>
  );
}
