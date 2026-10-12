import Image from "next/image";
import type { CSSProperties } from "react";
import { DetectionVisual, MeshVisual, MigrationVisual, PatternVisual } from "@/components/project-visuals/canvas-visuals";
import { MultiAgentVisual, PipelineVisual, TimeSeriesVisual } from "@/components/project-visuals/svg-visuals";
import { getProjectPresentation, type ProjectVisualKind } from "@/lib/content/presentation";
import type { PortfolioItem } from "@/lib/content/types";

export type ProjectHue = "primary" | "water" | "hive" | "clay";

export const VISUAL_HUE: Record<ProjectVisualKind, ProjectHue> = {
  "multi-agent": "primary",
  migration: "hive",
  pipeline: "primary",
  timeseries: "water",
  detection: "hive",
  mesh: "clay",
  pattern: "primary",
};

export function projectHue(item: PortfolioItem): ProjectHue {
  return VISUAL_HUE[getProjectPresentation(item.slug).visual];
}

function VisualScene({ kind, seed, metric }: { kind: ProjectVisualKind; seed: string; metric?: { value: string; label: string } }) {
  switch (kind) {
    case "multi-agent": return <MultiAgentVisual />;
    case "migration": return <MigrationVisual metric={metric} />;
    case "pipeline": return <PipelineVisual />;
    case "timeseries": return <TimeSeriesVisual />;
    case "detection": return <DetectionVisual />;
    case "mesh": return <MeshVisual />;
    default: return <PatternVisual seed={seed} />;
  }
}

/**
 * 프로젝트 대표 시각 자료. 커버 이미지가 있으면 이미지를, 없으면 data/portfolio/presentation.json의 도식을 쓴다.
 * 부모가 position과 크기를 정한다.
 */
export function ProjectVisual({ item, priority = false, sizes = "(max-width: 768px) 100vw, 50vw" }: { item: PortfolioItem; priority?: boolean; sizes?: string }) {
  const presentation = getProjectPresentation(item.slug);
  const hue = VISUAL_HUE[presentation.visual];
  const style = { "--hue": `var(--${hue}-rgb)` } as CSSProperties;

  if (item.coverImage) {
    return (
      <div className="pvisual" style={style}>
        <Image src={item.coverImage.src} alt={item.coverImage.alt} fill priority={priority} sizes={sizes} className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#071a33]/70 via-transparent to-transparent" />
        <span className="pvisual-tag"><i />{item.type}</span>
      </div>
    );
  }

  return (
    <div className="pvisual" style={style} data-has-tag="true">
      <VisualScene kind={presentation.visual} seed={item.slug} metric={presentation.metric} />
      <span className="pvisual-tag"><i />{presentation.label ?? item.type}</span>
      {/* 이관 도식은 지표를 장면 안에 직접 그린다. */}
      {presentation.metric && presentation.visual !== "migration" ? <div className="pvisual-metric"><b className="tabular">{presentation.metric.value}</b><span>{presentation.metric.label}</span></div> : null}
      <span className="pvisual-note">도식</span>
    </div>
  );
}
