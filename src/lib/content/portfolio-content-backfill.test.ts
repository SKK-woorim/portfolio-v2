import { describe, expect, it } from "vitest";
import { buildPortfolioContentText } from "../../../scripts/backfill-portfolio-content-text";

describe("portfolio content-text backfill", () => {
  it("converts legacy Tiptap documents through the shared Markdown pipeline", () => {
    expect(buildPortfolioContentText({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "RAG 프로젝트" }] },
        { type: "paragraph", content: [{ type: "text", text: "검색 품질을 개선했습니다." }] },
      ],
    })).toBe("RAG 프로젝트 검색 품질을 개선했습니다.");
  });

  it("supports the current Markdown document shape", () => {
    expect(buildPortfolioContentText({ type: "markdown", markdown: "## 기술\n\n**Python**과 [Supabase](https://supabase.com)" }))
      .toBe("기술 Python과 Supabase");
  });
});
