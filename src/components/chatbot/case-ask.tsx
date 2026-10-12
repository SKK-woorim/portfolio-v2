"use client";

import { MessageCircle } from "lucide-react";
import { useChatbot } from "./chatbot-context";

/** 프로젝트 상세에서 그 사례에 대한 질문으로 바로 대화를 연다. 챗봇을 쓸 수 없으면 숨긴다. */
export function CaseAsk({ questions }: { questions: string[] }) {
  const chatbot = useChatbot();
  if (!chatbot || chatbot.runtimeAvailability === "disabled" || chatbot.runtimeAvailability === "unavailable") return null;
  return (
    <div className="case-ask">
      <p><MessageCircle size={14} aria-hidden="true" />이 사례에 대해 묻기</p>
      {questions.map((question) => (
        <button key={question} type="button" className="focus-ring" onClick={() => chatbot.openPanel(question)}>{question}</button>
      ))}
    </div>
  );
}
