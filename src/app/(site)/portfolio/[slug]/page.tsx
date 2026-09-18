import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { ProjectVisual } from "@/components/project-visual";
import { Tag } from "@/components/tag";
import { MarkdownContent } from "@/components/markdown-content";
import { MarkdownTableOfContents } from "@/components/markdown-table-of-contents";
import { ContentContactCta, RelatedPortfolio, relatedPortfolioItems } from "@/components/content-discovery";
import { getPublishedPortfolioItem, getPublishedPortfolioItems } from "@/lib/content/repository";
import { absoluteUrl, createSocialImage, DEFAULT_OG_IMAGE_PATH, jsonLd, SITE_AUTHOR_NAME } from "@/lib/site-metadata";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateStaticParams() {
  const items = await getPublishedPortfolioItems();
  return items.map((item) => ({ slug: item.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const item = await getPublishedPortfolioItem((await params).slug);
  if (!item) return {};
  const path = `/portfolio/${item.slug}`;
  const images = [createSocialImage(item.coverImage)];
  return {
    title: item.title,
    description: item.summary,
    alternates: { canonical: path },
    openGraph: { type: "website", locale: "ko_KR", url: path, title: item.title, description: item.summary, images },
    twitter: { card: "summary_large_image", title: item.title, description: item.summary, images: images.map((image) => image.url) },
  };
}

export default async function PortfolioDetailPage({ params }: PageProps) {
  const slug = (await params).slug;
  const [item, items] = await Promise.all([getPublishedPortfolioItem(slug), getPublishedPortfolioItems()]);
  if (!item) notFound();
  const markdown = item.contentMarkdown ?? item.body.join("\n\n");
  const related = relatedPortfolioItems(items, item);
  const projectJsonLd = {
    "@context": "https://schema.org",
    "@type": "CreativeWork",
    name: item.title,
    description: item.summary,
    url: absoluteUrl(`/portfolio/${item.slug}`),
    dateModified: item.updatedAt,
    keywords: item.tags,
    image: absoluteUrl(item.coverImage?.src ?? DEFAULT_OG_IMAGE_PATH),
    author: { "@type": "Person", name: SITE_AUTHOR_NAME, url: absoluteUrl("/") },
  };
  return (
    <article>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(projectJsonLd) }} />
      <section className="tech-grid border-b border-[var(--border)] bg-[var(--dark)] py-10 sm:py-16"><div className="container"><Link href="/portfolio" className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]"><ArrowLeft size={16} /> 포트폴리오로 돌아가기</Link><div className="mt-10 grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-end"><div><p className="eyebrow">{item.type} · {item.period}</p><h1 className="display mt-4 text-5xl leading-[1.04] sm:text-6xl">{item.title}</h1><p className="mt-6 max-w-xl text-lg leading-8 text-[var(--body)]">{item.summary}</p><div className="mt-7 flex flex-wrap gap-2">{item.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div></div><ProjectVisual item={item} priority /></div></div></section>
      <section className="section"><div className="container grid gap-12 lg:grid-cols-[.7fr_1.3fr]"><aside className="grid h-fit gap-5 lg:sticky lg:top-28"><div className="tech-panel rounded-3xl p-6 text-sm text-[var(--body)]"><p className="font-semibold text-[var(--ink)]">프로젝트 상세</p><dl className="mt-5 grid gap-4"><div><dt className="text-xs tracking-[.08em] text-[var(--muted)]">유형</dt><dd className="mt-1">{item.type}</dd></div><div><dt className="text-xs tracking-[.08em] text-[var(--muted)]">기간</dt><dd className="mt-1">{item.period}</dd></div></dl></div><MarkdownTableOfContents markdown={markdown} /></aside><div><h2 className="display text-3xl sm:text-4xl">문제에서 결과까지</h2><MarkdownContent markdown={markdown} inlineImages={item.inlineImages} className="mt-7 text-base leading-8 text-[var(--body)]" /><div className="mt-10 flex flex-wrap gap-3">{item.links.map((link) => <Link key={link.label} href={link.href} className="solid-primary-cta focus-ring inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold">{link.label} <ArrowUpRight size={16} /></Link>)}</div><ContentContactCta kind="portfolio" slug={item.slug} /><RelatedPortfolio items={related} /></div></div></section>
    </article>
  );
}
