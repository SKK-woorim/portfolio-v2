import * as Sentry from "@sentry/nextjs";
import { randomUUID } from "node:crypto";
import { getChatBackendConfig } from "@/lib/chat/backend-config";
import { cachedAnswers, chunkCachedAnswer, type CachedAnswer } from "@/lib/chat/cached-answers";
import { CHAT_REQUEST_MAX_BYTES, chatErrorCodeSchema, chatRequestSchema, isTerminalChatSseEvent, type ChatErrorCode, type ChatRequest } from "@/lib/chat/contracts";
import { CHAT_ERROR_MESSAGES as USER_ERROR_MESSAGES } from "@/lib/chat/error-messages";
import { getPublicContentVersion } from "@/lib/chat/public-content-version";
import { consumeChatRateLimit } from "@/lib/chat/rate-limit";
import { getChatbotRuntimeStatus, isChatbotMasterEnabled } from "@/lib/chat/runtime-status";
import { createSignedChatHeaders } from "@/lib/chat/signature";
import { BackendSseFrameBuffer, CHAT_SSE_HEADERS, encodeHeartbeat, encodeSse, parseBackendSseFrame } from "@/lib/chat/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const encoder = new TextEncoder();

/** 백엔드 요청을 끊은 까닭. 클라이언트가 떠난 경우에는 오류를 보내지 않는다. */
type RelayAbortReason = "timeout" | "client";

function jsonError(code: ChatErrorCode, status: number, retryAfterSeconds?: number) {
  return Response.json(
    {
      code,
      message: USER_ERROR_MESSAGES[code],
      ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        ...(retryAfterSeconds === undefined ? {} : { "Retry-After": String(retryAfterSeconds) }),
      },
    },
  );
}

function requestTimeoutMs() {
  const parsed = Number(process.env.CHAT_REQUEST_TIMEOUT_MS ?? 240_000);
  if (!Number.isFinite(parsed) || parsed < 1_000 || parsed > 285_000) {
    throw new Error("CHAT_REQUEST_TIMEOUT_MS must be between 1000 and 285000");
  }
  return Math.floor(parsed);
}

async function readSmallErrorBody(response: Response) {
  if (!response.body) return null;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  try {
    while (text.length <= 4_096) {
      const { done, value } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
    }
    if (text.length > 4_096) return null;
    text += decoder.decode();
    const candidate = JSON.parse(text) as { code?: unknown };
    const parsed = chatErrorCodeSchema.safeParse(candidate.code);
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

async function relayBackendStream(
  controller: ReadableStreamDefaultController<Uint8Array>,
  payload: ChatRequest,
  downstreamSignal: AbortSignal,
) {
  const backend = getChatBackendConfig();
  const rawBody = JSON.stringify(payload);
  const signed = createSignedChatHeaders(backend.secret, rawBody);
  const abortController = new AbortController();
  const abortRelay = (reason: RelayAbortReason) => abortController.abort(reason);
  const timeout = setTimeout(() => abortRelay("timeout"), requestTimeoutMs());
  const abortFromClient = () => abortRelay("client");
  downstreamSignal.addEventListener("abort", abortFromClient, { once: true });
  if (downstreamSignal.aborted) abortRelay("client");

  let closed = false;
  const enqueue = (value: string) => {
    if (!closed && !downstreamSignal.aborted) controller.enqueue(encoder.encode(value));
  };
  const heartbeat = setInterval(() => enqueue(encodeHeartbeat()), 9_000);

  try {
    enqueue(encodeSse("status", { phase: "accepted", message: "질문을 확인하고 있어요." }));
    enqueue(encodeSse("status", { phase: "searching", message: "관련 정보를 검색하고 있어요." }));

    const response = await fetch(backend.chatUrl, {
      method: "POST",
      headers: signed.headers,
      body: rawBody,
      cache: "no-store",
      signal: abortController.signal,
    });
    if (!response.ok) {
      const upstreamCode = await readSmallErrorBody(response);
      const code = upstreamCode ?? (response.status === 429 ? "MODEL_BUSY" : "MODEL_UNAVAILABLE");
      enqueue(encodeSse("error", { code, message: USER_ERROR_MESSAGES[code] }));
      return;
    }
    if (!response.headers.get("content-type")?.toLowerCase().startsWith("text/event-stream")) {
      throw new Error("Chat backend did not return an SSE response");
    }
    if (!response.body) throw new Error("Chat backend returned an empty response");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    const frames = new BackendSseFrameBuffer();
    let terminalEventReceived = false;
    try {
      while (!terminalEventReceived) {
        const { done, value } = await reader.read();
        if (done) break;
        for (const frame of frames.push(decoder.decode(value, { stream: true }))) {
          const parsed = parseBackendSseFrame(frame);
          if (!parsed) continue;
          if (parsed.type === "heartbeat") {
            enqueue(encodeHeartbeat());
            continue;
          }
          const { event, data } = parsed.value;
          if (event === "status" && data.phase !== "generating") continue;
          if (event === "done" && data.requestId !== signed.requestId) {
            throw new Error("Chat backend returned a mismatched request ID");
          }
          if (event === "error") {
            enqueue(encodeSse(event, { code: data.code, message: USER_ERROR_MESSAGES[data.code] }));
          } else {
            enqueue(encodeSse(event, data));
          }
          terminalEventReceived = isTerminalChatSseEvent(event);
          if (terminalEventReceived) break;
        }
      }
      if (!terminalEventReceived) {
        frames.finish();
        throw new Error("Chat backend stream ended before a terminal event");
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
  } catch (error) {
    const abortReason = abortController.signal.aborted ? abortController.signal.reason as RelayAbortReason : null;
    if (downstreamSignal.aborted || abortReason === "client") return;
    const timedOut = abortReason === "timeout";
    const code: ChatErrorCode = timedOut ? "GENERATION_TIMEOUT" : "MODEL_UNAVAILABLE";
    enqueue(encodeSse("error", { code, message: USER_ERROR_MESSAGES[code] }));
    Sentry.captureException(error, { tags: { area: "chat-relay", code }, extra: { requestId: signed.requestId } });
  } finally {
    clearTimeout(timeout);
    clearInterval(heartbeat);
    downstreamSignal.removeEventListener("abort", abortFromClient);
    closed = true;
    if (!downstreamSignal.aborted) controller.close();
  }
}

const CACHED_CHUNK_DELAY_MS = 18;

/**
 * 고정 문구 질문(추천 질문, 사례별 질문)에 미리 만들어 둔 답변을 찾는다.
 * 답변을 만들 때의 콘텐츠 지문이 현재와 다르면 쓰지 않고 실제 생성 경로로 넘긴다.
 */
async function findCurrentCachedAnswer(request: Request, message: string) {
  if (request.headers.get("x-chat-cache")?.trim().toLowerCase() === "bypass") return undefined;
  const entry = cachedAnswers.find(message);
  if (!entry) return undefined;
  try {
    return cachedAnswers.isCurrent(await getPublicContentVersion()) ? entry : undefined;
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "chat-cached-answer" } });
    return undefined;
  }
}

function cachedAnswerStream(entry: CachedAnswer, signal: AbortSignal) {
  let stopped = false;
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (value: string) => {
        if (!stopped && !signal.aborted) controller.enqueue(encoder.encode(value));
      };
      enqueue(encodeSse("status", { phase: "accepted", message: "질문을 확인하고 있어요." }));
      enqueue(encodeSse("status", { phase: "searching", message: "관련 정보를 검색하고 있어요." }));
      enqueue(encodeSse("sources", { items: entry.sources }));
      enqueue(encodeSse("status", { phase: "generating", message: "저장된 답변을 불러오고 있어요." }));
      for (const delta of chunkCachedAnswer(entry.answer)) {
        if (stopped || signal.aborted) return;
        enqueue(encodeSse("token", { delta }));
        await new Promise((resolve) => setTimeout(resolve, CACHED_CHUNK_DELAY_MS));
      }
      if (stopped || signal.aborted) return;
      enqueue(encodeSse("done", { requestId: randomUUID(), finishReason: "stop", cached: true }));
      stopped = true;
      controller.close();
    },
    cancel() {
      stopped = true;
    },
  });
}

