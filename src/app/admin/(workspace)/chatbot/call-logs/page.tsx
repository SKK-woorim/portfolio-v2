import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { ChatbotNavigation } from "@/components/admin/chatbot-navigation";
import {
  CHATBOT_CALL_LOG_PAGE_SIZE,
  getAdminChatbotCallLogs,
  parseChatbotCallLogPage,
  type ChatbotCallAttempt,
} from "@/lib/admin/chatbot-call-logs";

const providers = {
  openai: "OpenAI",
  gemini: "Google Gemini",
  local: "로컬",
} satisfies Record<ChatbotCallAttempt["provider"], string>;

const outcomes = {
  success: { label: "성공", style: "bg-[#eaf8f4] text-[#146b58]" },
  error: { label: "오류", style: "bg-[#fff0f1] text-[#a22b38]" },
  timeout: { label: "시간 초과", style: "bg-[#fff7df] text-[#8a5b00]" },
  cancelled: { label: "취소", style: "bg-[#f0f2f5] text-[var(--body)]" },
} satisfies Record<ChatbotCallAttempt["status"], { label: string; style: string }>;

const keyLookupMessages = {
  failed: "API 키 조회 실패",
  missing_openai: "OpenAI API 키 미등록",
  missing_gemini: "Google Gemini API 키 미등록",
  missing_both: "OpenAI 및 Google Gemini API 키 미등록",
};

const errorReasons = new Map([
  ["EmptyResponse", "응답 본문이 비어 있음"],
  ["IncompleteResponse", "응답이 완료되기 전에 종료됨"],
  ["FirstTokenTimeout", "첫 토큰 대기 시간 초과"],
  ["GenerationTimeout", "답변 생성 시간 초과"],
  ["RemoteBudgetTimeout", "원격 모델 호출 제한 시간 초과"],
  ["TimeoutError", "모델 응답 대기 시간 초과"],
  ["CancelledError", "호출이 취소됨"],
  ["RequestError", "모델 연결 또는 통신 오류"],
]);

function failureReason({ status, http_status, error_class }: ChatbotCallAttempt) {
  if (status === "success") return null;
  if (http_status === 401 || http_status === 403) return "API 인증 또는 접근 권한 오류";
  if (http_status === 429) return "호출 한도 또는 사용량 제한";
  if (http_status !== null && http_status >= 500) return "모델 서버 오류";

  const knownReason = error_class ? errorReasons.get(error_class) : undefined;
  if (knownReason) return knownReason;
  if (error_class === "HTTPStatusError") return "모델 API 요청 실패";
  return error_class ? "모델 호출 처리 오류" : null;
}

const dateTime = new Intl.DateTimeFormat("ko-KR", {
  dateStyle: "medium",
  timeStyle: "medium",
  timeZone: "Asia/Seoul",
});
const number = new Intl.NumberFormat("ko-KR");

const paginationLinkStyle = "focus-ring inline-flex min-h-10 items-center rounded-full border border-[var(--border)] px-4 text-sm font-semibold text-[var(--primary)] hover:border-[var(--primary)]";

function pageHref(page: number) {
  const path = "/admin/chatbot/call-logs";
  return page === 1 ? path : `${path}?page=${page}`;
}

