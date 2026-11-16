import { z } from "zod";
import { CHAT_ERROR_CODES } from "@/lib/chat/error-messages";

export const CHAT_REQUEST_MAX_BYTES = 16 * 1024;

export const chatHistoryMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(1_000),
}).strict();

export const chatRequestSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().trim().min(1).max(500),
  history: z.array(chatHistoryMessageSchema).max(4).default([]),
}).strict();

export type ChatRequest = z.infer<typeof chatRequestSchema>;
export type ChatHistoryMessage = z.infer<typeof chatHistoryMessageSchema>;

// 오류 코드와 문구는 error-messages.ts 한 곳에서 관리한다.
export const chatErrorCodeSchema = z.enum(CHAT_ERROR_CODES);

export type ChatErrorCode = z.infer<typeof chatErrorCodeSchema>;

const internalSourcePath = /^\/(?:about|portfolio\/[a-z0-9]+(?:-[a-z0-9]+)*|blog\/[a-z0-9]+(?:-[a-z0-9]+)*)$/;

export function isAllowedChatSourceUrl(value: string) {
  return internalSourcePath.test(value);
}

export const chatSourceSchema = z.object({
  id: z.string().regex(/^S[1-9]\d*$/),
  title: z.string().trim().min(1).max(200),
  type: z.enum(["profile", "portfolio", "post"]),
  url: z.string().refine(isAllowedChatSourceUrl, "허용되지 않은 출처 URL입니다."),
}).strict();

export type ChatSource = z.infer<typeof chatSourceSchema>;

/**
 * `/api/chat` 스트림의 이벤트. 한 응답의 순서는 다음과 같다.
 *
 *   status(accepted) → status(searching) → sources → status(generating) → token… → done
 *
 * 어느 시점에서든 error가 오면 거기서 끝난다. done과 error가 종료 이벤트이고,
 * 종료 이벤트 없이 닫힌 스트림은 오류로 다룬다.
 */
export const chatSseEventSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("status"),
    data: z.object({
      phase: z.enum(["accepted", "searching", "generating"]),
      message: z.string().trim().min(1).max(200),
    }).strict(),
  }),
  z.object({
    event: z.literal("sources"),
    data: z.object({ items: z.array(chatSourceSchema).max(5) }).strict(),
  }),
  z.object({
    event: z.literal("token"),
    data: z.object({ delta: z.string().min(1).max(4_000) }).strict(),
  }),
  z.object({
    event: z.literal("done"),
    data: z.object({
      requestId: z.string().uuid(),
      finishReason: z.enum(["stop", "length", "cancelled"]),
      // 미리 만들어 저장해 둔 답변이면 true. 화면에 "저장된 답변"으로 표시한다.
      cached: z.literal(true).optional(),
    }).strict(),
  }),
  z.object({
    event: z.literal("error"),
    data: z.object({
      code: chatErrorCodeSchema,
      message: z.string().trim().min(1).max(300),
    }).strict(),
  }),
]);

export type ChatSseEvent = z.infer<typeof chatSseEventSchema>;

/** 스트림을 끝내는 이벤트인지. 릴레이는 이 이벤트를 받으면 읽기를 멈춘다. */
export function isTerminalChatSseEvent(event: ChatSseEvent["event"]) {
  return event === "done" || event === "error";
}

export const chatHttpErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryAfterSeconds: z.number().int().nonnegative().optional(),
}).strict();
