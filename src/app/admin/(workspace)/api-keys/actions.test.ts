import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  revalidatePath: vi.fn(),
  rpc: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));

import { getAiProviderKeyMetadata } from "@/lib/ai-provider-keys";
import { updateAiProviderKey } from "./actions";

describe("admin AI provider keys", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "example-publishable-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "example-service-role-key");
    mocks.requireAdmin.mockResolvedValue({ id: "admin" });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
  });

  afterEach(() => vi.unstubAllEnvs());

  function inputs(operation: string, apiKey?: string) {
    const formData = new FormData();
    formData.set("operation", operation);
    if (apiKey !== undefined) formData.set("apiKey", apiKey);
    return formData;
  }

  it("authorizes a save before accessing Vault", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Unauthorized"));

    await expect(updateAiProviderKey("openai", {}, inputs("save", "sample-key"))).rejects.toThrow("Unauthorized");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("saves a trimmed key and revalidates the manager without returning the value", async () => {
    await expect(updateAiProviderKey("openai", {}, inputs("save", " sample-key ")))
      .resolves.toEqual({ success: "API 키를 저장했습니다." });
    expect(mocks.rpc).toHaveBeenCalledWith("set_ai_provider_key", { p_provider: "openai", p_api_key: "sample-key" });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/admin/api-keys");
  });

  it("rejects unknown providers and invalid credential input without deleting anything", async () => {
    await expect(updateAiProviderKey("local", {}, inputs("delete"))).resolves.toHaveProperty("error");
    await expect(updateAiProviderKey("openai", {}, inputs("save", ""))).resolves.toHaveProperty("error");
    await expect(updateAiProviderKey("openai", {}, inputs("save", "broken\nkey"))).resolves.toHaveProperty("error");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("sends a null value only for an explicit delete", async () => {
    await expect(updateAiProviderKey("gemini", {}, inputs("delete"))).resolves.toHaveProperty("success");
    expect(mocks.rpc).toHaveBeenCalledWith("set_ai_provider_key", { p_provider: "gemini", p_api_key: null });
  });

  it("requests metadata only and strips unexpected credential fields", async () => {
    const metadata = { provider: "openai", updated_at: "2026-11-18T00:00:00+00:00" };
    mocks.rpc.mockResolvedValue({ data: [{ ...metadata, api_key: "sample-key" }], error: null });

    await expect(getAiProviderKeyMetadata()).resolves.toEqual([metadata]);
    expect(mocks.rpc).toHaveBeenCalledWith("get_ai_provider_keys", { p_include_values: false });
  });

  it("handles a storage failure without returning the upstream error", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "failed to save sample-key" } });

    await expect(updateAiProviderKey("openai", {}, inputs("save", "sample-key")))
      .resolves.toEqual({ error: "API 키 설정을 변경하지 못했습니다. 다시 시도하세요." });
    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });
});
