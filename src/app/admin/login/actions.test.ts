import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createLoginRateLimitContext: vi.fn(),
  finalizeLoginAttempt: vi.fn(),
  headers: vi.fn(),
  redirect: vi.fn(),
  reserveLoginAttempt: vi.fn(),
}));

vi.mock("@/lib/auth/login-rate-limit", () => ({
  createLoginRateLimitContext: authMocks.createLoginRateLimitContext,
  finalizeLoginAttempt: authMocks.finalizeLoginAttempt,
  reserveLoginAttempt: authMocks.reserveLoginAttempt,
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: authMocks.createClient }));
vi.mock("next/headers", () => ({ headers: authMocks.headers }));
vi.mock("next/navigation", () => ({ redirect: authMocks.redirect }));

import { login } from "./actions";

const RATE_LIMIT_CONTEXT = { emailHash: "a".repeat(64), ipHash: "b".repeat(64) };
const RESERVATION_TOKEN = "7bcad5d9-ff4f-4ca7-a234-a571965a9883";
const REJECTED_MESSAGE = "이메일 또는 비밀번호를 확인하거나 잠시 후 다시 시도해 주세요.";
const TEMPORARY_MESSAGE = "로그인 요청을 처리하지 못했습니다. 잠시 뒤 다시 시도해 주세요.";

function formData() {
  const data = new FormData();
  data.set("email", "Woorim31@Naver.com");
  data.set("password", "correct-password");
  return data;
}

describe("login", () => {
  const signInWithPassword = vi.fn();
  const signOut = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    authMocks.headers.mockResolvedValue(new Headers({ "x-vercel-forwarded-for": "203.0.113.24" }));
    authMocks.createLoginRateLimitContext.mockReturnValue(RATE_LIMIT_CONTEXT);
    authMocks.reserveLoginAttempt.mockResolvedValue({
      allowed: true,
      retryAfterSeconds: 0,
      reservationToken: RESERVATION_TOKEN,
    });
    authMocks.finalizeLoginAttempt.mockResolvedValue(undefined);
    signOut.mockResolvedValue({ error: null });
    authMocks.createClient.mockResolvedValue({ auth: { signInWithPassword, signOut } });
  });

  it("atomically reserves trusted email and IP capacity before password verification", async () => {
    authMocks.reserveLoginAttempt.mockResolvedValue({
      allowed: false,
      retryAfterSeconds: 600,
      reservationToken: null,
    });

    await expect(login({}, formData())).resolves.toEqual({ error: REJECTED_MESSAGE });
    expect(authMocks.createLoginRateLimitContext).toHaveBeenCalledWith("woorim31@naver.com", expect.any(Headers));
    expect(authMocks.reserveLoginAttempt).toHaveBeenCalledWith(RATE_LIMIT_CONTEXT);
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("finalizes only invalid credentials as a failed attempt", async () => {
    signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials" } });

    await expect(login({}, formData())).resolves.toEqual({ error: REJECTED_MESSAGE });
    expect(authMocks.finalizeLoginAttempt).toHaveBeenCalledWith(RESERVATION_TOKEN, "failure");
  });

  it("finalizes a reservation after a successful sign-in", async () => {
    signInWithPassword.mockResolvedValue({ error: null });

    await login({}, formData());

    expect(signInWithPassword).toHaveBeenCalledWith({ email: "woorim31@naver.com", password: "correct-password" });
    expect(authMocks.reserveLoginAttempt.mock.invocationCallOrder[0]).toBeLessThan(signInWithPassword.mock.invocationCallOrder[0]);
    expect(authMocks.finalizeLoginAttempt).toHaveBeenCalledWith(RESERVATION_TOKEN, "success");
    expect(authMocks.redirect).toHaveBeenCalledWith("/admin");
  });

  it("releases a reservation without counting infrastructure failures", async () => {
    signInWithPassword.mockResolvedValue({ error: { code: "service_unavailable" } });

    await expect(login({}, formData())).resolves.toEqual({ error: TEMPORARY_MESSAGE });
    expect(authMocks.finalizeLoginAttempt).toHaveBeenCalledWith(RESERVATION_TOKEN, "abandoned");
  });

  it("fails closed when the limiter reservation is unavailable", async () => {
    authMocks.reserveLoginAttempt.mockRejectedValue(new Error("RPC unavailable"));

    await expect(login({}, formData())).resolves.toEqual({ error: TEMPORARY_MESSAGE });
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it("fails closed when an invalid credential reservation cannot be finalized", async () => {
    signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials" } });
    authMocks.finalizeLoginAttempt.mockRejectedValue(new Error("RPC unavailable"));

    await expect(login({}, formData())).resolves.toEqual({ error: TEMPORARY_MESSAGE });
    expect(authMocks.redirect).not.toHaveBeenCalled();
  });

  it("removes a newly-created session when the success reset fails", async () => {
    signInWithPassword.mockResolvedValue({ error: null });
    authMocks.finalizeLoginAttempt.mockRejectedValue(new Error("RPC unavailable"));

    await expect(login({}, formData())).resolves.toEqual({ error: TEMPORARY_MESSAGE });
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(authMocks.redirect).not.toHaveBeenCalled();
  });
});
