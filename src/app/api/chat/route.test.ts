import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const chatRouteMocks = vi.hoisted(() => ({
  consumeChatRateLimit: vi.fn(),
  getChatbotRuntimeStatus: vi.fn(),
  getPublicContentVersion: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/lib/chat/rate-limit", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chat/rate-limit")>("@/lib/chat/rate-limit");
  return { ...actual, consumeChatRateLimit: chatRouteMocks.consumeChatRateLimit };
});
vi.mock("@sentry/nextjs", () => ({ captureException: chatRouteMocks.captureException }));
vi.mock("@/lib/chat/public-content-version", () => ({ getPublicContentVersion: chatRouteMocks.getPublicContentVersion }));
vi.mock("@/lib/chat/cached-answers", async () => {
  const actual = await vi.importActual<typeof import("@/lib/chat/cached-answers")>("@/lib/chat/cached-answers");
  return {
    ...actual,
    cachedAnswers: actual.createCachedAnswerLookup({
      version: 1,
      generatedAt: "2026-11-10T00:00:00.000Z",
      contentVersion: "0123456789abcdef",
      entries: [{ question: "주요 기술 스택이 궁금해요", answer: "Python과 RAG를 주로 사용합니다. [S1]", sources: [{ id: "S1", title: "소개", type: "profile", url: "/about" }] }],
    }),
  };
});
vi.mock("@/lib/chat/runtime-status", () => ({
  getChatbotRuntimeStatus: chatRouteMocks.getChatbotRuntimeStatus,
  isChatbotMasterEnabled: () => process.env.CHATBOT_ENABLED === "true",
}));

import { POST } from "./route";

const sessionId = "7bcad5d9-ff4f-4ca7-a234-a571965a9883";
const validRequest = { sessionId, message: "RAG 프로젝트를 알려주세요.", history: [] };

