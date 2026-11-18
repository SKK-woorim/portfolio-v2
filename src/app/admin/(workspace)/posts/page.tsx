import Link from "next/link";
import { Plus } from "lucide-react";
import { ContentStatusActions } from "@/components/admin/content-status-actions";
import { getAdminPosts } from "@/lib/admin/queries";
import { contentStatusLabel } from "@/lib/content/status";

export default async function AdminPostsPage() { const posts = await getAdminPosts(); const trashedCount = posts.filter((post) => post.status === "trashed").length; return <div className="mx-auto max-w-6xl"><div className="flex flex-wrap items-end justify-between gap-5"><div><p className="eyebrow">Content</p><h1 className="display mt-3 text-4xl">게시글</h1><p className="mt-3 text-sm text-[var(--body)]">초안, 발행, 비공개 글을 관리합니다. 휴지통 {trashedCount}개는 언제든 복구할 수 있습니다.</p></div><Link href="/admin/posts/new" className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--primary-action)]"><Plus size={17} /> 새 글</Link></div><section className="mt-8 overflow-hidden rounded-3xl border border-[var(--border)] bg-white">
    {/* 좁은 화면에서 가로로 스크롤되는 표: 키보드로도 스크롤하도록 초점을 받고, 표 제목으로 영역 이름을 붙인다. */}
    <div className="focus-ring-inset overflow-x-auto" tabIndex={0} role="region" aria-labelledby="admin-posts-table-caption">
      <table className="w-full min-w-165 text-left text-sm">
        <caption id="admin-posts-table-caption" className="sr-only">게시글 목록</caption>
        <thead className="border-b border-[var(--border)] bg-[#f8fbff] text-xs text-[var(--muted)]">
          <tr>
            <th scope="col" className="px-5 py-4 font-semibold">제목</th>
            <th scope="col" className="px-5 py-4 font-semibold">카테고리</th>
            <th scope="col" className="px-5 py-4 font-semibold">상태</th>
            <th scope="col" className="px-5 py-4"><span className="sr-only">작업</span></th>
          </tr>
        </thead>
        <tbody>{posts.map((post) => <tr className={`border-b border-[var(--border)] last:border-0 ${post.status === "trashed" ? "bg-[#fff9fa] opacity-75" : ""}`} key={post.id}><th scope="row" className="px-5 py-4 text-left font-semibold text-[var(--ink)]">{post.title}</th><td className="px-5 py-4 text-[var(--body)]">{post.categories?.name ?? "미분류"}</td><td className="px-5 py-4"><span className="rounded-full bg-[#edf3fb] px-2 py-1 text-xs text-[var(--primary)]">{contentStatusLabel(post.status)}</span></td><td className="px-5 py-4 text-right"><div className="inline-flex items-start gap-3">{post.status !== "trashed" ? <Link href={`/admin/posts/${post.id}/edit`} className="focus-ring font-semibold text-[var(--primary)]">수정</Link> : null}<ContentStatusActions table="posts" id={post.id} status={post.status} /></div></td></tr>)}</tbody>
      </table>
    </div>
    {!posts.length ? <p className="p-10 text-center text-sm text-[var(--body)]">아직 게시글이 없습니다.</p> : null}</section></div>; }
