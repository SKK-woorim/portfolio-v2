"use client";

import Link from "next/link";
import { RefreshCw, Send, Sparkles, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import { ChatbotMessage } from "./chatbot-message";
import { ChatbotStatus } from "./chatbot-status";
import type { ChatbotRuntimeAvailability, ChatMessage, ChatPhase } from "./chatbot-types";

type ChatbotPanelProps = {
  messages: ChatMessage[];
  phase: ChatPhase;
  statusMessage: string | null;
  canCancel: boolean;
  input: string;
  isReady: boolean;
  runtimeAvailability: ChatbotRuntimeAvailability;
  announcement: string;
  suggestedQuestions: readonly string[];
  onInputChange: (value: string) => void;
  onSubmit: (message: string) => void;
  onRetry: (message: string) => void;
  onCancel: () => void;
  onRefreshStatus: () => void;
  onClose: () => void;
  onClearConversation: () => void;
  onNavigate: () => void;
};

const WELCOME_MESSAGE: ChatMessage = {
  id: "chatbot-welcome",
  role: "assistant",
  content: "안녕하세요. 송경근님의 기술, 프로젝트와 블로그에 대해 알려드릴게요.",
  delivery: "complete",
};

function getFocusableElements(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(
    'button:not([disabled]), a[href], textarea:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])',
  )).filter((element) => !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
}

export function ChatbotPanel({
  messages,
  phase,
  statusMessage,
  canCancel,
  input,
  isReady,
  runtimeAvailability,
  announcement,
  suggestedQuestions,
  onInputChange,
  onSubmit,
  onRetry,
  onCancel,
  onRefreshStatus,
  onClose,
  onClearConversation,
  onNavigate,
}: ChatbotPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const [showNewReply, setShowNewReply] = useState(false);
  const isChecking = runtimeAvailability === "checking";
  const isDisabled = runtimeAvailability === "disabled";
  const isUnavailable = runtimeAvailability === "unavailable";
  const isOffline = isDisabled || isUnavailable;
  const isBusy = isChecking || phase === "submitting" || phase === "searching" || phase === "generating" || phase === "streaming";
  const hasUserMessage = messages.some((message) => message.role === "user");

  useEffect(() => {
    closeButtonRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const textarea = inputRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 112)}px`;
  }, [input]);

  useEffect(() => {
    const closeOnEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  useEffect(() => {
    const list = messageListRef.current;
    if (!list || !shouldStickToBottomRef.current) {
      if (list && messages.some((message) => message.delivery === "streaming")) setShowNewReply(true);
      return;
    }
    list.scrollTop = list.scrollHeight;
    setShowNewReply(false);
  }, [messages, phase, statusMessage, canCancel]);

  function handleMessageListScroll() {
    const list = messageListRef.current;
    if (!list) return;
    const distanceFromBottom = list.scrollHeight - list.scrollTop - list.clientHeight;
    shouldStickToBottomRef.current = distanceFromBottom < 72;
    if (shouldStickToBottomRef.current) setShowNewReply(false);
  }

  function scrollToLatest() {
    const list = messageListRef.current;
    if (!list) return;
    shouldStickToBottomRef.current = true;
    list.scrollTo({ top: list.scrollHeight, behavior: "smooth" });
    setShowNewReply(false);
  }

  function handlePanelKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab" || !panelRef.current) return;

    const focusable = getFocusableElements(panelRef.current);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable.at(-1)!;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit(input);
  }

  function handleInputKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      onSubmit(input);
    }
  }

  return (
    <div className="chatbot-layer">
      <div className="chatbot-backdrop" aria-hidden="true" onMouseDown={onClose} />
      <div
        ref={panelRef}
        id="portfolio-chatbot-panel"
        className="chatbot-panel"
        role="dialog"
        aria-modal="true"
        aria-label="포트폴리오 챗봇"
        aria-busy={isBusy}
        onKeyDown={handlePanelKeyDown}
      >
        <header className="chatbot-panel-header">
          <div className="chatbot-panel-heading">
            <span className="chatbot-panel-icon" aria-hidden="true"><Sparkles size={18} /></span>
            <div>
              <h2>포트폴리오 AI</h2>
              <p className={isDisabled ? "chatbot-panel-status--offline" : undefined}>
                <span aria-hidden="true" />
                {isChecking ? "연결 상태를 확인하고 있어요" : isDisabled ? "현재 AI 연결이 꺼져 있어요" : "공개된 콘텐츠를 바탕으로 답해요"}
              </p>
            </div>
          </div>
          <div className="chatbot-panel-actions">
            <button type="button" className="chatbot-clear-button focus-ring" aria-label="대화 기록 지우기" onClick={onClearConversation} disabled={messages.length === 0}>
              <Trash2 size={16} aria-hidden="true" />
            </button>
            <button ref={closeButtonRef} type="button" className="chatbot-close-button focus-ring" aria-label="포트폴리오 챗봇 닫기" onClick={onClose}>
              <X size={21} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div ref={messageListRef} className="chatbot-message-list" onScroll={handleMessageListScroll}>
          {isChecking ? (
            <div className="chatbot-offline-card" role="status">
              <span className="chatbot-status-dots" aria-hidden="true"><i /><i /><i /></span>
              <p>챗봇 연결 상태를 확인하고 있어요.</p>
            </div>
          ) : isOffline ? (
            <>
              <div className="chatbot-offline-card" role="status">
                <span className="chatbot-offline-icon" aria-hidden="true"><Sparkles size={20} /></span>
                <div>
                  <h3>{isDisabled ? "지금은 AI 챗봇 연결이 꺼져 있어요." : "AI 챗봇 연결 상태를 확인할 수 없어요."}</h3>
                  <p>{isDisabled ? "현재는 질문에 답변할 수 없지만, 소개와 연락처 페이지에서 송경근의 기술과 협업 정보를 확인하실 수 있어요." : "잠시 후 다시 확인해 주세요. 저장된 대화와 소개·연락처 페이지는 계속 확인할 수 있어요."}</p>
                </div>
                <div className="chatbot-offline-actions">
                  <Link href="/about" className="focus-ring" onClick={onNavigate}>소개 보기</Link>
                  <Link href="/contact" className="focus-ring" onClick={onNavigate}>연락처 보기</Link>
                </div>
                <button type="button" className="chatbot-status-refresh focus-ring" onClick={onRefreshStatus}>
                  <RefreshCw size={14} aria-hidden="true" /> 연결 상태 다시 확인
                </button>
              </div>
              {messages.map((message) => <ChatbotMessage key={message.id} message={message} onRetry={onRetry} onNavigate={onNavigate} />)}
            </>
          ) : (
            <>
              <ChatbotMessage message={WELCOME_MESSAGE} onNavigate={onNavigate} />
              {!hasUserMessage ? (
                <div className="chatbot-suggestions" aria-label="추천 질문">
                  <p>이렇게 물어보세요</p>
                  <div>
                    {suggestedQuestions.map((question) => (
                      <button
                        key={question}
                        type="button"
                        className="focus-ring"
                        disabled={!isReady || isBusy}
                        onClick={() => onSubmit(question)}
                      >
                        {question}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}
              {messages.map((message) => <ChatbotMessage key={message.id} message={message} onRetry={onRetry} onNavigate={onNavigate} />)}
              <ChatbotStatus phase={phase} message={statusMessage} canCancel={canCancel} onCancel={onCancel} />
            </>
          )}
          {showNewReply ? <button type="button" className="chatbot-new-reply-button focus-ring" onClick={scrollToLatest}>새 답변 보기</button> : null}
        </div>

        <p className="sr-only" aria-live="polite" aria-atomic="true">{announcement}</p>

        {!isChecking && !isOffline ? (
          <form className="chatbot-composer" onSubmit={submit}>
            <label className="sr-only" htmlFor="portfolio-chatbot-input">포트폴리오에 대해 질문하기</label>
            <div className="chatbot-input-wrap">
              <textarea
                ref={inputRef}
                id="portfolio-chatbot-input"
                value={input}
                rows={1}
                maxLength={500}
                placeholder="기술이나 프로젝트를 물어보세요"
                disabled={!isReady || isBusy}
                onChange={(event) => onInputChange(event.target.value)}
                onKeyDown={handleInputKeyDown}
              />
              <button
                type="submit"
                className="chatbot-send-button focus-ring"
                disabled={!isReady || isBusy || input.trim().length === 0}
                aria-label="질문 보내기"
              >
                <Send size={18} aria-hidden="true" />
              </button>
            </div>
            <p><span>대화는 이 탭에만 임시로 보관돼요.</span><span aria-live="off">{input.length}/500</span></p>
          </form>
        ) : null}
      </div>
    </div>
  );
}
