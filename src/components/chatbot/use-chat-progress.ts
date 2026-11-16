"use client";

import { useEffect, useState } from "react";

// 질문 이해 → 검색 → 근거 단계의 기본 연출 시간. 매 요청 0.75–1.3배 편차를 섞는다.
const STEP_BASE_MS = [450, 700, 550] as const;
export const SLOW_NOTICE_DELAY_MS = 6_000;
export const SLOW_NOTICE_MIN_VISIBLE_MS = 2_000;

/**
 * 화면에 보여 주는 진행 단계. 숫자는 순서 비교(`step >= grounding`)에 쓰므로 그대로 두고,
 * 뜻은 이름으로 읽는다. 숫자를 직접 쓰지 않는다.
 */
export const CHAT_PROGRESS_STEP = {
  /** 아직 질문이 없다. */
  idle: -1,
  understanding: 0,
  searching: 1,
  /** 근거를 확인하는 중. 근거가 도착하기 전에는 여기서 기다린다. */
  grounding: 2,
  /** 첫 토큰을 기다리는 중. 대기 시간을 센다. */
  generating: 3,
  /** 답변이 나오기 시작했거나 요청이 끝났다. */
  done: 4,
} as const;

export type ChatProgressStep = (typeof CHAT_PROGRESS_STEP)[keyof typeof CHAT_PROGRESS_STEP];

type ProgressSignals = {
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
 * 연출 타이머와 실제 응답 신호를 합쳐 지금 단계를 정한다.
 * 실제 응답이 연출보다 빠르면 남은 연출을 건너뛰고, 근거 도착 전에는 답변 단계로 넘어가지 않는다.
 */
export function deriveChatProgressStep({ requestKey, active, hasSources, hasToken, generating }: ProgressSignals, cosmeticStep: number): ChatProgressStep {
  if (!requestKey) return CHAT_PROGRESS_STEP.idle;
  if (!active || hasToken) return CHAT_PROGRESS_STEP.done;
  if (cosmeticStep >= CHAT_PROGRESS_STEP.generating && (hasSources || generating)) return CHAT_PROGRESS_STEP.generating;
  return Math.min(cosmeticStep, CHAT_PROGRESS_STEP.grounding) as ChatProgressStep;
}

/** 앞의 세 단계는 연출 시간으로 넘기고, 답변 단계에서는 첫 토큰을 기다린다. */
export function useChatProgress(signals: ProgressSignals) {
  const { requestKey, active } = signals;
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

  const step = deriveChatProgressStep(signals, cosmetic.key === requestKey ? cosmetic.step : 0);

  const waiting = step === CHAT_PROGRESS_STEP.generating;
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
