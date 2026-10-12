import { MessageCircle } from "lucide-react";
import type { RefObject } from "react";
import type { ChatbotRuntimeAvailability } from "./chatbot-types";

type ChatbotButtonProps = {
  buttonRef: RefObject<HTMLButtonElement | null>;
  isOpen: boolean;
  hasUnreadError: boolean;
  onClick: () => void;
  /** 히어로 챗봇 콘솔이 보이는 동안 버튼을 숨긴다. */
  isAway?: boolean;
  pulse?: boolean;
  runtimeAvailability?: ChatbotRuntimeAvailability;
};

export function ChatbotButton({ buttonRef, isOpen, hasUnreadError, onClick, isAway = false, pulse = false, runtimeAvailability }: ChatbotButtonProps) {
  const offline = runtimeAvailability === "disabled" || runtimeAvailability === "unavailable";
  const className = [
    "chatbot-trigger focus-ring",
    isOpen ? "chatbot-trigger--open" : "",
    isAway ? "chatbot-trigger--away" : "",
    pulse ? "chatbot-trigger--pulse" : "",
  ].filter(Boolean).join(" ");

  return (
    <button
      ref={buttonRef}
      type="button"
      className={className}
      aria-label="포트폴리오 챗봇 열기"
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-controls="portfolio-chatbot-panel"
      tabIndex={isAway ? -1 : undefined}
      onClick={onClick}
    >
      <MessageCircle size={27} strokeWidth={1.9} aria-hidden="true" />
      {hasUnreadError ? <span className="chatbot-unread-dot" aria-label="확인하지 않은 챗봇 오류" /> : null}
      {!hasUnreadError && offline ? <span className="chatbot-state-dot" data-state={runtimeAvailability} aria-hidden="true" /> : null}
    </button>
  );
}
