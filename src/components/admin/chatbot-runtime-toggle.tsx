"use client";

import { useActionState } from "react";
import { Power, PowerOff } from "lucide-react";
import { setChatbotRuntimeEnabled } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import type { FormState } from "@/lib/validation/content";

const initialState: FormState = {};

export function ChatbotRuntimeToggle({ enabled }: { enabled: boolean }) {
  const [state, formAction, pending] = useActionState(setChatbotRuntimeEnabled, initialState);
  const nextEnabled = !enabled;

  return (
    <form action={formAction}>
      <input type="hidden" name="enabled" value={String(nextEnabled)} />
      <Button type="submit" size="large" disabled={pending}>
        {nextEnabled ? <Power size={16} aria-hidden="true" /> : <PowerOff size={16} aria-hidden="true" />}
        {pending ? "변경 중…" : nextEnabled ? "챗봇 활성화" : "챗봇 비활성화"}
      </Button>
      {state.error ? <p role="alert" className="mt-2 max-w-80 text-xs text-[#a22b38]">{state.error}</p> : null}
      {state.success ? <p role="status" className="mt-2 max-w-80 text-xs text-[#146b58]">{state.success}</p> : null}
    </form>
  );
}
