"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { parseChatbotIndexStats, type ChatbotIndexStats } from "@/lib/chat/index-stats";
import { chatSuggestions } from "@/lib/content/presentation";
import { INTERRUPTED_ANSWER_PLACEHOLDER, reduceChatMessage, restoreStoredDelivery, type ChatMessageEvent } from "./chat-state";
import { sanitizeChatSources } from "./chatbot-sources";
import type { ChatbotRuntimeAvailability, ChatFinishReason, ChatHistoryMessage, ChatMessage, ChatPhase, ChatStreamError } from "./chatbot-types";
import { initialRuntimeAvailability, isChatOnline, parseRuntimeStatusPayload, reduceRuntimeAvailability, type RuntimeAvailabilityEvent, type RuntimeStatusAbortReason } from "./runtime-availability";
import { CHAT_PROGRESS_STEP, useChatProgress, useSlowNotice, type ChatProgressStep } from "./use-chat-progress";
import { useChatStream } from "./use-chat-stream";

const STORAGE_KEY = "portfolio-chatbot-session-v2";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_STORED_MESSAGES = 40;
const RUNTIME_STATUS_POLL_MS = 15_000;

export const SUGGESTED_QUESTIONS = chatSuggestions;

export type { ChatbotIndexStats };

export type ChatbotProgress = {
  step: ChatProgressStep;
  waitSeconds: number;
  sourceCount: number | null;
  slowNotice: boolean;
};

type ChatbotContextValue = {
  messages: ChatMessage[];
  phase: ChatPhase;
  statusMessage: string | null;
  canCancel: boolean;
  isBusy: boolean;
  input: string;
  setInput: (value: string) => void;
  isHydrated: boolean;
  runtimeAvailability: ChatbotRuntimeAvailability;
  indexStats: ChatbotIndexStats | null;
  announcement: string;
  isOpen: boolean;
  hasUnreadError: boolean;
  buttonRef: RefObject<HTMLButtonElement | null>;
  suggestions: readonly string[];
  progress: ChatbotProgress;
  heroVisible: boolean;
  setHeroVisible: (visible: boolean) => void;
  openPanel: (question?: string) => void;
  closePanel: (restoreFocus?: boolean) => void;
  /** 질문을 보낸다. 지금은 받을 수 없어 보내지 않았다면 false. */
  sendMessage: (message: string) => boolean;
  cancel: () => void;
  clearConversation: () => void;
  refreshRuntimeAvailability: () => Promise<void>;
};

const ChatbotContext = createContext<ChatbotContextValue | null>(null);

export function useChatbot() {
  return useContext(ChatbotContext);
}

function createUuid() {
  const browserCrypto = globalThis.crypto;
  if (typeof browserCrypto?.randomUUID === "function") return browserCrypto.randomUUID();

  const bytes = new Uint8Array(16);
  if (typeof browserCrypto?.getRandomValues === "function") browserCrypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function restoreMessages(value: unknown): ChatMessage[] {
  if (!Array.isArray(value)) return [];
  const messages: ChatMessage[] = [];

  for (const item of value.slice(-MAX_STORED_MESSAGES)) {
    if (!isRecord(item) || !UUID_PATTERN.test(String(item.id ?? ""))) continue;
    if (item.role !== "user" && item.role !== "assistant") continue;
    if (typeof item.content !== "string" || item.content.length > 12_000) continue;
    const interruptedWithoutContent = item.role === "assistant" && item.delivery === "streaming" && item.content.length === 0;
    if (item.content.length === 0 && !interruptedWithoutContent) continue;

    const delivery = restoreStoredDelivery(item.delivery);
    const retryMessage = typeof item.retryMessage === "string" && item.retryMessage.length <= 500
      ? item.retryMessage
      : undefined;
    const errorCode = typeof item.errorCode === "string" && item.errorCode.length <= 80 ? item.errorCode : undefined;
    const sources = sanitizeChatSources(item.sources);

    messages.push({
      id: String(item.id),
      role: item.role,
      content: interruptedWithoutContent ? INTERRUPTED_ANSWER_PLACEHOLDER : item.content,
      delivery,
      ...(sources.length ? { sources } : {}),
      ...(item.cached === true ? { cached: true } : {}),
      ...(retryMessage ? { retryMessage } : {}),
      ...(errorCode ? { errorCode } : {}),
    });
  }

  return messages;
}

function loadStoredSession() {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || typeof value.sessionId !== "string" || !UUID_PATTERN.test(value.sessionId)) return null;
    return { sessionId: value.sessionId, messages: restoreMessages(value.messages) };
  } catch {
    return null;
  }
}

