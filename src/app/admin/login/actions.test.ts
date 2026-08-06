import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  redirect: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: authMocks.createClient }));
vi.mock("next/navigation", () => ({ redirect: authMocks.redirect }));

import { login } from "./actions";

function formData() {
  const data = new FormData();
  data.set("email", "woorim31@naver.com");
  data.set("password", "correct-password");
  return data;
}

describe("login", () => {
  const rpc = vi.fn();
  const signInWithPassword = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    authMocks.createClient.mockResolvedValue({ rpc, auth: { signInWithPassword } });
  });

  it("blocks a known locked account before password verification", async () => {
    rpc.mockResolvedValueOnce({ data: true, error: null });

    await expect(login({}, formData())).resolves.toEqual({ error: "로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요." });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("records only invalid credentials as failed attempts", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ error: null });
    signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials" } });

    await expect(login({}, formData())).resolves.toEqual({ error: "이메일 또는 비밀번호를 확인해 주세요." });
    expect(rpc).toHaveBeenNthCalledWith(1, "is_login_locked", { p_identifier: "woorim31@naver.com" });
    expect(rpc).toHaveBeenNthCalledWith(2, "record_failed_login_attempt", { p_identifier: "woorim31@naver.com" });
  });

  it("clears prior failures after a successful sign-in", async () => {
    rpc.mockResolvedValueOnce({ data: false, error: null }).mockResolvedValueOnce({ error: null });
    signInWithPassword.mockResolvedValue({ error: null });

    await login({}, formData());

    expect(rpc).toHaveBeenNthCalledWith(2, "clear_failed_login_attempt", { p_identifier: "woorim31@naver.com" });
    expect(authMocks.redirect).toHaveBeenCalledWith("/admin");
  });

  it("does not present a database failure as an account lock", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "RPC unavailable" } });

    await expect(login({}, formData())).resolves.toEqual({ error: "로그인 제한을 확인할 수 없습니다. 잠시 뒤 다시 시도해 주세요." });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });
});
