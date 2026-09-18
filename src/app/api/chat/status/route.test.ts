import { beforeEach, describe, expect, it, vi } from "vitest";

const statusMocks = vi.hoisted(() => ({
  getChatbotRuntimeStatus: vi.fn(),
  captureException: vi.fn(),
}));

vi.mock("@/lib/chat/runtime-status", () => ({ getChatbotRuntimeStatus: statusMocks.getChatbotRuntimeStatus }));
vi.mock("@sentry/nextjs", () => ({ captureException: statusMocks.captureException }));

import { GET } from "./route";

describe("GET /api/chat/status", () => {
  beforeEach(() => vi.resetAllMocks());

  it("returns the current runtime connection without caching", async () => {
    statusMocks.getChatbotRuntimeStatus.mockResolvedValue({ enabled: true, updatedAt: null });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    await expect(response.json()).resolves.toEqual({ status: "enabled", enabled: true });
  });

  it("distinguishes an intentional disabled state from an unavailable store", async () => {
    statusMocks.getChatbotRuntimeStatus.mockResolvedValue({ enabled: false, updatedAt: null });
    const response = await GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "disabled", enabled: false });
  });

  it("fails closed when the status store is unavailable", async () => {
    statusMocks.getChatbotRuntimeStatus.mockRejectedValue(new Error("database unavailable"));
    const response = await GET();
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable", enabled: false });
    expect(statusMocks.captureException).toHaveBeenCalledOnce();
  });
});