function Attempt({ attempt }: { attempt: ChatbotCallAttempt }) {
  const { label, style } = outcomes[attempt.status];
  const reason = failureReason(attempt);
  const tokenCounts = [
    ["입력", attempt.input_tokens],
    ["출력", attempt.output_tokens],
    ["합계", attempt.total_tokens],
  ] as const;

  return (
    <li data-provider={attempt.provider} data-status={attempt.status} className="border-b border-[var(--border)] px-4 py-4 last:border-0 sm:px-6">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="font-semibold text-[var(--ink)]">{providers[attempt.provider]}</span>
        {attempt.model && <span className="wrap-anywhere font-mono text-xs text-[var(--body)]">{attempt.model}</span>}
        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${style}`}>{label}</span>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[var(--body)]">
        <time dateTime={attempt.started_at}>{dateTime.format(new Date(attempt.started_at))}</time>
        <span>{number.format(attempt.duration_ms)} ms</span>
        {attempt.http_status !== null && <span>HTTP {attempt.http_status}</span>}
        {reason && <span>{reason}</span>}
        {attempt.error_class && <span className="font-mono">{attempt.error_class}</span>}
      </div>
      {tokenCounts.some(([, count]) => count !== null) && (
        <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--body)]">
          <span className="font-semibold">토큰</span>
          {tokenCounts.map(([label, count]) => count !== null && (
            <span key={label}>{label} {number.format(count)}</span>
          ))}
        </p>
      )}
    </li>
  );
}

export default async function AdminChatbotCallLogsPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const page = parseChatbotCallLogPage((await searchParams).page);
  const history = await getAdminChatbotCallLogs(page);
  const totalPages = Math.max(1, Math.ceil((history?.total_count ?? 0) / CHATBOT_CALL_LOG_PAGE_SIZE));

  return (
    <div className="mx-auto max-w-7xl">
      <ChatbotNavigation current="호출 기록" />
      <h1 className="display text-4xl">호출 기록</h1>
      <p className="mt-3 text-sm leading-6 text-[var(--body)]">
        챗봇 요청을 열면 모델을 시도한 순서와 각 결과를 확인할 수 있습니다. 시각은 한국 표준시입니다.
      </p>

      {history ? (
        <section aria-label="챗봇 요청 목록" className="mt-8">
          <p className="mb-3 text-sm text-[var(--body)]">요청 {number.format(history.total_count)}건</p>
          {history.requests.length > 0 ? (
            <ul className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white">
              {history.requests.map((request) => {
                const finalAttempt = request.attempts.at(-1);

                return (
                  <li key={request.request_id} className="border-b border-[var(--border)] last:border-0">
                    <details className="group" data-key-lookup-status={request.key_lookup_status ?? undefined}>
                      <summary className="focus-ring-inset flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-4 hover:bg-[var(--primary-soft)] sm:px-6 [&::-webkit-details-marker]:hidden">
                        <span className="min-w-0">
                          <time dateTime={request.started_at} className="font-semibold text-[var(--ink)]">
                            {dateTime.format(new Date(request.started_at))}
                          </time>
                          <span className="mt-1 block break-all font-mono text-xs text-[var(--muted)]">{request.request_id}</span>
                          {finalAttempt && (
                            <span className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--body)]">
                              <span>마지막 호출 {providers[finalAttempt.provider]}</span>
                              <span className={`rounded-full px-2 py-0.5 font-semibold ${outcomes[finalAttempt.status].style}`}>
                                {outcomes[finalAttempt.status].label}
                              </span>
                            </span>
                          )}
                        </span>
                        <span className="flex shrink-0 items-center gap-2 text-xs text-[var(--body)]">
                          <span>시도 {number.format(request.attempts.length)}회</span>
                          <ChevronDown size={16} aria-hidden="true" className="group-open:rotate-180" />
                        </span>
                      </summary>
                      <div className="border-t border-[var(--border)] bg-[#f8fbff]">
                        {request.key_lookup_status && (
                          <p className="border-b border-[var(--border)] px-4 py-3 text-sm text-[var(--body)] sm:px-6">
                            {keyLookupMessages[request.key_lookup_status]}
                          </p>
                        )}
                        {request.attempts.length ? (
                          <ol aria-label="모델 호출 순서" className="list-decimal pl-6">
                            {request.attempts.map((attempt) => <Attempt key={attempt.attempt_order} attempt={attempt} />)}
                          </ol>
                        ) : (
                          <p className="px-4 py-4 text-sm text-[var(--body)] sm:px-6">기록된 모델 호출이 없습니다.</p>
                        )}
                      </div>
                    </details>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="rounded-3xl border border-[var(--border)] bg-white p-10 text-center text-sm text-[var(--body)]">
              {page > 1 ? "이 페이지에 표시할 요청이 없습니다." : "아직 기록된 챗봇 요청이 없습니다."}
            </p>
          )}

          {(totalPages > 1 || page > 1) && (
            <nav aria-label="호출 기록 페이지" className="mt-5 flex flex-wrap items-center justify-center gap-3">
              {page > totalPages ? (
                <Link href={pageHref(1)} className={paginationLinkStyle}>첫 페이지</Link>
              ) : (
                <>
                  {page > 1 && <Link href={pageHref(page - 1)} className={paginationLinkStyle}>이전</Link>}
                  <span className="text-sm tabular-nums text-[var(--body)]">{page} / {totalPages} 페이지</span>
                  {page < totalPages && <Link href={pageHref(page + 1)} className={paginationLinkStyle}>다음</Link>}
                </>
              )}
            </nav>
          )}
        </section>
      ) : (
        <p role="alert" className="mt-8 rounded-xl bg-[#fff0f1] px-4 py-3 text-sm text-[#a22b38]">
          호출 기록을 불러오지 못했습니다. 잠시 후 새로고침해 주세요.
        </p>
      )}
    </div>
  );
}
