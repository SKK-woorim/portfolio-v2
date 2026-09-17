import type { Metadata } from "next";
import { CheckCircle2 } from "lucide-react";
import { SectionHeading } from "@/components/section-heading";
import { Tag } from "@/components/tag";
import { getSiteProfile } from "@/lib/content/repository";
import { createPageMetadata } from "@/lib/site-metadata";

export const metadata: Metadata = createPageMetadata({
  title: "소개",
  description: "AI Agent, RAG와 데이터 워크플로우를 개발하는 송경근의 경험과 기술 스택입니다.",
  path: "/about",
});

export default async function AboutPage() {
  const profile = await getSiteProfile();
  const strengths = [
    "고객의 요구사항과 데이터 환경을 먼저 이해하기",
    "작게 검증하며 AI 워크플로우의 신뢰도 높이기",
    "문서와 피드백으로 팀의 판단 기준을 공유하기",
  ];

  return (
    <>
      <section className="theme-section tech-grid border-b border-[var(--border)] py-20 sm:py-28">
        <div className="container grid gap-10 lg:grid-cols-[1fr_.9fr] lg:items-end">
          <SectionHeading level={1} eyebrow="About" title="협업을 즐기며, AI와 데이터를 실제 문제에 연결합니다." description={profile.bio} />
          <div className="tech-panel rounded-3xl p-8">
            <p className="text-sm leading-7 text-[var(--body)]">&ldquo;기술을 보여주는 데서 멈추지 않고, 팀이 함께 이해하고 운영할 수 있는 흐름을 만드는 개발자가 되고자 합니다.&rdquo;</p>
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
            {strengths.map((item) => <div className="flex gap-4 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6" key={item}><CheckCircle2 className="mt-0.5 shrink-0 text-[var(--primary)]" size={20} /><p className="font-semibold tracking-[-.02em]">{item}</p></div>)}
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
