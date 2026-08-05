import { describe, expect, it } from "vitest";
import { loginSchema, portfolioInputSchema, postInputSchema } from "./content";

const documentJson = JSON.stringify({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "본문" }] }] });

describe("content validation", () => {
  it("accepts a valid administrator login", () => {
    expect(loginSchema.safeParse({ email: "admin@example.com", password: "password-123" }).success).toBe(true);
  });

  it("rejects an unsafe public slug", () => {
    expect(portfolioInputSchema.safeParse({ title: "Test", slug: "Unsafe slug", type: "Project", summary: "Summary", contentJson: documentJson, status: "draft", sortOrder: 0, isFeatured: false }).success).toBe(false);
  });

  it("requires Tiptap JSON instead of arbitrary HTML", () => {
    expect(postInputSchema.safeParse({ title: "Test", slug: "test-post", excerpt: "Summary", contentJson: "<script>alert(1)</script>", status: "draft" }).success).toBe(false);
  });
});
