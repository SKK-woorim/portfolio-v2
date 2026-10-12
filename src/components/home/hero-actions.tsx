"use client";

import Link from "next/link";
import { ArrowRight, Mail, MessageCircle } from "lucide-react";
import { useChatbot } from "@/components/chatbot/chatbot-context";

/** 히어로 CTA. 챗봇을 쓸 수 없으면 질문하기 대신 연락하기를 보여준다. */
export function HeroActions() {
  const chatbot = useChatbot();
  const canAsk = chatbot && chatbot.runtimeAvailability !== "disabled" && chatbot.runtimeAvailability !== "unavailable";

  function focusConsole() {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document.getElementById("hero-chat")?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    window.setTimeout(() => document.getElementById("hero-chat-input")?.focus({ preventScroll: true }), reduceMotion ? 0 : 400);
  }

  return (
    <div className="hero-cta">
      <Link className="theme-primary-cta focus-ring inline-flex min-h-14 items-center gap-2 rounded-full px-8 text-base font-semibold" href="/portfolio">프로젝트 보기 <ArrowRight size={18} aria-hidden="true" /></Link>
      {canAsk ? (
        <button type="button" onClick={focusConsole} className="theme-outline-cta focus-ring inline-flex min-h-14 items-center gap-2 rounded-full border bg-transparent px-8 text-base font-semibold"><MessageCircle size={18} aria-hidden="true" /> 포트폴리오에 질문하기</button>
      ) : (
        <Link className="theme-outline-cta focus-ring inline-flex min-h-14 items-center gap-2 rounded-full border px-8 text-base font-semibold" href="/contact"><Mail size={18} aria-hidden="true" /> 연락하기</Link>
      )}
    </div>
  );
}
