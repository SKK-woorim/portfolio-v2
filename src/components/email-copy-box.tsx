"use client";

import { Copy } from "lucide-react";
import { useRef, useState } from "react";

/** 이메일 주소를 선택 가능한 글자와 복사 버튼으로 보여준다. */
export function EmailCopyBox({ email }: { email: string }) {
  const addressRef = useRef<HTMLSpanElement>(null);
  const [status, setStatus] = useState<"idle" | "copied" | "selected">("idle");

  async function copy() {
    try {
      await navigator.clipboard.writeText(email);
      setStatus("copied");
    } catch {
      const range = document.createRange();
      if (addressRef.current) range.selectNodeContents(addressRef.current);
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(range);
      setStatus("selected");
    }
  }

  return (
    <span className="inline-flex flex-col items-center gap-2">
      <span className="email-box">
        <span ref={addressRef}>{email}</span>
        <button type="button" className="focus-ring" onClick={() => void copy()}><Copy size={15} aria-hidden="true" /> 복사</button>
      </span>
      <span className="text-xs text-[var(--body)]" role="status" aria-live="polite">
        {status === "copied" ? "주소를 복사했어요." : status === "selected" ? "주소를 선택했어요. 직접 복사해 주세요." : null}
      </span>
    </span>
  );
}
