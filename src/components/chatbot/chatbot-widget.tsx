"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { ChatbotButton } from "./chatbot-button";
import { ChatbotProvider, describeProgress, SUGGESTED_QUESTIONS, useChatbot } from "./chatbot-context";
import { ChatbotPanel } from "./chatbot-panel";
import { ChatbotSlowNotice } from "./chatbot-slow-notice";

export { SUGGESTED_QUESTIONS };

const TEASER_STORAGE_KEY = "portfolio-chatbot-teaser-seen";
const TEASER_DELAY_MS = 700;

function readTeaserSeen() {
  try {
    return window.localStorage.getItem(TEASER_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markTeaserSeen() {
  try {
    window.localStorage.setItem(TEASER_STORAGE_KEY, "1");
  } catch {
    // The teaser only shows once per page view when storage is blocked.
  }
}

function ChatbotFloating() {
  const chatbot = useChatbot()!;
  const [teaserVisible, setTeaserVisible] = useState(false);
  const { isOpen, heroVisible, runtimeAvailability } = chatbot;
  const away = heroVisible && !isOpen;

  // 버튼이 처음 보일 때 연결된 상태라면 안내 말풍선을 한 번 띄운다.
  useEffect(() => {
    if (away || isOpen || runtimeAvailability !== "enabled" || readTeaserSeen()) return;
    const timer = window.setTimeout(() => setTeaserVisible(true), TEASER_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [away, isOpen, runtimeAvailability]);

  const showTeaser = teaserVisible && !away && !isOpen && runtimeAvailability === "enabled";

  function dismissTeaser() {
    markTeaserSeen();
    setTeaserVisible(false);
  }

  return (
    <>
      <ChatbotButton
        buttonRef={chatbot.buttonRef}
        isOpen={isOpen}
        isAway={away}
        pulse={showTeaser}
        hasUnreadError={chatbot.hasUnreadError}
        runtimeAvailability={runtimeAvailability}
        onClick={() => {
          dismissTeaser();
          chatbot.openPanel();
        }}
      />
      {showTeaser ? (
        <div className="chatbot-teaser" role="status">
          <button type="button" className="chatbot-teaser-body focus-ring" onClick={() => { dismissTeaser(); chatbot.openPanel(); }}>
            프로젝트나 기술이 궁금하면 물어보세요.
            <small>공개된 글과 프로젝트를 근거로 답해요</small>
          </button>
          <button type="button" className="chatbot-teaser-close focus-ring" aria-label="안내 닫기" onClick={dismissTeaser}>
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {isOpen ? (
        <ChatbotPanel
          messages={chatbot.messages}
          phase={chatbot.phase}
          statusMessage={describeProgress(chatbot.progress, chatbot.indexStats) ?? chatbot.statusMessage}
          canCancel={chatbot.canCancel}
          input={chatbot.input}
          isReady={chatbot.isHydrated && runtimeAvailability === "enabled"}
          runtimeAvailability={runtimeAvailability}
          announcement={chatbot.announcement}
          suggestedQuestions={chatbot.suggestions}
          slowNotice={<ChatbotSlowNotice show={chatbot.progress.slowNotice} modelLabel={chatbot.modelLabel} />}
          onInputChange={chatbot.setInput}
          onSubmit={chatbot.sendMessage}
          onRetry={chatbot.sendMessage}
          onCancel={chatbot.cancel}
          onRefreshStatus={() => void chatbot.refreshRuntimeAvailability()}
          onClose={chatbot.closePanel}
          onClearConversation={chatbot.clearConversation}
          onNavigate={() => chatbot.closePanel(false)}
        />
      ) : null}
    </>
  );
}

/** 우측 하단 챗봇 버튼과 패널. 사이트 레이아웃의 ChatbotProvider 밖에서는 스스로 Provider를 만든다. */
export function ChatbotWidget() {
  const chatbot = useChatbot();
  if (!chatbot) {
    return (
      <ChatbotProvider>
        <ChatbotFloating />
      </ChatbotProvider>
    );
  }
  return <ChatbotFloating />;
}
