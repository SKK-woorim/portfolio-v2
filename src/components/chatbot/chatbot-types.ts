export type ChatPhase =
  | "idle"
  | "submitting"
  | "searching"
  | "generating"
  | "streaming"
  | "complete"
  | "cancelled"
  | "error";

export type ChatbotRuntimeAvailability = "checking" | "enabled" | "disabled";

export type ChatSourceType = "profile" | "portfolio" | "post" | "blog";

export type ChatSource = {
  id: string;
  title: string;
  type: ChatSourceType;
  url: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  delivery: "complete" | "streaming" | "cancelled" | "error";
  sources?: ChatSource[];
  errorCode?: string;
  retryMessage?: string;
};

export type ChatHistoryMessage = Pick<ChatMessage, "role" | "content">;

export type ChatStreamError = {
  code: string;
  message: string;
  retryAfterSeconds?: number;
};
