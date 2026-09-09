"use client";

import { useActionState, useState } from "react";
import { updateMediaAlt } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/validation/content";

const initialState: FormState = {};

export function MediaAltForm({ id, initialAlt }: { id: string; initialAlt: string }) {
  const [state, formAction, pending] = useActionState(updateMediaAlt, initialState);
  const [decorative, setDecorative] = useState(!initialAlt);

  return <form action={formAction} className="mt-3 grid gap-2 border-t border-[var(--border)] pt-3">
    <input type="hidden" name="id" value={id} />
    <label className="grid gap-1 text-xs font-semibold text-[var(--ink)]">대체 텍스트
      <input name="alt" defaultValue={initialAlt} maxLength={200} disabled={decorative} className="min-h-9 rounded-lg border border-[var(--border)] bg-white px-2.5 font-normal outline-none focus:border-2 focus:border-[var(--primary-action)] disabled:bg-[#eef1f5]" />
    </label>
    <label className="inline-flex items-center gap-2 text-xs text-[var(--body)]"><input name="decorative" type="checkbox" value="true" checked={decorative} onChange={(event) => setDecorative(event.target.checked)} /> 장식용 이미지</label>
    {state.error ? <p role="alert" className="text-xs text-[#a22b38]">{state.error}</p> : null}
    {state.success ? <p role="status" className="text-xs text-[#146b58]">{state.success}</p> : null}
    <div><Button type="submit" variant="secondary" disabled={pending} className="min-h-9 px-3 text-xs">{pending ? "저장 중…" : "대체 텍스트 저장"}</Button></div>
  </form>;
}
