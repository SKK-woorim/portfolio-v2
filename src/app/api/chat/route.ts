import * as Sentry from "@sentry/nextjs";
import { getChatBackendConfig } from "@/lib/chat/backend-config";
import { CHAT_REQUEST_MAX_BYTES, chatErrorCodeSchema, chatRequestSchema, type ChatErrorCode, type ChatRequest } from "@/lib/chat/contracts";
import { consumeChatRateLimit } from "@/lib/chat/rate-limit";
import { getChatbotRuntimeStatus, isChatbotMasterEnabled } from "@/lib/chat/runtime-status";
import { createSignedChatHeaders } from "@/lib/chat/signature";
import { BackendSseFrameBuffer, CHAT_SSE_HEADERS, encodeHeartbeat, encodeSse, parseBackendSseFrame } from "@/lib/chat/sse";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const encoder = new TextEncoder();

const USER_ERROR_MESSAGES: Record<ChatErrorCode, string> = {
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
  const timeout = setTimeout(() => abortController.abort("timeout"), requestTimeoutMs());
  const abortFromClient = () => abortController.abort("client");
  downstreamSignal.addEventListener("abort", abortFromClient, { once: true });
  if (downstreamSignal.aborted) abortController.abort("client");

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
          terminalEventReceived = event === "done" || event === "error";
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
    if (downstreamSignal.aborted || abortController.signal.reason === "client") return;
    const timedOut = abortController.signal.aborted && abortController.signal.reason === "timeout";
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
