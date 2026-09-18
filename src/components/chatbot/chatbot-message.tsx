import Link from "next/link";
import { RotateCcw } from "lucide-react";
import { ChatbotSources } from "./chatbot-sources";
import type { ChatMessage } from "./chatbot-types";

type ChatbotMessageProps = {
  message: ChatMessage;
  onRetry?: (message: string) => void;
  onNavigate?: () => void;
};

export function ChatbotMessage({ message, onRetry, onNavigate }: ChatbotMessageProps) {
  if (!message.content) return null;
  const isAssistant = message.role === "assistant";
  const canRetry = isAssistant
    && (message.delivery === "error" || message.delivery === "cancelled" || message.delivery === "partial")
    && message.errorCode !== "NO_RELEVANT_CONTEXT"
    && Boolean(message.retryMessage)
    && Boolean(onRetry);

  return (
    <article
      className={`chatbot-message chatbot-message--${message.role}`}
      aria-label={isAssistant ? "챗봇 답변" : "사용자 질문"}
    >
      <div className="chatbot-message-bubble">
        <p>{message.content}</p>
        {message.delivery === "cancelled" ? <small className="chatbot-message-note">생성이 취소된 답변입니다.</small> : null}
        {message.delivery === "partial" ? <small className="chatbot-message-note">답변이 길이 제한으로 일부만 표시되었습니다.</small> : null}
      </div>
      {isAssistant && message.sources?.length ? <ChatbotSources sources={message.sources} onNavigate={onNavigate} /> : null}
      {message.errorCode === "NO_RELEVANT_CONTEXT" ? (
        <div className="chatbot-fallback-links" aria-label="다른 페이지 보기">
          <Link className="focus-ring" href="/about" onClick={onNavigate}>소개 보기</Link>
          <Link className="focus-ring" href="/contact" onClick={onNavigate}>연락처 보기</Link>
        </div>
      ) : null}
      {canRetry ? (
        <button
          type="button"
          className="chatbot-retry-button focus-ring"
          onClick={() => onRetry?.(message.retryMessage!)}
        >
          <RotateCcw size={14} aria-hidden="true" />
          다시 시도
        </button>
      ) : null}
    </article>
  );
}
