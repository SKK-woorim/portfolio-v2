"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CHAT_ERROR_MESSAGES, chatErrorMessage } from "@/lib/chat/error-messages";
import { ChatSseParser, type ParsedServerSentEvent } from "./chat-sse-parser";
import { INITIAL_CHAT_STREAM_STATE, isChatPhaseActive, reduceChatStream, type ChatStreamEvent } from "./chat-state";
import { sanitizeChatSources } from "./chatbot-sources";
import type { ChatFinishReason, ChatHistoryMessage, ChatSource, ChatStreamError } from "./chatbot-types";

export { advanceChatPhase } from "./chat-state";

const CANCEL_REVEAL_DELAY_MS = 30_000;

type ChatStreamHandlers = {
  onSources?: (requestId: string, sources: ChatSource[]) => void;
  onToken?: (requestId: string, delta: string) => void;
  onComplete?: (requestId: string, finishReason: ChatFinishReason, meta?: { cached: boolean }) => void;
  onError?: (requestId: string, error: ChatStreamError) => void;
  onCancel?: (requestId: string) => void;
};

type SendChatInput = {
  requestId: string;
  sessionId: string;
  message: string;
  history: ChatHistoryMessage[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function internalError(): ChatStreamError {
  return { code: "INTERNAL_ERROR", message: CHAT_ERROR_MESSAGES.INTERNAL_ERROR };
}

export async function readChatHttpError(response: Response): Promise<ChatStreamError> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  const code = isRecord(payload) && typeof payload.code === "string" ? payload.code : "INTERNAL_ERROR";
  const retryAfterSeconds = isRecord(payload) && typeof payload.retryAfterSeconds === "number" && payload.retryAfterSeconds >= 0
    ? payload.retryAfterSeconds
    : undefined;

  return {
    code,
    message: chatErrorMessage(code, isRecord(payload) ? payload.message : undefined),
    ...(retryAfterSeconds === undefined ? {} : { retryAfterSeconds }),
  };
}

function parseEventData(event: ParsedServerSentEvent): Record<string, unknown> | null {
  try {
    const value: unknown = JSON.parse(event.data);
    return isRecord(value) ? value : null;
  } catch {
    return null;
  }
}

export function parseChatFinishReason(value: unknown): ChatFinishReason | null {
  return value === "stop" || value === "length" || value === "cancelled" ? value : null;
}

/** 서버의 `status` 이벤트 단계를 요청 단계로 옮긴다. 모르는 단계는 버린다. */
function statusEventPhase(value: unknown) {
  if (value === "accepted") return "submitting" as const;
  return value === "searching" || value === "generating" ? value : null;
}

/**
 * 챗봇 요청 한 건을 보내고 SSE 응답을 요청 단계로 옮긴다.
 *
 * 단계 전이는 모두 `reduceChatStream`(chat-state.ts)을 거친다. 이 훅은 한 번에 요청 하나만
 * 가지며, 진행 중인 요청이 있는지는 `activeRequestIdRef`가 단독으로 정한다.
 */
export function useChatStream(handlers: ChatStreamHandlers = {}) {
  const [state, setState] = useState(INITIAL_CHAT_STREAM_STATE);
  const stateRef = useRef(INITIAL_CHAT_STREAM_STATE);
  const handlersRef = useRef(handlers);
  const activeRequestIdRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const transition = useCallback((event: ChatStreamEvent) => {
    const next = reduceChatStream(stateRef.current, event);
    if (next === stateRef.current) return;
    stateRef.current = next;
    setState(next);
  }, []);

  const clearTimers = useCallback(() => {
    if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current);
    cancelTimerRef.current = null;
  }, []);

  /** 진행 중인 요청이 `requestId`일 때만 요청 자원을 놓는다. 이미 끝난 요청이면 null. */
  const releaseRequest = useCallback((requestId: string) => {
    if (activeRequestIdRef.current !== requestId) return null;
    const controller = controllerRef.current;
    activeRequestIdRef.current = null;
    controllerRef.current = null;
    clearTimers();
    return { controller };
  }, [clearTimers]);

  const finishWithError = useCallback((requestId: string, error: ChatStreamError) => {
    if (!releaseRequest(requestId)) return;
    transition({ type: "failed", message: error.message });
    handlersRef.current.onError?.(requestId, error);
  }, [releaseRequest, transition]);

  const cancel = useCallback(() => {
    const requestId = activeRequestIdRef.current;
    if (!requestId) return;
    const released = releaseRequest(requestId);
    transition({ type: "cancelled" });
    released?.controller?.abort();
    handlersRef.current.onCancel?.(requestId);
  }, [releaseRequest, transition]);

  const runRequest = useCallback(async ({ requestId, sessionId, message, history }: SendChatInput, controller: AbortController) => {
    const isCurrent = () => activeRequestIdRef.current === requestId;
    let receivedToken = false;
    let reachedTerminalEvent = false;

    const handleEvent = (event: ParsedServerSentEvent) => {
      if (!isCurrent()) return;
      const data = parseEventData(event);

      if (event.event === "status" && data) {
        const phase = statusEventPhase(data.phase);
        if (!phase) return;
        // 긴 대기 안내는 use-chat-progress의 6초 슬라이드 안내가 맡는다.
        const statusMessage = typeof data.message === "string" && data.message.trim() ? data.message.trim().slice(0, 300) : undefined;
        transition({ type: "status", phase, ...(statusMessage ? { message: statusMessage } : {}) });
        return;
      }

      if (event.event === "sources" && data) {
        handlersRef.current.onSources?.(requestId, sanitizeChatSources(data.items));
        return;
      }

      if (event.event === "token" && data && typeof data.delta === "string") {
        if (!data.delta) return;
        receivedToken = true;
        transition({ type: "token" });
        handlersRef.current.onToken?.(requestId, data.delta);
        return;
      }

      if (event.event === "done") {
        reachedTerminalEvent = true;
        const finishReason = parseChatFinishReason(data?.finishReason);
        // 종료 사유를 모르거나 토큰 없이 끝난 응답은 완료로 치지 않는다.
        if (!finishReason || !receivedToken) {
          finishWithError(requestId, internalError());
          return;
        }
        releaseRequest(requestId);
        transition({ type: "finished", finishReason });
        handlersRef.current.onComplete?.(requestId, finishReason, { cached: data?.cached === true });
        return;
      }

      if (event.event === "error") {
        reachedTerminalEvent = true;
        const code = data && typeof data.code === "string" ? data.code : "INTERNAL_ERROR";
        finishWithError(requestId, { code, message: chatErrorMessage(code, data?.message) });
      }
    };

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
        body: JSON.stringify({ sessionId, message, history: history.slice(-4) }),
        cache: "no-store",
        signal: controller.signal,
      });

      if (!isCurrent()) return;
      if (!response.ok) {
        finishWithError(requestId, await readChatHttpError(response));
        return;
      }
      if (!response.headers.get("content-type")?.toLowerCase().includes("text/event-stream") || !response.body) {
        finishWithError(requestId, internalError());
        return;
      }

      const parser = new ChatSseParser();
      const decoder = new TextDecoder();
      const reader = response.body.getReader();

      while (!reachedTerminalEvent && isCurrent()) {
        const { value, done } = await reader.read();
        if (done) break;
        const events = parser.push(decoder.decode(value, { stream: true }));
        for (const event of events) {
          handleEvent(event);
          if (reachedTerminalEvent) break;
        }
      }

      if (!reachedTerminalEvent && isCurrent()) {
        const finalEvents = [...parser.push(decoder.decode()), ...parser.finish()];
        for (const event of finalEvents) {
          handleEvent(event);
          if (reachedTerminalEvent) break;
        }
      }

      // 종료 이벤트 없이 연결이 끊겼다.
      if (!reachedTerminalEvent) finishWithError(requestId, internalError());
    } catch (error) {
      if (!isCurrent()) return;
      if (error instanceof DOMException && error.name === "AbortError") return;
      finishWithError(requestId, { code: "MODEL_UNAVAILABLE", message: CHAT_ERROR_MESSAGES.MODEL_UNAVAILABLE });
    }
  }, [finishWithError, releaseRequest, transition]);

  /**
   * 요청을 시작한다. 이미 진행 중인 요청이 있으면 아무것도 하지 않고 false를 돌려준다.
   * 호출한 쪽은 true일 때만 대화 목록에 질문과 답변 자리를 추가하면 된다.
   */
  const sendChat = useCallback((input: SendChatInput) => {
    if (activeRequestIdRef.current) return false;

    clearTimers();
    const controller = new AbortController();
    activeRequestIdRef.current = input.requestId;
    controllerRef.current = controller;
    transition({ type: "submitted" });
    cancelTimerRef.current = setTimeout(() => {
      if (activeRequestIdRef.current === input.requestId) transition({ type: "cancel-revealed" });
    }, CANCEL_REVEAL_DELAY_MS);

    void runRequest(input, controller);
    return true;
  }, [clearTimers, runRequest, transition]);

  useEffect(() => () => {
    activeRequestIdRef.current = null;
    controllerRef.current?.abort();
    controllerRef.current = null;
    clearTimers();
  }, [clearTimers]);

  return {
    phase: state.phase,
    statusMessage: state.statusMessage,
    canCancel: state.canCancel,
    isBusy: isChatPhaseActive(state.phase),
    sendChat,
    cancel,
  };
}
