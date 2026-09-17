/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PostForm } from "./post-form";
import { PortfolioForm } from "./portfolio-form";

const actionMocks = vi.hoisted(() => ({
  savePost: vi.fn(),
  savePortfolio: vi.fn(),
  uploadMedia: vi.fn(),
}));

vi.mock("@/app/admin/actions", () => actionMocks);

const POST_ID = "26ed78d5-f82c-437c-a093-a97addf70020";
const ITEM_ID = "1d4ba08f-0e22-4dcb-839f-96056e30b0e0";
const media = [
  { id: "media-1", public_url: "https://example.com/one.png", alt: "첫 이미지", storage_key: "one.png" },
  { id: "media-2", public_url: "https://example.com/two.png", alt: "두 번째 이미지", storage_key: "two.png" },
];

function postFixture() {
  return {
    id: POST_ID,
    title: "기존 게시글",
    slug: "existing-post",
    excerpt: "기존 요약",
    status: "draft",
    cover_media_id: "media-1",
    content_json: { type: "markdown", markdown: "본문" },
    updated_at: "2026-09-07T12:00:00.000Z",
  };
}

function portfolioFixture() {
  return {
    id: ITEM_ID,
    title: "기존 프로젝트",
    slug: "existing-project",
    type: "프로젝트",
    summary: "기존 요약",
    status: "draft",
    cover_media_id: "media-1",
    content_json: { type: "markdown", markdown: "본문" },
    updated_at: "2026-09-07T12:00:00.000Z",
    portfolio_item_media: [{ media_id: "media-1", role: "cover" }],
  };
}

beforeEach(() => {
  actionMocks.savePost.mockReset();
  actionMocks.savePortfolio.mockReset();
  actionMocks.uploadMedia.mockReset();
  actionMocks.uploadMedia.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("PostForm", () => {
  it("preserves edited fields and representative image after a save error", async () => {
    actionMocks.savePost.mockResolvedValueOnce({ error: "저장하지 못했습니다. 기존 글은 변경되지 않았습니다." });
    const view = render(createElement(PostForm, { post: postFixture(), categories: [], media }));

    fireEvent.change(view.getByLabelText("제목"), { target: { value: "수정한 제목" } });
    fireEvent.change(view.getByLabelText("요약"), { target: { value: "수정한 요약" } });
    fireEvent.change(view.getByLabelText("저장 상태"), { target: { value: "private" } });
    fireEvent.change(view.getByLabelText("대표 이미지"), { target: { value: "media-2" } });
    expect((view.getByLabelText("저장 상태") as HTMLSelectElement).value).toBe("private");
    fireEvent.click(view.getByRole("button", { name: "변경 사항 저장" }));

    await waitFor(() => expect(view.getByRole("alert")).toBeTruthy());
    expect(actionMocks.savePost).toHaveBeenCalledTimes(1);
    const submitted = actionMocks.savePost.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("title")).toBe("수정한 제목");
    expect(submitted.get("excerpt")).toBe("수정한 요약");
    expect(submitted.get("status")).toBe("private");
    expect(submitted.get("coverMediaId")).toBe("media-2");
    expect((view.getByLabelText("제목") as HTMLInputElement).value).toBe("수정한 제목");
    expect((view.getByLabelText("요약") as HTMLTextAreaElement).value).toBe("수정한 요약");
    await waitFor(() => expect((view.getByLabelText("저장 상태") as HTMLSelectElement).value).toBe("private"));
    expect((view.getByLabelText("대표 이미지") as HTMLSelectElement).value).toBe("media-2");
  });

  it("synchronizes the status select after a successful publish", async () => {
    actionMocks.savePost.mockResolvedValueOnce({ success: "게시글을 발행했습니다.", contentId: POST_ID, updatedAt: "2026-09-07T13:00:00.000Z", slug: "existing-post" });
    const view = render(createElement(PostForm, { post: postFixture(), categories: [], media }));

    fireEvent.click(view.getByRole("button", { name: "즉시 발행" }));

    await waitFor(() => expect(view.getByText("게시글을 발행했습니다.")).toBeTruthy());
    expect((view.getByLabelText("저장 상태") as HTMLSelectElement).value).toBe("published");
  });
});

describe("PortfolioForm", () => {
  it("preserves edited fields and representative image after a save error", async () => {
    actionMocks.savePortfolio.mockResolvedValueOnce({ error: "저장하지 못했습니다. 기존 내용은 변경되지 않았습니다." });
    const view = render(createElement(PortfolioForm, { item: portfolioFixture(), media }));

    fireEvent.change(view.getByLabelText("제목"), { target: { value: "수정한 프로젝트" } });
    fireEvent.change(view.getByLabelText("한 줄 요약"), { target: { value: "수정한 요약" } });
    fireEvent.change(view.getByLabelText("저장 상태"), { target: { value: "hidden" } });
    fireEvent.change(view.getByLabelText("대표 이미지"), { target: { value: "media-2" } });
    expect((view.getByLabelText("저장 상태") as HTMLSelectElement).value).toBe("hidden");
    fireEvent.click(view.getByRole("button", { name: "변경 사항 저장" }));

    await waitFor(() => expect(view.getByRole("alert")).toBeTruthy());
    expect(actionMocks.savePortfolio).toHaveBeenCalledTimes(1);
    const submitted = actionMocks.savePortfolio.mock.calls[0]?.[1] as FormData;
    expect(submitted.get("title")).toBe("수정한 프로젝트");
    expect(submitted.get("summary")).toBe("수정한 요약");
    expect(submitted.get("status")).toBe("hidden");
    expect(submitted.get("coverMediaId")).toBe("media-2");
    expect((view.getByLabelText("제목") as HTMLInputElement).value).toBe("수정한 프로젝트");
    expect((view.getByLabelText("한 줄 요약") as HTMLTextAreaElement).value).toBe("수정한 요약");
    await waitFor(() => expect((view.getByLabelText("저장 상태") as HTMLSelectElement).value).toBe("hidden"));
    expect((view.getByLabelText("대표 이미지") as HTMLSelectElement).value).toBe("media-2");
  });

  it("synchronizes the status select after a successful publish", async () => {
    actionMocks.savePortfolio.mockResolvedValueOnce({ success: "포트폴리오 항목을 발행했습니다.", contentId: ITEM_ID, updatedAt: "2026-09-07T13:00:00.000Z", slug: "existing-project" });
    const view = render(createElement(PortfolioForm, { item: portfolioFixture(), media }));

    fireEvent.click(view.getByRole("button", { name: "즉시 발행" }));

    await waitFor(() => expect(view.getByText("포트폴리오 항목을 발행했습니다.")).toBeTruthy());
    expect((view.getByLabelText("저장 상태") as HTMLSelectElement).value).toBe("published");
  });
});
