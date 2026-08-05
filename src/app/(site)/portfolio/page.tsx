import type { Metadata } from "next";
import { ProjectCard } from "@/components/project-card";
import { SectionHeading } from "@/components/section-heading";
import { getPublishedPortfolioItems } from "@/lib/content/repository";

export const metadata: Metadata = { title: "포트폴리오", description: "프로젝트와 경험의 기록입니다." };

export default async function PortfolioPage() {
  const items = await getPublishedPortfolioItems();
  return (
    <>
      <section className="bg-white py-20 sm:py-28"><div className="container"><SectionHeading eyebrow="Portfolio" title="작업을 통해 만든 변화" description="프로젝트, 설계 시스템, 제품 개발의 과정을 모았습니다." /></div></section>
      <section className="section"><div className="container"><div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <ProjectCard item={item} key={item.id} />)}</div></div></section>
    </>
  );
}
