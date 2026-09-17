import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ArrowUpRight, CheckCircle2, Mail } from "lucide-react";
import { AuthRecoveryRedirect } from "@/components/admin/auth-recovery-redirect";
import { PostCard } from "@/components/post-card";
import { ProjectCard } from "@/components/project-card";
import { SectionHeading } from "@/components/section-heading";
import { getPublishedPortfolioItems, getPublishedPosts, getSiteProfile } from "@/lib/content/repository";
import { absoluteUrl, jsonLd } from "@/lib/site-metadata";

export default async function HomePage() {
  const [profile, portfolioItems, posts] = await Promise.all([
    getSiteProfile(),
    getPublishedPortfolioItems(),
    getPublishedPosts(),
  ]);
  const featuredItems = portfolioItems.filter((item) => item.featured);
  const personJsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: profile.displayName,
    jobTitle: profile.roleTitle,
    description: profile.bio,
    url: absoluteUrl("/"),
    sameAs: profile.socialLinks.map((link) => link.href),
    knowsAbout: profile.skills,
  };

  return (
    <>
      <AuthRecoveryRedirect />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(personJsonLd) }} />
      <section className="theme-section tech-grid border-b border-[var(--border)]">
        <div className="container grid min-h-[700px] gap-12 py-20 lg:grid-cols-[.92fr_1.08fr] lg:items-center lg:py-28">
          <div>
            <p className="theme-eyebrow inline-flex items-center gap-3 text-xs font-bold uppercase tracking-[.12em]"><span className="signal-dot size-2 rounded-full bg-[#4d9cf6]" aria-hidden="true" />{profile.roleTitle}</p>
            <h1 className="display mt-5 max-w-3xl text-5xl leading-[1.03] sm:text-6xl lg:text-7xl">{profile.headline}</h1>
            <p className="theme-copy mt-7 max-w-xl text-base leading-7 sm:text-lg">{profile.bio}</p>
            <div className="mt-9 flex flex-wrap gap-3">
              <Link className="theme-primary-cta focus-ring inline-flex min-h-14 items-center gap-2 rounded-full px-8 text-base font-semibold" href="/portfolio">포트폴리오 보기 <ArrowRight size={18} /></Link>
              <Link className="theme-outline-cta focus-ring inline-flex min-h-14 items-center gap-2 rounded-full border px-8 text-base font-semibold" href="/contact">연락하기 <ArrowUpRight size={18} /></Link>
            </div>
            <div className="mt-10 flex flex-wrap gap-2">
              {profile.skills.map((skill) => <span className="theme-chip rounded-full border px-3 py-1.5 text-xs font-medium" key={skill}>{skill}</span>)}
            </div>
          </div>
          <div className="relative mx-auto w-full max-w-2xl pb-10 lg:pb-0">
            <div className="tech-panel relative aspect-[4/3] overflow-hidden rounded-[30px]">
              <Image src="/og.png" alt="" fill priority sizes="(max-width: 1024px) 100vw, 56vw" className="object-contain object-center" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#031022] via-transparent to-[#031022]/15" />
              <div className="absolute left-5 top-5 flex items-center gap-2 rounded-full border border-[#67aef8]/30 bg-[#06182c]/80 px-3 py-2 text-[11px] font-semibold tracking-[.08em] text-[#a8d1ff] backdrop-blur-md"><span className="signal-dot size-1.5 rounded-full bg-[#58a8ff]" /> 업무 흐름 예시</div>
              <div className="absolute inset-x-5 bottom-5 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#071a31]/85 p-4 text-white backdrop-blur-md">
                <div><p className="text-xs text-[#84a8cf]">Architecture</p><p className="mt-1 text-sm font-semibold">Agent → RAG → Data</p></div>
                <div className="flex -space-x-1.5" aria-label="핵심 기술 3개"><span className="grid size-8 place-items-center rounded-full border border-[#65adfa]/35 bg-[#123f70] text-[10px]">AI</span><span className="grid size-8 place-items-center rounded-full border border-[#65adfa]/35 bg-[#123f70] text-[10px]">DB</span><span className="grid size-8 place-items-center rounded-full border border-[#65adfa]/35 bg-[#123f70] text-[10px]">ETL</span></div>
              </div>
            </div>
            <div className="tech-panel absolute -bottom-1 -left-5 hidden w-52 rounded-3xl p-5 sm:block">
              <p className="text-xs text-[var(--muted)]">Operating principle</p>
              <p className="mt-2 text-lg font-medium tracking-[-.03em]">Grounded. Useful. Reliable.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <SectionHeading eyebrow="Selected portfolio" title="AI와 데이터로 해결한 문제들" description="업무에서 구축한 워크플로우와 팀을 이끌며 완성한 AI 프로젝트를 기록합니다." />
            <Link href="/portfolio" className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">전체 포트폴리오 <ArrowRight size={16} /></Link>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {featuredItems.map((item, index) => <ProjectCard item={item} key={item.id} priority={index === 0} />)}
          </div>
        </div>
      </section>

      <section className="theme-section-alt section border-b border-[var(--border)]">
        <div className="container grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-16">
          <SectionHeading eyebrow="How I work" title="문서를 지식으로, 질문을 실행 가능한 흐름으로 바꿉니다." description="요구사항을 분석하고 AI와 데이터가 실제 업무에서 안정적으로 이어지는 구조를 설계합니다." />
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["01", "문제를 정의합니다", "고객의 요구사항과 데이터 환경을 먼저 이해합니다."],
              ["02", "흐름을 설계합니다", "Agent, RAG, SQL과 ETL을 목적에 맞게 연결합니다."],
              ["03", "결과를 검증합니다", "근거와 오류 경로를 확인해 운영 가능한 품질을 만듭니다."],
            ].map(([number, title, copy]) => (
              <article className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6" key={number}>
                <span className="font-mono text-xs text-[var(--primary)]">{number}</span>
                <h3 className="mt-6 text-lg font-semibold tracking-[-.02em]">{title}</h3>
                <p className="mt-3 text-sm leading-6 text-[var(--body)]">{copy}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="theme-section-alt section border-y border-[var(--border)]">
        <div className="container">
          <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
            <SectionHeading eyebrow="Latest writing" title="AI를 만들며 배운 것들" description="RAG, 데이터 파이프라인, 협업 과정에서 얻은 실무적인 관점을 정리합니다." />
            <Link href="/blog" className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">모든 글 보기 <ArrowRight size={16} /></Link>
          </div>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {posts.slice(0, 3).map((post) => <PostCard post={post} key={post.id} />)}
          </div>
        </div>
      </section>

      <section className="theme-section tech-grid section">
        <div className="container text-center">
          <p className="theme-eyebrow eyebrow">Let&apos;s work together</p>
          <h2 className="display mx-auto mt-4 max-w-3xl text-4xl leading-[1.08] sm:text-5xl">좋은 문제를 함께 풀어볼까요?</h2>
          <p className="theme-copy mx-auto mt-5 max-w-xl text-base leading-7">AI Agent, RAG, 데이터 워크플로우 또는 새로운 프로젝트에 관한 대화를 환영합니다.</p>
          <Link href="/contact" className="theme-primary-cta focus-ring mt-8 inline-flex min-h-14 items-center gap-2 rounded-full px-8 text-base font-semibold">이야기 시작하기 <Mail size={18} /></Link>
          <div className="theme-copy mt-10 flex flex-wrap justify-center gap-x-6 gap-y-3 text-sm">
            {profile.skills.slice(0, 3).map((skill) => <span className="inline-flex items-center gap-2" key={skill}><CheckCircle2 size={15} className="text-[var(--primary)]" /> {skill}</span>)}
          </div>
        </div>
      </section>
    </>
  );
}
