import evidence from "../../../data/portfolio/evidence.json";

export type EvidenceOwner = "me" | "team";

export type EvidenceMetric = { value: string; label: string; owner: EvidenceOwner; page?: string };
export type EvidenceMilestone = { date: string; label: string };
export type EvidenceFigure = {
  src: string;
  width: number;
  height: number;
  kind: "photo" | "screenshot";
  alt: string;
  caption: string;
  note?: string;
  page?: string;
  wide?: boolean;
  tall?: boolean;
  split?: boolean;
};
export type StorageChartRow = { label: string; tables: number; records: number; source: number; stored: number };
export type StorageChart = {
  title: string;
  caption: string;
  page?: string;
  unit: string;
  series: { source: string; stored: string };
  rows: StorageChartRow[];
};
export type ModelErrorCounts = { fn: number; fp: number };
export type ModelComparison = {
  title: string;
  page?: string;
  testSet: string;
  baselineLabel: string;
  proposedLabel: string;
  rows: { anchor: string; condition: string; baseline: ModelErrorCounts; proposed: ModelErrorCounts; summary: string }[];
  note: string;
};
export type ProjectEvidence = {
  source: string;
  metrics: EvidenceMetric[];
  timeline: EvidenceMilestone[];
  timelinePage?: string;
  storageChart?: StorageChart;
  modelComparison?: ModelComparison;
  figures: EvidenceFigure[];
  scope?: string;
};

const entries = evidence.projects as Record<string, ProjectEvidence>;

export function getProjectEvidence(slug: string): ProjectEvidence | undefined {
  return entries[slug];
}
