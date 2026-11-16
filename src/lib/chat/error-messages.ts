/**
 * 챗봇 오류 코드와 사용자에게 보여 줄 문구의 단일 출처.
 * 서버 릴레이(`/api/chat`)와 브라우저 스트림 훅이 같은 표를 쓴다.
 * zod에 기대지 않으므로 클라이언트 번들에서도 가볍게 가져올 수 있다.
 */
export const CHAT_ERROR_CODES = [
  "INVALID_REQUEST",
  "CHATBOT_DISABLED",
  "RATE_LIMITED",
  "SEARCH_UNAVAILABLE",
  "NO_RELEVANT_CONTEXT",
  "MODEL_BUSY",
  "MODEL_UNAVAILABLE",
  "FIRST_TOKEN_TIMEOUT",
  "GENERATION_TIMEOUT",
  "INTERNAL_ERROR",
] as const;

export type ChatErrorCode = (typeof CHAT_ERROR_CODES)[number];

export const CHAT_ERROR_MESSAGES: Record<ChatErrorCode, string> = {
  INVALID_REQUEST: "질문 내용을 확인해 주세요.",
  CHATBOT_DISABLED: "현재 포트폴리오 AI 챗봇 연결이 꺼져 있어요. 소개와 연락처에서 더 많은 정보를 확인해 주세요.",
  RATE_LIMITED: "요청이 많아요. 잠시 후 다시 질문해 주세요.",
  SEARCH_UNAVAILABLE: "관련 콘텐츠를 챗봇에 반영하고 있어요. 잠시 후 다시 질문해 주세요.",
  NO_RELEVANT_CONTEXT: "현재 공개된 포트폴리오와 블로그에서는 해당 내용을 확인할 수 없어요. 다른 기술이나 프로젝트에 대해 질문하거나 연락처 페이지를 이용해 주세요.",
  MODEL_BUSY: "요청이 많아요. 잠시 후 다시 질문해 주세요.",
  MODEL_UNAVAILABLE: "챗봇 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
  FIRST_TOKEN_TIMEOUT: "답변 생성에 시간이 너무 오래 걸렸어요. 질문을 조금 짧게 바꿔 다시 시도해 주세요.",
  GENERATION_TIMEOUT: "답변 생성에 시간이 너무 오래 걸렸어요. 질문을 조금 짧게 바꿔 다시 시도해 주세요.",
  INTERNAL_ERROR: "답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
};

/** 근거를 찾지 못한 답변. 다시 시도해도 결과가 같으므로 재시도 대신 다른 페이지를 안내한다. */
export const NO_RELEVANT_CONTEXT_CODE = "NO_RELEVANT_CONTEXT" satisfies ChatErrorCode;

const KNOWN_CODES: ReadonlySet<string> = new Set(CHAT_ERROR_CODES);

export function isChatErrorCode(value: unknown): value is ChatErrorCode {
  return typeof value === "string" && KNOWN_CODES.has(value);
}

/** 서버가 보낸 문구가 쓸 만하면 그대로 쓰고, 아니면 코드에 맞는 기본 문구로 돌아간다. */
export function chatErrorMessage(code: string, suppliedMessage?: unknown) {
  if (typeof suppliedMessage === "string") {
    const message = suppliedMessage.trim();
    if (message && message.length <= 300) return message;
  }
  return CHAT_ERROR_MESSAGES[isChatErrorCode(code) ? code : "INTERNAL_ERROR"];
}
