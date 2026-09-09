import { ReindexAllControl, ReindexDocumentControl } from "@/components/admin/chatbot-reindex-controls";
import { ChatbotRuntimeToggle } from "@/components/admin/chatbot-runtime-toggle";
import { getAdminChatbotRuntimeStatus, getChatbotIndexData, type KnowledgeIndexStatus } from "@/lib/admin/queries";
import { formatDate } from "@/lib/utils";

const statusLabels: Record<KnowledgeIndexStatus, string> = {
  ready: "챗봇 반영 완료",
  pending: "챗봇 반영 중",
  processing: "챗봇 반영 중",
  failed: "챗봇 반영 실패",
  disabled: "비공개",
};

const statusStyles: Record<KnowledgeIndexStatus, string> = {
  ready: "bg-[#eaf8f4] text-[#146b58]",
  pending: "bg-[#fff7df] text-[#8a5b00]",
  processing: "bg-[#edf3fb] text-[var(--primary)]",
  failed: "bg-[#fff0f1] text-[#a22b38]",
  disabled: "bg-[#f0f2f5] text-[var(--body)]",
};

const sourceLabels = { profile: "프로필", portfolio: "포트폴리오", post: "게시글" } as const;

function displayDate(value: string | null) {
  return value ? formatDate(value) : "—";
}

export default async function AdminChatbotPage() {
  const [data, runtimeStatus] = await Promise.all([getChatbotIndexData(), getAdminChatbotRuntimeStatus()]);
  const cards = [
    { label: "전체 문서", value: data.total },
    { label: "반영 완료", value: data.counts.ready },
    { label: "대기·처리 중", value: data.counts.pending + data.counts.processing },
    { label: "실패", value: data.counts.failed },
    { label: "비공개", value: data.counts.disabled },
  ];

  return (
    <div className="mx-auto max-w-7xl">
      <section className={`mb-8 flex flex-wrap items-center justify-between gap-5 rounded-3xl border p-6 ${runtimeStatus.enabled ? "border-[#b9e8da] bg-[#f2fbf8]" : "border-[#f1d5a4] bg-[#fff9ed]"}`}>
        <div>
          <div className="flex items-center gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${runtimeStatus.enabled ? "bg-[#1ca574]" : "bg-[#d58a14]"}`} aria-hidden="true" />
            <h2 className="text-lg font-semibold text-[var(--ink)]">외부 챗봇 연결 {runtimeStatus.enabled ? "활성화" : "비활성화"}</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--body)]">
            {runtimeStatus.enabled
              ? "방문자가 AI 챗봇에 질문할 수 있습니다. 모델과 인덱싱 워커는 상태 변경과 관계없이 계속 실행됩니다."
              : "외부 질문 요청을 차단하고 소개·연락처 안내만 표시합니다. 모델을 다시 시작하지 않고 즉시 연결할 수 있습니다."}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">최근 상태 변경: {displayDate(runtimeStatus.updatedAt)}</p>
        </div>
        <ChatbotRuntimeToggle enabled={runtimeStatus.enabled} />
      </section>

      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <p className="eyebrow">RAG knowledge</p>
          <h1 className="display mt-3 text-4xl">챗봇 인덱스</h1>
          <p className="mt-3 text-sm text-[var(--body)]">공개 콘텐츠의 검색 반영 상태를 확인하고 재인덱싱 작업을 요청합니다.</p>
          <p className="mt-1 text-xs text-[var(--muted)]">최근 인덱싱: {displayDate(data.lastIndexedAt)}</p>
        </div>
        <ReindexAllControl />
      </div>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {cards.map((card) => (
          <div key={card.label} className="rounded-3xl border border-[var(--border)] bg-white p-5">
            <p className="text-xs text-[var(--body)]">{card.label}</p>
            <p className="mt-2 text-3xl font-semibold tracking-[-.04em] text-[var(--ink)]">{card.value}</p>
          </div>
        ))}
      </div>

      <section className="mt-8 overflow-hidden rounded-3xl border border-[var(--border)] bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-260 text-left text-sm">
            <thead className="border-b border-[var(--border)] bg-[#f8fbff] text-xs text-[var(--muted)]">
              <tr>
                <th className="px-5 py-4 font-semibold">문서</th>
                <th className="px-5 py-4 font-semibold">종류</th>
                <th className="px-5 py-4 font-semibold">원본 수정</th>
                <th className="px-5 py-4 font-semibold">인덱싱</th>
                <th className="px-5 py-4 font-semibold">상태</th>
                <th className="px-5 py-4 font-semibold">오류</th>
                <th className="px-5 py-4" />
              </tr>
            </thead>
            <tbody>
              {data.documents.map((document) => (
                <tr key={document.id} className="border-b border-[var(--border)] align-top last:border-0">
                  <td className="px-5 py-4">
                    <p className="max-w-64 truncate font-semibold text-[var(--ink)]">{document.title}</p>
                    <p className="mt-1 max-w-64 truncate text-xs text-[var(--muted)]">{document.source_url}</p>
                  </td>
                  <td className="px-5 py-4 text-[var(--body)]">{sourceLabels[document.source_type]}</td>
                  <td className="px-5 py-4 text-xs text-[var(--body)]">{displayDate(document.source_updated_at)}</td>
                  <td className="px-5 py-4 text-xs text-[var(--body)]">{displayDate(document.indexed_at)}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusStyles[document.index_status]}`}>{statusLabels[document.index_status]}</span>
                    {document.attempt_count ? <p className="mt-1 text-xs text-[var(--muted)]">시도 {document.attempt_count}회</p> : null}
                  </td>
                  <td className="px-5 py-4"><p className="max-w-80 text-xs leading-5 text-[#a22b38]">{document.last_error ?? "—"}</p></td>
                  <td className="px-5 py-4"><ReindexDocumentControl documentId={document.id} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.documents.length ? <p className="p-10 text-center text-sm text-[var(--body)]">아직 챗봇 지식 문서가 없습니다. 전체 재인덱싱을 요청해 주세요.</p> : null}
      </section>
    </div>
  );
}
