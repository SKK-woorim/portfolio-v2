"use client";

import { useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";

type CopyStatus = "idle" | "copied" | "failed";

const COPY_MESSAGE: Record<CopyStatus, string> = {
  idle: "",
  copied: "본문에 쓸 URL을 복사했습니다.",
  failed: "URL을 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.",
};

export function MediaUrlCopyButton({ url }: { url: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const message = COPY_MESSAGE[status];

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  }

  return <div>
    <button type="button" onClick={copyUrl} className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]"><Copy size={15} /> 본문 URL 복사</button>
    <p className="sr-only" role="status" aria-live="polite">{message}</p>
    {status === "copied" ? <p className="mt-2 inline-flex items-center gap-1 text-xs text-[var(--muted)]"><Check size={13} aria-hidden="true" /> {message}</p> : null}
    {status === "failed" ? <p className="mt-2 inline-flex items-center gap-1 text-xs text-[#a22b38]"><TriangleAlert size={13} aria-hidden="true" /> {message}</p> : null}
  </div>;
}
