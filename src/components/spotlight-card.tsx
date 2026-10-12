"use client";

import type { CSSProperties, PointerEvent, ReactNode } from "react";

/** 커서 위치를 CSS 변수로 넘겨 카드 테두리 스포트라이트를 그린다. */
export function SpotlightCard({ className, children, style, ...data }: { className: string; children: ReactNode; style?: CSSProperties; [key: `data-${string}`]: string | undefined }) {
  function track(event: PointerEvent<HTMLElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    event.currentTarget.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    event.currentTarget.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }
  return <article className={className} style={style} onPointerMove={track} {...data}>{children}</article>;
}
