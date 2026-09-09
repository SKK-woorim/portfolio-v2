import { describe, expect, it } from "vitest";
import { chatRequestSchema, chatSseEventSchema, isAllowedChatSourceUrl } from "./contracts";

describe("chat contracts", () => {
  it("accepts a bounded browser request", () => {
    const result = chatRequestSchema.safeParse({
      sessionId: "7bcad5d9-ff4f-4ca7-a234-a571965a9883",
      message: " RAG 프로젝트를 알려주세요. ",
      history: [{ role: "user", content: "주요 기술은 무엇인가요?" }],
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.message).toBe("RAG 프로젝트를 알려주세요.");
  });

  it("rejects excess history and unexpected fields", () => {
    const history = Array.from({ length: 5 }, () => ({ role: "user", content: "질문" }));
    expect(chatRequestSchema.safeParse({ sessionId: crypto.randomUUID(), message: "질문", history }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ sessionId: crypto.randomUUID(), message: "질문", history: [], admin: true }).success).toBe(false);
  });

  it.each(["/about", "/portfolio/rag-pipeline", "/blog/nextjs-16"])('allows internal source "%s"', (url) => {
    expect(isAllowedChatSourceUrl(url)).toBe(true);
  });

  it.each(["https://example.com", "//example.com", "/contact", "/portfolio/../admin", "/blog/Post"])('rejects source "%s"', (url) => {
    expect(isAllowedChatSourceUrl(url)).toBe(false);
  });

  it("rejects unknown SSE event fields", () => {
    expect(chatSseEventSchema.safeParse({ event: "token", data: { delta: "답변", url: "https://evil.example" } }).success).toBe(false);
  });
});
