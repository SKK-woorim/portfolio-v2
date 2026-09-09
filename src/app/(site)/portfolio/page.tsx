import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/site-metadata";
import { ProjectCard } from "@/components/project-card";
import { SectionHeading } from "@/components/section-heading";
import { getPublishedPortfolioItems } from "@/lib/content/repository";

export const metadata: Metadata = createPageMetadata({ title: "포트폴리오", description: "AI Agent, RAG, 데이터 분석과 예측·객체 탐지 프로젝트 기록입니다.", path: "/portfolio" });

export default async function PortfolioPage() {
  const items = await getPublishedPortfolioItems();
  return (
    <>
      <section className="theme-section tech-grid border-b border-[var(--border)] py-20 sm:py-28"><div className="container"><SectionHeading eyebrow="Portfolio" title="AI와 데이터로 만든 결과" description="RAG·NL2SQL 실무부터 예측 모델과 객체 탐지 프로젝트까지, 문제를 정의하고 구현한 과정을 모았습니다." /></div></section>
      <section className="section"><div className="container"><div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <ProjectCard item={item} key={item.id} />)}</div></div></section>
    </>
  );
}
