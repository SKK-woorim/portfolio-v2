"use client";

import { Copy } from "lucide-react";
import { useState } from "react";

export function ContactCopyButton({ value }: { value: string }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setStatus("copied");
    } catch {
      setStatus("error");
    }
  }

  return (
    <span className="inline-flex flex-wrap items-center gap-3">
      <button type="button" onClick={() => void copy()} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 text-sm font-semibold text-[var(--ink)] hover:border-[var(--primary)]">
        <Copy size={16} aria-hidden="true" /> 이메일 주소 복사
      </button>
      <span className="text-xs text-[var(--body)]" role="status" aria-live="polite">
        {status === "copied" ? "주소를 복사했습니다." : status === "error" ? "복사하지 못했습니다. 주소를 직접 선택해 주세요." : null}
      </span>
    </span>
  );
}
