import { describe, expect, it } from "vitest";
import { loginSchema, portfolioInputSchema, postInputSchema } from "./content";

const markdown = "## 본문\n\n**강조**";

describe("content validation", () => {
  it("accepts a valid administrator login", () => {
    expect(loginSchema.safeParse({ email: "admin@example.com", password: "password-123" }).success).toBe(true);
  });

  it("rejects an unsafe public slug", () => {
    expect(portfolioInputSchema.safeParse({ title: "Test", slug: "Unsafe slug", type: "Project", summary: "Summary", contentMarkdown: markdown, status: "draft", sortOrder: 0, isFeatured: false }).success).toBe(false);
  });

  it("accepts Markdown content without accepting an empty body", () => {
    expect(postInputSchema.safeParse({ title: "Test", slug: "test-post", excerpt: "Summary", contentMarkdown: markdown, status: "draft" }).success).toBe(true);
    expect(postInputSchema.safeParse({ title: "Test", slug: "test-post", excerpt: "Summary", contentMarkdown: "   ", status: "draft" }).success).toBe(false);
  });
});
