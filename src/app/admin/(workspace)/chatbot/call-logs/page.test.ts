import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CallLogsPage from "./page";

const mocks = vi.hoisted(() => ({ requireAdmin: vi.fn(), rpc: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/admin", () => ({ requireAdmin: mocks.requireAdmin }));
vi.mock("@supabase/supabase-js", () => ({ createClient: () => ({ rpc: mocks.rpc }) }));

const startedAt = "2026-11-18T00:00:00+00:00";
const firstAttempt = {
  attempt_order: 1,
  provider: "gemini",
  model: "gemini-model",
  started_at: startedAt,
  duration_ms: 8000,
  status: "timeout",
  http_status: null,
  error_class: "TimeoutError",
  input_tokens: null,
  output_tokens: null,
  total_tokens: null,
};

describe("admin chatbot call history", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://supabase.example.com");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "example-publishable-key");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "example-service-role-key");
    mocks.requireAdmin.mockResolvedValue({ id: "admin" });
  });

  afterEach(() => vi.unstubAllEnvs());

  function renderPage(page?: string | string[]) {
    return CallLogsPage({ searchParams: Promise.resolve({ page }) }).then(renderToStaticMarkup);
  }

  it("checks administrator access before calling the privileged RPC", async () => {
    mocks.requireAdmin.mockRejectedValue(new Error("Unauthorized"));

    await expect(renderPage()).rejects.toThrow("Unauthorized");
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it("paginates request groups and renders expandable attempts in RPC order", async () => {
    mocks.rpc.mockResolvedValue({
      data: {
        total_count: 23,
        requests: [{
          request_id: "ba574437-cc4e-4ad2-a290-015469cccb9d",
          started_at: startedAt,
          key_lookup_status: "missing_openai",
          attempts: [
            firstAttempt,
            {
              ...firstAttempt,
              attempt_order: 2,
              provider: "local",
              model: "local-model",
              status: "success",
              error_class: null,
              input_tokens: 100,
              output_tokens: 0,
              total_tokens: 100,
              response: "private response",
            },
          ],
        }],
      },
      error: null,
    });

    const html = await renderPage("2");

    expect(mocks.rpc).toHaveBeenCalledWith("list_chatbot_call_logs", { p_limit: 20, p_offset: 20 });
    expect(html).toContain("<details");
    expect(html).toContain("OpenAI API 키 미등록");
    expect(html).toContain("시도 2회");
    expect(html).toContain("TimeoutError");
    expect(html).toContain("모델 응답 대기 시간 초과");
    expect(html.match(/<summary[^>]*>.*?<\/summary>/)?.[0]).toMatch(/마지막 호출 로컬.*성공/);
    expect(html).toContain("출력 0");
    expect(html).toContain("2 / 2 페이지");
    expect(html.indexOf("gemini-model")).toBeLessThan(html.indexOf("local-model"));
    expect(html).not.toContain("private response");
  });

  it.each([
    [401, "HTTPStatusError", "API 인증 또는 접근 권한 오류"],
    [403, "HTTPStatusError", "API 인증 또는 접근 권한 오류"],
    [429, "HTTPStatusError", "호출 한도 또는 사용량 제한"],
    [200, "EmptyResponse", "응답 본문이 비어 있음"],
    [null, "FirstTokenTimeout", "첫 토큰 대기 시간 초과"],
  ])("describes HTTP %s with reason %s", async (httpStatus, errorClass, reason) => {
    mocks.rpc.mockResolvedValue({
      data: {
        total_count: 1,
        requests: [{
          request_id: "ba574437-cc4e-4ad2-a290-015469cccb9d",
          started_at: startedAt,
          key_lookup_status: null,
          attempts: [{ ...firstAttempt, status: "error", http_status: httpStatus, error_class: errorClass }],
        }],
      },
      error: null,
    });

    expect(await renderPage()).toContain(reason);
  });

  it("distinguishes key lookup failure from a failed history query", async () => {
    mocks.rpc.mockResolvedValueOnce({
      data: {
        total_count: 1,
        requests: [{
          request_id: "ba574437-cc4e-4ad2-a290-015469cccb9d",
          started_at: startedAt,
          key_lookup_status: "failed",
          attempts: [],
        }],
      },
      error: null,
    });
    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: "private database error" } });

    const html = await renderPage(["3", "4"]);
    expect(mocks.rpc).toHaveBeenCalledWith("list_chatbot_call_logs", { p_limit: 20, p_offset: 0 });
    expect(html).toContain("API 키 조회 실패");
    expect(html).toContain("시도 0회");

    const errorHtml = await renderPage();
    expect(errorHtml).toContain("호출 기록을 불러오지 못했습니다.");
    expect(errorHtml).not.toContain("private database error");
  });
});
