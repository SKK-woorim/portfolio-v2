"use client";

import Link from "next/link";
import { ArrowRight, Cpu, RefreshCw, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { describeProgress, useChatbot } from "@/components/chatbot/chatbot-context";
import { ChatbotSlowNotice } from "@/components/chatbot/chatbot-slow-notice";
import { getVerifiedSourceUrl } from "@/components/chatbot/chatbot-sources";
import { CitedText } from "@/components/chatbot/cited-text";
import type { ChatbotRuntimeAvailability, ChatSourceType } from "@/components/chatbot/chatbot-types";

const STATE_LABEL: Record<ChatbotRuntimeAvailability, string> = {
  checking: "연결 확인 중",
  enabled: "온라인",
  disabled: "꺼짐",
  unavailable: "연결 확인 불가",
};

const OFFLINE_COPY = {
  disabled: {
    title: "지금은 로컬 AI를 쉬게 해 두었어요",
    copy: "질문에 답할 수는 없지만, 궁금한 내용은 아래 페이지에서 바로 확인할 수 있어요.",
    placeholder: "AI 연결이 꺼져 있어 지금은 질문을 받지 않아요",
  },
  unavailable: {
    title: "AI 연결 상태를 확인할 수 없어요",
    copy: "잠시 후 다시 확인해 주세요. 그동안 아래 페이지는 계속 볼 수 있어요.",
    placeholder: "연결 상태를 확인할 수 없어 지금은 질문을 받지 않아요",
  },
} as const;

function sourceTypeLabel(type: ChatSourceType) {
  return type === "profile" ? "소개" : type === "portfolio" ? "포트폴리오" : "블로그";
}

type HeroChatConsoleProps = {
  evaluationTotal: number;
  featuredProject?: { slug: string; title: string };
};

/** 히어로의 포트폴리오 챗봇. 우측 하단 패널과 같은 대화를 쓰고, 보이는 동안 플로팅 버튼을 숨긴다. */
export function HeroChatConsole({ evaluationTotal, featuredProject }: HeroChatConsoleProps) {
  const chatbot = useChatbot();
  const rootRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const [input, setInput] = useState("");
  const setHeroVisible = chatbot?.setHeroVisible;

  useEffect(() => {
    const element = rootRef.current;
    if (!element || !setHeroVisible) return;
    // 교차 이벤트만 믿지 않고, 스크롤·리사이즈마다 콘솔의 4분의 1 이상이 화면에 있는지 다시 계산한다.
    let frame = 0;
    const measure = () => {
      frame = 0;
      const rect = element.getBoundingClientRect();
      const visibleHeight = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
      setHeroVisible(rect.height > 0 && visibleHeight >= rect.height * 0.25);
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    const observer = new IntersectionObserver(schedule, { threshold: [0, 0.25, 0.5, 1] });
    observer.observe(element);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      if (frame) window.cancelAnimationFrame(frame);
      setHeroVisible(false);
    };
  }, [setHeroVisible]);

  const exchange = useMemo(() => {
    const messages = chatbot?.messages ?? [];
    let answerIndex = messages.length - 1;
    while (answerIndex >= 0 && messages[answerIndex].role !== "assistant") answerIndex -= 1;
    if (answerIndex < 0) return null;
    let questionIndex = answerIndex - 1;
    while (questionIndex >= 0 && messages[questionIndex].role !== "user") questionIndex -= 1;
    const answer = messages[answerIndex];
    return { question: questionIndex >= 0 ? messages[questionIndex].content : answer.retryMessage ?? "", answer };
  }, [chatbot?.messages]);

  // 답변이 넘치면 스트리밍을 따라 내려가되, 사용자가 직접 스크롤하면 멈춘다.
  useEffect(() => {
    const body = bodyRef.current;
    if (body && followRef.current) body.scrollTop = body.scrollHeight;
  }, [exchange?.answer.content, exchange?.answer.sources, chatbot?.progress.step]);

  if (!chatbot) return null;
  const { runtimeAvailability: availability, progress, indexStats, isBusy } = chatbot;
  const offline = availability === "disabled" || availability === "unavailable";
  const ready = availability === "enabled" && chatbot.isHydrated;
  const step = exchange ? progress.step : -1;
  const answer = exchange?.answer;
  const sources = answer?.sources ?? [];
  const stepSmall = [
    "질문 확인",
    indexStats ? `공개 페이지 ${indexStats.documents}` : "공개 콘텐츠",
    progress.sourceCount === null ? "최대 3건" : `${progress.sourceCount}건`,
    step === 3 ? `생성 중 ${progress.waitSeconds.toFixed(1)}s` : "출처 포함",
  ];

  function ask(question: string) {
    const message = question.trim();
    if (!message || !ready || isBusy) return;
    followRef.current = true;
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
    chatbot!.sendMessage(message);
    setInput("");
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    ask(input);
  }

  return (
    <div ref={rootRef} className="console" id="hero-chat" aria-label="포트폴리오 도우미">
      <div className="console-head">
        <span className="console-who">
          포트폴리오 도우미
          <span className="console-state" data-state={availability}><i aria-hidden="true" />{STATE_LABEL[availability]}</span>
        </span>
        <span className="console-badge tabular">{indexStats ? `공개 페이지 ${indexStats.documents}` : `평가 질문 ${evaluationTotal}개`}</span>
      </div>
      <ChatbotSlowNotice show={progress.slowNotice && !offline} modelLabel={chatbot.modelLabel} />

      {offline ? (
        <div className="console-offline" role="status">
          <span className="offline-icon" data-state={availability}><Cpu size={20} aria-hidden="true" /></span>
          <div>
            <h3>{OFFLINE_COPY[availability].title}</h3>
            <p>{OFFLINE_COPY[availability].copy}</p>
          </div>
          <div className="offline-links">
            <Link href="/about" className="focus-ring">기술 스택<small>소개 페이지</small></Link>
            <Link href={featuredProject ? `/portfolio/${featuredProject.slug}` : "/portfolio"} className="focus-ring">대표 프로젝트<small>{featuredProject?.title ?? "포트폴리오"}</small></Link>
            <Link href="/contact" className="focus-ring">협업 문의<small>연락처</small></Link>
          </div>
          <button type="button" className="offline-recheck focus-ring" onClick={() => void chatbot.refreshRuntimeAvailability()}>
            <RefreshCw size={14} aria-hidden="true" /> 연결 상태 다시 확인
          </button>
        </div>
      ) : (
        <div
          ref={bodyRef}
          className="console-body"
          aria-live="polite"
          onWheel={() => { followRef.current = false; }}
          onTouchMove={() => { followRef.current = false; }}
        >
          {!exchange ? (
            <div className="console-intro">
              <b>{availability === "checking" ? "연결 상태를 확인하고 있어요" : "궁금한 점을 직접 물어보세요"}</b>
              <span>공개된 프로젝트·글·소개에서 근거를 찾아 답하고, 답변까지의 과정을 단계별로 보여드려요. 근거가 없으면 추측해 답하지 않아요.</span>
            </div>
          ) : (
            <>
              <div>
                <span className="console-label">질문</span>
                <p className="console-question">{exchange.question}</p>
              </div>
              <ol className="console-steps" aria-label={describeProgress(progress, indexStats) ?? "답변 완료"}>
                {["질문 이해", "검색", "근거", "답변"].map((label, index) => (
                  <li key={label} data-on={step >= index} data-active={step === index && index < 4}>
                    {label}<small>{stepSmall[index]}</small>
                  </li>
                ))}
              </ol>
              {step >= 2 || sources.length ? (
                <div className="console-sources">
                  <span className="console-label">{progress.sourceCount === null && step < 4 ? "근거 찾는 중" : sources.length ? `검색된 근거 ${sources.length}건` : "근거를 찾지 못했어요"}</span>
                  {sources.length ? (
                    <ul>
                      {sources.map((source, index) => {
                        const href = getVerifiedSourceUrl(source.type, source.url);
                        if (!href) return null;
                        return (
                          <li key={source.id}>
                            <Link href={href} className="focus-ring">
                              <b>{index + 1}</b>
                              <span>{source.title}</span>
                              <small>{sourceTypeLabel(source.type)}</small>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  ) : null}
                </div>
              ) : null}
              {answer && (answer.content || step >= 3) ? (
                <div className="console-answer" data-tone={answer.delivery === "error" ? "error" : undefined}>
                  <span className="console-label">{answer.delivery === "error" ? "답변하지 못했어요" : "답변"}</span>
                  <p>{answer.content ? <CitedText text={answer.content} /> : "답변을 만드는 중이에요…"}</p>
                  {answer.delivery === "error" && answer.errorCode === "NO_RELEVANT_CONTEXT" ? (
                    <div className="console-links">
                      <Link href="/about" className="focus-ring">소개 보기 <ArrowRight size={14} aria-hidden="true" /></Link>
                      <Link href="/contact" className="focus-ring">연락처 보기 <ArrowRight size={14} aria-hidden="true" /></Link>
                    </div>
                  ) : null}
                  {answer.delivery === "error" && answer.errorCode !== "NO_RELEVANT_CONTEXT" && answer.retryMessage ? (
                    <div className="console-links">
                      <button type="button" className="focus-ring" onClick={() => ask(answer.retryMessage!)} disabled={!ready || isBusy}>
                        <RotateCcw size={14} aria-hidden="true" /> 다시 시도
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </>
          )}
        </div>
      )}

      <div className="console-ask">
        {!offline ? (
          <div className="console-suggest" aria-label="추천 질문">
            {chatbot.suggestions.map((question) => (
              <button key={question} type="button" className="focus-ring" disabled={!ready || isBusy} onClick={() => ask(question)}>{question}</button>
            ))}
          </div>
        ) : null}
        <form className="console-composer" onSubmit={submit}>
          <label className="sr-only" htmlFor="hero-chat-input">포트폴리오에 질문하기</label>
          <input
            id="hero-chat-input"
            value={input}
            maxLength={500}
            autoComplete="off"
            disabled={!ready}
            placeholder={offline ? OFFLINE_COPY[availability].placeholder : availability === "checking" ? "연결 상태를 확인하고 있어요" : "이 포트폴리오에 무엇이든 물어보세요"}
            onChange={(event) => setInput(event.target.value)}
          />
          <button type="submit" aria-label="질문 보내기" disabled={!ready || isBusy || input.trim().length === 0}>
            <ArrowRight size={18} aria-hidden="true" />
          </button>
        </form>
      </div>
      <div className="console-foot"><span>공개 글·프로젝트·소개만 근거로 답합니다</span><span className="tabular">평가 질문 {evaluationTotal}개</span></div>
    </div>
  );
}