export async function POST(request: Request) {
  if (!isChatbotMasterEnabled()) return jsonError("CHATBOT_DISABLED", 503);
  try {
    if (!(await getChatbotRuntimeStatus()).enabled) return jsonError("CHATBOT_DISABLED", 503);
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "chat-runtime-status" } });
    return jsonError("CHATBOT_DISABLED", 503);
  }
  if (request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() !== "application/json") {
    return jsonError("INVALID_REQUEST", 415);
  }

  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (Number.isFinite(declaredLength) && declaredLength > CHAT_REQUEST_MAX_BYTES) {
    return jsonError("INVALID_REQUEST", 413);
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return jsonError("INVALID_REQUEST", 400);
  }
  if (encoder.encode(rawBody).byteLength > CHAT_REQUEST_MAX_BYTES) return jsonError("INVALID_REQUEST", 413);

  let input: unknown;
  try {
    input = JSON.parse(rawBody);
  } catch {
    return jsonError("INVALID_REQUEST", 400);
  }
  const parsed = chatRequestSchema.safeParse(input);
  if (!parsed.success) return jsonError("INVALID_REQUEST", 400);

  const cached = await findCurrentCachedAnswer(request, parsed.data.message);
  if (cached) return new Response(cachedAnswerStream(cached, request.signal), { status: 200, headers: CHAT_SSE_HEADERS });

  try {
    getChatBackendConfig();
    requestTimeoutMs();
    const rateLimit = await consumeChatRateLimit(request, parsed.data.sessionId);
    if (!rateLimit.allowed) return jsonError("RATE_LIMITED", 429, rateLimit.retryAfterSeconds);
  } catch (error) {
    Sentry.captureException(error, { tags: { area: "chat-configuration" } });
    return jsonError("MODEL_UNAVAILABLE", 503);
  }

  const relayAbortController = new AbortController();
  const abortRelay = () => relayAbortController.abort("client");
  request.signal.addEventListener("abort", abortRelay, { once: true });
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      void relayBackendStream(controller, parsed.data, relayAbortController.signal)
        .finally(() => request.signal.removeEventListener("abort", abortRelay));
    },
    cancel() {
      relayAbortController.abort("client");
    },
  });
  return new Response(stream, { status: 200, headers: CHAT_SSE_HEADERS });
}
