import { MessageCircle } from "lucide-react";
import type { RefObject } from "react";

type ChatbotButtonProps = {
  buttonRef: RefObject<HTMLButtonElement | null>;
  isOpen: boolean;
  hasUnreadError: boolean;
  onClick: () => void;
};

export function ChatbotButton({ buttonRef, isOpen, hasUnreadError, onClick }: ChatbotButtonProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      className={`chatbot-trigger focus-ring${isOpen ? " chatbot-trigger--open" : ""}`}
      aria-label="포트폴리오 챗봇 열기"
      aria-haspopup="dialog"
      aria-expanded={isOpen}
      aria-controls="portfolio-chatbot-panel"
      onClick={onClick}
    >
      <MessageCircle size={27} strokeWidth={1.9} aria-hidden="true" />
      {hasUnreadError ? <span className="chatbot-unread-dot" aria-label="확인하지 않은 챗봇 오류" /> : null}
    </button>
  );
}
