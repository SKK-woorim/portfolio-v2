import type { Metadata } from "next";
import Image from "next/image";
import { ArrowUpRight, Mail } from "lucide-react";
import Link from "next/link";
import { ContactCopyButton } from "@/components/contact-copy-button";
import { createPageMetadata } from "@/lib/site-metadata";
import { getPublishedPost, getPublishedPortfolioItem, getSiteProfile } from "@/lib/content/repository";
import { parseContactContext } from "./contact-context";

type ContactSearchParams = Promise<{ from?: string | string[]; slug?: string | string[] }>;

export const metadata: Metadata = createPageMetadata({
  title: "연락처",
  description: "AI·데이터 프로젝트와 협업 제안을 위한 송경근의 연락처입니다.",
  path: "/contact",
});

export default async function ContactPage({ searchParams }: { searchParams: ContactSearchParams }) {
  const profile = await getSiteProfile();
  const parsedContext = parseContactContext(await searchParams);
  const contextItem = parsedContext
    ? await (parsedContext.kind === "blog" ? getPublishedPost(parsedContext.slug) : getPublishedPortfolioItem(parsedContext.slug)).catch(() => undefined)
    : undefined;
  const context = parsedContext && contextItem ? { ...parsedContext, title: contextItem.title } : null;
  const contextLabel = context?.kind === "blog" ? "블로그 글" : "포트폴리오 프로젝트";
  const contextUrl = context ? `/${context.kind === "blog" ? "blog" : "portfolio"}/${context.slug}` : null;
  const mailSubject = context ? `${context.title} 관련 협업 문의` : "협업 문의";
  const mailBody = context && contextUrl
    ? `안녕하세요.\n\n${context.title}(${contextUrl})을 읽고 문의드립니다.\n\n문의 내용:\n`
    : "안녕하세요.\n\n문의 내용:\n";

  return (
    <section className="tech-grid section">
      <div className="container">
        <div className="tech-panel overflow-hidden rounded-[32px] px-7 py-12 text-[var(--ink)] sm:px-12 sm:py-16">
          <div className="grid items-center gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(380px,0.82fr)] lg:gap-10">
            <div className="relative z-10 py-4 sm:py-8">
              <p className="eyebrow">Contact</p>
              <h1 className="display mt-4 max-w-3xl text-5xl leading-[1.05] sm:text-6xl">
                AI와 데이터로
                <br />
                함께 해결해볼까요?
              </h1>
              <p className="mt-6 max-w-xl text-lg leading-8 text-[var(--body)]">
                AI Agent, RAG, 데이터 워크플로우와 프로젝트 협업에 관한 대화를 환영합니다.
                아래 이메일로 편하게 연락해 주세요.
              </p>
              {context ? <p className="mt-4 max-w-xl text-sm leading-6 text-[var(--body)]">방금 읽은 {contextLabel} <Link className="font-semibold text-[var(--primary)] underline underline-offset-4" href={contextUrl!}>{context.title}</Link>에서 이어진 문의입니다. 메일에 원문 링크와 제목을 미리 넣었습니다.</p> : null}
              <div className="mt-10 flex flex-wrap items-center gap-3">
                <a
                  className="theme-primary-cta focus-ring inline-flex min-h-14 items-center gap-3 rounded-full px-7 text-base font-semibold"
                  href={`mailto:${profile.email}?subject=${encodeURIComponent(mailSubject)}&body=${encodeURIComponent(mailBody)}`}
                >
                  <Mail size={19} />
                  {profile.email}
                </a>
                <ContactCopyButton value={profile.email} />
              </div>
              <div className="mt-12 flex flex-wrap gap-5 text-sm text-[var(--body)]">
                {profile.socialLinks.map((link) => (
                  <a
                    className="focus-ring inline-flex items-center gap-1 hover:text-[var(--ink)]"
                    href={link.href}
                    key={link.label}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {link.label} <ArrowUpRight size={15} />
                  </a>
                ))}
              </div>
            </div>

            <div
              className="relative mt-8 min-h-[390px] overflow-hidden rounded-[28px] border border-[#1b416e]/70 bg-[#020d20] sm:min-h-[500px] lg:mt-0 lg:min-h-[540px]"
              aria-hidden="true"
            >
              <Image
                src="/assets/images/contact-ai-collaboration.png"
                alt=""
                fill
                sizes="(max-width: 1023px) 100vw, 42vw"
                className="object-cover object-center"
              />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(4,17,35,0.28),transparent_28%),linear-gradient(0deg,rgba(4,17,35,0.4),transparent_24%)]" />
              <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full border border-[#28598f]/80 bg-[#061426]/85 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#9fc4f5] backdrop-blur-sm">
                <span className="signal-dot" />
                Open to collaboration
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
