import Link from "next/link";
import { ArrowLeft, ArrowRight, ArrowUpRight, MessageCircle } from "lucide-react";
import { PostCard } from "@/components/post-card";
import { ProjectCard } from "@/components/project-card";
import type { BlogPost, PortfolioItem } from "@/lib/content/types";

function sharedCount(left: string[], right: string[]) {
  const rightTags = new Set(right);
  return left.filter((tag) => rightTags.has(tag)).length;
}

export function relatedPosts(posts: BlogPost[], current: BlogPost) {
  return posts.filter((post) => post.id !== current.id).map((post) => ({
    post,
    sharedTags: sharedCount(post.tags, current.tags),
    sameCategory: post.category === current.category,
  })).filter((candidate) => candidate.sharedTags || candidate.sameCategory).sort((left, right) => {
    const scoreDifference = (right.sharedTags * 100 + Number(right.sameCategory) * 10) - (left.sharedTags * 100 + Number(left.sameCategory) * 10);
    return scoreDifference || new Date(right.post.publishedAt).getTime() - new Date(left.post.publishedAt).getTime();
  }).slice(0, 3).map((candidate) => candidate.post);
}

export function relatedPortfolioItems(items: PortfolioItem[], current: PortfolioItem) {
  return items.filter((item) => item.id !== current.id).map((item) => ({
    item,
    sharedTags: sharedCount(item.tags, current.tags),
    sameType: item.type === current.type,
    samePeriod: item.period === current.period,
  })).filter((candidate) => candidate.sharedTags || candidate.sameType || candidate.samePeriod).sort((left, right) => {
    const scoreDifference = (right.sharedTags * 100 + Number(right.sameType) * 10 + Number(right.samePeriod)) - (left.sharedTags * 100 + Number(left.sameType) * 10 + Number(left.samePeriod));
    return scoreDifference || right.item.updatedAt.localeCompare(left.item.updatedAt);
  }).slice(0, 3).map((candidate) => candidate.item);
}

export function PostPreviousNext({ posts, current }: { posts: BlogPost[]; current: BlogPost }) {
  const index = posts.findIndex((post) => post.id === current.id);
  const previous = index > 0 ? posts[index - 1] : undefined;
  const next = index >= 0 && index < posts.length - 1 ? posts[index + 1] : undefined;
  if (!previous && !next) return null;
  return <nav aria-label="이전 및 다음 글" className="grid gap-3 border-y border-[var(--border)] py-6 sm:grid-cols-2">{previous ? <Link href={`/blog/${previous.slug}`} className="focus-ring rounded-2xl border border-[var(--border)] p-4 hover:border-[var(--primary)]"><span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted)]"><ArrowLeft size={14} /> 이전 글</span><span className="mt-2 block font-semibold text-[var(--ink)]">{previous.title}</span></Link> : <div />}{next ? <Link href={`/blog/${next.slug}`} className="focus-ring rounded-2xl border border-[var(--border)] p-4 text-right hover:border-[var(--primary)]"><span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--muted)]">다음 글 <ArrowRight size={14} /></span><span className="mt-2 block font-semibold text-[var(--ink)]">{next.title}</span></Link> : null}</nav>;
}

export function RelatedPosts({ posts }: { posts: BlogPost[] }) {
  if (!posts.length) return null;
  return <section className="mt-12"><div className="flex items-end justify-between gap-4"><div><p className="eyebrow">Continue reading</p><h2 className="display mt-2 text-3xl">연관 글</h2></div><Link href="/blog" className="focus-ring text-sm font-semibold text-[var(--primary)]">모든 글 보기</Link></div><div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">{posts.map((post) => <PostCard post={post} key={post.id} />)}</div></section>;
}

export function RelatedPortfolio({ items }: { items: PortfolioItem[] }) {
  if (!items.length) return null;
  return <section className="mt-12"><div className="flex items-end justify-between gap-4"><div><p className="eyebrow">More projects</p><h2 className="display mt-2 text-3xl">연관 프로젝트</h2></div><Link href="/portfolio" className="focus-ring text-sm font-semibold text-[var(--primary)]">모든 프로젝트 보기</Link></div><div className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <ProjectCard item={item} key={item.id} />)}</div></section>;
}

export function ContentContactCta({ kind, slug }: { kind: "blog" | "portfolio"; slug: string }) {
  const isPortfolio = kind === "portfolio";
  const href = `/contact?from=${kind}&slug=${encodeURIComponent(slug)}`;
  return <section className="mt-12 rounded-3xl border border-[var(--border)] bg-[var(--primary-soft)] p-6 sm:p-8"><p className="eyebrow">Let&apos;s talk</p><h2 className="display mt-3 text-3xl">{isPortfolio ? "비슷한 문제를 함께 해결하기" : "이 주제로 함께 이야기하기"}</h2><p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--body)]">읽은 콘텐츠의 맥락을 담아 문의 페이지로 이동합니다. 메시지 내용은 직접 작성할 수 있습니다.</p><Link href={href} className="solid-primary-cta focus-ring mt-6 inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold"><MessageCircle size={17} /> 문의하기 <ArrowUpRight size={16} /></Link></section>;
}
