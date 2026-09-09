"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

export function MediaUrlCopyButton({ url }: { url: string }) {
  const [message, setMessage] = useState("");

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setMessage("본문에 쓸 URL을 복사했습니다.");
    } catch {
      setMessage("URL을 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.");
    }
  }

  return <div>
    <button type="button" onClick={copyUrl} className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]"><Copy size={15} /> 본문 URL 복사</button>
    <p className="sr-only" role="status" aria-live="polite">{message}</p>
    {message ? <p className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--muted)]"><Check size={13} aria-hidden="true" /> {message}</p> : null}
  </div>;
}
