import presentation from "../../../data/portfolio/presentation.json";
import home from "../../../data/content/home.json";
import evaluation from "../../../data/chatbot/evaluation-cases.json";

export type ProjectVisualKind = "multi-agent" | "migration" | "pipeline" | "timeseries" | "detection" | "mesh" | "pattern";
export type ProjectFactKind = "role" | "result" | "award" | "doc";

export type ProjectPresentation = {
  visual: ProjectVisualKind;
  label?: string;
  metric?: { value: string; label: string };
  facts: { kind: ProjectFactKind; text: string }[];
};

const VISUALS = new Set<ProjectVisualKind>(["multi-agent", "migration", "pipeline", "timeseries", "detection", "mesh", "pattern"]);
const FACT_KINDS = new Set<ProjectFactKind>(["role", "result", "award", "doc"]);
const entries = presentation.projects as Record<string, { visual: string; label?: string; metric?: { value: string; label: string }; facts?: { kind: string; text: string }[] }>;

export function getProjectPresentation(slug: string): ProjectPresentation {
  const entry = entries[slug];
  if (!entry) return { visual: "pattern", facts: [] };
  return {
    visual: VISUALS.has(entry.visual as ProjectVisualKind) ? entry.visual as ProjectVisualKind : "pattern",
    label: entry.label,
    metric: entry.metric,
    facts: (entry.facts ?? []).filter((fact) => FACT_KINDS.has(fact.kind as ProjectFactKind)) as ProjectPresentation["facts"],
  };
}

export const homeHighlights: { value: string; label: string }[] = home.highlights;
export const chatSuggestions: readonly string[] = home.chatSuggestions;

const EVALUATION_GROUP_LABELS: Record<string, string> = {
  portfolio: "포트폴리오",
  profile: "프로필",
  blog: "블로그",
  combined: "복합",
  "no-context": "근거 없음",
  "prompt-injection": "프롬프트 주입",
};

export function getEvaluationSummary() {
  const counts = new Map<string, number>();
  for (const item of evaluation.cases) counts.set(item.group, (counts.get(item.group) ?? 0) + 1);
  const groups = [...counts.entries()]
    .sort((left, right) => right[1] - left[1])
    .map(([group, count]) => ({ group, label: EVALUATION_GROUP_LABELS[group] ?? group, count }));
  return { total: evaluation.cases.length, groups };
}
