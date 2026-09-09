import Link from "next/link";
import { FilePlus2, FolderPlus, PenSquare } from "lucide-react";
import { getDashboardData } from "@/lib/admin/queries";
import { formatDate } from "@/lib/utils";

function countByStatus(items: { status: string }[], status: string) {
  return items.filter((item) => item.status === status).length;
}

export default async function AdminDashboardPage() {
  const data = await getDashboardData();
  const cards = [
    { label: "발행 포트폴리오", value: countByStatus(data.portfolio, "published"), href: "/admin/portfolio" },
    { label: "포트폴리오 초안", value: countByStatus(data.portfolio, "draft"), href: "/admin/portfolio" },
    { label: "발행 게시글", value: countByStatus(data.posts, "published"), href: "/admin/posts" },
    { label: "게시글 초안", value: countByStatus(data.posts, "draft"), href: "/admin/posts" },
  ];

  return (
    <div className="mx-auto max-w-6xl">
      <p className="eyebrow">Overview</p>
      <h1 className="display mt-3 text-4xl">콘텐츠 대시보드</h1>
      <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link href={card.href} key={card.label} className="focus-ring rounded-3xl border border-[var(--border)] bg-white p-6 hover:shadow-[0_4px_12px_rgba(10,25,48,.04)]">
            <p className="text-sm text-[var(--body)]">{card.label}</p>
            <p className="mt-3 text-4xl font-semibold tracking-[-.04em] text-[var(--ink)]">{card.value}</p>
          </Link>
        ))}
      </div>
      <div className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_.85fr]">
        <section className="rounded-3xl border border-[var(--border)] bg-white p-6 sm:p-8">
          <h2 className="text-lg font-semibold">최근 수정</h2>
          <div className="mt-5 grid divide-y divide-[var(--border)]">
            {data.recent.length ? data.recent.map((item) => (
              <div className="flex items-center justify-between gap-4 py-4" key={`${item.kind}-${item.id}`}>
                <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.title}</p><p className="mt-1 text-xs text-[var(--body)]">{item.kind} · {item.status}</p></div>
                <time className="shrink-0 text-xs text-[var(--muted)]">{formatDate(item.updated_at)}</time>
              </div>
            )) : <p className="py-10 text-sm text-[var(--body)]">아직 콘텐츠가 없습니다.</p>}
          </div>
        </section>
        <section className="rounded-3xl bg-[var(--dark)] p-6 text-white sm:p-8">
          <p className="text-sm text-[#b9cee9]">Quick actions</p>
          <div className="mt-5 grid gap-3">
            <Link href="/admin/portfolio/new" className="focus-ring flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-4 text-sm font-semibold hover:bg-white/15"><FolderPlus size={18} /> 포트폴리오 작성</Link>
            <Link href="/admin/posts/new" className="focus-ring flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-4 text-sm font-semibold hover:bg-white/15"><FilePlus2 size={18} /> 게시글 작성</Link>
            <Link href="/admin/profile" className="focus-ring flex items-center gap-3 rounded-2xl bg-white/10 px-4 py-4 text-sm font-semibold hover:bg-white/15"><PenSquare size={18} /> 사이트 정보 수정</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
