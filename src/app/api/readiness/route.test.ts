import { beforeEach, describe, expect, it, vi } from "vitest";

const readinessMocks = vi.hoisted(() => ({ getReadinessStatus: vi.fn() }));

vi.mock("@/lib/health/readiness", () => ({ getReadinessStatus: readinessMocks.getReadinessStatus }));

import { GET } from "./route";

describe("GET /api/readiness", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns a no-store ready response with coarse component statuses", async () => {
    readinessMocks.getReadinessStatus.mockResolvedValue({
      status: "ready",
      components: { supabaseConfig: "ready", publishedContent: "ready", chatbotRelay: "disabled", chatbotBackend: "disabled" },
    });

    const response = await GET(new Request("https://portfolio.example/api/readiness"));

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({
      status: "ready",
      components: { supabaseConfig: "ready", publishedContent: "ready", chatbotRelay: "disabled", chatbotBackend: "disabled" },
    });
  });

  it("returns 503 without exposing dependency details when not ready", async () => {
    readinessMocks.getReadinessStatus.mockResolvedValue({
      status: "not_ready",
      components: { supabaseConfig: "ready", publishedContent: "not_ready", chatbotRelay: "ready", chatbotBackend: "not_ready" },
    });

    const response = await GET(new Request("https://portfolio.example/api/readiness"));

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({
      status: "not_ready",
      components: { supabaseConfig: "ready", publishedContent: "not_ready", chatbotRelay: "ready", chatbotBackend: "not_ready" },
    });
    expect(JSON.stringify(body)).not.toMatch(/error|stack|secret|https?:/i);
  });
});
