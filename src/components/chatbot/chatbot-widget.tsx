"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChatbotButton } from "./chatbot-button";
import { ChatbotPanel } from "./chatbot-panel";
import { sanitizeChatSources } from "./chatbot-sources";
import type { ChatbotRuntimeAvailability, ChatHistoryMessage, ChatMessage, ChatStreamError } from "./chatbot-types";
import { useChatStream } from "./use-chat-stream";

const STORAGE_KEY = "portfolio-chatbot-session-v2";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_STORED_MESSAGES = 40;
const RUNTIME_STATUS_POLL_MS = 15_000;

export const SUGGESTED_QUESTIONS = [
  "주요 기술 스택이 궁금해요",
  "RAG 관련 프로젝트를 알려주세요",
  "최근 블로그 글을 요약해 주세요",
  "어떤 분야의 협업이 가능한가요?",
] as const;

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

    const storedDelivery = item.delivery;
    const delivery = storedDelivery === "complete" || storedDelivery === "cancelled" || storedDelivery === "error"
      ? storedDelivery
      : "cancelled";
    const retryMessage = typeof item.retryMessage === "string" && item.retryMessage.length <= 500
      ? item.retryMessage
      : undefined;
    const errorCode = typeof item.errorCode === "string" && item.errorCode.length <= 80 ? item.errorCode : undefined;
    const sources = sanitizeChatSources(item.sources);

    messages.push({
      id: String(item.id),
      role: item.role,
      content: interruptedWithoutContent ? "이전 답변 연결이 종료되었어요. 다시 시도해 주세요." : item.content,
      delivery,
      ...(sources.length ? { sources } : {}),
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

export function ChatbotWidget() {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const announcementSequenceRef = useRef(0);
  const submitLockRef = useRef(false);
  const isOpenRef = useRef(false);
  const [isOpen, setIsOpen] = useState(false);
  const [isHydrated, setIsHydrated] = useState(false);
  const [sessionId, setSessionId] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [hasUnreadError, setHasUnreadError] = useState(false);
  const [runtimeAvailability, setRuntimeAvailability] = useState<ChatbotRuntimeAvailability>("checking");

  const refreshRuntimeAvailability = useCallback(async () => {
    try {
      const response = await fetch("/api/chat/status", { cache: "no-store", headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error("Chatbot status request failed");
      const payload: unknown = await response.json();
      const enabled = typeof payload === "object" && payload !== null && !Array.isArray(payload)
        && (payload as { enabled?: unknown }).enabled === true;
      setRuntimeAvailability(enabled ? "enabled" : "disabled");
    } catch {
      setRuntimeAvailability("disabled");
    }
  }, []);

  const announce = useCallback((message: string) => {
    announcementSequenceRef.current += 1;
    setAnnouncement(`${message} (${announcementSequenceRef.current})`);
  }, []);

  const stream = useChatStream({
    onSources(requestId, sources) {
      setMessages((current) => current.map((message) => message.id === requestId ? { ...message, sources } : message));
    },
    onToken(requestId, delta) {
      setMessages((current) => current.map((message) => message.id === requestId
        ? { ...message, content: `${message.content}${delta}`, delivery: "streaming" }
        : message));
    },
    onComplete(requestId) {
      submitLockRef.current = false;
      setMessages((current) => current.map((message) => message.id === requestId ? { ...message, delivery: "complete" } : message));
      announce("챗봇 답변이 완료되었습니다.");
    },
    onError(requestId, error: ChatStreamError) {
      submitLockRef.current = false;
      if (error.code === "CHATBOT_DISABLED") setRuntimeAvailability("disabled");
      setMessages((current) => current.map((message) => message.id === requestId
        ? { ...message, content: error.message, delivery: "error", errorCode: error.code }
        : message));
      if (!isOpenRef.current) setHasUnreadError(true);
      announce(error.message);
    },
    onCancel(requestId) {
      submitLockRef.current = false;
      setMessages((current) => current.map((message) => message.id === requestId
        ? { ...message, content: message.content || "답변 생성을 취소했어요.", delivery: "cancelled" }
        : message));
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
    if (!isOpen) return;
    const timeout = window.setTimeout(() => void refreshRuntimeAvailability(), 0);
    const interval = window.setInterval(() => void refreshRuntimeAvailability(), RUNTIME_STATUS_POLL_MS);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [isOpen, refreshRuntimeAvailability]);

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

  const closePanel = useCallback(() => {
    isOpenRef.current = false;
    setIsOpen(false);
    window.requestAnimationFrame(() => buttonRef.current?.focus({ preventScroll: true }));
  }, []);

  const sendMessage = useCallback((rawMessage: string) => {
    const message = rawMessage.trim();
    if (!isHydrated || runtimeAvailability !== "enabled" || stream.isBusy || submitLockRef.current || message.length === 0 || message.length > 500) return;
    submitLockRef.current = true;

    const activeSessionId = sessionId || createUuid();
    if (!sessionId) setSessionId(activeSessionId);
    const requestId = createUuid();
    const userMessage: ChatMessage = {
      id: createUuid(),
      role: "user",
      content: message,
      delivery: "complete",
    };
    const assistantMessage: ChatMessage = {
      id: requestId,
      role: "assistant",
      content: "",
      delivery: "streaming",
      retryMessage: message,
    };
    const history = buildHistory(messages);

    setMessages((current) => [...current, userMessage, assistantMessage]);
    setInput("");
    setAnnouncement("");
    void stream.sendChat({ requestId, sessionId: activeSessionId, message, history });
  }, [isHydrated, messages, runtimeAvailability, sessionId, stream]);

  return (
    <>
      <ChatbotButton
        buttonRef={buttonRef}
        isOpen={isOpen}
        hasUnreadError={hasUnreadError}
        onClick={() => {
          isOpenRef.current = true;
          setHasUnreadError(false);
          setRuntimeAvailability("checking");
          setIsOpen(true);
        }}
      />
      {isOpen ? (
        <ChatbotPanel
          messages={messages}
          phase={stream.phase}
          statusMessage={stream.statusMessage}
          canCancel={stream.canCancel}
          input={input}
          isReady={isHydrated && runtimeAvailability === "enabled"}
          runtimeAvailability={runtimeAvailability}
          announcement={announcement}
          suggestedQuestions={SUGGESTED_QUESTIONS}
          onInputChange={setInput}
          onSubmit={sendMessage}
          onRetry={sendMessage}
          onCancel={stream.cancel}
          onRefreshStatus={() => void refreshRuntimeAvailability()}
          onClose={closePanel}
        />
      ) : null}
    </>
  );
}
