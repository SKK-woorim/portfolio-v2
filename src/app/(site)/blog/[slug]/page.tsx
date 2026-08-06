import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Clock3 } from "lucide-react";
import { Tag } from "@/components/tag";
import { MarkdownContent } from "@/components/markdown-content";
import { getPublishedPost } from "@/lib/content/repository";
import { formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ slug: string }> };
export async function generateMetadata({ params }: PageProps): Promise<Metadata> { const post = await getPublishedPost((await params).slug); return post ? { title: post.title, description: post.excerpt } : {}; }

export default async function BlogDetailPage({ params }: PageProps) {
  const post = await getPublishedPost((await params).slug);
  if (!post) notFound();
  return <article><header className="bg-white py-10 sm:py-20"><div className="container max-w-4xl"><Link href="/blog" className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]"><ArrowLeft size={16} /> 블로그로 돌아가기</Link><p className="eyebrow mt-12">{post.category}</p><h1 className="display mt-4 text-4xl leading-[1.08] sm:text-6xl">{post.title}</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--body)]">{post.excerpt}</p><div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-[var(--body)]"><span>{formatDate(post.publishedAt)}</span><span className="inline-flex items-center gap-1"><Clock3 size={15} /> {post.readingMinutes}분 읽기</span></div><div className="mt-6 flex flex-wrap gap-2">{post.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div></div></header><div className="section"><div className="container max-w-3xl"><MarkdownContent markdown={post.contentMarkdown ?? post.body.join("\n\n")} className="text-[17px] leading-8 text-[var(--body)]" /></div></div></article>;
}
