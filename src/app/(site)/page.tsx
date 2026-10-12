import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { AuthRecoveryRedirect } from "@/components/admin/auth-recovery-redirect";
import { EmailCopyBox } from "@/components/email-copy-box";
import { HeroActions } from "@/components/home/hero-actions";
import { HeroChatConsole } from "@/components/home/hero-chat-console";
import { HeroFlow } from "@/components/home/hero-flow";
import { ProjectBento } from "@/components/project-card";
import { SectionHeading } from "@/components/section-heading";
import { getPublishedPortfolioItems, getPublishedPosts, getSiteProfile } from "@/lib/content/repository";
import { getEvaluationSummary, homeHighlights } from "@/lib/content/presentation";
import { absoluteUrl, jsonLd } from "@/lib/site-metadata";
import { formatDate } from "@/lib/utils";

/** "A, B, C" 형태의 헤드라인을 구절마다 한 줄로 나누고 첫 낱말을 강조한다. */
function HeadlineLines({ text }: { text: string }) {
  const clauses = text.split(/,\s+/).filter(Boolean);
  return (
    <>
      {clauses.map((clause, index) => {
        const [first, ...rest] = clause.split(" ");
        const isLast = index === clauses.length - 1;
        return (
          <span key={`${index}-${clause}`}>
            <strong>{first}</strong>{rest.length ? ` ${rest.join(" ")}` : ""}{isLast ? "" : ","}
            {isLast ? <span className="hero-caret" aria-hidden="true" /> : null}
          </span>
        );
      })}
    </>
  );
}

const METHOD_STEPS = [
  { title: "문제를 정의합니다", copy: "고객의 데이터 환경과 검증 범위를 먼저 확인합니다.", inputs: ["요구사항", "데이터 환경"], output: "검증 범위" },
  { title: "흐름을 설계합니다", copy: "이관 경로, Agent, RAG, SQL을 목적에 맞게 연결합니다.", inputs: ["ETL", "Agent", "RAG", "SQL"], output: "워크플로우" },
  { title: "결과를 검증하고 넘깁니다", copy: "정합성과 근거를 확인하고, 매뉴얼과 교육으로 다음 사용까지 잇습니다.", inputs: ["정합성 검증", "근거 확인", "교육"], output: "운영 준비" },
];

export default async function HomePage() {
  const [profile, portfolioItems, posts] = await Promise.all([
    getSiteProfile(),
    getPublishedPortfolioItems(),
    getPublishedPosts(),
  ]);
  const featuredItems = portfolioItems.filter((item) => item.featured);
  const evaluation = getEvaluationSummary();
  const evaluationMax = Math.max(1, ...evaluation.groups.map((group) => group.count));
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
      <section className="hero">
        <HeroFlow targetId="hero-chat" />
        <div className="container hero-grid">
          <div>
            <p className="hero-status"><i aria-hidden="true" /><b>{profile.roleTitle}</b></p>
            <h1 className="hero-title" aria-label={profile.headline}><HeadlineLines text={profile.headline} /></h1>
            <p className="hero-lede">{profile.bio}</p>
            <HeroActions />
            {homeHighlights.length ? (
              <ul className="hero-proof" aria-label="주요 성과">
                {homeHighlights.map((highlight) => <li key={highlight.value}><b className="tabular">{highlight.value}</b><span>{highlight.label}</span></li>)}
              </ul>
            ) : null}
          </div>
          <HeroChatConsole evaluationTotal={evaluation.total} featuredProject={featuredItems[0] ? { slug: featuredItems[0].slug, title: featuredItems[0].title } : undefined} />
        </div>
      </section>

      {profile.skills.length ? (
        <div className="skills-strip" aria-label="기술 스택">
          <div className="skills-track">
            {profile.skills.map((skill) => <span key={skill}>{skill}</span>)}
            {profile.skills.map((skill) => <span key={`repeat-${skill}`} aria-hidden="true">{skill}</span>)}
          </div>
        </div>
      ) : null}

      {featuredItems.length ? (
        <section className="section">
          <div className="container">
            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <SectionHeading eyebrow="대표 프로젝트" title="AI와 데이터로 해결한 문제들" description="실무에서 직접 맡은 구축·분석·기술 이전 경험과 AI 프로젝트를 기록합니다." />
              <Link href="/portfolio" className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">전체 포트폴리오 <ArrowRight size={16} /></Link>
            </div>
            <div className="mt-12"><ProjectBento items={featuredItems} /></div>
          </div>
        </section>
      ) : null}

      <section className="method section">
        <div className="container method-grid">
          <div>
            <SectionHeading eyebrow="일하는 방식" title="고객의 데이터에서 출발해 운영까지 잇습니다." description="고객의 데이터 환경과 검증 범위를 먼저 확인하고, 구축부터 기술 이전·운영 준비까지 이어지는 흐름을 만듭니다." />
            <div className="eval-gate">
              <b className="tabular">{evaluation.total}</b>
              <p>이 사이트의 챗봇도 같은 방식으로 만듭니다. 출시 전 평가 질문 {evaluation.total}개로 검색·근거·범위 준수를 확인합니다.</p>
              <div className="eval-bars" aria-hidden="true">
                {evaluation.groups.map((group) => <i key={group.group} style={{ flex: group.count, ["--a" as string]: (0.3 + 0.6 * (group.count / evaluationMax)).toFixed(2) }} />)}
              </div>
              <div className="eval-keys tabular">{evaluation.groups.map((group) => <span key={group.group}>{group.label} {group.count}</span>)}</div>
            </div>
          </div>
          <ol className="method-steps">
            {METHOD_STEPS.map((step, index) => (
              <li key={step.title}>
                <span className="method-no">{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <h3>{step.title}</h3>
                  <p>{step.copy}</p>
                  <div className="method-io">
                    {step.inputs.map((input) => <span key={input}>{input}</span>)}
                    <ArrowRight size={14} aria-hidden="true" />
                    <span>{step.output}</span>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {posts.length ? (
        <section className="section">
          <div className="container">
            <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-end">
              <SectionHeading eyebrow="최근 글" title="AI를 만들며 배운 것들" />
              <Link href="/blog" className="focus-ring inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]">모든 글 보기 <ArrowRight size={16} /></Link>
            </div>
            <div className="post-rows mt-12">
              {posts.slice(0, 3).map((post) => (
                <article className="post-row" key={post.id}>
                  <span className="post-row-category">{post.category}</span>
                  <div>
                    <h3><Link href={`/blog/${post.slug}`} className="focus-ring">{post.title}</Link></h3>
                    <p>{post.excerpt}</p>
                    {post.tags.length ? <div className="pcard-tags mt-3">{post.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div> : null}
                  </div>
                  <time className="tabular" dateTime={post.publishedAt}>{formatDate(post.publishedAt)} · {post.readingMinutes}분</time>
                  <span className="pcard-go" aria-hidden="true"><ArrowRight size={16} /></span>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="cta-band section">
        <div className="container">
          <p className="eyebrow">함께 일하기</p>
          <h2>좋은 문제를<br /><strong>함께</strong> 풀어볼까요?</h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-[var(--body)]">데이터 이관, AI Agent·RAG 워크플로우, MLOps 연계에 관한 대화를 환영합니다.</p>
          <div className="cta-row">
            <EmailCopyBox email={profile.email} />
            <Link href="/contact" className="theme-primary-cta focus-ring inline-flex min-h-14 items-center gap-2 rounded-full px-8 text-base font-semibold">문의 남기기 <ArrowRight size={18} /></Link>
          </div>
        </div>
      </section>
    </>
  );
}
