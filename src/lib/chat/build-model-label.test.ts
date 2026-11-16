import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./backend-config", () => ({
  getChatBackendConfig: () => ({ healthUrl: "https://backend.example/health" }),
}));

import { getBuildModelLabel } from "./build-model-label";

function health(modelLabel?: unknown) {
  return Response.json({
    status: "ok", modelReady: true, embeddingReady: true, modelLabel,
    modelPath: "/private/model.gguf", secret: "private-value",
  });
}

describe("chatbot model discovery at build/start", () => {
  beforeEach(() => vi.stubGlobal("fetch", vi.fn()));
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

  it("discovers the model configured at each build/start", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(health("Gemma 4 E2B"))
      .mockResolvedValueOnce(health("HyperCLOVA X 1.5B · Q8_0"));
    expect(await getBuildModelLabel()).toBe("Gemma 4 E2B");
    expect(await getBuildModelLabel()).toBe("HyperCLOVA X 1.5B · Q8_0");
    expect(fetch).toHaveBeenLastCalledWith("https://backend.example/health", expect.objectContaining({
      cache: "no-store", signal: expect.any(AbortSignal),
    }));
  });

  it.each([undefined, "", 123, "x".repeat(81), "invalid\nlabel"])("ignores missing or invalid labels (%s)", async (label) => {
    vi.mocked(fetch).mockResolvedValueOnce(health(label));
    expect(await getBuildModelLabel()).toBe("서버 모델");
  });

  it("keeps metadata optional when the backend is unavailable", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect(await getBuildModelLabel()).toBe("서버 모델");
    vi.mocked(fetch).mockRejectedValueOnce(new DOMException("Timeout", "TimeoutError"));
    expect(await getBuildModelLabel()).toBe("서버 모델");
  });

  it("rejects oversized metadata responses", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response("x".repeat(4_097)));
    expect(await getBuildModelLabel()).toBe("서버 모델");
  });

  it("uses the explicit fallback only when discovery is unavailable", async () => {
    vi.stubEnv("NEXT_PUBLIC_CHATBOT_MODEL_LABEL", "Configured fallback");
    vi.mocked(fetch).mockRejectedValueOnce(new Error("unavailable"));
    expect(await getBuildModelLabel()).toBe("Configured fallback");
  });
});
