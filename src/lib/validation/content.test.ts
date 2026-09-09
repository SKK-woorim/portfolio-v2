import { describe, expect, it } from "vitest";
import { loginSchema, portfolioInputSchema, postInputSchema, siteProfileInputSchema } from "./content";

const markdown = "## 본문\n\n**강조**";

function profileInput(socialLinks = "[]") {
  return {
    displayName: "송경근",
    roleTitle: "AI Engineer",
    headline: "RAG 시스템을 만듭니다.",
    bio: "검색과 생성 파이프라인을 설계합니다.",
    skills: "Python, RAG",
    email: "hello@example.com",
    socialLinks,
  };
}

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

  it("normalizes a comma-separated profile skill list", () => {
    const result = siteProfileInputSchema.safeParse({
      ...profileInput(),
      skills: "Python, RAG, Python, PostgreSQL",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.skills).toEqual(["Python", "RAG", "PostgreSQL"]);
  });

  it("requires social links to be a JSON array", () => {
    const result = siteProfileInputSchema.safeParse(profileInput("{}"));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("외부 링크는 JSON 배열이어야 합니다.");
  });

  it("limits social links to 20 entries", () => {
    const links = Array.from({ length: 21 }, (_, index) => ({
      label: `Link ${index}`,
      href: `https://example.com/${index}`,
    }));

    const result = siteProfileInputSchema.safeParse(profileInput(JSON.stringify(links)));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.message === "외부 링크는 최대 20개까지 입력할 수 있습니다.")).toBe(true);
  });

  it.each([
    "http://example.com/profile",
    "https://user:password@example.com/profile",
  ])("rejects an unsafe social-link URL: %s", (href) => {
    const result = siteProfileInputSchema.safeParse(profileInput(JSON.stringify([{ label: "Profile", href }])));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues.some((issue) => issue.message === "외부 링크 주소는 인증 정보가 없는 HTTPS URL이어야 합니다.")).toBe(true);
  });

  it("accepts a valid HTTPS social-link URL", () => {
    const result = siteProfileInputSchema.safeParse(profileInput(JSON.stringify([
      { label: "GitHub", href: "https://github.com/SKK-woorim" },
    ])));

    expect(result.success).toBe(true);
  });
});
