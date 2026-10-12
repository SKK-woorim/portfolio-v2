"use client";

import { useEffect, useState } from "react";

// 질문 이해 → 검색 → 근거 단계의 기본 연출 시간. 매 요청 0.75–1.3배 편차를 섞는다.
const STEP_BASE_MS = [450, 700, 550] as const;
export const SLOW_NOTICE_DELAY_MS = 6_000;
export const SLOW_NOTICE_MIN_VISIBLE_MS = 2_000;

export type ChatProgressStep = -1 | 0 | 1 | 2 | 3 | 4;

type ProgressInput = {
  requestKey: string | null;
  active: boolean;
  hasSources: boolean;
  hasToken: boolean;
  generating: boolean;
};

function jitter(ms: number) {
  return Math.round(ms * (0.75 + Math.random() * 0.55));
}

/**
 * 앞의 세 단계는 연출 시간으로 넘기고, 답변 단계(3)에서는 첫 토큰을 기다린다.
 * 실제 응답이 연출보다 빠르면 남은 연출을 건너뛰고(4), 근거 도착 전에는 답변 단계로 넘어가지 않는다.
 */
export function useChatProgress({ requestKey, active, hasSources, hasToken, generating }: ProgressInput) {
  const [cosmetic, setCosmetic] = useState<{ key: string | null; step: number }>({ key: null, step: 0 });
  const [wait, setWait] = useState<{ key: string | null; seconds: number }>({ key: null, seconds: 0 });

  useEffect(() => {
    if (!requestKey || !active) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    STEP_BASE_MS.forEach((base, index) => {
      elapsed += jitter(base);
      timers.push(setTimeout(() => setCosmetic({ key: requestKey, step: index + 1 }), elapsed));
    });
    return () => timers.forEach(clearTimeout);
  }, [requestKey, active]);

  const cosmeticStep = cosmetic.key === requestKey ? cosmetic.step : 0;
  let step: ChatProgressStep;
  if (!requestKey) step = -1;
  else if (!active || hasToken) step = 4;
  else if (cosmeticStep >= 3 && (hasSources || generating)) step = 3;
  else step = Math.min(cosmeticStep, 2) as ChatProgressStep;

  const waiting = step === 3;
  useEffect(() => {
    if (!waiting) return;
    const startedAt = performance.now();
    const interval = setInterval(() => setWait({ key: requestKey, seconds: (performance.now() - startedAt) / 1000 }), 100);
    return () => clearInterval(interval);
  }, [waiting, requestKey]);

  return { step, waiting, waitSeconds: waiting && wait.key === requestKey ? wait.seconds : 0 };
}

/** 답변 단계에서 6초가 지나면 안내를 보이고, 첫 토큰이 오면 최소 2초를 채운 뒤 숨긴다. */
export function useSlowNotice(waiting: boolean) {
  const [shownAt, setShownAt] = useState<number | null>(null);

  useEffect(() => {
    if (!waiting) return;
    const timer = setTimeout(() => setShownAt(performance.now()), SLOW_NOTICE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [waiting]);

  useEffect(() => {
    if (waiting || shownAt === null) return;
    const remaining = Math.max(0, shownAt + SLOW_NOTICE_MIN_VISIBLE_MS - performance.now());
    const timer = setTimeout(() => setShownAt(null), remaining);
    return () => clearTimeout(timer);
  }, [waiting, shownAt]);

  return shownAt !== null;
}
