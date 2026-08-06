/** @vitest-environment jsdom */

import { createElement } from "react";
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MarkdownEditor } from "./markdown-editor";

const legacyDocument = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "제목" }] },
    { type: "paragraph", content: [{ type: "text", text: "본문" }] },
  ],
};

describe("MarkdownEditor", () => {
  it("shows legacy content as Markdown and preserves it when previewing", () => {
    const view = render(createElement("form", null, createElement(MarkdownEditor, { name: "contentMarkdown", initialValue: legacyDocument })));
    const editor = view.getByLabelText(/본문/);
    expect((editor as HTMLTextAreaElement).value).toBe("## 제목\n\n본문");

    fireEvent.click(view.getByRole("button", { name: "미리보기" }));
    expect(view.getByRole("heading", { name: "제목" })).toBeTruthy();
    expect(new FormData(view.container.querySelector("form")!).get("contentMarkdown")).toBe("## 제목\n\n본문");
  });
});
