/** @vitest-environment jsdom */

import { createElement } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MarkdownEditor } from "./markdown-editor";

const legacyDocument = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "제목" }] },
    { type: "paragraph", content: [{ type: "text", text: "본문" }] },
  ],
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("MarkdownEditor", () => {
  it("shows legacy content as Markdown and preserves it when previewing", () => {
    const view = render(createElement("form", null, createElement(MarkdownEditor, { name: "contentMarkdown", initialValue: legacyDocument })));
    const editor = view.getByLabelText(/본문/);
    expect((editor as HTMLTextAreaElement).value).toBe("## 제목\n\n본문");

    fireEvent.click(view.getByRole("tab", { name: "미리보기" }));
    expect(view.getByRole("heading", { name: "제목" })).toBeTruthy();
    expect(new FormData(view.container.querySelector("form")!).get("contentMarkdown")).toBe("## 제목\n\n본문");
  });

  it("inserts the chosen image at the saved cursor position with required alt text", () => {
    const view = render(createElement("form", null, createElement(MarkdownEditor, {
      name: "contentMarkdown",
      initialValue: { type: "markdown", markdown: "앞뒤" },
      media: [{ id: "media-1", public_url: "https://example.com/image.png", alt: "프로젝트 화면", storage_key: "2026/image.png" }],
    })));
    const editor = view.getByLabelText(/본문/) as HTMLTextAreaElement;
    editor.focus();
    editor.setSelectionRange(1, 1);
    fireEvent.select(editor);
    fireEvent.click(view.getByRole("button", { name: "이미지 넣기" }));
    fireEvent.click(view.getByRole("button", { name: /프로젝트 화면/ }));
    fireEvent.click(view.getByRole("button", { name: "본문에 넣기" }));

    expect(editor.value).toBe("앞![프로젝트 화면](<https://example.com/image.png>)뒤");
  });

  it("keeps insertion disabled until alt text is supplied for media without alt", () => {
    const view = render(createElement(MarkdownEditor, {
      name: "contentMarkdown",
      media: [{ id: "media-1", public_url: "https://example.com/image.png", alt: "", storage_key: "2026/image.png" }],
    }));
    fireEvent.click(view.getByRole("button", { name: "이미지 넣기" }));
    fireEvent.click(view.getByRole("button", { name: /2026\/image.png/ }));
    expect(view.getByRole("button", { name: "본문에 넣기" })).toHaveProperty("disabled", true);
    fireEvent.change(view.getByLabelText("대체 텍스트"), { target: { value: "설명" } });
    expect(view.getByRole("button", { name: "본문에 넣기" })).toHaveProperty("disabled", false);
  });

  it("locks editor mutations while the parent form is saving", () => {
    const view = render(createElement(MarkdownEditor, {
      name: "contentMarkdown",
      initialValue: { type: "markdown", markdown: "서버 본문" },
      media: [{ id: "media-1", public_url: "https://example.com/image.png", alt: "프로젝트 화면", storage_key: "2026/image.png" }],
      disabled: true,
    }));
    const editor = view.getByLabelText(/본문/) as HTMLTextAreaElement;
    expect(editor.disabled).toBe(true);
    expect(view.getByRole("button", { name: "이미지 넣기" })).toHaveProperty("disabled", true);
  });

  it("reports unique internal media IDs from new and existing Markdown images only", () => {
    const media = [
      { id: "media-1", public_url: "https://example.com/one.png", alt: "하나", storage_key: "one.png" },
      { id: "media-2", public_url: "https://example.com/two.png", alt: "둘", storage_key: "two.png" },
    ];
    const view = render(createElement("form", null, createElement(MarkdownEditor, {
      name: "contentMarkdown",
      initialValue: { type: "markdown", markdown: "![첫](https://example.com/one.png)\n![둘](<https://example.com/two.png>)\n![중복](https://example.com/one.png)\n![외부](https://other.example/image.png)" },
      media,
    })));

    expect(new FormData(view.container.querySelector("form")!).get("inlineMediaIds")).toBe('["media-1","media-2"]');
  });

  it("keeps media tracking intact when alt text contains Markdown brackets", () => {
    const view = render(createElement("form", null, createElement(MarkdownEditor, {
      name: "contentMarkdown",
      media: [{ id: "media-1", public_url: "https://example.com/one.png", alt: "대시보드 [결과]", storage_key: "one.png" }],
    })));
    fireEvent.click(view.getByRole("button", { name: "이미지 넣기" }));
    fireEvent.click(view.getByRole("button", { name: /대시보드/ }));
    fireEvent.click(view.getByRole("button", { name: "본문에 넣기" }));

    expect(new FormData(view.container.querySelector("form")!).get("inlineMediaIds")).toBe('["media-1"]');
  });

  it("uploads a new image and inserts it at the saved cursor without leaving the editor", async () => {
    const uploadAction = vi.fn().mockResolvedValue({
      success: "업로드했습니다.",
      media: {
        id: "new-media",
        public_url: "https://example.com/new-image.webp",
        alt: "새 프로젝트 화면",
        storage_key: "2026/new-image.webp",
      },
    });
    const view = render(createElement("form", null, createElement(MarkdownEditor, {
      name: "contentMarkdown",
      initialValue: { type: "markdown", markdown: "앞뒤" },
      uploadAction,
    })));
    const editor = view.getByLabelText(/본문/) as HTMLTextAreaElement;
    editor.setSelectionRange(1, 1);
    fireEvent.select(editor);
    fireEvent.click(view.getByRole("button", { name: "이미지 넣기" }));
    fireEvent.change(view.getByLabelText("새 이미지 파일"), {
      target: { files: [new File(["image"], "project.png", { type: "image/png" })] },
    });
    fireEvent.change(view.getByLabelText("새 이미지 대체 텍스트"), {
      target: { value: "새 프로젝트 화면" },
    });
    fireEvent.click(view.getByRole("button", { name: "업로드하고 본문에 넣기" }));

    await waitFor(() => expect(editor.value).toBe("앞![새 프로젝트 화면](<https://example.com/new-image.webp>)뒤"));
    expect(uploadAction).toHaveBeenCalledTimes(1);
    expect(new FormData(view.container.querySelector("form")!).get("inlineMediaIds")).toBe('["new-media"]');
  });

  it("offers a newer browser draft and restores it only after confirmation", async () => {
    localStorage.setItem("portfolio-cms-draft:post:existing", JSON.stringify({
      markdown: "## 복구할 본문",
      savedAt: Date.now(),
      baseUpdatedAt: "2026-09-07T10:00:00.000Z",
    }));
    const view = render(createElement(MarkdownEditor, {
      name: "contentMarkdown",
      initialValue: { type: "markdown", markdown: "## 서버 본문" },
      draftKey: "post:existing",
      baseUpdatedAt: "2026-09-07T10:00:00.000Z",
    }));

    await waitFor(() => expect(view.getByText("브라우저에 임시 저장된 본문이 있습니다.")).toBeTruthy());
    expect((view.getByLabelText(/본문/) as HTMLTextAreaElement).value).toBe("## 서버 본문");
    fireEvent.click(view.getByRole("button", { name: "임시본 복원" }));
    expect((view.getByLabelText(/본문/) as HTMLTextAreaElement).value).toBe("## 복구할 본문");
  });

  it("saves unsaved Markdown to a content-specific browser draft", async () => {
    const view = render(createElement(MarkdownEditor, {
      name: "contentMarkdown",
      initialValue: { type: "markdown", markdown: "## 서버 본문" },
      draftKey: "portfolio:item-1",
    }));
    fireEvent.change(view.getByLabelText(/본문/), { target: { value: "## 수정한 본문" } });

    await waitFor(() => {
      const stored = JSON.parse(localStorage.getItem("portfolio-cms-draft:portfolio:item-1") ?? "null");
      expect(stored?.markdown).toBe("## 수정한 본문");
    }, { timeout: 2_000 });
  });
});
