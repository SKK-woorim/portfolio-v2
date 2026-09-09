import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getReadinessStatus,
  probePublishedContent,
  readChatbotBackendHealth,
} from "./readiness";

const backendConfig = {
  chatUrl: "https://rag.example/v1/chat",
  healthUrl: "https://rag.example/health",
  secret: "shared-secret-with-32-random-chars",
};

afterEach(() => vi.unstubAllGlobals());

describe("readiness", () => {
  it("reports ready when core content, relay configuration, and the enabled backend are ready", async () => {
    const readPublishedContent = vi.fn(async () => undefined);
    const readChatbotBackendHealth = vi.fn(async () => undefined);
    const status = await getReadinessStatus({
      hasSupabaseConfig: () => true,
      readPublishedContent,
      isChatbotMasterEnabled: () => true,
      getChatbotRuntimeStatus: async () => ({ enabled: true, updatedAt: "2026-09-07T00:00:00.000Z" }),
      getChatBackendConfig: () => backendConfig,
      readChatbotBackendHealth,
    });

    expect(status).toEqual({
      status: "ready",
      components: {
        supabaseConfig: "ready",
        publishedContent: "ready",
        chatbotRelay: "ready",
        chatbotBackend: "ready",
      },
    });
    expect(readPublishedContent).toHaveBeenCalledOnce();
    expect(readChatbotBackendHealth).toHaveBeenCalledWith(backendConfig.healthUrl, expect.any(AbortSignal));
  });

  it("does not probe chatbot dependencies when chat is intentionally disabled", async () => {
    const getChatbotRuntimeStatus = vi.fn(async () => ({ enabled: true, updatedAt: null }));
    const readChatbotBackendHealth = vi.fn(async () => undefined);
    const status = await getReadinessStatus({
      hasSupabaseConfig: () => true,
      readPublishedContent: async () => undefined,
      isChatbotMasterEnabled: () => false,
      getChatbotRuntimeStatus,
      getChatBackendConfig: () => backendConfig,
      readChatbotBackendHealth,
    });

    expect(status.status).toBe("ready");
    expect(status.components.chatbotRelay).toBe("disabled");
    expect(status.components.chatbotBackend).toBe("disabled");
    expect(getChatbotRuntimeStatus).not.toHaveBeenCalled();
    expect(readChatbotBackendHealth).not.toHaveBeenCalled();
  });

  it("treats an administrator-disabled runtime as ready without contacting the backend", async () => {
    const readChatbotBackendHealth = vi.fn(async () => undefined);
    const status = await getReadinessStatus({
      hasSupabaseConfig: () => true,
      readPublishedContent: async () => undefined,
      isChatbotMasterEnabled: () => true,
      getChatbotRuntimeStatus: async () => ({ enabled: false, updatedAt: null }),
      getChatBackendConfig: () => backendConfig,
      readChatbotBackendHealth,
    });

    expect(status.status).toBe("ready");
    expect(status.components.chatbotRelay).toBe("disabled");
    expect(status.components.chatbotBackend).toBe("disabled");
    expect(readChatbotBackendHealth).not.toHaveBeenCalled();
  });

  it("does not issue dependency probes when public Supabase configuration is missing", async () => {
    const readPublishedContent = vi.fn(async () => undefined);
    const getChatbotRuntimeStatus = vi.fn(async () => ({ enabled: true, updatedAt: null }));
    const readChatbotBackendHealth = vi.fn(async () => undefined);
    const status = await getReadinessStatus({
      hasSupabaseConfig: () => false,
      readPublishedContent,
      isChatbotMasterEnabled: () => true,
      getChatbotRuntimeStatus,
      getChatBackendConfig: () => backendConfig,
      readChatbotBackendHealth,
    });

    expect(status).toEqual({
      status: "not_ready",
      components: {
        supabaseConfig: "not_ready",
        publishedContent: "not_ready",
        chatbotRelay: "not_ready",
        chatbotBackend: "not_ready",
      },
    });
    expect(readPublishedContent).not.toHaveBeenCalled();
    expect(getChatbotRuntimeStatus).not.toHaveBeenCalled();
    expect(readChatbotBackendHealth).not.toHaveBeenCalled();
  });

  it("aborts and fails the content probe after its short timeout", async () => {
    vi.useFakeTimers();
    try {
      let receivedSignal: AbortSignal | undefined;
      const probe = probePublishedContent(async (signal) => {
        receivedSignal = signal;
        await new Promise<void>(() => undefined);
      }, 25);

      await vi.advanceTimersByTimeAsync(25);
      await expect(probe).resolves.toBe("not_ready");
      expect(receivedSignal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("propagates a cancelled request to concurrent dependency probes", async () => {
    const requestController = new AbortController();
    const receivedSignals: AbortSignal[] = [];
    const pending = (signal: AbortSignal) => {
      receivedSignals.push(signal);
      return new Promise<void>(() => undefined);
    };
    const statusPromise = getReadinessStatus({
      hasSupabaseConfig: () => true,
      readPublishedContent: pending,
      isChatbotMasterEnabled: () => true,
      getChatbotRuntimeStatus: async (signal) => {
        if (signal) receivedSignals.push(signal);
        return new Promise(() => undefined);
      },
      getChatBackendConfig: () => backendConfig,
      readChatbotBackendHealth: async () => undefined,
    }, requestController.signal);

    requestController.abort();
    const status = await statusPromise;

    expect(status.status).toBe("not_ready");
    expect(receivedSignals).toHaveLength(2);
    expect(receivedSignals.every((signal) => signal.aborted)).toBe(true);
  });

  it("reports an enabled but unavailable backend without exposing configuration or errors", async () => {
    const privateDetail = "https://secret.example/health?key=secret-value";
    const status = await getReadinessStatus({
      hasSupabaseConfig: () => true,
      readPublishedContent: async () => undefined,
      isChatbotMasterEnabled: () => true,
      getChatbotRuntimeStatus: async () => ({ enabled: true, updatedAt: null }),
      getChatBackendConfig: () => ({ ...backendConfig, healthUrl: privateDetail }),
      readChatbotBackendHealth: async () => {
        throw new Error(privateDetail);
      },
    });

    expect(status).toEqual({
      status: "not_ready",
      components: {
        supabaseConfig: "ready",
        publishedContent: "ready",
        chatbotRelay: "ready",
        chatbotBackend: "not_ready",
      },
    });
    expect(JSON.stringify(status)).not.toContain(privateDetail);
    expect(JSON.stringify(status)).not.toContain("secret-value");
  });

  it("accepts only the bounded ready contract from the backend health endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      status: "ok",
      embeddingReady: true,
      modelReady: true,
      generation: { running: 0, waiting: 0, maxWaiters: 5 },
    })));

    await expect(readChatbotBackendHealth(
      backendConfig.healthUrl,
      new AbortController().signal,
    )).resolves.toBeUndefined();

    vi.mocked(fetch).mockResolvedValueOnce(Response.json({
      status: "ok",
      embeddingReady: true,
      modelReady: false,
    }));
    await expect(readChatbotBackendHealth(
      backendConfig.healthUrl,
      new AbortController().signal,
    )).rejects.toThrow(/not ready/i);
  });

  it("stops reading a chunked backend health response above 4 KiB", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("x".repeat(4_097)));
        controller.close();
      },
    }), { status: 200 })));

    await expect(readChatbotBackendHealth(
      backendConfig.healthUrl,
      new AbortController().signal,
    )).rejects.toThrow(/too large/i);
  });
});
