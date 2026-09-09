import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ProjectVisual } from "@/components/project-visual";
import { Tag } from "@/components/tag";
import type { PortfolioItem } from "@/lib/content/types";

export function ProjectCard({ item, priority = false }: { item: PortfolioItem; priority?: boolean }) {
  return (
    <article className="group overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-3 transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-[#367fc9] hover:shadow-[0_20px_55px_rgba(0,8,22,.34)]">
      <ProjectVisual item={item} compact priority={priority} />
      <div className="px-3 pb-4 pt-6 sm:px-5 sm:pb-5">
        <div className="flex items-center justify-between gap-4 text-sm text-[var(--body)]">
          <span>{item.period}</span>
          <span>{item.type}</span>
        </div>
        <h3 className="mt-3 text-xl font-semibold tracking-[-.02em] text-[var(--ink)]">{item.title}</h3>
        <p className="mt-3 line-clamp-2 text-sm leading-6 text-[var(--body)]">{item.summary}</p>
        <div className="mt-5 flex flex-wrap gap-2">
          {item.tags.slice(0, 3).map((tag) => <Tag key={tag}>{tag}</Tag>)}
        </div>
        <Link href={`/portfolio/${item.slug}`} className="focus-ring mt-6 inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)]">
          자세히 보기 <ArrowUpRight size={16} />
        </Link>
      </div>
    </article>
  );
}
