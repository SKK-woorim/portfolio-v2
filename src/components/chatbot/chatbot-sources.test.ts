import { describe, expect, it } from "vitest";
import { getVerifiedSourceUrl, sanitizeChatSources } from "./chatbot-sources";

describe("chatbot source validation", () => {
  it("allows only source-type-matched public site paths", () => {
    expect(getVerifiedSourceUrl("profile", "/about")).toBe("/about");
    expect(getVerifiedSourceUrl("portfolio", "/portfolio/rag-pipeline")).toBe("/portfolio/rag-pipeline");
    expect(getVerifiedSourceUrl("post", "/blog/rag-notes-2")).toBe("/blog/rag-notes-2");
    expect(getVerifiedSourceUrl("portfolio", "/blog/rag-notes")).toBeNull();
    expect(getVerifiedSourceUrl("post", "https://example.com/blog/rag-notes")).toBeNull();
    expect(getVerifiedSourceUrl("post", "/blog/../admin")).toBeNull();
    expect(getVerifiedSourceUrl("post", "/blog/rag-notes?draft=true")).toBeNull();
  });

  it("drops invalid and duplicate source items and limits the result to three", () => {
    expect(sanitizeChatSources([
      { id: "S1", title: "RAG 프로젝트", type: "portfolio", url: "/portfolio/rag-project" },
      { id: "S1", title: "중복 식별자", type: "portfolio", url: "/portfolio/duplicate" },
      { id: "S2", title: "외부 링크", type: "post", url: "https://example.com" },
      { id: "S2", title: "블로그 글", type: "post", url: "/blog/rag-review" },
      { id: "S3", title: "소개", type: "profile", url: "/about" },
      { id: "S4", title: "네 번째 자료", type: "blog", url: "/blog/fourth-source" },
    ])).toEqual([
      { id: "S1", title: "RAG 프로젝트", type: "portfolio", url: "/portfolio/rag-project" },
      { id: "S2", title: "블로그 글", type: "post", url: "/blog/rag-review" },
      { id: "S3", title: "소개", type: "profile", url: "/about" },
    ]);
  });
});
