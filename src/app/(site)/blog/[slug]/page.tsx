import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ArrowLeft, Clock3 } from "lucide-react";
import { Tag } from "@/components/tag";
import { getMarkdownHeadings, MarkdownContent } from "@/components/markdown-content";
import { MarkdownTableOfContents } from "@/components/markdown-table-of-contents";
import { ContentContactCta, PostPreviousNext, RelatedPosts, relatedPosts } from "@/components/content-discovery";
import { getPublishedPost, getPublishedPosts } from "@/lib/content/repository";
import { absoluteUrl, jsonLd } from "@/lib/site-metadata";
import { formatDate } from "@/lib/utils";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const posts = await getPublishedPosts();
  return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const post = await getPublishedPost((await params).slug);
  if (!post) return {};
  const title = post.seoTitle || post.title;
  const description = post.seoDescription || post.excerpt;
  const path = `/blog/${post.slug}`;
  const images = post.coverImage ? [{ url: post.coverImage.src, alt: post.coverImage.alt }] : [];
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: "article", locale: "ko_KR", url: path, title, description, publishedTime: post.publishedAt, modifiedTime: post.updatedAt, tags: post.tags, images },
    twitter: { card: images.length ? "summary_large_image" : "summary", title, description, images },
  };
}

export default async function BlogDetailPage({ params }: PageProps) {
  const slug = (await params).slug;
  const [post, posts] = await Promise.all([getPublishedPost(slug), getPublishedPosts()]);
  if (!post) notFound();
  const markdown = post.contentMarkdown ?? post.body.join("\n\n");
  const hasTableOfContents = getMarkdownHeadings(markdown).filter((heading) => heading.level === 2).length >= 3;
  const related = relatedPosts(posts, post);
  const articleJsonLd = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.excerpt,
    url: absoluteUrl(`/blog/${post.slug}`),
    datePublished: post.publishedAt,
    dateModified: post.updatedAt,
    keywords: post.tags,
    image: post.coverImage?.src,
    author: { "@type": "Person", name: "송경근", url: absoluteUrl("/") },
  };
  return <article><script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(articleJsonLd) }} /><header className="tech-grid border-b border-[var(--border)] bg-[var(--dark)] py-10 sm:py-20"><div className="container max-w-4xl"><Link href="/blog" className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]"><ArrowLeft size={16} /> 블로그로 돌아가기</Link><p className="eyebrow mt-12">{post.category}</p><h1 className="display mt-4 text-4xl leading-[1.08] sm:text-6xl">{post.title}</h1><p className="mt-6 max-w-2xl text-lg leading-8 text-[var(--body)]">{post.excerpt}</p><div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-[var(--body)]"><span>{formatDate(post.publishedAt)}</span><span className="inline-flex items-center gap-1"><Clock3 size={15} /> {post.readingMinutes}분 읽기</span></div><div className="mt-6 flex flex-wrap gap-2">{post.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>{post.coverImage ? <div className="relative mt-10 aspect-[16/9] overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--primary-soft)]"><Image src={post.coverImage.src} alt={post.coverImage.alt} fill priority sizes="(max-width: 896px) 100vw, 896px" className="object-cover" /></div> : null}</div></header><div className="section"><div className={hasTableOfContents ? "container grid max-w-6xl gap-10 lg:grid-cols-[15rem_minmax(0,1fr)]" : "container max-w-4xl"}>{hasTableOfContents ? <aside><MarkdownTableOfContents markdown={markdown} /></aside> : null}<div className="min-w-0"><MarkdownContent markdown={markdown} className="text-[17px] leading-8 text-[var(--body)]" /><PostPreviousNext posts={posts} current={post} /><ContentContactCta kind="blog" slug={post.slug} /><RelatedPosts posts={related} /></div></div></div></article>;
}
