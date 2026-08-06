import { describe, expect, it } from "vitest";
import { contentToMarkdown, markdownToPlainText, toMarkdownDocument } from "./markdown";

describe("contentToMarkdown", () => {
  it("keeps Markdown documents intact", () => {
    const markdown = "## 성과\n\n- **속도** 개선";
    expect(contentToMarkdown(toMarkdownDocument(markdown))).toBe(markdown);
  });

  it("migrates existing Tiptap content while retaining its formatting", () => {
    const legacy = {
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "문제 정의" }] },
        { type: "paragraph", content: [{ type: "text", text: "핵심", marks: [{ type: "bold" }] }, { type: "text", text: " 내용을 정리했습니다." }] },
        { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "항목" }] }] }] },
        { type: "codeBlock", attrs: { language: "ts" }, content: [{ type: "text", text: "const done = true;" }] },
      ],
    };
    expect(contentToMarkdown(legacy)).toBe("## 문제 정의\n\n**핵심** 내용을 정리했습니다.\n\n- 항목\n\n```ts\nconst done = true;\n```");
  });

  it("creates safe plain text for reading-time calculations", () => {
    expect(markdownToPlainText("# 제목\n\n[링크](https://example.com)\n\n```ts\nconst hidden = true;\n```\n\n**본문**")).toBe("제목 링크 본문");
  });
});
