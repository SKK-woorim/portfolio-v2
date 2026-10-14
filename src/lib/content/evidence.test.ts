import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import evidence from "../../../data/portfolio/evidence.json";
import manifest from "../../../data/portfolio/manifest.json";
import { getProjectEvidence, type ProjectEvidence } from "./evidence";

const projects = evidence.projects as Record<string, ProjectEvidence>;

describe("project evidence", () => {
  it("only covers published career projects", () => {
    const slugs = manifest.projects.map((project) => project.slug);
    for (const slug of Object.keys(projects)) expect(slugs).toContain(slug);
    expect(getProjectEvidence("unknown-project")).toBeUndefined();
  });

  it("points every figure at a processed asset with alt text and a caption", () => {
    for (const project of Object.values(projects)) {
      for (const figure of project.figures) {
        expect(figure.src).toMatch(/^\/assets\/images\/portfolio\/[a-z0-9-]+\/[a-z0-9-]+\.webp$/);
        expect(existsSync(path.join(process.cwd(), "public", figure.src))).toBe(true);
        expect(figure.alt.trim()).not.toBe("");
        expect(figure.caption.trim()).not.toBe("");
      }
    }
  });

  it("keeps the Yonsei storage chart equal to the report totals", () => {
    const chart = projects["yonsei-medical-data-platform"].storageChart!;
    const sum = (key: "tables" | "records" | "source" | "stored") => chart.rows.reduce((total, row) => total + row[key], 0);
    expect(sum("tables")).toBe(26);
    expect(sum("records")).toBe(3_130_427_008);
    expect(sum("source")).toBeCloseTo(1376.97, 2);
    expect(sum("stored")).toBeCloseTo(273.45, 2);
  });

  it("labels the SDI model comparison as a team result over the full test set", () => {
    const comparison = projects["samsung-sdi-multi-agent-mlops-poc"].modelComparison!;
    expect(comparison.note).toContain("팀원");
    expect(comparison.rows.map((row) => [row.baseline, row.proposed])).toEqual([
      [{ fn: 42, fp: 20 }, { fn: 39, fp: 10 }],
      [{ fn: 16, fp: 103 }, { fn: 16, fp: 82 }],
    ]);
  });
});
