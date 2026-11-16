import { describe, expect, it } from "vitest";
import rawCachedAnswers from "../../../data/chatbot/cached-answers.json";
import { cachedAnswersFileSchema, chunkCachedAnswer, createCachedAnswerLookup, normalizeChatQuestion } from "./cached-answers";
import { computeContentVersion, type ContentVersionInput } from "./content-version";

const file = {
  version: 1,
  generatedAt: "2026-11-10T00:00:00.000Z",
  contentVersion: "0123456789abcdef",
  entries: [{ question: "데이터 이관 경험이 궁금해요", answer: "약 30억 건을 이관했습니다. [S1]", sources: [{ id: "S1", title: "연세대", type: "portfolio", url: "/portfolio/yonsei-medical-data-platform" }] }],
};

describe("cached chat answers", () => {
  it("keeps the committed file valid", () => {
    expect(cachedAnswersFileSchema.safeParse(rawCachedAnswers).success).toBe(true);
  });

  it("matches fixed questions regardless of spacing and case", () => {
    const lookup = createCachedAnswerLookup(file);
    expect(lookup.find("  데이터  이관 경험이 궁금해요 ")?.answer).toContain("30억");
    expect(lookup.find("데이터 이관 경험")).toBeUndefined();
    expect(normalizeChatQuestion("RAG  Agent?")).toBe("rag agent?");
  });

  it("is only current for the content version it was generated from", () => {
    const lookup = createCachedAnswerLookup(file);
    expect(lookup.isCurrent("0123456789abcdef")).toBe(true);
    expect(lookup.isCurrent("fedcba9876543210")).toBe(false);
    expect(createCachedAnswerLookup({ ...file, contentVersion: null }).isCurrent("0123456789abcdef")).toBe(false);
  });

  it("ignores a malformed file instead of serving it", () => {
    const lookup = createCachedAnswerLookup({ ...file, entries: [{ ...file.entries[0], sources: [{ id: "S1", title: "외부", type: "post", url: "https://evil.example" }] }] });
    expect(lookup.file.entries).toHaveLength(0);
    expect(lookup.find(file.entries[0].question)).toBeUndefined();
  });

  it("splits answers on code points and loses nothing", () => {
    const answer = "한글 답변 😀 [S1] ".repeat(9);
    const chunks = chunkCachedAnswer(answer, 7);
    expect(chunks.join("")).toBe(answer);
    expect(chunks.every((chunk) => Array.from(chunk).length <= 7 && !/[\uD800-\uDBFF]$/.test(chunk))).toBe(true);
  });
});

describe("computeContentVersion", () => {
  const input: ContentVersionInput = {
    profile: { displayName: "송경근", roleTitle: "엔지니어", headline: "h", bio: "b", email: "a@example.com", skills: ["RAG"], socialLinks: [] },
    projects: [{ slug: "b", updatedAt: "2026-10-01T00:00:00Z" }, { slug: "a", updatedAt: "2026-10-02T00:00:00Z" }],
    posts: [{ slug: "p", updatedAt: "2026-09-01T00:00:00Z" }],
  };

  it("does not depend on list order", () => {
    expect(computeContentVersion({ ...input, projects: [...input.projects].reverse() })).toBe(computeContentVersion(input));
    expect(computeContentVersion(input)).toMatch(/^[0-9a-f]{16}$/);
  });

  it("changes when a project, post, or the profile changes", () => {
    const base = computeContentVersion(input);
    expect(computeContentVersion({ ...input, projects: [input.projects[0], { slug: "a", updatedAt: "2026-11-01T00:00:00Z" }] })).not.toBe(base);
    expect(computeContentVersion({ ...input, posts: [] })).not.toBe(base);
    expect(computeContentVersion({ ...input, profile: { ...input.profile, bio: "changed" } })).not.toBe(base);
  });
});
