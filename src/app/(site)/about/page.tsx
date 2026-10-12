import type { Metadata } from "next";
import Link from "next/link";
import { ArrowUpRight, CheckCircle2 } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Tag } from "@/components/tag";
import { careerProfile } from "@/lib/content/career-profile";
import { getSiteProfile } from "@/lib/content/repository";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = createPageMetadata({
  title: "소개",
  description: "AI Agent와 데이터 플랫폼을 현장 문제에 연결하는 송경근의 경험과 기술 스택입니다.",
  path: "/about",
});

export default async function AboutPage() {
  const profile = await getSiteProfile();

  return (
    <>
      <section className="theme-section tech-grid border-b border-[var(--border)] py-20 sm:py-28">
        <div className="container grid gap-10 lg:grid-cols-[1fr_.9fr] lg:items-end">
          <SectionHeading level={1} eyebrow="About" title="AI Agent와 데이터 플랫폼을 현장 문제에 연결합니다." description={profile.bio} />
          <div className="tech-panel rounded-3xl p-8">
            <p className="eyebrow">Current role</p>
            <p className="mt-4 text-2xl font-semibold tracking-[-.03em] text-[var(--ink)]">{careerProfile.currentCareer.company}</p>
            <p className="mt-2 text-sm font-medium text-[var(--body)]">{careerProfile.currentCareer.organization} · {careerProfile.currentCareer.employment}</p>
            <p className="mt-5 text-sm leading-7 text-[var(--body)]">{careerProfile.currentCareer.description}</p>
          </div>
        </div>
      </section>
      <section className="section border-b border-[var(--border)]">
        <div className="container">
          <SectionHeading eyebrow="Career" title="실무에서 직접 맡은 구축·분석·기술 이전 경험" description="고객의 데이터 환경과 검증 범위를 먼저 확인하고, 구현 결과가 다음 사용과 운영 준비로 이어지도록 정리합니다." />
          <div className="mt-10 grid gap-5 lg:grid-cols-2">
            {careerProfile.projects.map((project) => (
              <article className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8" key={project.slug}>
                <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-[var(--body)]"><span>{project.period}</span><span>{project.customer}</span></div>
                <h3 className="mt-4 text-2xl font-semibold tracking-[-.03em] text-[var(--ink)]">{project.title}</h3>
                <p className="mt-3 text-sm font-medium leading-6 text-[var(--primary)]">{project.role}</p>
                <p className="mt-4 text-sm leading-7 text-[var(--body)]">{project.summary}</p>
                <Link className="focus-ring mt-6 inline-flex items-center gap-2 text-sm font-semibold text-[var(--primary)]" href={`/portfolio/${project.slug}`}>프로젝트 상세 보기 <ArrowUpRight size={16} /></Link>
              </article>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="container grid gap-12 lg:grid-cols-[.8fr_1.2fr]">
          <div>
            <p className="eyebrow">Strengths</p>
            <h2 className="display mt-3 text-4xl leading-[1.1]">함께 일할 때<br />중요하게 생각하는 것</h2>
          </div>
          <div className="grid gap-5">
            {careerProfile.strengths.map((item) => <div className="flex gap-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6" key={item}><CheckCircle2 className="mt-0.5 shrink-0 text-[var(--primary)]" size={20} /><p className="font-semibold tracking-[-.02em]">{item}</p></div>)}
          </div>
        </div>
      </section>
      <section className="theme-section-alt section border-y border-[var(--border)]">
        <div className="container">
          <SectionHeading eyebrow="Skills" title="AI와 데이터 흐름을 끝까지 연결합니다." />
          <div className="mt-10 flex max-w-3xl flex-wrap gap-3">{profile.skills.map((skill) => <Tag className="px-4 py-2 text-sm" key={skill}>{skill}</Tag>)}</div>
        </div>
      </section>
    </>
  );
}
