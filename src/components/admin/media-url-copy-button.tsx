"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type CopyStatus = "idle" | "copied" | "failed";

const COPY_MESSAGE: Record<Exclude<CopyStatus, "idle">, string> = {
  copied: "본문에 쓸 URL을 복사했습니다.",
  failed: "URL을 복사하지 못했습니다. 브라우저 권한을 확인해 주세요.",
};

/** 피드백을 지우기까지의 시간. 지난 "복사했습니다"가 스크린리더 탐색 모드에 남지 않게 한다. */
export const COPY_FEEDBACK_MS = 2000;

const ICONS = { idle: Copy, copied: Check, failed: TriangleAlert } as const;

/**
 * 미디어 공개 URL 복사 버튼.
 * - 보이는 문구와 스크린리더 안내는 버튼 바깥의 `role="status"` 하나다(버튼 자식은 표현용이라 라이브 영역이 읽히지 않는다).
 *   비어 있을 때는 sr-only라 자리를 차지하지 않고, display: none이 아니라 접근성 트리에 남는다.
 * - 성공·실패 때 버튼 아이콘도 바뀌어 색에만 의존하지 않는다. 피드백 중에도 버튼은 비활성화하지 않는다.
 * - 다시 누르면 타이머를 새로 시작하고, 같은 문구가 이어지면 줄바꿈 없는 공백(U+00A0)을 붙여 VoiceOver도 다시 읽게 한다.
 * - 복사 대상이 요소가 아니라 prop 값이라 Invoker Commands 대신 onClick을 쓴다.
 */
export function MediaUrlCopyButton({ url }: { url: string }) {
  const [status, setStatus] = useState<CopyStatus>("idle");
  const [message, setMessage] = useState("");
  const lastMessageRef = useRef("");
  const timerRef = useRef<number | undefined>(undefined);
  const frameRef = useRef<number | undefined>(undefined);

  useEffect(() => () => {
    window.clearTimeout(timerRef.current);
    if (frameRef.current !== undefined) window.cancelAnimationFrame(frameRef.current);
  }, []);

  function report(next: Exclude<CopyStatus, "idle">) {
    window.clearTimeout(timerRef.current);
    if (frameRef.current !== undefined) window.cancelAnimationFrame(frameRef.current);
    let text = COPY_MESSAGE[next];
    if (text === lastMessageRef.current) text += "\u00A0";
    lastMessageRef.current = text;
    setStatus(next);
    // 먼저 비운 뒤 다음 프레임에 채워, 같은 결과가 반복돼도 내용 변경으로 안내되게 한다.
    setMessage("");
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = undefined;
      setMessage(text);
    });
    timerRef.current = window.setTimeout(() => {
      setStatus("idle");
      setMessage("");
    }, COPY_FEEDBACK_MS);
  }

  async function copyUrl() {
    try {
      await navigator.clipboard.writeText(url);
      report("copied");
    } catch {
      // clipboard가 없거나(비보안 문맥) 권한이 거부된 경우
      report("failed");
    }
  }

  const Icon = ICONS[status];
  return <div>
    <button type="button" onClick={() => void copyUrl()} data-copy-status={status} className="focus-ring inline-flex min-h-6 items-center gap-2 text-sm font-semibold text-[var(--primary)]">
      <Icon size={15} aria-hidden="true" /> 본문 URL 복사
    </button>
    <p role="status" className={message ? cn("mt-2 text-xs", status === "failed" ? "text-[#a22b38]" : "text-[var(--muted)]") : "sr-only"}>{message}</p>
  </div>;
}
