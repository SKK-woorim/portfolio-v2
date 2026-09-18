/** @vitest-environment jsdom */

import { cleanup, fireEvent, render } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { BlogPost } from "@/lib/content/types";

const navigationMocks = vi.hoisted(() => ({
  search: "",
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(navigationMocks.search),
  usePathname: () => "/blog",
  useRouter: () => ({ replace: navigationMocks.replace }),
}));

vi.mock("next/link", () => ({
  default: ({ children, href, ...props }: { children?: ReactNode; href: string; [key: string]: unknown }) => createElement("a", { ...props, href }, children),
}));

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => createElement("img", props),
}));

import { BlogBrowser } from "./blog-browser";

describe("BlogBrowser search navigation", () => {
  beforeEach(() => {
    navigationMocks.search = "";
    navigationMocks.replace.mockReset();
    vi.useFakeTimers();
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      callback(0);
      return 1;
    });
    vi.spyOn(window, "cancelAnimationFrame").mockImplementation(() => undefined);
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function renderBrowser(posts: BlogPost[] = []) {
    return render(createElement(BlogBrowser, { posts }));
  }

  it("distinguishes an empty publication from a filter with no matches", () => {
    expect(renderBrowser().getByText("아직 공개된 글이 없습니다.")).toBeTruthy();

    navigationMocks.search = "q=없는글";
    const post = {
      id: "post-1",
      slug: "published-post",
      title: "공개된 글",
      excerpt: "검색 가능한 요약",
      category: "개발",
      tags: ["Next.js"],
      publishedAt: "2026-09-01T00:00:00.000Z",
    } as BlogPost;
    expect(renderBrowser([post]).getByText("조건에 맞는 글이 없습니다.")).toBeTruthy();
  });

  it("waits for Korean IME composition to finish before replacing the URL", () => {
    const view = renderBrowser();
    const input = view.getByRole("textbox", { name: /글 검색/ });

    fireEvent.compositionStart(input);
    fireEvent.change(input, { target: { value: "ㅎ" } });
    vi.advanceTimersByTime(500);
    expect(navigationMocks.replace).not.toHaveBeenCalled();

    fireEvent.compositionEnd(input, { data: "한" });
    fireEvent.change(input, { target: { value: "한" } });
    vi.advanceTimersByTime(179);
    expect(navigationMocks.replace).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(navigationMocks.replace).toHaveBeenCalledWith("/blog?q=%ED%95%9C", { scroll: false });
  });

  it("coalesces rapid input into one latest search replacement", () => {
    const view = renderBrowser();
    const input = view.getByRole("textbox", { name: /글 검색/ });

    fireEvent.change(input, { target: { value: "r" } });
    vi.advanceTimersByTime(80);
    fireEvent.change(input, { target: { value: "ra" } });
    vi.advanceTimersByTime(80);
    fireEvent.change(input, { target: { value: "rag" } });
    vi.advanceTimersByTime(179);
    expect(navigationMocks.replace).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);

    expect(navigationMocks.replace).toHaveBeenCalledTimes(1);
    expect(navigationMocks.replace).toHaveBeenCalledWith("/blog?q=rag", { scroll: false });
  });

  it("adopts browser back/forward query state without writing it back", () => {
    navigationMocks.search = "q=first";
    const view = renderBrowser();
    expect((view.getByRole("textbox", { name: /글 검색/ }) as HTMLInputElement).value).toBe("first");
    navigationMocks.replace.mockReset();

    navigationMocks.search = "q=back";
    view.rerender(createElement(BlogBrowser, { posts: [] }));
    expect((view.getByRole("textbox", { name: /글 검색/ }) as HTMLInputElement).value).toBe("back");
    vi.advanceTimersByTime(500);

    expect(navigationMocks.replace).not.toHaveBeenCalled();
  });
});
