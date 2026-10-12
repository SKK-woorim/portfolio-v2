import Link from "next/link";
import { ArrowRight, Award, FileText, Sparkles, UserRound } from "lucide-react";
import { ProjectVisual, projectHue } from "@/components/project-visual";
import { SpotlightCard } from "@/components/spotlight-card";
import { getProjectPresentation, type ProjectFactKind } from "@/lib/content/presentation";
import type { PortfolioItem } from "@/lib/content/types";

export type ProjectCardSize = "feature" | "side" | "half" | "wide" | "third";

const FACT_ICONS: Record<ProjectFactKind, typeof UserRound> = { role: UserRound, result: Sparkles, award: Award, doc: FileText };

export function ProjectCard({ item, size = "third", priority = false, showSummary }: { item: PortfolioItem; size?: ProjectCardSize; priority?: boolean; showSummary?: boolean }) {
  const presentation = getProjectPresentation(item.slug);
  const hue = projectHue(item);
  const withSummary = showSummary ?? (size === "feature" || size === "wide");

  return (
    <SpotlightCard className="pcard" data-size={size === "third" ? undefined : size} data-hue={hue === "primary" ? undefined : hue}>
      <div className="pcard-visual">
        <ProjectVisual item={item} priority={priority} sizes={size === "feature" || size === "wide" ? "(max-width: 768px) 100vw, 58vw" : "(max-width: 768px) 100vw, 33vw"} />
      </div>
      <div className="pcard-body">
        <p className="pcard-meta">{item.type} · {item.period}</p>
        <h3><Link href={`/portfolio/${item.slug}`} className="pcard-link">{item.title}</Link></h3>
        {withSummary ? <p className="pcard-summary">{item.summary}</p> : null}
        {presentation.facts.length ? (
          <ul className="pcard-facts" aria-label="역할과 결과">
            {presentation.facts.map((fact) => {
              const Icon = FACT_ICONS[fact.kind];
              return <li key={fact.text}><Icon size={14} aria-hidden="true" />{fact.text}</li>;
            })}
          </ul>
        ) : null}
        {!withSummary && !presentation.facts.length ? <p className="pcard-summary line-clamp-2">{item.summary}</p> : null}
        <div className="pcard-foot">
          <div className="pcard-tags">{item.tags.slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}</div>
          <span className="pcard-go" aria-hidden="true"><ArrowRight size={16} /></span>
        </div>
      </div>
    </SpotlightCard>
  );
}

/** 벤토 배치: 첫 항목은 크게, 다음 두 항목은 옆에, 나머지는 개수에 맞춰 3열·2열·한 줄로 채운다. */
export function bentoSizes(count: number): ProjectCardSize[] {
  if (count === 1) return ["wide"];
  if (count === 2) return ["half", "half"];
  if (count === 3) return ["feature", "side", "side"];
  const sizes: ProjectCardSize[] = ["feature", "side", "side"];
  let rest = count - 3;
  while (rest > 0) {
    if (rest === 1) { sizes.push("wide"); rest -= 1; }
    else if (rest === 2 || rest === 4) { sizes.push("half", "half"); rest -= 2; }
    else { sizes.push("third", "third", "third"); rest -= 3; }
  }
  return sizes;
}

export function ProjectBento({ items, priorityFirst = true }: { items: PortfolioItem[]; priorityFirst?: boolean }) {
  const sizes = bentoSizes(items.length);
  return (
    <div className="bento">
      {items.map((item, index) => <ProjectCard item={item} key={item.id} size={sizes[index]} priority={priorityFirst && index === 0} />)}
    </div>
  );
}
