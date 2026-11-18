"use client";

import { startTransition, useActionState, useId, useState } from "react";
import { updateAiProviderKey } from "@/app/admin/(workspace)/api-keys/actions";
import { Button } from "@/components/ui/button";
import { inputFieldClass } from "@/components/ui/field-classes";
import type { AiProvider } from "@/lib/ai-provider-keys";
import { formatDate } from "@/lib/utils";
import type { FormState } from "@/lib/validation/content";
import { ConfirmDialog } from "./confirm-dialog";
import { FormStatus } from "./form-status";

const initialState: FormState = {};

export function AiProviderKeyForm({ provider, label, updatedAt }: {
  provider: AiProvider;
  label: string;
  updatedAt?: string;
}) {
  const [state, formAction, pending] = useActionState(updateAiProviderKey.bind(null, provider), initialState);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const titleId = useId();
  const fieldId = useId();

  function deleteKey() {
    setConfirmDelete(false);
    const data = new FormData();
    data.set("operation", "delete");
    startTransition(() => formAction(data));
  }

  return (
    <section aria-labelledby={titleId} className="rounded-3xl border border-[var(--border)] bg-white p-6 sm:p-8">
      <h2 id={titleId} className="text-lg font-semibold">{label}</h2>
      <p className="mt-2 text-sm text-[var(--body)]">
        {updatedAt ? <>키 등록됨 <span className="text-[var(--muted)]">· {formatDate(updatedAt)}</span></> : "관리자 키 미등록"}
      </p>
      <form action={formAction} className="mt-5 grid gap-3">
        <input type="hidden" name="operation" value="save" />
        <label className="text-sm font-semibold" htmlFor={fieldId}>{label} API 키</label>
        <input
          id={fieldId}
          name="apiKey"
          type="password"
          autoComplete="off"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          required
          maxLength={4096}
          disabled={pending}
          className={inputFieldClass}
        />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>{pending ? "처리 중…" : updatedAt ? "키 교체" : "키 저장"}</Button>
          {updatedAt ? (
            <Button variant="secondary" type="button" disabled={pending} onClick={() => setConfirmDelete(true)}>
              키 삭제
            </Button>
          ) : null}
        </div>
        <FormStatus result={state} error={state.error} success={state.success} />
      </form>
      <ConfirmDialog
        open={confirmDelete}
        title={`${label} 키를 삭제할까요?`}
        description="삭제 후 챗봇은 이 제공자를 건너뜁니다. 다시 사용하려면 키를 등록하세요."
        confirmLabel="키 삭제"
        onConfirm={deleteKey}
        onCancel={() => setConfirmDelete(false)}
      />
    </section>
  );
}
