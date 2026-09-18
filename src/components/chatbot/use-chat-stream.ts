"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatSseParser, type ParsedServerSentEvent } from "./chat-sse-parser";
import { sanitizeChatSources } from "./chatbot-sources";
import type { ChatFinishReason, ChatHistoryMessage, ChatPhase, ChatSource, ChatStreamError } from "./chatbot-types";

const LONG_GENERATION_DELAY_MS = 15_000;
const CANCEL_REVEAL_DELAY_MS = 30_000;
const LONG_GENERATION_MESSAGE = "로컬 AI가 답변을 생성 중이에요. 조금만 기다려 주세요.";

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "질문 내용을 확인해 주세요.",
  CHATBOT_DISABLED: "현재 포트폴리오 AI 챗봇 연결이 꺼져 있어요. 소개와 연락처에서 더 많은 정보를 확인해 주세요.",
  RATE_LIMITED: "요청이 많아요. 잠시 후 다시 질문해 주세요.",
  SEARCH_UNAVAILABLE: "챗봇 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
  NO_RELEVANT_CONTEXT: "현재 공개된 포트폴리오와 블로그에서는 해당 내용을 확인할 수 없어요. 다른 기술이나 프로젝트에 대해 질문하거나 연락처 페이지를 이용해 주세요.",
  MODEL_BUSY: "현재 다른 답변을 만들고 있어요. 잠시 후 다시 질문해 주세요.",
  MODEL_UNAVAILABLE: "챗봇 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
  FIRST_TOKEN_TIMEOUT: "답변 생성에 시간이 너무 오래 걸렸어요. 질문을 조금 짧게 바꿔 다시 시도해 주세요.",
  GENERATION_TIMEOUT: "답변 생성에 시간이 너무 오래 걸렸어요. 질문을 조금 짧게 바꿔 다시 시도해 주세요.",
  INTERNAL_ERROR: "답변을 만들지 못했어요. 잠시 후 다시 시도해 주세요.",
};

const ACTIVE_PHASES = new Set<ChatPhase>(["submitting", "searching", "generating", "streaming"]);
const PHASE_RANK: Record<ChatPhase, number> = {
  idle: 0,
  submitting: 1,
  searching: 2,
  generating: 3,
  streaming: 4,
  complete: 5,
  cancelled: 5,
  error: 5,
};

