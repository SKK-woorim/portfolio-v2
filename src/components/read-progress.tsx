"use client";

import { useEffect, useRef } from "react";

/** CSS 뷰 타임라인 이름을 대상에 붙이는 클래스. visual-system.css의 .read-progress-target과 짝을 이룬다. */
const TARGET_CLASS = "read-progress-target";

function supportsScrollTimeline() {
  return (
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("animation-timeline", "scroll()") &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** 대상 영역을 읽은 정도를 헤더 아래 막대로 보여준다. */
export function ReadProgress({ targetId }: { targetId: string }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const target = document.getElementById(targetId);
    const bar = barRef.current;
    if (!target || !bar) return;

    // CSS 경로도 문서 전체가 아니라 대상 영역을 재도록 대상에 뷰 타임라인을 단다.
    if (supportsScrollTimeline()) {
      target.classList.add(TARGET_CLASS);
      return () => target.classList.remove(TARGET_CLASS);
    }

    let frame = 0;
    const update = () => {
      frame = 0;
      const rect = target.getBoundingClientRect();
      const total = rect.height - window.innerHeight;
      const ratio = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 1;
      bar.style.transform = `scaleX(${ratio})`;
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(update); };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [targetId]);

  return <div ref={barRef} className="read-progress" aria-hidden="true" />;
}
