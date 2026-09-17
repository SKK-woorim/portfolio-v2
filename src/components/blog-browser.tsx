"use client";

import Link from "next/link";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { PostCard } from "@/components/post-card";
import type { BlogPost } from "@/lib/content/types";

function normalize(value: string) {
  return value.toLocaleLowerCase().trim();
}

function filterHref(query: string, category: string, tag: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  if (category) params.set("category", category);
  if (tag) params.set("tag", tag);
  const search = params.toString();
  return search ? `/blog?${search}` : "/blog";
}

export function BlogBrowser({ posts }: { posts: BlogPost[] }) {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useRouter();
  const urlQuery = searchParams.get("q") ?? "";
  const tag = searchParams.get("tag") ?? "";
  const category = searchParams.get("category") ?? "";
  const [query, setQuery] = useState(urlQuery);
  const composingRef = useRef(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => setQuery(urlQuery));
    return () => window.cancelAnimationFrame(frame);
  }, [urlQuery]);

  useEffect(() => {
    if (composingRef.current || query === urlQuery) return;
    const timeout = window.setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (query.trim()) params.set("q", query);
      else params.delete("q");
      const search = params.toString();
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [pathname, query, router, searchParams, urlQuery]);

  const needle = normalize(query);
  const tags = [...new Set(posts.flatMap((post) => post.tags))];
  const categories = [...new Set(posts.map((post) => post.category))];
  const filteredPosts = posts
    .filter((post) => {
      const searchable = normalize([post.title, post.excerpt, post.category, ...post.tags].join(" "));
      return (!needle || searchable.includes(needle)) && (!tag || post.tags.includes(tag)) && (!category || post.category === category);
    })
    .sort((left, right) => {
      if (!needle) return 0;
      const titleDifference = Number(normalize(right.title).includes(needle)) - Number(normalize(left.title).includes(needle));
      return titleDifference || new Date(right.publishedAt).getTime() - new Date(left.publishedAt).getTime();
    });
  const activeConditions = [query && `“${query}”`, category && `카테고리 ${category}`, tag && `태그 #${tag}`].filter(Boolean);

  return (
    <>
      <div className="mt-10 grid min-w-0 gap-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 sm:p-6">
        <label className="grid min-w-0 gap-2 text-sm font-semibold text-[var(--ink)]">글 검색
          <span className="flex min-w-0 min-h-12 items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface-elevated)] px-3 text-[var(--ink)] focus-within:border-2 focus-within:border-[var(--primary-action)]"><Search size={18} aria-hidden="true" className="shrink-0 text-[var(--muted)]" /><input value={query} onChange={(event) => setQuery(event.target.value)} onCompositionStart={() => { composingRef.current = true; }} onCompositionEnd={(event) => { composingRef.current = false; setQuery(event.currentTarget.value); }} className="w-full min-w-0 flex-1 bg-transparent text-base font-normal text-[var(--ink)] outline-none placeholder:text-[var(--muted)]" placeholder="제목, 요약, 카테고리, 태그 검색" /><span className="sr-only">제목, 요약, 카테고리, 태그를 검색합니다</span></span>
        </label>
        <div className="grid gap-3"><p className="text-xs font-semibold uppercase tracking-[.08em] text-[var(--muted)]">카테고리</p><div className="flex flex-wrap gap-2"><Link aria-current={!category ? "page" : undefined} className={`focus-ring rounded-full border px-4 py-2 text-sm font-semibold ${!category ? "border-[#4a9df4] bg-[#1463c3] text-white" : "border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--body)]"}`} href={filterHref(query, "", tag)}>전체</Link>{categories.map((item) => <Link key={item} aria-current={category === item ? "page" : undefined} href={filterHref(query, category === item ? "" : item, tag)} className={`focus-ring rounded-full border px-4 py-2 text-sm font-semibold ${category === item ? "border-[#4a9df4] bg-[#1463c3] text-white" : "border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--body)]"}`}>{item}</Link>)}</div></div>
        <div className="grid gap-3"><p className="text-xs font-semibold uppercase tracking-[.08em] text-[var(--muted)]">태그</p><div className="flex flex-wrap gap-2">{tags.map((item) => <Link key={item} aria-current={tag === item ? "page" : undefined} href={filterHref(query, category, tag === item ? "" : item)} className={`focus-ring rounded-full border px-4 py-2 text-sm font-semibold ${tag === item ? "border-[#4a9df4] bg-[#1463c3] text-white" : "border-[var(--border)] bg-[var(--surface-elevated)] text-[var(--body)]"}`}>#{item}</Link>)}</div></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4"><p role="status" aria-live="polite" aria-atomic="true" className="text-sm text-[var(--body)]">{activeConditions.length ? `${activeConditions.join(", ")} 조건에서 ` : ""}{filteredPosts.length}개의 글을 찾았습니다.</p>{activeConditions.length ? <button type="button" onClick={() => router.replace("/blog", { scroll: false })} className="focus-ring inline-flex min-h-9 items-center gap-1 rounded-full px-3 text-sm font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)]"><X size={15} /> 조건 초기화</button> : null}</div>
      </div>
      <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        {filteredPosts.map((post) => <PostCard post={post} key={post.id} />)}
      </div>
      {filteredPosts.length === 0 ? <div className="grid place-items-center gap-4 py-12 text-center"><p className="text-[var(--body)]">{posts.length === 0 ? "아직 공개된 글이 없습니다." : "조건에 맞는 글이 없습니다."}</p>{activeConditions.length ? <button type="button" onClick={() => router.replace("/blog", { scroll: false })} className="focus-ring rounded-full bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white">조건 초기화</button> : null}</div> : null}
    </>
  );
}