function request(body: unknown) {
  return new Request("https://portfolio.example/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.10" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("POST /api/chat", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("CHATBOT_ENABLED", "true");
    vi.stubEnv("CHAT_BACKEND_URL", "https://chat.example");
    vi.stubEnv("CHAT_BACKEND_SECRET", "backend-secret-with-safe-length");
    vi.stubEnv("CHAT_RATE_LIMIT_SECRET", "rate-limit-secret");
    vi.stubEnv("CHAT_REQUEST_TIMEOUT_MS", "5000");
    chatRouteMocks.consumeChatRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    chatRouteMocks.getChatbotRuntimeStatus.mockResolvedValue({ enabled: true, updatedAt: null });
    chatRouteMocks.getPublicContentVersion.mockResolvedValue("0123456789abcdef");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("rejects an invalid request before rate limiting", async () => {
    const response = await POST(request({ sessionId, message: "", history: [] }));
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ code: "INVALID_REQUEST" });
    expect(chatRouteMocks.consumeChatRateLimit).not.toHaveBeenCalled();
  });

  it("blocks direct requests while the runtime connection is disabled", async () => {
    chatRouteMocks.getChatbotRuntimeStatus.mockResolvedValue({ enabled: false, updatedAt: "2026-08-24T00:00:00Z" });
    const response = await POST(request(validRequest));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ code: "CHATBOT_DISABLED" });
    expect(chatRouteMocks.consumeChatRateLimit).not.toHaveBeenCalled();
  });

  it("requires a JSON content type", async () => {
    const plainTextRequest = new Request("https://portfolio.example/api/chat", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: JSON.stringify(validRequest),
    });
    const response = await POST(plainTextRequest);
    expect(response.status).toBe(415);
    expect(chatRouteMocks.consumeChatRateLimit).not.toHaveBeenCalled();
  });

  it("returns a bounded retry response when the rate limit is exhausted", async () => {
    chatRouteMocks.consumeChatRateLimit.mockResolvedValue({ allowed: false, retryAfterSeconds: 37 });
    const response = await POST(request(validRequest));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("37");
    expect(await response.json()).toMatchObject({ code: "RATE_LIMITED", retryAfterSeconds: 37 });
  });

  it("signs and relays validated backend SSE events", async () => {
    vi.stubGlobal("fetch", vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const requestId = new Headers(init?.headers).get("x-chat-request-id");
      return new Response([
        'event: sources\ndata: {"items":[{"id":"S1","title":"RAG","type":"portfolio","url":"/portfolio/rag"}]}\n\n',
        'event: status\ndata: {"phase":"generating","message":"답변을 생성하고 있어요."}\n\n',
        'event: token\ndata: {"delta":"근거 있는 답변"}\n\n',
        `event: done\ndata: {"requestId":"${requestId}","finishReason":"stop"}\n\n`,
      ].join(""), { headers: { "content-type": "text/event-stream" } });
    }));

    const response = await POST(request(validRequest));
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const stream = await response.text();
    expect(stream).toContain('{"phase":"accepted"');
    expect(stream).toContain('{"phase":"searching"');
    expect(stream).toContain('{"phase":"generating"');
    expect(stream).toContain('event: token\ndata: {"delta":"근거 있는 답변"}');
    expect(stream).toContain('"finishReason":"stop"');

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, init] = fetchMock.mock.calls[0];
    const headers = new Headers(init?.headers);
    expect(headers.get("x-chat-signature")).toMatch(/^[a-f0-9]{64}$/);
    expect(init?.body).toBe(JSON.stringify(validRequest));
  });

  it("does not relay an untrusted source URL", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(
      'event: sources\ndata: {"items":[{"id":"S1","title":"외부","type":"post","url":"https://evil.example"}]}\n\n',
      { headers: { "content-type": "text/event-stream" } },
    )));
    const response = await POST(request(validRequest));
    const stream = await response.text();
    expect(stream).not.toContain("evil.example");
    expect(stream).toContain('"code":"MODEL_UNAVAILABLE"');
    expect(chatRouteMocks.captureException).toHaveBeenCalledOnce();
  });

  describe("cached answers", () => {
    const cachedRequest = { sessionId, message: "  주요 기술 스택이   궁금해요 ", history: [] };

    it("streams a stored answer without rate limiting or calling the backend", async () => {
      vi.stubGlobal("fetch", vi.fn());
      const response = await POST(request(cachedRequest));
      expect(response.status).toBe(200);
      const stream = await response.text();
      expect(stream).toContain('event: sources\ndata: {"items":[{"id":"S1","title":"소개","type":"profile","url":"/about"}]}');
      const answer = [...stream.matchAll(/event: token\ndata: (.+)/g)].map((match) => (JSON.parse(match[1]) as { delta: string }).delta).join("");
      expect(answer).toBe("Python과 RAG를 주로 사용합니다. [S1]");
      expect(stream).toMatch(/event: done\ndata: \{"requestId":"[0-9a-f-]{36}","finishReason":"stop","cached":true\}/);
      expect(fetch).not.toHaveBeenCalled();
      expect(chatRouteMocks.consumeChatRateLimit).not.toHaveBeenCalled();
    });

    it("falls back to live generation when public content changed after the answers were stored", async () => {
      chatRouteMocks.getPublicContentVersion.mockResolvedValue("fedcba9876543210");
      vi.stubGlobal("fetch", vi.fn(async () => new Response('event: error\ndata: {"code":"MODEL_BUSY","message":"busy"}\n\n', { headers: { "content-type": "text/event-stream" } })));
      const stream = await (await POST(request(cachedRequest))).text();
      expect(fetch).toHaveBeenCalledOnce();
      expect(stream).not.toContain('"cached":true');
    });

    it("falls back to live generation when the content version cannot be read", async () => {
      chatRouteMocks.getPublicContentVersion.mockRejectedValue(new Error("supabase down"));
      vi.stubGlobal("fetch", vi.fn(async () => new Response('event: error\ndata: {"code":"MODEL_BUSY","message":"busy"}\n\n', { headers: { "content-type": "text/event-stream" } })));
      await (await POST(request(cachedRequest))).text();
      expect(fetch).toHaveBeenCalledOnce();
      expect(chatRouteMocks.captureException).toHaveBeenCalledOnce();
    });

    it("lets the generation script bypass stored answers", async () => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response('event: error\ndata: {"code":"MODEL_BUSY","message":"busy"}\n\n', { headers: { "content-type": "text/event-stream" } })));
      const bypass = new Request("https://portfolio.example/api/chat", { method: "POST", headers: { "content-type": "application/json", "x-chat-cache": "bypass" }, body: JSON.stringify(cachedRequest) });
      await (await POST(bypass)).text();
      expect(fetch).toHaveBeenCalledOnce();
      expect(chatRouteMocks.getPublicContentVersion).not.toHaveBeenCalled();
    });

    it("still refuses stored answers while the chatbot is switched off", async () => {
      chatRouteMocks.getChatbotRuntimeStatus.mockResolvedValue({ enabled: false, updatedAt: null });
      const response = await POST(request(cachedRequest));
      expect(response.status).toBe(503);
    });
  });
});
