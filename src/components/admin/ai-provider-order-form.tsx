"use client";

import { useActionState, useId, useState } from "react";
import { updateAiProviderOrder } from "@/app/admin/(workspace)/api-keys/actions";
import { Button } from "@/components/ui/button";
import { inputFieldClass } from "@/components/ui/field-classes";
import type { AiProviderOrder } from "@/lib/ai-provider-keys";
import type { FormState } from "@/lib/validation/content";
import { FormStatus } from "./form-status";

const initialState: FormState = {};

const labels = {
  openai: "GPT",
  gemini: "Gemini",
  local: "로컬 모델",
} satisfies Record<AiProviderOrder[number], string>;

const orderOptions = [
  ["openai", "gemini", "local"],
  ["openai", "local", "gemini"],
  ["gemini", "openai", "local"],
  ["gemini", "local", "openai"],
  ["local", "openai", "gemini"],
  ["local", "gemini", "openai"],
] satisfies AiProviderOrder[];

export function AiProviderOrderForm({ order }: { order: AiProviderOrder }) {
  const [state, formAction, pending] = useActionState(updateAiProviderOrder, initialState);
  const [draft, setDraft] = useState<{ savedOrder: string; selection: string } | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const fieldId = useId();
  const savedOrder = order.join(",");
  const selection = draft?.savedOrder === savedOrder ? draft.selection : savedOrder;

  return (
    <section aria-labelledby={titleId} className="rounded-3xl border border-[var(--border)] bg-white p-6 sm:p-8">
      <h2 id={titleId} className="text-lg font-semibold">모델 호출 순서</h2>
      <p id={descriptionId} className="mt-2 text-sm leading-6 text-[var(--body)]">
        첫 번째 모델부터 시도합니다. API 키가 없거나 호출에 실패하면 다음 모델로 넘어갑니다.
        저장한 순서는 다음 실시간 요청부터 적용됩니다.
      </p>
      <form action={formAction} className="mt-5 grid max-w-md gap-3">
        <label className="text-sm font-semibold" htmlFor={fieldId}>우선순위</label>
        <select
          id={fieldId}
          name="providerOrder"
          aria-describedby={descriptionId}
          value={selection}
          onChange={(event) => setDraft({ savedOrder, selection: event.target.value })}
          disabled={pending}
          className={inputFieldClass}
        >
          {orderOptions.map((option) => (
            <option key={option.join(",")} value={option.join(",")}>{option.map((provider) => labels[provider]).join(" → ")}</option>
          ))}
        </select>
        <div>
          <Button type="submit" disabled={pending || selection === savedOrder}>
            {pending ? "저장 중…" : "순서 저장"}
          </Button>
        </div>
        <FormStatus result={state} error={state.error} success={state.success} />
      </form>
    </section>
  );
}
