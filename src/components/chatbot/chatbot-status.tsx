import { Square } from "lucide-react";
import type { ChatPhase } from "./chatbot-types";

type ChatbotStatusProps = {
  phase: ChatPhase;
  message: string | null;
  canCancel: boolean;
  onCancel: () => void;
};

export function ChatbotStatus({ phase, message, canCancel, onCancel }: ChatbotStatusProps) {
  const isActive = phase === "submitting" || phase === "searching" || phase === "generating" || phase === "streaming";
  if (!isActive || (!message && !canCancel)) return null;

  return (
    <div className="chatbot-status" aria-live="polite" aria-atomic="true">
      {message ? (
        <div className="chatbot-status-copy">
          <span className="chatbot-status-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>{message}</span>
        </div>
      ) : null}
      {canCancel ? (
        <button type="button" className="chatbot-cancel-button focus-ring" onClick={onCancel}>
          <Square size={13} fill="currentColor" aria-hidden="true" />
          답변 생성 취소
        </button>
      ) : null}
    </div>
  );
}
