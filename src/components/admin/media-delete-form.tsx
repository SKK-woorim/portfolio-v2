"use client";

import { useActionState } from "react";
import { Trash2 } from "lucide-react";
import { deleteMedia } from "@/app/admin/actions";
import type { FormState } from "@/lib/validation/content";

const initialState: FormState = {};

export function MediaDeleteForm({ id, retry = false }: { id: string; retry?: boolean }) {
  const [state, formAction, pending] = useActionState(deleteMedia, initialState);

  return <form action={formAction} className="grid gap-2">
    <input type="hidden" name="id" value={id} />
    <button
      className="focus-ring inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-[#b33d4a] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={pending}
      type="submit"
    >
      <Trash2 size={15} /> {pending ? "삭제 확인 중…" : retry ? "파일 삭제 재시도" : "삭제"}
    </button>
    {state.error ? <p role="alert" className="text-xs leading-5 text-[#a22b38]">{state.error}</p> : null}
    {state.success ? <p role="status" className="text-xs leading-5 text-[#146b58]">{state.success}</p> : null}
  </form>;
}
