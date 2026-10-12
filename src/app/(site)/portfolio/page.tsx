import type { Metadata } from "next";
import { createPageMetadata } from "@/lib/site-metadata";
import { ProjectBento } from "@/components/project-card";
import { SectionHeading } from "@/components/section-heading";
import { getPublishedPortfolioItems } from "@/lib/content/repository";

export const metadata: Metadata = createPageMetadata({ title: "포트폴리오", description: "데이터 플랫폼 구축, AI Agent·MLOps, RAG와 예측·객체 탐지 프로젝트 기록입니다.", path: "/portfolio" });

export default async function PortfolioPage() {
  const items = await getPublishedPortfolioItems();
  return (
    <>
      <section className="theme-section tech-grid border-b border-[var(--border)] py-20 sm:py-28"><div className="container"><SectionHeading level={1} eyebrow="포트폴리오" title="AI와 데이터로 만든 결과" description="데이터 이관과 플랫폼 구축, AI Agent·MLOps 실무부터 예측 모델과 객체 탐지 프로젝트까지, 문제를 정의하고 구현한 과정을 모았습니다." /></div></section>
      <section className="section">
        <div className="container">
          {items.length ? <ProjectBento items={items} /> : <p className="rounded-3xl border border-dashed border-[var(--border)] p-10 text-center text-[var(--body)]">아직 공개된 프로젝트가 없어요. 곧 정리해서 올릴게요.</p>}
        </div>
      </section>
    </>
  );
}
