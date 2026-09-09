import { z } from "zod";

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

export const chatErrorCodeSchema = z.enum([
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
]);

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

export const chatHttpErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
  retryAfterSeconds: z.number().int().nonnegative().optional(),
}).strict();
