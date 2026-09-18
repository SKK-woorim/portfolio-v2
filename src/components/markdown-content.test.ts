import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { getMarkdownHeadings, MarkdownContent } from "./markdown-content";

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

  it("renders angle-bracket image destinations inserted by the editor", () => {
    const html = renderToStaticMarkup(createElement(MarkdownContent, { markdown: "![프로젝트 화면](<https://example.com/project-image.png>)" }));
    expect(html).toContain('src="https://example.com/project-image.png"');
    expect(html).not.toContain("%3Chttps");
  });

  it("renders escaped brackets in image alt text without backslashes", () => {
    const html = renderToStaticMarkup(createElement(MarkdownContent, { markdown: "![대시보드 \\[결과\\]](<https://example.com/project-image.png>)" }));
    expect(html).toContain('alt="대시보드 [결과]"');
    expect(html).toContain('loading="lazy"');
  });

  it("passes managed inline media dimensions while preserving explicit alt text", () => {
    const html = renderToStaticMarkup(createElement(MarkdownContent, {
      markdown: "![프로젝트 화면](https://cdn.example.com/project.png)",
      inlineImages: [{ src: "https://cdn.example.com/project.png", alt: "관리형 설명", width: 1200, height: 800 }],
    }));
    expect(html).toContain('width="1200"');
    expect(html).toContain('height="800"');
    expect(html).toContain('alt="프로젝트 화면"');
  });

  it("keeps explicit decorative alt empty and leaves unknown external images un-sized", () => {
    const managed = renderToStaticMarkup(createElement(MarkdownContent, {
      markdown: "![](https://cdn.example.com/decorative.png)",
      inlineImages: [{ src: "https://cdn.example.com/decorative.png", alt: "서버 설명", width: 640, height: 360 }],
    }));
    const external = renderToStaticMarkup(createElement(MarkdownContent, { markdown: "![외부 이미지](https://images.example.com/external.png)" }));
    expect(managed).toContain('alt=""');
    expect(managed).toContain('width="640"');
    expect(external).not.toContain('width="');
    expect(external).not.toContain('height="');
  });

  it("assigns stable, unique IDs to duplicate headings", () => {
    const markdown = "## 같은 제목\n\n내용\n\n## 같은 제목\n\n## 세 번째 제목";
    expect(getMarkdownHeadings(markdown)).toEqual([
      { level: 2, text: "같은 제목", id: "같은-제목" },
      { level: 2, text: "같은 제목", id: "같은-제목-2" },
      { level: 2, text: "세 번째 제목", id: "세-번째-제목" },
    ]);
    const html = renderToStaticMarkup(createElement(MarkdownContent, { markdown }));
    expect(html).toContain('id="같은-제목"');
    expect(html).toContain('id="같은-제목-2"');
  });

  it("ignores heading-like text inside fenced code blocks", () => {
    const markdown = "```md\n## 코드 예시\n```\n\n## 실제 제목";
    expect(getMarkdownHeadings(markdown)).toEqual([
      { level: 2, text: "실제 제목", id: "실제-제목" },
    ]);

    const html = renderToStaticMarkup(createElement(MarkdownContent, { markdown }));
    expect(html).toContain('id="실제-제목"');
    expect(html).not.toContain('id="코드-예시"');
  });

  it("keeps balanced parentheses in a link destination", () => {
    const html = renderToStaticMarkup(createElement(MarkdownContent, { markdown: "[문서](https://example.com/guide_(v2))" }));
    expect(html).toContain('href="https://example.com/guide_(v2)"');
  });

  it("keeps escaped pipes inside Markdown table cells", () => {
    const html = renderToStaticMarkup(createElement(MarkdownContent, { markdown: "| 항목 | 설명 |\n| --- | --- |\n| RAG | 검색\\|생성 |" }));
    expect(html).toContain("검색|생성");
    expect(html).not.toContain("검색\\");
  });

  it("preserves ordinary backslashes in Markdown table cells", () => {
    const markdown = String.raw`| 항목 | 경로 |
| --- | --- |
| 파일 | C:\temp |`;
    const html = renderToStaticMarkup(createElement(MarkdownContent, { markdown }));
    expect(html).toContain("C:\\temp");
  });
});
