import { describe, expect, it } from "vitest";
import { relatedPortfolioItems, relatedPosts } from "./content-discovery";
import type { BlogPost, PortfolioItem } from "@/lib/content/types";

const post = (id: string, tags: string[], category: string, publishedAt: string): BlogPost => ({
  id, slug: id, title: id, excerpt: "요약", body: [], category, tags, publishedAt, updatedAt: publishedAt, readingMinutes: 1,
});
const project = (id: string, tags: string[], type: string, period: string, updatedAt: string): PortfolioItem => ({
  id, slug: id, title: id, type, period, summary: "요약", body: [], tags, links: [], featured: false, accent: "blue", updatedAt,
});

describe("content discovery", () => {
  it("ranks related posts by shared tags, then category, and excludes the current post", () => {
    const current = post("current", ["AI", "RAG"], "Engineering", "2026-01-01");
    const result = relatedPosts([current, post("tag-match", ["AI"], "Other", "2026-01-01"), post("category-match", [], "Engineering", "2026-03-01"), post("unrelated", [], "Other", "2026-04-01")], current);
    expect(result.map((item) => item.id)).toEqual(["tag-match", "category-match"]);
  });

  it("ranks related portfolio projects and leaves unrelated projects out", () => {
    const current = project("current", ["AI"], "Product", "2026", "2026-01-01");
    const result = relatedPortfolioItems([current, project("tag-match", ["AI"], "Other", "2024", "2026-01-01"), project("type-match", [], "Product", "2025", "2026-03-01"), project("unrelated", [], "Other", "2024", "2026-04-01")], current);
    expect(result.map((item) => item.id)).toEqual(["tag-match", "type-match"]);
  });
});
