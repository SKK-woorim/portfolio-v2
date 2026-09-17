import type { Metadata } from "next";
import { Suspense } from "react";
import { BlogBrowser } from "@/components/blog-browser";
import { SectionHeading } from "@/components/section-heading";
import { getPublishedPosts } from "@/lib/content/repository";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = createPageMetadata({ title: "블로그", description: "AI Agent, RAG, 데이터 엔지니어링과 협업에 관한 글입니다.", path: "/blog" });

export default async function BlogPage() {
  const posts = await getPublishedPosts();
  return (
    <><section className="theme-section tech-grid border-b border-[var(--border)] py-20 sm:py-28"><div className="container"><SectionHeading level={1} eyebrow="Writing" title="AI를 만들고, 검증하고, 기록합니다." description="문서 처리부터 데이터 분석, 팀 협업까지 실무와 프로젝트에서 배운 내용을 남깁니다." /></div></section><section className="section"><div className="container"><Suspense fallback={<p className="text-sm text-[var(--muted)]">글 목록을 불러오는 중…</p>}><BlogBrowser posts={posts} /></Suspense></div></section></>
  );
}
