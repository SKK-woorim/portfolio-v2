import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { CaseEvidence } from "@/components/case-evidence/case-evidence";
import { CaseAsk } from "@/components/chatbot/case-ask";
import { ProjectVisual } from "@/components/project-visual";
import { ReadProgress } from "@/components/read-progress";
import { Tag } from "@/components/tag";
import { MarkdownContent } from "@/components/markdown-content";
import { MarkdownTableOfContents } from "@/components/markdown-table-of-contents";
import { ContentContactCta, RelatedPortfolio, relatedPortfolioItems } from "@/components/content-discovery";
import { getProjectEvidence } from "@/lib/content/evidence";
import { getProjectPresentation } from "@/lib/content/presentation";
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
  const role = getProjectPresentation(item.slug).facts.find((fact) => fact.kind === "role")?.text;
  const evidence = getProjectEvidence(item.slug);
  const askQuestions = [`${item.title}에서 맡은 역할은 무엇인가요?`, `${item.title}의 결과를 알려주세요.`];
  return (
    <article id="case-article">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(projectJsonLd) }} />
      <ReadProgress targetId="case-article" />
      <section className="hero">
        <div className="container grid gap-10 py-14 sm:py-20 lg:grid-cols-[1.05fr_.95fr] lg:items-center">
          <div>
            <Link href="/portfolio" className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]"><ArrowLeft size={16} /> 포트폴리오</Link>
            <p className="eyebrow mt-10">{item.type} · {item.period}</p>
            <h1 className="case-hero-title mt-4">{item.title}</h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--body)]">{item.summary}</p>
            <div className="mt-7 flex flex-wrap gap-2">{item.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div>
            <dl className="case-meta">
              <div><dt>기간</dt><dd className="tabular">{item.period}</dd></div>
              <div><dt>유형</dt><dd>{item.type}</dd></div>
              {role ? <div><dt>역할</dt><dd>{role}</dd></div> : null}
            </dl>
          </div>
          <div className="case-visual"><ProjectVisual item={item} priority /></div>
        </div>
      </section>
      {evidence ? <CaseEvidence evidence={evidence} /> : null}
      <section className="section">
        <div className="container grid gap-12 lg:grid-cols-[.7fr_1.3fr]">
          <aside className="grid h-fit gap-5 lg:sticky lg:top-28">
            <MarkdownTableOfContents markdown={markdown} />
            <CaseAsk questions={askQuestions} />
          </aside>
          <div>
            <MarkdownContent markdown={markdown} inlineImages={item.inlineImages} className="text-base leading-8 text-[var(--body)]" />
            {item.links.length ? (
              <div className="mt-10 flex flex-wrap gap-3">
                {item.links.map((link) => /^https?:\/\//.test(link.href)
                  ? <a key={link.href} href={link.href} target="_blank" rel="noopener noreferrer" className="solid-primary-cta focus-ring inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold">{link.label} <ArrowUpRight size={16} /></a>
                  : <Link key={link.href} href={link.href} className="solid-primary-cta focus-ring inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold">{link.label} <ArrowUpRight size={16} /></Link>)}
              </div>
            ) : null}
            <ContentContactCta kind="portfolio" slug={item.slug} />
            <RelatedPortfolio items={related} />
          </div>
        </div>
      </section>
    </article>
  );
}