function buildHistory(messages: ChatMessage[]): ChatHistoryMessage[] {
  return messages
    .filter((message) => message.delivery === "complete" && message.content.trim().length > 0)
    .map(({ role, content }) => ({ role, content: content.slice(0, 1_000) }))
    .slice(-4);
}

type ChatbotProviderProps = {
  children: ReactNode;
  /** 히어로 콘솔처럼 패널을 열기 전에도 연결 상태가 필요할 때 켠다. */
  checkOnMount?: boolean;
  /** 환경 변수로 챗봇을 끈 배포에서는 상태 확인 없이 꺼짐으로 둔다. */
  disabled?: boolean;
};

export function ChatbotProvider({ children, checkOnMount = false, disabled = false }: ChatbotProviderProps) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const announcementSequenceRef = useRef(0);
  const isOpenRef = useRef(false);
  const statusRequestRef = useRef<{ controller: AbortController; reason: RuntimeStatusAbortReason } | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [hasUnreadError, setHasUnreadError] = useState(false);
  const [runtimeAvailability, setRuntimeAvailability] = useState<ChatbotRuntimeAvailability>(() => initialRuntimeAvailability(disabled));
  const [indexStats, setIndexStats] = useState<ChatbotIndexStats | null>(null);
  const [heroVisible, setHeroVisible] = useState(false);
  /** 질문과 함께 패널을 열었을 때, 연결 상태가 확인될 때까지 들고 있는 질문. */
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null);

  /** 연결 상태는 이 함수로만 바꾼다. 전이 규칙은 runtime-availability.ts에 있다. */
  const transitionAvailability = useCallback((event: RuntimeAvailabilityEvent) => {
    setRuntimeAvailability((current) => reduceRuntimeAvailability(current, event));
  }, []);

  /** 답변 한 건의 전달 상태를 바꾼다. 전이 규칙은 chat-state.ts의 `reduceChatMessage`에 있다. */
  const transitionMessage = useCallback((requestId: string, event: ChatMessageEvent) => {
    setMessages((current) => current.map((message) => message.id === requestId ? reduceChatMessage(message, event) : message));
  }, []);

  const refreshRuntimeAvailability = useCallback(async () => {
    const previousRequest = statusRequestRef.current;
    if (previousRequest) {
      previousRequest.reason = "superseded";
      previousRequest.controller.abort();
    }
    const controller = new AbortController();
    const request = { controller, reason: null as RuntimeStatusAbortReason };
    statusRequestRef.current = request;
    const timeout = window.setTimeout(() => {
      if (statusRequestRef.current !== request) return;
      request.reason = "timeout";
      controller.abort();
    }, 5_000);
    try {
      const response = await fetch("/api/chat/status", { cache: "no-store", headers: { Accept: "application/json" }, signal: controller.signal });
      if (!response.ok) throw new Error("Chatbot status request failed");
      const payload: unknown = await response.json();
      if (isRecord(payload)) {
        const stats = parseChatbotIndexStats(payload.index);
        if (stats) setIndexStats(stats);
      }
      transitionAvailability({ type: "status-resolved", availability: parseRuntimeStatusPayload(payload) });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        transitionAvailability({ type: "status-aborted", reason: request.reason });
        return;
      }
      transitionAvailability({ type: "status-failed" });
    } finally {
      window.clearTimeout(timeout);
      if (statusRequestRef.current === request) statusRequestRef.current = null;
    }
  }, [transitionAvailability]);

  const announce = useCallback((message: string) => {
    announcementSequenceRef.current += 1;
    setAnnouncement(`${message} (${announcementSequenceRef.current})`);
  }, []);

  const stream = useChatStream({
    onSources(requestId, sources) {
      transitionMessage(requestId, { type: "sources", sources });
    },
    onToken(requestId, delta) {
      transitionMessage(requestId, { type: "token", delta });
    },
    onComplete(requestId, finishReason: ChatFinishReason, meta) {
      transitionMessage(requestId, { type: "finished", finishReason, cached: meta?.cached });
      announce(finishReason === "length" ? "답변이 길이 제한으로 일부 완료되었습니다." : finishReason === "cancelled" ? "답변 생성을 취소했습니다." : "챗봇 답변이 완료되었습니다.");
    },
    onError(requestId, error: ChatStreamError) {
      if (error.code === "CHATBOT_DISABLED") transitionAvailability({ type: "chat-rejected-as-disabled" });
      transitionMessage(requestId, { type: "failed", error });
      if (!isOpenRef.current) setHasUnreadError(true);
      announce(error.message);
    },
    onCancel(requestId) {
      transitionMessage(requestId, { type: "cancelled" });
      announce("답변 생성을 취소했습니다.");
    },
  });

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      const stored = loadStoredSession();
      setSessionId(stored?.sessionId ?? createUuid());
      setMessages(stored?.messages ?? []);
      setIsHydrated(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    if (!checkOnMount || disabled) return;
    const timeout = window.setTimeout(() => void refreshRuntimeAvailability(), 0);
    return () => window.clearTimeout(timeout);
  }, [checkOnMount, disabled, refreshRuntimeAvailability]);

  useEffect(() => {
    if (!isOpen) return;
    const timeout = window.setTimeout(() => void refreshRuntimeAvailability(), 0);
    const interval = window.setInterval(() => void refreshRuntimeAvailability(), RUNTIME_STATUS_POLL_MS);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [isOpen, refreshRuntimeAvailability]);

  useEffect(() => () => {
    const request = statusRequestRef.current;
    if (request) {
      request.reason = "unmount";
      request.controller.abort();
    }
    statusRequestRef.current = null;
  }, []);

  useEffect(() => {
    if (runtimeAvailability === "disabled" && stream.isBusy) stream.cancel();
  }, [runtimeAvailability, stream]);

  useEffect(() => {
    if (!isHydrated || !sessionId) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ sessionId, messages: messages.slice(-MAX_STORED_MESSAGES) }));
    } catch {
      // The chat remains usable when storage is blocked or full.
    }
  }, [isHydrated, messages, sessionId]);

  useEffect(() => {
    if (!isOpen) return;
    const media = window.matchMedia("(max-width: 767px)");
    const syncScrollLock = () => document.body.classList.toggle("chatbot-scroll-locked", media.matches);
    syncScrollLock();
    media.addEventListener("change", syncScrollLock);
    return () => {
      media.removeEventListener("change", syncScrollLock);
      document.body.classList.remove("chatbot-scroll-locked");
    };
  }, [isOpen]);

  const closePanel = useCallback((restoreFocus = true) => {
    isOpenRef.current = false;
    setIsOpen(false);
    if (restoreFocus) window.requestAnimationFrame(() => buttonRef.current?.focus({ preventScroll: true }));
  }, []);

  const clearConversation = useCallback(() => {
    if (stream.isBusy) stream.cancel();
    setMessages([]);
    setInput("");
    setSessionId(createUuid());
    announce("대화 기록을 지웠습니다. 새 대화를 시작할 수 있어요.");
  }, [announce, stream]);

  const sendMessage = useCallback((rawMessage: string) => {
    const message = rawMessage.trim();
    if (!isHydrated || !isChatOnline(runtimeAvailability) || stream.isBusy || message.length === 0 || message.length > 500) return false;

    const activeSessionId = sessionId || createUuid();
    const requestId = createUuid();
    // 진행 중인 요청이 있는지는 스트림 훅이 단독으로 정한다. 받아들여진 요청만 대화에 추가한다.
    if (!stream.sendChat({ requestId, sessionId: activeSessionId, message, history: buildHistory(messages) })) return false;

    if (!sessionId) setSessionId(activeSessionId);
    const userMessage: ChatMessage = { id: createUuid(), role: "user", content: message, delivery: "complete" };
    const assistantMessage: ChatMessage = { id: requestId, role: "assistant", content: "", delivery: "streaming", retryMessage: message };
    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");
    setAnnouncement("");
    return true;
  }, [isHydrated, messages, runtimeAvailability, sessionId, stream]);

  const openPanel = useCallback((question?: string) => {
    isOpenRef.current = true;
    setPendingQuestion(question?.trim() || null);
    setHasUnreadError(false);
    transitionAvailability({ type: "panel-opened" });
    setIsOpen(true);
  }, [transitionAvailability]);

  // 질문을 넘겨 연 경우, 연결 상태가 확인되면 바로 보낸다. 보낼 수 없으면 입력창에 남겨 둔다.
  useEffect(() => {
    if (!isOpen || !pendingQuestion || runtimeAvailability === "checking") return;
    const frame = window.requestAnimationFrame(() => {
      setPendingQuestion(null);
      if (!sendMessage(pendingQuestion)) setInput(pendingQuestion);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, pendingQuestion, runtimeAvailability, sendMessage]);

  const latestAssistant = useMemo(() => messages.findLast((message) => message.role === "assistant"), [messages]);
  const progressState = useChatProgress({
    requestKey: latestAssistant?.id ?? null,
    active: Boolean(latestAssistant && latestAssistant.delivery === "streaming" && stream.isBusy),
    hasSources: latestAssistant?.sources !== undefined,
    hasToken: Boolean(latestAssistant?.content),
    generating: stream.phase === "generating" || stream.phase === "streaming",
  });
  const slowNotice = useSlowNotice(progressState.waiting);

  const value = useMemo<ChatbotContextValue>(() => ({
    messages,
    phase: stream.phase,
    statusMessage: stream.statusMessage,
    canCancel: stream.canCancel,
    isBusy: stream.isBusy,
    input,
    setInput,
    isHydrated,
    runtimeAvailability,
    indexStats,
    announcement,
    isOpen,
    hasUnreadError,
    buttonRef,
    suggestions: SUGGESTED_QUESTIONS,
    progress: {
      step: progressState.step,
      waitSeconds: progressState.waitSeconds,
      sourceCount: latestAssistant?.sources ? latestAssistant.sources.length : null,
      slowNotice,
    },
    heroVisible,
    setHeroVisible,
    openPanel,
    closePanel,
    sendMessage,
    cancel: stream.cancel,
    clearConversation,
    refreshRuntimeAvailability,
  }), [announcement, clearConversation, closePanel, hasUnreadError, heroVisible, indexStats, input, isHydrated, isOpen, latestAssistant, messages, openPanel, progressState.step, progressState.waitSeconds, refreshRuntimeAvailability, runtimeAvailability, sendMessage, slowNotice, stream.cancel, stream.canCancel, stream.isBusy, stream.phase, stream.statusMessage]);

  return <ChatbotContext.Provider value={value}>{children}</ChatbotContext.Provider>;
}

const PANEL_STEP_LABELS = ["질문을 이해하는 중", "검색하는 중", "근거를 확인하는 중", "답변을 생성하는 중"] as const;

/** 패널 상태 줄에 쓰는 단계 문구. */
export function describeProgress(progress: ChatbotProgress, indexStats: ChatbotIndexStats | null) {
  switch (progress.step) {
    case CHAT_PROGRESS_STEP.understanding: return PANEL_STEP_LABELS[0];
    case CHAT_PROGRESS_STEP.searching: return indexStats ? `공개 페이지 ${indexStats.documents}개를 ${PANEL_STEP_LABELS[1]}` : `공개 콘텐츠를 ${PANEL_STEP_LABELS[1]}`;
    case CHAT_PROGRESS_STEP.grounding: return progress.sourceCount === null ? PANEL_STEP_LABELS[2] : progress.sourceCount ? `근거 ${progress.sourceCount}건 확인` : "근거를 찾지 못했어요";
    case CHAT_PROGRESS_STEP.generating: return `${PANEL_STEP_LABELS[3]} · ${progress.waitSeconds.toFixed(1)}초`;
    case CHAT_PROGRESS_STEP.idle:
    case CHAT_PROGRESS_STEP.done:
      return null;
  }
}
