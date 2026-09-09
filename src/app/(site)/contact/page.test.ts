import { describe, expect, it } from "vitest";
import { parseContactContext } from "./contact-context";

describe("parseContactContext", () => {
  it("accepts supported content sources and a canonical slug", () => {
    expect(parseContactContext({ from: "blog", slug: "rag-document-pipeline" })).toEqual({
      kind: "blog",
      slug: "rag-document-pipeline",
    });
    expect(parseContactContext({ from: ["portfolio"], slug: ["ai-agent-rag-workflows"] })).toEqual({
      kind: "portfolio",
      slug: "ai-agent-rag-workflows",
    });
  });

  it("ignores unsupported or unsafe query values", () => {
    expect(parseContactContext({ from: "home", slug: "safe-slug" })).toBeNull();
    expect(parseContactContext({ from: "blog", slug: "<script>alert(1)</script>" })).toBeNull();
    expect(parseContactContext({ from: "portfolio", slug: "unsafe slug" })).toBeNull();
  });
});
