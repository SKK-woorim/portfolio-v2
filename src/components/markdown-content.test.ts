import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MarkdownContent } from "./markdown-content";

describe("MarkdownContent", () => {
  it("renders the Markdown elements used by portfolio entries", () => {
    const html = renderToStaticMarkup(createElement(MarkdownContent, { markdown: "## 프로젝트 성과\n\n**속도**를 개선했습니다.\n\n> 사용자 검증 완료\n\n- 첫 번째\n  - 하위 항목\n\n1. 단계 하나\n2. 단계 둘\n\n```ts\nconst done = true;\n```" }));
    expect(html).toContain("<h2");
    expect(html).toContain("<strong");
    expect(html).toContain("<blockquote");
    expect(html).toContain("<ul");
    expect(html).toContain("<ol");
    expect(html).toContain("const done = true;");
  });

  it("does not render unsafe link protocols as anchors", () => {
    const html = renderToStaticMarkup(createElement(MarkdownContent, { markdown: "[열지 마세요](javascript:alert(1))" }));
    expect(html).not.toContain("href=");
    expect(html).toContain("열지 마세요");
  });
});
