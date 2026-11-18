"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type FormStatusVariant = "box" | "text";

const toneClasses: Record<FormStatusVariant, { error: string; success: string }> = {
  box: {
    error: "rounded-xl bg-[#fff0f1] px-4 py-3 text-sm text-[#a22b38]",
    success: "rounded-xl bg-[#eaf8f4] px-4 py-3 text-sm text-[#146b58]",
  },
  text: {
    error: "text-xs text-[#a22b38]",
    success: "text-xs text-[#146b58]",
  },
};

/** 같은 문구가 이어질 때 붙이는 줄바꿈 없는 공백. 보이지 않고 읽히지도 않지만 내용이 달라져 다시 안내된다. */
const REPEAT_MARK = "\u00A0";

type FormStatusProps = {
  error?: string;
  success?: string;
  /**
   * 이번 결과를 가리키는 값(보통 `useActionState`의 상태 객체). 값이 바뀌면 새 결과로 보고,
   * 문구가 직전과 같아도 다시 안내한다. 같은 값으로 다시 렌더링되면(입력 중 등) 아무것도 하지 않는다.
   * 넘기지 않으면 문구가 바뀔 때만 안내한다.
   */
  result?: unknown;
  /** box: 폼 아래 상자형, text: 버튼 옆·아래 작은 글씨형. */
  variant?: FormStatusVariant;
  /** 두 메시지 모두에 붙는 배치용 클래스(여백·최대 폭·정렬). */
  className?: string;
};

/**
 * 서버 액션 결과 메시지.
 *
 * - 오류는 `role="alert"`로 나타날 때 바로 읽힌다. 새 결과가 직전과 같은 오류면 요소를 다시 마운트해 다시 읽히게 한다.
 * - 성공은 항상 DOM에 있는 하나의 `role="status"` 요소의 내용이 바뀌는 방식이다. 새로 나타나는 라이브
 *   영역은 안정적으로 읽히지 않기 때문이다. 비어 있을 때는 `sr-only`(절대 위치)라 grid·flex 부모에
 *   빈 칸이나 여분의 gap을 만들지 않고, `display: none`이 아니라 접근성 트리에도 남는다.
 * - 새 결과마다 먼저 비운 뒤 다음 프레임에 채우고, 직전 문구와 같으면 U+00A0을 붙인다(VoiceOver는 같은
 *   영역의 같은 문구를 사이에 비워도 건너뛴다).
 */
export function FormStatus({ error, success, result, variant = "box", className }: FormStatusProps) {
  const tones = toneClasses[variant];
  const [announced, setAnnounced] = useState("");
  const [errorRevision, setErrorRevision] = useState(0);
  const lastSuccessRef = useRef("");
  const lastErrorRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    let second = 0;
    // 기록(ref)도 프레임 안에서 갱신한다. 취소된 실행(StrictMode의 이중 실행, 빠른 연속 결과)은 흔적을 남기지 않는다.
    const first = window.requestAnimationFrame(() => {
      let text = success ?? "";
      if (text) {
        if (text === lastSuccessRef.current) text += REPEAT_MARK;
        lastSuccessRef.current = text;
      }
      const repeatedError = Boolean(error) && error === lastErrorRef.current;
      lastErrorRef.current = error || undefined;

      setAnnounced("");
      if (repeatedError) setErrorRevision((revision) => revision + 1);
      if (text) second = window.requestAnimationFrame(() => setAnnounced(text));
    });
    return () => {
      window.cancelAnimationFrame(first);
      window.cancelAnimationFrame(second);
    };
    // 결과 객체나 문구가 바뀔 때만 다시 안내한다. 같은 결과의 재렌더링은 무시한다.
  }, [result, success, error]);

  return <>
    {error ? <Fragment key={errorRevision}><p role="alert" className={cn(tones.error, className)}>{error}</p></Fragment> : null}
    <p role="status" className={announced ? cn(tones.success, className) : "sr-only"}>{announced}</p>
  </>;
}
