import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight } from "lucide-react";
import { ProjectVisual } from "@/components/project-visual";
import { Tag } from "@/components/tag";
import { MarkdownContent } from "@/components/markdown-content";
import { getPublishedPortfolioItem } from "@/lib/content/repository";
import { notFound } from "next/navigation";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const item = await getPublishedPortfolioItem((await params).slug);
  return item ? { title: item.title, description: item.summary } : {};
}

export default async function PortfolioDetailPage({ params }: PageProps) {
  const item = await getPublishedPortfolioItem((await params).slug);
  if (!item) notFound();
  return (
    <article>
      <section className="bg-white py-10 sm:py-16"><div className="container"><Link href="/portfolio" className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]"><ArrowLeft size={16} /> 포트폴리오로 돌아가기</Link><div className="mt-10 grid gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-end"><div><p className="eyebrow">{item.type} · {item.period}</p><h1 className="display mt-4 text-5xl leading-[1.04] sm:text-6xl">{item.title}</h1><p className="mt-6 max-w-xl text-lg leading-8 text-[var(--body)]">{item.summary}</p><div className="mt-7 flex flex-wrap gap-2">{item.tags.map((tag) => <Tag key={tag}>{tag}</Tag>)}</div></div><ProjectVisual item={item} /></div></div></section>
      <section className="section"><div className="container grid gap-12 lg:grid-cols-[.7fr_1.3fr]"><aside className="text-sm text-[var(--body)]"><p className="font-semibold text-[var(--ink)]">Project details</p><dl className="mt-5 grid gap-4"><div><dt className="text-xs uppercase tracking-[.08em] text-[var(--muted)]">Type</dt><dd className="mt-1">{item.type}</dd></div><div><dt className="text-xs uppercase tracking-[.08em] text-[var(--muted)]">Period</dt><dd className="mt-1">{item.period}</dd></div></dl></aside><div><h2 className="display text-3xl sm:text-4xl">문제에서 결과까지</h2><MarkdownContent markdown={item.contentMarkdown ?? item.body.join("\n\n")} className="mt-7 text-base leading-8 text-[var(--body)]" /><div className="mt-10 flex flex-wrap gap-3">{item.links.map((link) => <Link key={link.label} href={link.href} className="focus-ring inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--primary)] px-5 text-sm font-semibold text-white hover:bg-[var(--primary-action)]">{link.label} <ArrowUpRight size={16} /></Link>)}</div></div></div></section>
    </article>
  );
}
