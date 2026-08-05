import type { Metadata } from "next";
import Link from "next/link";
import { PostCard } from "@/components/post-card";
import { SectionHeading } from "@/components/section-heading";
import { getPublishedPosts } from "@/lib/content/repository";

export const metadata: Metadata = { title: "블로그", description: "제품과 기술, 일하는 방식에 관한 글입니다." };
type PageProps = { searchParams: Promise<{ tag?: string; category?: string }> };

export default async function BlogPage({ searchParams }: PageProps) {
  const [{ tag, category }, posts] = await Promise.all([searchParams, getPublishedPosts()]);
  const tags = [...new Set(posts.flatMap((post) => post.tags))];
  const categories = [...new Set(posts.map((post) => post.category))];
  const filteredPosts = posts.filter((post) => (!tag || post.tags.includes(tag)) && (!category || post.category === category));
  return (
    <><section className="bg-white py-20 sm:py-28"><div className="container"><SectionHeading eyebrow="Writing" title="만들고, 배우고, 기록합니다." description="제품의 경험을 더 낫게 만드는 과정에서 얻은 생각을 남깁니다." /><div className="mt-10 flex flex-wrap gap-2"><Link className={`focus-ring rounded-full px-4 py-2 text-sm font-semibold ${!tag && !category ? "bg-[var(--primary)] text-white" : "bg-[#eaf0f8] text-[var(--body)]"}`} href="/blog">전체</Link>{categories.map((item) => <Link key={item} href={`/blog?category=${encodeURIComponent(item)}`} className={`focus-ring rounded-full px-4 py-2 text-sm font-semibold ${category === item ? "bg-[var(--primary)] text-white" : "bg-[#eaf0f8] text-[var(--body)]"}`}>{item}</Link>)}{tags.map((item) => <Link key={item} href={`/blog?tag=${encodeURIComponent(item)}`} className={`focus-ring rounded-full px-4 py-2 text-sm font-semibold ${tag === item ? "bg-[var(--primary)] text-white" : "bg-[#eaf0f8] text-[var(--body)]"}`}>#{item}</Link>)}</div></div></section><section className="section"><div className="container"><div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{filteredPosts.map((post) => <PostCard post={post} key={post.id} />)}</div>{filteredPosts.length === 0 ? <p className="py-12 text-center text-[var(--body)]">조건에 맞는 글이 없습니다.</p> : null}</div></section></>
  );
}
