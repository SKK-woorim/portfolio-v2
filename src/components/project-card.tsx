import Link from "next/link";
import { ProjectVisual } from "@/components/project-visual";
import { Tag } from "@/components/tag";
import type { PortfolioItem } from "@/lib/content/types";

export function ProjectCard({ item, priority = false }: { item: PortfolioItem; priority?: boolean }) {
  return (
    <article className="project-card group overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-3 transition-[border-color,box-shadow,transform] duration-300 hover:border-[#367fc9] hover:shadow-[0_20px_55px_rgba(0,8,22,.34)]">
      <Link href={`/portfolio/${item.slug}`} aria-label={`${item.title} 프로젝트 보기`} className="focus-ring block rounded-[22px]"><ProjectVisual item={item} compact priority={priority} /></Link>
      <div className="px-3 pb-4 pt-6 sm:px-5 sm:pb-5">
        <div className="flex items-center justify-between gap-4 text-sm text-[var(--body)]">
          <span>{item.period}</span>
          <span>{item.type}</span>
        </div>
        <h3 className="mt-3 text-xl font-semibold tracking-[-.02em] text-[var(--ink)]"><Link href={`/portfolio/${item.slug}`} className="focus-ring rounded-sm">{item.title}</Link></h3>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--body)]">{item.summary}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {item.tags.slice(0, 3).map((tag) => <Tag key={tag}>{tag}</Tag>)}
        </div>
        <p className="mt-6 text-sm font-semibold text-[var(--primary)]">프로젝트 상세 보기</p>
      </div>
    </article>
  );
}