type ChatStreamHandlers = {
  onSources?: (requestId: string, sources: ChatSource[]) => void;
  onToken?: (requestId: string, delta: string) => void;
  onComplete?: (requestId: string, finishReason: ChatFinishReason) => void;
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

function getErrorMessage(code: string, suppliedMessage?: unknown) {
  if (typeof suppliedMessage === "string") {
    const message = suppliedMessage.trim();
    if (message && message.length <= 300) return message;
  }
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES.INTERNAL_ERROR;
}

export function advanceChatPhase(current: ChatPhase, next: ChatPhase): ChatPhase {
  if (current === "complete" || current === "cancelled" || current === "error") return current;
  return PHASE_RANK[next] >= PHASE_RANK[current] ? next : current;
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
    message: getErrorMessage(code, isRecord(payload) ? payload.message : undefined),
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

export function useChatStream(handlers: ChatStreamHandlers = {}) {
  const [phase, setPhase] = useState<ChatPhase>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [canCancel, setCanCancel] = useState(false);
  const handlersRef = useRef(handlers);
  const phaseRef = useRef<ChatPhase>("idle");
  const activeRequestIdRef = useRef<string | null>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const longGenerationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  const clearTimers = useCallback(() => {
    if (longGenerationTimerRef.current) clearTimeout(longGenerationTimerRef.current);
    if (cancelTimerRef.current) clearTimeout(cancelTimerRef.current);
    longGenerationTimerRef.current = null;
    cancelTimerRef.current = null;
  }, []);

  const moveForward = useCallback((next: ChatPhase) => {
    const advanced = advanceChatPhase(phaseRef.current, next);
    if (advanced !== next) return false;
    phaseRef.current = advanced;
    setPhase(advanced);
    return true;
  }, []);

  const finishWithError = useCallback((requestId: string, error: ChatStreamError) => {
    if (activeRequestIdRef.current !== requestId) return;
    activeRequestIdRef.current = null;
    controllerRef.current = null;
    clearTimers();
    setCanCancel(false);
    phaseRef.current = "error";
    setPhase("error");
    setStatusMessage(error.message);
    handlersRef.current.onError?.(requestId, error);
  }, [clearTimers]);

  const cancel = useCallback(() => {
    const requestId = activeRequestIdRef.current;
    if (!requestId) return;

    activeRequestIdRef.current = null;
    const controller = controllerRef.current;
    controllerRef.current = null;
    clearTimers();
    setCanCancel(false);
    phaseRef.current = "cancelled";
    setPhase("cancelled");
    setStatusMessage(null);
    controller?.abort();
    handlersRef.current.onCancel?.(requestId);
  }, [clearTimers]);

  const sendChat = useCallback(async ({ requestId, sessionId, message, history }: SendChatInput) => {
    if (activeRequestIdRef.current) return false;

    clearTimers();
    const controller = new AbortController();
    activeRequestIdRef.current = requestId;
    controllerRef.current = controller;
    phaseRef.current = "submitting";
    setPhase("submitting");
    setStatusMessage("질문을 확인하고 있어요.");
    setCanCancel(false);
    cancelTimerRef.current = setTimeout(() => {
      if (activeRequestIdRef.current === requestId) setCanCancel(true);
    }, CANCEL_REVEAL_DELAY_MS);

    let receivedToken = false;
    let reachedTerminalEvent = false;
    let completed = false;

    const handleEvent = (event: ParsedServerSentEvent) => {
      if (activeRequestIdRef.current !== requestId) return;
      const data = parseEventData(event);

      if (event.event === "status" && data) {
        const statusPhase = data.phase;
        const nextPhase = statusPhase === "accepted"
          ? "submitting"
          : statusPhase === "searching" || statusPhase === "generating"
            ? statusPhase
            : null;
        if (!nextPhase || !moveForward(nextPhase)) return;

        if (typeof data.message === "string" && data.message.trim()) setStatusMessage(data.message.trim().slice(0, 300));
        if (nextPhase === "generating" && !longGenerationTimerRef.current) {
          longGenerationTimerRef.current = setTimeout(() => {
            if (activeRequestIdRef.current === requestId && phaseRef.current === "generating") {
              setStatusMessage(LONG_GENERATION_MESSAGE);
            }
          }, LONG_GENERATION_DELAY_MS);
        }
        return;
      }

      if (event.event === "sources" && data) {
        handlersRef.current.onSources?.(requestId, sanitizeChatSources(data.items));
        return;
      }

      if (event.event === "token" && data && typeof data.delta === "string") {
        if (!data.delta || !moveForward("streaming")) return;
        receivedToken = true;
        if (longGenerationTimerRef.current) clearTimeout(longGenerationTimerRef.current);
        longGenerationTimerRef.current = null;
        setStatusMessage(null);
        handlersRef.current.onToken?.(requestId, data.delta);
        return;
      }

      if (event.event === "done") {
        const finishReason = parseChatFinishReason(data?.finishReason);
        if (!finishReason) {
          reachedTerminalEvent = true;
          finishWithError(requestId, { code: "INTERNAL_ERROR", message: ERROR_MESSAGES.INTERNAL_ERROR });
          return;
        }
        if (!receivedToken) {
          reachedTerminalEvent = true;
          finishWithError(requestId, { code: "INTERNAL_ERROR", message: ERROR_MESSAGES.INTERNAL_ERROR });
          return;
        }
        reachedTerminalEvent = true;
        completed = true;
        activeRequestIdRef.current = null;
        controllerRef.current = null;
        clearTimers();
        setCanCancel(false);
        phaseRef.current = finishReason === "cancelled" ? "cancelled" : "complete";
        setPhase(phaseRef.current);
        setStatusMessage(null);
        handlersRef.current.onComplete?.(requestId, finishReason);
        return;
      }

      if (event.event === "error") {
        reachedTerminalEvent = true;
        const code = data && typeof data.code === "string" ? data.code : "INTERNAL_ERROR";
        finishWithError(requestId, { code, message: getErrorMessage(code, data?.message) });
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

      if (activeRequestIdRef.current !== requestId) return false;
      if (!response.ok) {
        finishWithError(requestId, await readChatHttpError(response));
        return false;
      }
      if (!response.headers.get("content-type")?.toLowerCase().includes("text/event-stream") || !response.body) {
        finishWithError(requestId, { code: "INTERNAL_ERROR", message: ERROR_MESSAGES.INTERNAL_ERROR });
        return false;
      }

      const parser = new ChatSseParser();
      const decoder = new TextDecoder();
      const reader = response.body.getReader();

      while (!reachedTerminalEvent && activeRequestIdRef.current === requestId) {
        const { value, done } = await reader.read();
        if (done) break;
        const events = parser.push(decoder.decode(value, { stream: true }));
        for (const event of events) {
          handleEvent(event);
          if (reachedTerminalEvent) break;
        }
      }

      if (!reachedTerminalEvent && activeRequestIdRef.current === requestId) {
        const finalEvents = [...parser.push(decoder.decode()), ...parser.finish()];
        for (const event of finalEvents) {
          handleEvent(event);
          if (reachedTerminalEvent) break;
        }
      }

      if (!reachedTerminalEvent && activeRequestIdRef.current === requestId) {
        finishWithError(requestId, { code: "INTERNAL_ERROR", message: ERROR_MESSAGES.INTERNAL_ERROR });
        return false;
      }
      return completed;
    } catch (error) {
      if (activeRequestIdRef.current !== requestId) return false;
      if (error instanceof DOMException && error.name === "AbortError") return false;
      finishWithError(requestId, { code: "MODEL_UNAVAILABLE", message: ERROR_MESSAGES.MODEL_UNAVAILABLE });
      return false;
    }
  }, [clearTimers, finishWithError, moveForward]);

  useEffect(() => () => {
    activeRequestIdRef.current = null;
    controllerRef.current?.abort();
    controllerRef.current = null;
    clearTimers();
  }, [clearTimers]);

  return {
    phase,
    statusMessage,
    canCancel,
    isBusy: ACTIVE_PHASES.has(phase),
    sendChat,
    cancel,
  };
}
